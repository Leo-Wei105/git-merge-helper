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
            throw new AppError(vscode.l10n.t("\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u662FGit\u4ED3\u5E93\uFF0C\u8BF7\u5728Git\u9879\u76EE\u4E2D\u4F7F\u7528\u6B64\u63D2\u4EF6"), "NOT_GIT_REPO", { stage: "init" });
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
    private async resolveRollbackStrategy(commitsAfterMerge: number): Promise<MergeRollbackStrategy> {
        const mode = this.getConfiguredRollbackMode();
        if (mode === "revert") {
            return "revert";
        }
        if (mode === "reset") {
            if (this.canUseReset(commitsAfterMerge)) {
                return "reset";
            }
            throw new AppError(vscode.l10n.t("\u5DF2\u914D\u7F6E\u4E3A reset \u56DE\u6EDA\uFF0C\u4F46\u8BE5 merge \u4E4B\u540E\u8FD8\u6709\u65B0\u63D0\u4EA4\uFF0C\u65E0\u6CD5\u5B89\u5168 reset\u3002\n") + vscode.l10n.t("\u8BF7\u5C06 gitWorkflowHelper.mergeRollbackStrategy \u6539\u4E3A revert \u6216 ask\uFF0C\u6216\u624B\u52A8\u5904\u7406\u3002"), "UNKNOWN", { stage: "resolveRollbackStrategy" });
        }
        // ask
        if (!this.canUseReset(commitsAfterMerge)) {
            const useRevert = await vscode.window.showWarningMessage(vscode.l10n.t("\u8BE5 merge \u4E4B\u540E\u5DF2\u6709\u5176\u4ED6\u63D0\u4EA4\uFF0C\u65E0\u6CD5\u4F7F\u7528 reset\uFF08\u4F1A\u4E22\u5931\u540E\u7EED\u63D0\u4EA4\uFF09\u3002\n\u662F\u5426\u6539\u7528 revert \u56DE\u6EDA\uFF1F"), { modal: true }, vscode.l10n.t("\u4F7F\u7528 revert"));
            if (useRevert !== vscode.l10n.t("\u4F7F\u7528 revert")) {
                throw AppError.userCancelled(vscode.l10n.t("\u5DF2\u53D6\u6D88\u56DE\u6EDA"));
            }
            return "revert";
        }
        const picked = await vscode.window.showQuickPick([
            {
                label: vscode.l10n.t("$(arrow-left) reset \u5230 merge \u524D"),
                description: vscode.l10n.t("git reset --hard\uFF0C\u79FB\u9664 merge \u63D0\u4EA4\uFF0C\u4E0D\u8DD1 revert\u3001\u4E0D\u65B0\u589E\u53CD\u5411\u63D0\u4EA4\uFF08\u63A8\u8350\uFF09"),
                value: "reset" as const,
            },
            {
                label: vscode.l10n.t("$(git-commit) revert \u751F\u6210\u53CD\u5411\u63D0\u4EA4"),
                description: vscode.l10n.t("git revert -m 1\uFF0C\u4FDD\u7559\u5386\u53F2\uFF0C\u53EF\u80FD\u51B2\u7A81\u5E76\u89E6\u53D1 pre-commit"),
                value: "revert" as const,
            },
        ], {
            placeHolder: vscode.l10n.t("\u9009\u62E9\u56DE\u6EDA\u65B9\u5F0F\uFF08\u9ED8\u8BA4\u63A8\u8350 reset\uFF09"),
            title: vscode.l10n.t("\u56DE\u6EDA\u65B9\u5F0F"),
        });
        if (!picked) {
            throw AppError.userCancelled(vscode.l10n.t("\u672A\u9009\u62E9\u56DE\u6EDA\u65B9\u5F0F"));
        }
        return picked.value;
    }
    private getConflictHandler(): GitConflictHandler {
        return new GitConflictHandler(this.gitOps.getWorkspaceRoot());
    }
    private async finishRevertCommit(): Promise<void> {
        await this.getConflictHandler().completeRevertOperation();
    }
    private async handleRevertConflicts(conflictFiles: string[]): Promise<ConflictResolution> {
        return this.getConflictHandler().runConflictWizard("revert", conflictFiles);
    }
    private async handleStuckRevertState(): Promise<boolean> {
        if (!(await this.gitOps.isRevertInProgress())) {
            return true;
        }
        const action = await vscode.window.showWarningMessage(vscode.l10n.t("\u68C0\u6D4B\u5230\u672A\u5B8C\u6210\u7684 revert\u3002\u8BF7\u5148\u5904\u7406\u540E\u518D\u8BD5\u3002"), { modal: true }, vscode.l10n.t("\u4E2D\u6B62 revert"));
        if (action === vscode.l10n.t("\u4E2D\u6B62 revert")) {
            await this.gitOps.abortRevert();
            vscode.window.showInformationMessage(vscode.l10n.t("\u5DF2\u4E2D\u6B62 revert\uFF0C\u4ED3\u5E93\u5DF2\u6062\u590D"));
            return true;
        }
        return false;
    }
    private async confirmRollback(currentBranch: string, latestMerge: LatestMergeCommit, shortHash: string, strategy: MergeRollbackStrategy, commitsAfterMerge: number, predictedConflicts: string[]): Promise<void> {
        const mergedHint = latestMerge.mergedBranchHint
            ? vscode.l10n.t("\n\u5408\u5165\u7684\u5206\u652F\uFF08\u53C2\u8003\uFF09: {0}", String(latestMerge.mergedBranchHint)) : "";
        const riskLines: string[] = [];
        if (commitsAfterMerge > 0) {
            riskLines.push(vscode.l10n.t("\u26A0 \u8BE5 merge \u4E4B\u540E\u53C8\u6709 {0} \u4E2A\u63D0\u4EA4\u3002", String(commitsAfterMerge)));
        }
        if (strategy === "revert" && predictedConflicts.length > 0) {
            riskLines.push(vscode.l10n.t("\u26A0 revert \u9884\u68C0\u7EA6 {0} \u4E2A\u6587\u4EF6\u53EF\u80FD\u51B2\u7A81\u3002", String(predictedConflicts.length)));
        }
        const actionDesc = strategy === "reset"
            ? vscode.l10n.t("\u5C06\u6267\u884C git reset --hard \u5230 merge \u524D\uFF08{0}\uFF09\uFF0C\u79FB\u9664 merge \u63D0\u4EA4 {1}\u3002", String(latestMerge.parentHashes[0].slice(0, 7)), String(shortHash)) : vscode.l10n.t("\u5C06\u6267\u884C git revert -m 1\uFF0C\u751F\u6210\u53CD\u5411\u63D0\u4EA4\u5E76\u4FDD\u7559\u5386\u53F2\u3002");
        const confirmLabel = strategy === "reset"
            ? vscode.l10n.t("\u786E\u8BA4 reset") : predictedConflicts.length > 0
            ? vscode.l10n.t("\u4ECD\u8981 revert") : vscode.l10n.t("\u786E\u8BA4 revert");
        const confirm = await vscode.window.showWarningMessage(vscode.l10n.t("\u5206\u652F\u300C{0}\u300D\u64A4\u9500\u5408\u5165\u7684 merge\uFF1A\n", String(currentBranch)) + vscode.l10n.t("\u63D0\u4EA4: {0} \u2014 {1}", String(shortHash), String(latestMerge.subject)) +
            mergedHint +
            (riskLines.length ? `\n\n${riskLines.join("\n")}` : "") +
            `\n\n${actionDesc}` +
            (strategy === "reset"
                ? vscode.l10n.t("\n\u82E5\u8BE5 merge \u5DF2\u63A8\u9001\uFF0C\u4E4B\u540E\u9700 force-with-lease \u63A8\u9001\u3002") : vscode.l10n.t("\n\u82E5\u51B2\u7A81\u53EF\u5728\u5411\u5BFC\u4E2D\u89E3\u51B3\u6216\u4E2D\u6B62\u3002")), { modal: true }, confirmLabel);
        if (confirm !== confirmLabel) {
            throw AppError.userCancelled(vscode.l10n.t("\u5DF2\u53D6\u6D88\u56DE\u6EDA"));
        }
    }
    private async executeResetRollback(latestMerge: LatestMergeCommit, currentBranch: string, shortHash: string): Promise<void> {
        const targetCommit = latestMerge.parentHashes[0];
        await this.gitOps.resetHardToCommit(targetCommit);
        const pushChoice = await vscode.window.showInformationMessage(vscode.l10n.t("\u2713 \u5DF2 reset \u79FB\u9664 merge {0}\uFF08\u5F53\u524D\u6307\u5411 {1}\uFF09", String(shortHash), String(targetCommit.slice(0, 7))), vscode.l10n.t("\u63A8\u9001"), vscode.l10n.t("\u6682\u4E0D\u63A8\u9001"));
        if (pushChoice === vscode.l10n.t("\u63A8\u9001")) {
            const remoteExists = await this.gitOps.checkRemoteBranchExists(currentBranch);
            try {
                await this.gitOps.pushBranch(currentBranch, !remoteExists);
                vscode.window.showInformationMessage(vscode.l10n.t("\u2713 \u5DF2\u63A8\u9001\u5230 origin/{0}", String(currentBranch)));
            }
            catch {
                const useLease = await vscode.window.showWarningMessage(vscode.l10n.t("\u666E\u901A push \u5931\u8D25\uFF08\u5E38\u89C1\u4E8E reset \u56DE\u6EDA\u540E\uFF09\u3002\u662F\u5426\u6539\u7528 force-with-lease \u63A8\u9001\uFF1F"), { modal: true }, vscode.l10n.t("force-with-lease \u63A8\u9001"));
                if (useLease === vscode.l10n.t("force-with-lease \u63A8\u9001")) {
                    try {
                        await this.gitOps.fetchRemote("origin");
                    }
                    catch {
                        // ignore
                    }
                    await this.gitOps.pushBranchForceWithLease(currentBranch, "origin", !remoteExists);
                    vscode.window.showInformationMessage(vscode.l10n.t("\u2713 \u5DF2 force-with-lease \u63A8\u9001\u5230 origin/{0}", String(currentBranch)));
                }
            }
        }
    }
    private async executeRevertRollback(latestMerge: LatestMergeCommit, currentBranch: string, shortHash: string, progress: vscode.Progress<{
        message?: string;
        increment?: number;
    }>): Promise<void> {
        progress.report({ message: vscode.l10n.t("\u6B63\u5728 revert merge \u63D0\u4EA4..."), increment: 50 });
        const result = await this.gitOps.revertMergeCommitSafe(latestMerge.hash, 1);
        if (result.status === "conflicts") {
            let resolution = await this.handleRevertConflicts(result.conflictFiles);
            while (resolution === "pending") {
                resolution = await this.handleRevertConflicts(await this.gitOps.getConflictFiles());
            }
            if (resolution === "aborted") {
                throw AppError.userCancelled(vscode.l10n.t("\u5DF2\u4E2D\u6B62 revert"));
            }
        }
        progress.report({ message: vscode.l10n.t("\u5B8C\u6210 revert \u63D0\u4EA4..."), increment: 80 });
        await this.finishRevertCommit();
        const pushChoice = await vscode.window.showInformationMessage(vscode.l10n.t("\u2713 \u5DF2 revert merge {0}\uFF0C\u662F\u5426\u63A8\u9001\u5230\u8FDC\u7A0B\uFF1F", String(shortHash)), vscode.l10n.t("\u63A8\u9001"), vscode.l10n.t("\u6682\u4E0D\u63A8\u9001"));
        if (pushChoice === vscode.l10n.t("\u63A8\u9001")) {
            progress.report({ message: vscode.l10n.t("\u63A8\u9001\u5230\u8FDC\u7A0B..."), increment: 0 });
            const remoteExists = await this.gitOps.checkRemoteBranchExists(currentBranch);
            await this.gitOps.pushBranch(currentBranch, !remoteExists);
            vscode.window.showInformationMessage(vscode.l10n.t("\u2713 \u5DF2\u63A8\u9001\u5230 origin/{0}", String(currentBranch)));
        }
    }
    async rollbackLastMerge(): Promise<void> {
        if (MergeRevertService.isOperationInProgress) {
            vscode.window.showWarningMessage(vscode.l10n.t("\u5DF2\u6709 Git \u5DE5\u4F5C\u6D41\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210\u540E\u518D\u8BD5"));
            return;
        }
        MergeRevertService.isOperationInProgress = true;
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t("\u56DE\u6EDA\u5408\u5165\u5F53\u524D\u5206\u652F\u7684\u5408\u5E76"),
                cancellable: false,
            }, async (progress) => {
                progress.report({ message: vscode.l10n.t("\u68C0\u67E5\u4ED3\u5E93\u72B6\u6001..."), increment: 10 });
                if (!(await this.gitOps.checkGitRepository())) {
                    throw new AppError(vscode.l10n.t("\u5F53\u524D\u76EE\u5F55\u4E0D\u662F\u6709\u6548\u7684Git\u4ED3\u5E93"), "NOT_GIT_REPO", {
                        stage: "rollbackLastMerge",
                    });
                }
                if (!(await this.handleStuckRevertState())) {
                    throw AppError.userCancelled(vscode.l10n.t("\u8BF7\u5148\u5904\u7406\u672A\u5B8C\u6210\u7684 revert"));
                }
                if (await this.gitOps.isMergeInProgress()) {
                    throw new AppError(vscode.l10n.t("\u5F53\u524D\u5B58\u5728\u672A\u5B8C\u6210\u7684\u5408\u5E76\uFF0C\u8BF7\u5148\u89E3\u51B3\u51B2\u7A81\u6216\u4E2D\u6B62\u5408\u5E76"), "UNKNOWN", { stage: "rollbackLastMerge" });
                }
                if (await this.gitOps.checkUncommittedChanges()) {
                    throw new AppError(vscode.l10n.t("\u5DE5\u4F5C\u533A\u6709\u672A\u63D0\u4EA4\u7684\u66F4\u6539\uFF0C\u8BF7\u5148\u63D0\u4EA4\u6216\u8D2E\u85CF\u540E\u518D\u56DE\u6EDA"), "UNKNOWN", { stage: "rollbackLastMerge" });
                }
                const currentBranch = await this.gitOps.getCurrentBranch();
                if (!currentBranch) {
                    throw new AppError(vscode.l10n.t("\u65E0\u6CD5\u8BC6\u522B\u5F53\u524D\u5206\u652F\uFF08\u53EF\u80FD\u5904\u4E8E detached HEAD\uFF09"), "UNKNOWN", { stage: "rollbackLastMerge" });
                }
                progress.report({
                    message: vscode.l10n.t("\u67E5\u627E\u6700\u8FD1\u4E00\u6B21\u5408\u5165\u5F53\u524D\u5206\u652F\u7684 merge..."),
                    increment: 20,
                });
                const latestMerge = await this.gitOps.getLatestIncomingMergeCommit(currentBranch);
                if (!latestMerge) {
                    throw new AppError(vscode.l10n.t("\u5F53\u524D\u5206\u652F\u4E3B\u7EBF\u4E0A\u672A\u627E\u5230\u300C\u5176\u4ED6\u5206\u652F\u5408\u5165\u672C\u5206\u652F\u300D\u7684 merge \u63D0\u4EA4\u3002"), "UNKNOWN", { stage: "rollbackLastMerge" });
                }
                const shortHash = latestMerge.hash.slice(0, 7);
                const commitsAfterMerge = await this.gitOps.countCommitsSince(latestMerge.hash);
                const strategy = await this.resolveRollbackStrategy(commitsAfterMerge);
                let predictedConflicts: string[] = [];
                if (strategy === "revert") {
                    progress.report({ message: vscode.l10n.t("\u9884\u68C0 revert \u51B2\u7A81..."), increment: 30 });
                    predictedConflicts = await this.gitOps.previewRevertMergeConflicts(latestMerge.hash, 1);
                }
                await this.confirmRollback(currentBranch, latestMerge, shortHash, strategy, commitsAfterMerge, predictedConflicts);
                if (strategy === "reset") {
                    progress.report({ message: vscode.l10n.t("\u6B63\u5728 reset \u5230 merge \u524D..."), increment: 60 });
                    await this.executeResetRollback(latestMerge, currentBranch, shortHash);
                }
                else {
                    await this.executeRevertRollback(latestMerge, currentBranch, shortHash, progress);
                }
                progress.report({ message: vscode.l10n.t("\u5B8C\u6210"), increment: 100 });
            });
        }
        catch (error: unknown) {
            if (await this.gitOps.isRevertInProgress()) {
                const cleanup = await vscode.window.showErrorMessage(vscode.l10n.t("revert \u672A\u5B8C\u6210\u3002\u5EFA\u8BAE\u4E2D\u6B62\u4EE5\u6062\u590D\u3002"), vscode.l10n.t("\u4E2D\u6B62 revert"), vscode.l10n.t("\u7A0D\u540E\u624B\u52A8\u5904\u7406"));
                if (cleanup === vscode.l10n.t("\u4E2D\u6B62 revert")) {
                    try {
                        await this.gitOps.abortRevert();
                        vscode.window.showInformationMessage(vscode.l10n.t("\u5DF2\u4E2D\u6B62 revert"));
                    }
                    catch {
                        // ignore
                    }
                }
            }
            const appError = toAppError(error, vscode.l10n.t("\u672A\u77E5\u9519\u8BEF"));
            if (isUserCancelledError(appError)) {
                vscode.window.showInformationMessage(vscode.l10n.t("\u5DF2\u53D6\u6D88\u56DE\u6EDA: {0}", String(appError.message)));
                return;
            }
            const stageText = appError.stage ? ` [${appError.stage}]` : "";
            vscode.window.showErrorMessage(vscode.l10n.t("\u56DE\u6EDA\u5931\u8D25{0}: {1}", String(stageText), String(appError.message)));
        }
        finally {
            MergeRevertService.isOperationInProgress = false;
        }
    }
}
