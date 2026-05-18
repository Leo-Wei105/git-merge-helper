import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AppError, toAppError } from "./errors";
import { BranchBaseInfo, GitOperations } from "./gitOperations";

const SOURCE_LABELS: Record<BranchBaseInfo["source"], string> = {
  config: "插件创建时记录",
  reflog: "Git reflog",
  inferred: "分支历史推测",
  unknown: "未知",
};

/**
 * 展示当前分支的创建基分支
 */
export class BranchBaseService {
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

  async showCurrentBranchBase(): Promise<void> {
    try {
      if (!(await this.gitOps.checkGitRepository())) {
        throw new AppError("当前目录不是有效的Git仓库", "NOT_GIT_REPO", {
          stage: "showCurrentBranchBase",
        });
      }

      const branchName = await this.gitOps.getCurrentBranch();
      if (!branchName) {
        throw new AppError(
          "当前处于 detached HEAD，无法判断分支基线",
          "UNKNOWN",
          { stage: "showCurrentBranchBase" }
        );
      }

      const extraCandidates = vscode.workspace
        .getConfiguration("gitWorkflowHelper")
        .get<string[]>("targetBranches", []);

      const info = await this.gitOps.resolveBranchBaseInfo(
        branchName,
        extraCandidates
      );

      if (info.baseBranch) {
        await this.showResolvedBase(info);
        return;
      }

      if (info.candidates?.length) {
        await this.showAmbiguousCandidates(info);
        return;
      }

      vscode.window.showWarningMessage(
        `无法确定分支「${branchName}」的创建基分支。\n` +
          "若由本插件创建，请使用较新版本重新创建；也可在 reflog 过期前尝试查看 Git 历史。"
      );
    } catch (error: unknown) {
      const appError = toAppError(error, "未知错误");
      const stageText = appError.stage ? ` [${appError.stage}]` : "";
      vscode.window.showErrorMessage(
        `查询基分支失败${stageText}: ${appError.message}`
      );
    }
  }

  private async showResolvedBase(info: BranchBaseInfo): Promise<void> {
    const shortCommit = info.baseCommit?.slice(0, 7);
    const commitLine = shortCommit ? `\n分叉提交: ${shortCommit}` : "";
    const sourceLabel = SOURCE_LABELS[info.source];

    const detail =
      `当前分支: ${info.branchName}\n` +
      `基分支: ${info.baseBranch}\n` +
      `依据: ${sourceLabel}` +
      commitLine;

    await vscode.window.showInformationMessage(detail, { modal: true });
  }

  private async showAmbiguousCandidates(info: BranchBaseInfo): Promise<void> {
    const items = info.candidates!.map((name) => ({
      label: name,
      description: "可能的基础分支",
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `分支「${info.branchName}」可能基于以下分支之一创建，请选择最符合的一项`,
      title: "基分支（多个候选）",
    });

    if (!selected) {
      return;
    }

    const resolved: BranchBaseInfo = {
      ...info,
      baseBranch: selected.label,
    };
    await this.showResolvedBase(resolved);
  }
}
