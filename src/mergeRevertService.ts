import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AppError, isUserCancelledError, toAppError } from "./errors";
import { ConflictResolution, GitConflictHandler } from "./gitConflictHandler";
import { GitOperations, LatestMergeCommit } from "./gitOperations";

export type MergeRollbackStrategy = "reset" | "revert";

/**
 * 回滚「其他分支合入当前分支」的最近一次 merge 提交
 */
export class MergeRevertService {
  private gitOps: GitOperations;
  private static isOperationInProgress = false;

  constructor(workspaceRoot: string) {
    const gitDir = path.join(workspaceRoot, ".git");
    if (!fs.existsSync(gitDir)) {
      throw new AppError(
        "当前工作区不是Git仓库，请在Git项目中使用此插件",
        "NOT_GIT_REPO",
        { stage: "init" }
      );
    }
    this.gitOps = new GitOperations(workspaceRoot);
  }

  private getConfiguredRollbackMode(): "reset" | "revert" | "ask" {
    return vscode.workspace
      .getConfiguration("gitWorkflowHelper")
      .get<"reset" | "revert" | "ask">("mergeRollbackStrategy", "reset");
  }

  private canUseReset(commitsAfterMerge: number): boolean {
    return commitsAfterMerge === 0;
  }

  /**
   * 解析本次回滚采用 reset 还是 revert
   */
  private async resolveRollbackStrategy(
    commitsAfterMerge: number
  ): Promise<MergeRollbackStrategy> {
    const mode = this.getConfiguredRollbackMode();

    if (mode === "revert") {
      return "revert";
    }

    if (mode === "reset") {
      if (this.canUseReset(commitsAfterMerge)) {
        return "reset";
      }
      throw new AppError(
        "已配置为 reset 回滚，但该 merge 之后还有新提交，无法安全 reset。\n" +
          "请将 gitWorkflowHelper.mergeRollbackStrategy 改为 revert 或 ask，或手动处理。",
        "UNKNOWN",
        { stage: "resolveRollbackStrategy" }
      );
    }

    // ask
    if (!this.canUseReset(commitsAfterMerge)) {
      const useRevert = await vscode.window.showWarningMessage(
        "该 merge 之后已有其他提交，无法使用 reset（会丢失后续提交）。\n是否改用 revert 回滚？",
        { modal: true },
        "使用 revert"
      );
      if (useRevert !== "使用 revert") {
        throw AppError.userCancelled("已取消回滚");
      }
      return "revert";
    }

    const picked = await vscode.window.showQuickPick(
      [
        {
          label: "$(arrow-left) reset 到 merge 前",
          description:
            "git reset --hard，移除 merge 提交，不跑 revert、不新增反向提交（推荐）",
          value: "reset" as const,
        },
        {
          label: "$(git-commit) revert 生成反向提交",
          description:
            "git revert -m 1，保留历史，可能冲突并触发 pre-commit",
          value: "revert" as const,
        },
      ],
      {
        placeHolder: "选择回滚方式（默认推荐 reset）",
        title: "回滚方式",
      }
    );

    if (!picked) {
      throw AppError.userCancelled("未选择回滚方式");
    }

    return picked.value;
  }

  private getConflictHandler(): GitConflictHandler {
    return new GitConflictHandler(this.gitOps.getWorkspaceRoot());
  }

  private async finishRevertCommit(): Promise<void> {
    await this.getConflictHandler().completeRevertOperation();
  }

  private async handleRevertConflicts(
    conflictFiles: string[]
  ): Promise<ConflictResolution> {
    return this.getConflictHandler().runConflictWizard("revert", conflictFiles);
  }

  private async handleStuckRevertState(): Promise<boolean> {
    if (!(await this.gitOps.isRevertInProgress())) {
      return true;
    }

    const action = await vscode.window.showWarningMessage(
      "检测到未完成的 revert。请先处理后再试。",
      { modal: true },
      "中止 revert"
    );

    if (action === "中止 revert") {
      await this.gitOps.abortRevert();
      vscode.window.showInformationMessage("已中止 revert，仓库已恢复");
      return true;
    }

    return false;
  }

