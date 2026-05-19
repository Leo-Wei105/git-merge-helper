import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AppError, toAppError } from "./errors";
import { BranchBaseInfo, GitOperations } from "./gitOperations";
const SOURCE_LABELS: Record<BranchBaseInfo["source"], string> = {
    config: vscode.l10n.t("\u63D2\u4EF6\u521B\u5EFA\u65F6\u8BB0\u5F55"),
    reflog: "Git reflog",
    inferred: vscode.l10n.t("\u5206\u652F\u5386\u53F2\u63A8\u6D4B"),
    unknown: vscode.l10n.t("\u672A\u77E5"),
};
/**
 * 展示当前分支的创建基分支
 */
export class BranchBaseService {
    private gitOps: GitOperations;
    constructor(workspaceRoot: string) {
        const gitDir = path.join(workspaceRoot, ".git");
        if (!fs.existsSync(gitDir)) {
            throw new AppError(vscode.l10n.t("\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u662FGit\u4ED3\u5E93\uFF0C\u8BF7\u5728Git\u9879\u76EE\u4E2D\u4F7F\u7528\u6B64\u63D2\u4EF6"), "NOT_GIT_REPO", { stage: "init" });
        }
        this.gitOps = new GitOperations(workspaceRoot);
    }
    async showCurrentBranchBase(): Promise<void> {
        try {
            if (!(await this.gitOps.checkGitRepository())) {
                throw new AppError(vscode.l10n.t("\u5F53\u524D\u76EE\u5F55\u4E0D\u662F\u6709\u6548\u7684Git\u4ED3\u5E93"), "NOT_GIT_REPO", {
                    stage: "showCurrentBranchBase",
                });
            }
            const branchName = await this.gitOps.getCurrentBranch();
            if (!branchName) {
                throw new AppError(vscode.l10n.t("\u5F53\u524D\u5904\u4E8E detached HEAD\uFF0C\u65E0\u6CD5\u5224\u65AD\u5206\u652F\u57FA\u7EBF"), "UNKNOWN", { stage: "showCurrentBranchBase" });
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
            vscode.window.showWarningMessage(vscode.l10n.t("\u65E0\u6CD5\u786E\u5B9A\u5206\u652F\u300C{0}\u300D\u7684\u521B\u5EFA\u57FA\u5206\u652F\u3002\n", String(branchName)) + vscode.l10n.t("\u82E5\u7531\u672C\u63D2\u4EF6\u521B\u5EFA\uFF0C\u8BF7\u4F7F\u7528\u8F83\u65B0\u7248\u672C\u91CD\u65B0\u521B\u5EFA\uFF1B\u4E5F\u53EF\u5728 reflog \u8FC7\u671F\u524D\u5C1D\u8BD5\u67E5\u770B Git \u5386\u53F2\u3002"));
        }
        catch (error: unknown) {
            const appError = toAppError(error, vscode.l10n.t("\u672A\u77E5\u9519\u8BEF"));
            const stageText = appError.stage ? ` [${appError.stage}]` : "";
            vscode.window.showErrorMessage(vscode.l10n.t("\u67E5\u8BE2\u57FA\u5206\u652F\u5931\u8D25{0}: {1}", String(stageText), String(appError.message)));
        }
    }
    private async showResolvedBase(info: BranchBaseInfo): Promise<void> {
        const shortCommit = info.baseCommit?.slice(0, 7);
        const commitLine = shortCommit ? vscode.l10n.t("\n\u5206\u53C9\u63D0\u4EA4: {0}", String(shortCommit)) : "";
        const sourceLabel = SOURCE_LABELS[info.source];
        const detail = vscode.l10n.t("\u5F53\u524D\u5206\u652F: {0}\n", String(info.branchName)) + vscode.l10n.t("\u57FA\u5206\u652F: {0}\n", String(info.baseBranch)) + vscode.l10n.t("\u4F9D\u636E: {0}", String(sourceLabel)) +
            commitLine;
        await vscode.window.showInformationMessage(detail, { modal: true });
    }
    private async showAmbiguousCandidates(info: BranchBaseInfo): Promise<void> {
        const items = info.candidates!.map((name) => ({
            label: name,
            description: vscode.l10n.t("\u53EF\u80FD\u7684\u57FA\u7840\u5206\u652F"),
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: vscode.l10n.t("\u5206\u652F\u300C{0}\u300D\u53EF\u80FD\u57FA\u4E8E\u4EE5\u4E0B\u5206\u652F\u4E4B\u4E00\u521B\u5EFA\uFF0C\u8BF7\u9009\u62E9\u6700\u7B26\u5408\u7684\u4E00\u9879", String(info.branchName)),
            title: vscode.l10n.t("\u57FA\u5206\u652F\uFF08\u591A\u4E2A\u5019\u9009\uFF09"),
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
