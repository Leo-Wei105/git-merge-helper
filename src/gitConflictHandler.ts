import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
    AppError,
    isGitHookFailure,
    isUserCancelledError,
    toAppError,
} from "./errors";
import { GitOperations, GitSequencerOperation } from "./gitOperations";

export type ConflictResolution = "resolved" | "aborted" | "pending";

const OPERATION_LABELS: Record<
  Exclude<GitSequencerOperation, null>,
  { name: string; abort: string; continue: string }
> = {
  merge: {
    name: "合并",
    abort: "取消合并",
    continue: "完成合并",
  },
  revert: {
    name: "回滚",
    abort: "取消回滚",
    continue: "完成回滚",
  },
  cherry_pick: {
    name: "Cherry-pick",
    abort: "取消 Cherry-pick",
    continue: "完成 Cherry-pick",
  },
  rebase: {
    name: "Rebase",
    abort: "取消 Rebase",
    continue: "完成 Rebase",
  },
};

/**
 * 统一的 Git 冲突提示与处理（合并 / 回滚 / cherry-pick / rebase）
 */
export class GitConflictHandler {
  private gitOps: GitOperations;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    const gitDir = path.join(workspaceRoot, ".git");
    if (!fs.existsSync(gitDir)) {
      throw new AppError(
        "当前工作区不是Git仓库",
        "NOT_GIT_REPO",
        { stage: "GitConflictHandler" }
      );
    }
    this.workspaceRoot = workspaceRoot;
    this.gitOps = new GitOperations(workspaceRoot);
  }

  /**
   * 命令入口：检测冲突与进行中的 Git 操作并引导处理
   */
  async handleConflictsInteractively(): Promise<void> {
    const operation = await this.gitOps.detectGitSequencerOperation();
    const conflictFiles = await this.gitOps.getConflictFiles();
    const hasConflicts = conflictFiles.length > 0;

    if (!operation && !hasConflicts) {
      vscode.window.showInformationMessage("当前没有检测到 Git 冲突或进行中的合并类操作");
      return;
    }

    if (!operation && hasConflicts) {
      await this.showConflictNotification(
        conflictFiles,
        null,
        "检测到文件冲突，但未识别到进行中的 merge/revert/cherry-pick/rebase。请手动处理或清理仓库状态。"
      );
      return;
    }

    const result = await this.runConflictWizard(
      operation!,
      conflictFiles.length > 0 ? conflictFiles : await this.gitOps.getConflictFiles()
    );

    if (result === "resolved") {
      vscode.window.showInformationMessage("✓ 冲突已处理完成");
    } else if (result === "aborted") {
      vscode.window.showInformationMessage("已取消当前 Git 操作，仓库已恢复");
    }
  }

  /**
   * 流程内调用：有冲突文件时进入向导
   */
  async runConflictWizard(
    operation: GitSequencerOperation,
    conflictFiles: string[]
  ): Promise<ConflictResolution> {
    if (conflictFiles.length === 0) {
      return this.waitUntilResolved(operation);
    }

    while (true) {
      const action = await this.promptConflictAction(conflictFiles, operation);

      switch (action) {
        case "resolve":
          await this.resolveConflicts(conflictFiles);
          return "pending";
        case "abort":
          await this.gitOps.abortGitSequencerOperation(operation);
          return "aborted";
        case "continue":
          return await this.waitUntilResolved(operation);
        default:
          return "pending";
      }
    }
  }

  private async showConflictNotification(
    conflictFiles: string[],
    operation: GitSequencerOperation | null,
    customMessage?: string
  ): Promise<void> {
    const opName = operation ? OPERATION_LABELS[operation].name : "Git 操作";
    const preview = conflictFiles.slice(0, 5).join("\n");
    const more =
      conflictFiles.length > 5
        ? `\n… 另有 ${conflictFiles.length - 5} 个文件`
        : "";
    const message =
      customMessage ??
      `${opName}存在 ${conflictFiles.length} 个冲突文件：\n${preview}${more}`;

    const op = operation ?? "merge";
    const labels = OPERATION_LABELS[op];

    await vscode.window
      .showWarningMessage(message, { modal: false }, "解决冲突", labels.abort)
      .then(async (choice) => {
        if (choice === "解决冲突") {
          await this.resolveConflicts(conflictFiles);
        } else if (choice === labels.abort && operation) {
          await this.gitOps.abortGitSequencerOperation(operation);
          vscode.window.showInformationMessage(`已${labels.abort}`);
        }
      });
  }

  private async promptConflictAction(
    conflictFiles: string[],
    operation: GitSequencerOperation
  ): Promise<"resolve" | "abort" | "continue" | "dismiss"> {
    const labels = OPERATION_LABELS[operation];
    const preview = conflictFiles.slice(0, 8).join("\n");
    const more =
      conflictFiles.length > 8
        ? `\n… 共 ${conflictFiles.length} 个文件`
        : "";

    const choice = await vscode.window.showWarningMessage(
      `${labels.name}冲突（${conflictFiles.length} 个文件）：\n${preview}${more}`,
      { modal: true },
      "解决冲突",
      labels.abort,
      "已解决，继续"
    );

    if (choice === "解决冲突") {
      return "resolve";
    }
    if (choice === labels.abort) {
      return "abort";
    }
    if (choice === "已解决，继续") {
      return "continue";
    }
    return "dismiss";
  }

  /**
   * 打开冲突文件：优先 Merge Editor，支持批量
   */
  async resolveConflicts(conflictFiles: string[]): Promise<void> {
    if (conflictFiles.length === 0) {
      return;
    }

    const maxOpen = this.getMaxConflictFilesToOpen();
    const action = await vscode.window.showQuickPick(
      [
        {
          label: "$(git-merge) 用合并编辑器打开（推荐）",
          value: "merge-editor",
          description: "逐个打开 VS Code 三向合并视图",
        },
        {
          label: "$(files) 批量打开前 N 个文件",
          value: "open-top-n",
          description: `N = ${maxOpen}（可在设置中调整）`,
        },
        {
          label: "$(file) 选择单个文件打开",
          value: "pick-one",
        },
      ],
      { placeHolder: "选择解决冲突的方式", title: "解决冲突" }
    );

    if (!action) {
      return;
    }

    if (action.value === "pick-one") {
      const selected = await vscode.window.showQuickPick(
        conflictFiles.map((file) => ({ label: file, value: file })),
        { placeHolder: "选择冲突文件" }
      );
      if (selected) {
        await this.openConflictFile(selected.value, true);
      }
      return;
    }

    const filesToOpen =
      action.value === "open-top-n"
        ? conflictFiles.slice(0, maxOpen)
        : conflictFiles.slice(0, Math.min(3, conflictFiles.length));

    for (const relativePath of filesToOpen) {
      await this.openConflictFile(
        relativePath,
        action.value === "merge-editor"
      );
    }
  }

  private async openConflictFile(
    relativePath: string,
    preferMergeEditor: boolean
  ): Promise<void> {
    const uri = vscode.Uri.file(path.join(this.workspaceRoot, relativePath));

    if (preferMergeEditor) {
      try {
        await vscode.commands.executeCommand("git.openMergeEditor", uri);
        return;
      } catch {
        // 未安装内置 Git 或版本不支持时回退
      }
    }

    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false });
  }

  private async waitUntilResolved(
    operation: GitSequencerOperation
  ): Promise<ConflictResolution> {
    const labels = OPERATION_LABELS[operation];

    while (true) {
      const conflictFiles = await this.gitOps.getConflictFiles();
      if (conflictFiles.length > 0) {
        const retry = await this.promptConflictAction(conflictFiles, operation);
        if (retry === "resolve") {
          await this.resolveConflicts(conflictFiles);
          continue;
        }
        if (retry === "abort") {
          await this.gitOps.abortGitSequencerOperation(operation);
          return "aborted";
        }
        if (retry === "dismiss") {
          return "pending";
        }
        continue;
      }

      const stillActive = await this.gitOps.isGitSequencerActive(operation);
      if (!stillActive) {
        return "resolved";
      }

      try {
        await this.completeSequencerOperation(operation);
        return "resolved";
      } catch (error: unknown) {
        const appError = toAppError(error);
        if (isUserCancelledError(appError)) {
          return "aborted";
        }

        const conflictAgain = await this.gitOps.getConflictFiles();
        if (conflictAgain.length > 0) {
          continue;
        }

        vscode.window.showErrorMessage(`继续${labels.name}失败: ${appError.message}`);
        return "pending";
      }
    }
  }

  /** 完成进行中的 revert（含钩子失败时的跳过确认） */
  async completeRevertOperation(): Promise<void> {
    await this.completeSequencerOperation("revert");
  }

  private async completeSequencerOperation(
    operation: GitSequencerOperation
  ): Promise<void> {
    switch (operation) {
      case "merge":
        await this.gitOps.completeMergeAfterConflicts();
        return;
      case "revert":
        await this.stageResolvedChangesIfNeeded();
        await this.continueRevertWithHookFallback();
        return;
      case "cherry_pick":
        await this.stageResolvedChangesIfNeeded();
        await this.gitOps.continueCherryPick();
        return;
      case "rebase":
        await this.stageResolvedChangesIfNeeded();
        await this.gitOps.continueRebase();
        return;
    }
  }

  private async stageResolvedChangesIfNeeded(): Promise<void> {
    if (!(await this.gitOps.checkUncommittedChanges())) {
      return;
    }
    if (!(await this.gitOps.checkStagedChanges())) {
      await this.gitOps.stageAllChanges();
    }
  }

  private async continueRevertWithHookFallback(): Promise<void> {
    const skipHooks = vscode.workspace
      .getConfiguration("gitWorkflowHelper")
      .get<boolean>("skipHooksOnRevert", false);

    if (skipHooks) {
      await this.gitOps.continueRevert({ skipHooks: true });
      return;
    }

    try {
      await this.gitOps.continueRevert();
    } catch (error: unknown) {
      if (!isGitHookFailure(error)) {
        throw error;
      }
      const retry = await vscode.window.showWarningMessage(
        "完成回滚时被 Git 钩子拦截。是否跳过钩子继续？",
        { modal: true },
        "跳过钩子完成"
      );
      if (retry !== "跳过钩子完成") {
        throw AppError.userCancelled("已取消完成回滚");
      }
      await this.gitOps.continueRevert({ skipHooks: true });
    }
  }

  private getMaxConflictFilesToOpen(): number {
    const configured = vscode.workspace
      .getConfiguration("gitWorkflowHelper")
      .get<number>("maxConflictFilesToOpen", 5);
    if (!Number.isFinite(configured)) {
      return 5;
    }
    return Math.min(20, Math.max(1, Math.floor(configured)));
  }
}