  private async confirmRollback(
    currentBranch: string,
    latestMerge: LatestMergeCommit,
    shortHash: string,
    strategy: MergeRollbackStrategy,
    commitsAfterMerge: number,
    predictedConflicts: string[]
  ): Promise<void> {
    const mergedHint = latestMerge.mergedBranchHint
      ? `\n合入的分支（参考）: ${latestMerge.mergedBranchHint}`
      : "";

    const riskLines: string[] = [];
    if (commitsAfterMerge > 0) {
      riskLines.push(
        `⚠ 该 merge 之后又有 ${commitsAfterMerge} 个提交。`
      );
    }
    if (strategy === "revert" && predictedConflicts.length > 0) {
      riskLines.push(
        `⚠ revert 预检约 ${predictedConflicts.length} 个文件可能冲突。`
      );
    }

    const actionDesc =
      strategy === "reset"
        ? `将执行 git reset --hard 到 merge 前（${latestMerge.parentHashes[0].slice(0, 7)}），移除 merge 提交 ${shortHash}。`
        : "将执行 git revert -m 1，生成反向提交并保留历史。";

    const confirmLabel =
      strategy === "reset"
        ? "确认 reset"
        : predictedConflicts.length > 0
          ? "仍要 revert"
          : "确认 revert";

    const confirm = await vscode.window.showWarningMessage(
      `分支「${currentBranch}」撤销合入的 merge：\n` +
        `提交: ${shortHash} — ${latestMerge.subject}` +
        mergedHint +
        (riskLines.length ? `\n\n${riskLines.join("\n")}` : "") +
        `\n\n${actionDesc}` +
        (strategy === "reset"
          ? "\n若该 merge 已推送，之后需 force-with-lease 推送。"
          : "\n若冲突可在向导中解决或中止。"),
      { modal: true },
      confirmLabel
    );

    if (confirm !== confirmLabel) {
      throw AppError.userCancelled("已取消回滚");
    }
  }

  private async executeResetRollback(
    latestMerge: LatestMergeCommit,
    currentBranch: string,
    shortHash: string
  ): Promise<void> {
    const targetCommit = latestMerge.parentHashes[0];
    await this.gitOps.resetHardToCommit(targetCommit);

    const pushChoice = await vscode.window.showInformationMessage(
      `✓ 已 reset 移除 merge ${shortHash}（当前指向 ${targetCommit.slice(0, 7)}）`,
      "推送",
      "暂不推送"
    );

    if (pushChoice === "推送") {
      const remoteExists = await this.gitOps.checkRemoteBranchExists(currentBranch);
      try {
        await this.gitOps.pushBranch(currentBranch, !remoteExists);
        vscode.window.showInformationMessage(
          `✓ 已推送到 origin/${currentBranch}`
        );
      } catch {
        const useLease = await vscode.window.showWarningMessage(
          "普通 push 失败（常见于 reset 回滚后）。是否改用 force-with-lease 推送？",
          { modal: true },
          "force-with-lease 推送"
        );
        if (useLease === "force-with-lease 推送") {
          try {
            await this.gitOps.fetchRemote("origin");
          } catch {
            // ignore
          }
          await this.gitOps.pushBranchForceWithLease(
            currentBranch,
            "origin",
            !remoteExists
          );
          vscode.window.showInformationMessage(
            `✓ 已 force-with-lease 推送到 origin/${currentBranch}`
          );
        }
      }
    }
  }

  private async executeRevertRollback(
    latestMerge: LatestMergeCommit,
    currentBranch: string,
    shortHash: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<void> {
    progress.report({ message: "正在 revert merge 提交...", increment: 50 });

    const result = await this.gitOps.revertMergeCommitSafe(latestMerge.hash, 1);

    if (result.status === "conflicts") {
      let resolution = await this.handleRevertConflicts(result.conflictFiles);

      while (resolution === "pending") {
        resolution = await this.handleRevertConflicts(
          await this.gitOps.getConflictFiles()
        );
      }

      if (resolution === "aborted") {
        throw AppError.userCancelled("已中止 revert");
      }
    }

    progress.report({ message: "完成 revert 提交...", increment: 80 });
    await this.finishRevertCommit();

    const pushChoice = await vscode.window.showInformationMessage(
      `✓ 已 revert merge ${shortHash}，是否推送到远程？`,
      "推送",
      "暂不推送"
    );

    if (pushChoice === "推送") {
      progress.report({ message: "推送到远程...", increment: 0 });
      const remoteExists = await this.gitOps.checkRemoteBranchExists(currentBranch);
      await this.gitOps.pushBranch(currentBranch, !remoteExists);
      vscode.window.showInformationMessage(`✓ 已推送到 origin/${currentBranch}`);
    }
  }

  async rollbackLastMerge(): Promise<void> {
    if (MergeRevertService.isOperationInProgress) {
      vscode.window.showWarningMessage(
        "已有 Git 工作流操作正在进行中，请等待完成后再试"
      );
      return;
    }

    MergeRevertService.isOperationInProgress = true;

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "回滚合入当前分支的合并",
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: "检查仓库状态...", increment: 10 });

