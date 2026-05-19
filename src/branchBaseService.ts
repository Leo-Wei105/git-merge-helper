import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AppError, toAppError } from "./errors";
import { BranchBaseInfo, GitOperations } from "./gitOperations";
const SOURCE_LABELS: Record<BranchBaseInfo["source"], string> = {
    config: vscode.l10n.t("插件创建时记录"),
    reflog: "Git reflog",
    inferred: vscode.l10n.t("分支历史推测"),
    unknown: vscode.l10n.t("未知"),
};
/**
 * 展示当前分支的创建基分支
 */
export class BranchBaseService {
    private gitOps: GitOperations;
    constructor(workspaceRoot: string) {
        const gitDir = path.join(workspaceRoot, ".git");
        if (!fs.existsSync(gitDir)) {
            throw new AppError(vscode.l10n.t("当前工作区不是Git仓库，请在Git项目中使用此插件"), "NOT_GIT_REPO", { stage: "init" });
        }
        this.gitOps = new GitOperations(workspaceRoot);
    }
    async showCurrentBranchBase(): Promise<void> {
        try {
            if (!(await this.gitOps.checkGitRepository())) {
                throw new AppError(vscode.l10n.t("当前目录不是有效的Git仓库"), "NOT_GIT_REPO", {
                    stage: "showCurrentBranchBase",
                });
            }
            const branchName = await this.gitOps.getCurrentBranch();
            if (!branchName) {
                throw new AppError(vscode.l10n.t("当前处于 detached HEAD，无法判断分支基线"), "UNKNOWN", { stage: "showCurrentBranchBase" });
            }
            const extraCandidates = vscode.workspace
                .getConfiguration("gitWorkflowHelper")
                .get<string[]>("targetBranches", []);
            const info = await this.gitOps.resolveBranchBaseInfo(branchName, extraCandidates);
            if (info.baseBranch) {
                await this.showResolvedBase(info);
                return;
            }
            if (info.candidates?.length) {
                await this.showAmbiguousCandidates(info);
                return;
            }
            vscode.window.showWarningMessage(vscode.l10n.t("无法确定分支「{0}」的创建基分支。\n", String(branchName)) + vscode.l10n.t("若由本插件创建，请使用较新版本重新创建；也可在 reflog 过期前尝试查看 Git 历史。"));
        }
        catch (error: unknown) {
            const appError = toAppError(error, vscode.l10n.t("未知错误"));
            const stageText = appError.stage ? ` [${appError.stage}]` : "";
            vscode.window.showErrorMessage(vscode.l10n.t("查询基分支失败{0}: {1}", String(stageText), String(appError.message)));
        }
    }
    private async showResolvedBase(info: BranchBaseInfo): Promise<void> {
        const shortCommit = info.baseCommit?.slice(0, 7);
        const commitLine = shortCommit ? vscode.l10n.t("\n分叉提交: {0}", String(shortCommit)) : "";
        const sourceLabel = SOURCE_LABELS[info.source];
        const detail = vscode.l10n.t("当前分支: {0}\n", String(info.branchName)) + vscode.l10n.t("基分支: {0}\n", String(info.baseBranch)) + vscode.l10n.t("依据: {0}", String(sourceLabel)) +
            commitLine;
        await vscode.window.showInformationMessage(detail, { modal: true });
    }
    private async showAmbiguousCandidates(info: BranchBaseInfo): Promise<void> {
        const items = info.candidates!.map((name) => ({
            label: name,
            description: vscode.l10n.t("可能的基础分支"),
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: vscode.l10n.t("分支「{0}」可能基于以下分支之一创建，请选择最符合的一项", String(info.branchName)),
            title: vscode.l10n.t("基分支（多个候选）"),
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
