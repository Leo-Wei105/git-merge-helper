import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AppError, isUserCancelledError, toAppError } from "./errors";
import { GitOperations } from "./gitOperations";

/**
 * 安全强制推送（git push --force-with-lease）
 */
export class GitPushService {
  private gitOps: GitOperations;

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

  async pushForceWithLease(): Promise<void> {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "force-with-lease 推送",
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: "检查仓库状态...", increment: 10 });

          if (!(await this.gitOps.checkGitRepository())) {
            throw new AppError("当前目录不是有效的Git仓库", "NOT_GIT_REPO", {
              stage: "pushForceWithLease",
            });
          }

          const branchName = await this.gitOps.getCurrentBranch();
          if (!branchName) {
            throw new AppError(
              "当前处于 detached HEAD，无法推送",
              "UNKNOWN",
              { stage: "pushForceWithLease" }
            );
          }

          if (await this.gitOps.checkUncommittedChanges()) {
            throw new AppError(
              "工作区有未提交的更改，请先提交或贮藏后再推送",
              "UNKNOWN",
              { stage: "pushForceWithLease" }
            );
          }

          progress.report({ message: "同步远程引用...", increment: 20 });
          try {
            await this.gitOps.fetchRemote("origin");
          } catch {
            vscode.window.showWarningMessage(
              "获取远程信息失败，force-with-lease 仍将执行，但保护可能不是最新"
            );
          }

          const upstream = await this.gitOps.getBranchUpstream(branchName);
          const remoteExists = await this.gitOps.checkRemoteBranchExists(branchName);
          const setUpstream = !upstream && !remoteExists;
          const pushTarget = setUpstream
            ? `origin/${branchName}（将建立上游）`
            : upstream ?? `origin/${branchName}`;

          const confirm = await vscode.window.showWarningMessage(
            `将把当前分支「${branchName}」以 --force-with-lease 推送到 ${pushTarget}。\n\n` +
              "若远程分支已有他人推送的新提交，操作会被拒绝（比 --force 更安全）。\n" +
              "仍会覆盖远程上与你本地不一致的提交，请确认团队允许后再继续。",
            { modal: true },
            "确认推送"
          );

          if (confirm !== "确认推送") {
            throw AppError.userCancelled("已取消推送");
          }

          progress.report({ message: "正在推送...", increment: 60 });
          await this.gitOps.pushBranchForceWithLease(
            branchName,
            "origin",
            setUpstream
          );

          progress.report({ message: "完成", increment: 100 });
          vscode.window.showInformationMessage(
            `✓ 已执行 git push --force-with-lease origin ${branchName}`
          );
        }
      );
    } catch (error: unknown) {
      const appError = toAppError(error, "未知错误");
      if (isUserCancelledError(appError)) {
        vscode.window.showInformationMessage(`已取消推送: ${appError.message}`);
        return;
      }
      const stageText = appError.stage ? ` [${appError.stage}]` : "";
      vscode.window.showErrorMessage(`推送失败${stageText}: ${appError.message}`);
    }
  }
}