          if (!(await this.gitOps.checkGitRepository())) {
            throw new AppError("当前目录不是有效的Git仓库", "NOT_GIT_REPO", {
              stage: "rollbackLastMerge",
            });
          }

          if (!(await this.handleStuckRevertState())) {
            throw AppError.userCancelled("请先处理未完成的 revert");
          }

          if (await this.gitOps.isMergeInProgress()) {
            throw new AppError(
              "当前存在未完成的合并，请先解决冲突或中止合并",
              "UNKNOWN",
              { stage: "rollbackLastMerge" }
            );
          }

          if (await this.gitOps.checkUncommittedChanges()) {
            throw new AppError(
              "工作区有未提交的更改，请先提交或贮藏后再回滚",
              "UNKNOWN",
              { stage: "rollbackLastMerge" }
            );
          }

          const currentBranch = await this.gitOps.getCurrentBranch();
          if (!currentBranch) {
            throw new AppError(
              "无法识别当前分支（可能处于 detached HEAD）",
              "UNKNOWN",
              { stage: "rollbackLastMerge" }
            );
          }

          progress.report({
            message: "查找最近一次合入当前分支的 merge...",
            increment: 20,
          });

          const latestMerge = await this.gitOps.getLatestIncomingMergeCommit(
            currentBranch
          );
          if (!latestMerge) {
            throw new AppError(
              "当前分支主线上未找到「其他分支合入本分支」的 merge 提交。",
              "UNKNOWN",
              { stage: "rollbackLastMerge" }
            );
          }

          const shortHash = latestMerge.hash.slice(0, 7);
          const commitsAfterMerge = await this.gitOps.countCommitsSince(
            latestMerge.hash
          );

          const strategy = await this.resolveRollbackStrategy(commitsAfterMerge);

          let predictedConflicts: string[] = [];
          if (strategy === "revert") {
            progress.report({ message: "预检 revert 冲突...", increment: 30 });
            predictedConflicts = await this.gitOps.previewRevertMergeConflicts(
              latestMerge.hash,
              1
            );
          }

          await this.confirmRollback(
            currentBranch,
            latestMerge,
            shortHash,
            strategy,
            commitsAfterMerge,
            predictedConflicts
          );

          if (strategy === "reset") {
            progress.report({ message: "正在 reset 到 merge 前...", increment: 60 });
            await this.executeResetRollback(latestMerge, currentBranch, shortHash);
          } else {
            await this.executeRevertRollback(
              latestMerge,
              currentBranch,
              shortHash,
              progress
            );
          }

          progress.report({ message: "完成", increment: 100 });
        }
      );
    } catch (error: unknown) {
      if (await this.gitOps.isRevertInProgress()) {
        const cleanup = await vscode.window.showErrorMessage(
          "revert 未完成。建议中止以恢复。",
          "中止 revert",
          "稍后手动处理"
        );
        if (cleanup === "中止 revert") {
          try {
            await this.gitOps.abortRevert();
            vscode.window.showInformationMessage("已中止 revert");
          } catch {
            // ignore
          }
        }
      }

      const appError = toAppError(error, "未知错误");
      if (isUserCancelledError(appError)) {
        vscode.window.showInformationMessage(`已取消回滚: ${appError.message}`);
        return;
      }
      const stageText = appError.stage ? ` [${appError.stage}]` : "";
      vscode.window.showErrorMessage(`回滚失败${stageText}: ${appError.message}`);
    } finally {
      MergeRevertService.isOperationInProgress = false;
    }
  }
}
