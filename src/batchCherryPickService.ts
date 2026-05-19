import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { selectCommitsForCherryPick } from "./cherryPickCommitFilter";
import { AppError, isUserCancelledError, toAppError } from "./errors";
import { ConflictResolution, GitConflictHandler } from "./gitConflictHandler";
import { CherryPickCommitInfo, GitOperations } from "./gitOperations";
/**
 * 批量 Cherry-pick（优选）：从源分支选取多个提交应用到当前分支
 */
export class BatchCherryPickService {
    private gitOps: GitOperations;
    private static isOperationInProgress = false;
    constructor(workspaceRoot: string) {
        const gitDir = path.join(workspaceRoot, ".git");
        if (!fs.existsSync(gitDir)) {
            throw new AppError(vscode.l10n.t("\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u662FGit\u4ED3\u5E93\uFF0C\u8BF7\u5728Git\u9879\u76EE\u4E2D\u4F7F\u7528\u6B64\u63D2\u4EF6"), "NOT_GIT_REPO", { stage: "init" });
        }
        this.gitOps = new GitOperations(workspaceRoot);
    }
    private getMaxCommitsToList(): number {
        const configured = vscode.workspace
            .getConfiguration("gitWorkflowHelper")
            .get<number>("maxCherryPickCommitsToList", 50);
        if (!Number.isFinite(configured)) {
            return 50;
        }
        return Math.min(200, Math.max(10, Math.floor(configured)));
    }
    private shouldRecordOrigin(): boolean {
        return vscode.workspace
            .getConfiguration("gitWorkflowHelper")
            .get<boolean>("cherryPickRecordOrigin", true);
    }
    private getConflictHandler(): GitConflictHandler {
        return new GitConflictHandler(this.gitOps.getWorkspaceRoot());
    }
    async runBatchCherryPick(): Promise<void> {
        if (BatchCherryPickService.isOperationInProgress) {
            vscode.window.showWarningMessage(vscode.l10n.t("\u5DF2\u6709 Git \u5DE5\u4F5C\u6D41\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210\u540E\u518D\u8BD5"));
            return;
        }
        BatchCherryPickService.isOperationInProgress = true;
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t("\u6279\u91CF Cherry-pick"),
                cancellable: false,
            }, async (progress) => {
                progress.report({ message: vscode.l10n.t("\u68C0\u67E5\u4ED3\u5E93\u72B6\u6001..."), increment: 5 });
                if (!(await this.gitOps.checkGitRepository())) {
                    throw new AppError(vscode.l10n.t("\u5F53\u524D\u76EE\u5F55\u4E0D\u662F\u6709\u6548\u7684Git\u4ED3\u5E93"), "NOT_GIT_REPO", {
                        stage: "runBatchCherryPick",
                    });
                }
                const ongoing = await this.gitOps.detectGitSequencerOperation();
                if (ongoing) {
                    throw new AppError(vscode.l10n.t("\u5F53\u524D\u5B58\u5728\u672A\u5B8C\u6210\u7684 {0} \u64CD\u4F5C\uFF0C\u8BF7\u5148\u5B8C\u6210\u6216\u53D6\u6D88\u540E\u518D\u6279\u91CF\u4F18\u9009", String(ongoing)), "UNKNOWN", { stage: "runBatchCherryPick" });
                }
                if (await this.gitOps.checkUncommittedChanges()) {
                    throw new AppError(vscode.l10n.t("\u5DE5\u4F5C\u533A\u6709\u672A\u63D0\u4EA4\u7684\u66F4\u6539\uFF0C\u8BF7\u5148\u63D0\u4EA4\u6216\u8D2E\u85CF\u540E\u518D\u4F18\u9009"), "UNKNOWN", { stage: "runBatchCherryPick" });
                }
                const currentBranch = await this.gitOps.getCurrentBranch();
                if (!currentBranch) {
                    throw new AppError(vscode.l10n.t("\u5F53\u524D\u5904\u4E8E detached HEAD\uFF0C\u65E0\u6CD5\u6267\u884C cherry-pick"), "UNKNOWN", { stage: "runBatchCherryPick" });
                }
                progress.report({ message: vscode.l10n.t("\u540C\u6B65\u8FDC\u7A0B\u5F15\u7528..."), increment: 10 });
                try {
                    await this.gitOps.fetchRemote("origin");
                }
                catch {
                    vscode.window.showWarningMessage(vscode.l10n.t("\u83B7\u53D6\u8FDC\u7A0B\u5206\u652F\u5931\u8D25\uFF0C\u5C06\u57FA\u4E8E\u672C\u5730\u5206\u652F\u5217\u8868\u7EE7\u7EED"));
                }
                const sourceBranch = await this.selectSourceBranch(currentBranch);
                if (!sourceBranch) {
                    throw AppError.userCancelled(vscode.l10n.t("\u672A\u9009\u62E9\u6E90\u5206\u652F"));
                }
                progress.report({
                    message: vscode.l10n.t("\u52A0\u8F7D {0} \u4E0A\u53EF\u4F18\u9009\u7684\u63D0\u4EA4...", String(sourceBranch)),
                    increment: 15,
                });
                const candidates = await this.gitOps.getCherryPickCandidates(sourceBranch, this.getMaxCommitsToList());
                if (candidates.length === 0) {
                    throw new AppError(vscode.l10n.t("\u5206\u652F\u300C{0}\u300D\u4E0A\u6CA1\u6709\u53EF\u4F18\u9009\u7684\u63D0\u4EA4\uFF08\u76F8\u5BF9\u5F53\u524D\u5206\u652F\u5DF2\u5168\u90E8\u5305\u542B\uFF09", String(sourceBranch)), "UNKNOWN", { stage: "runBatchCherryPick" });
                }
                const selectedCommits = await selectCommitsForCherryPick(candidates);
                if (!selectedCommits || selectedCommits.length === 0) {
                    throw AppError.userCancelled(vscode.l10n.t("\u672A\u9009\u62E9\u63D0\u4EA4"));
                }
                const recordOrigin = this.shouldRecordOrigin();
                const confirm = await vscode.window.showWarningMessage(vscode.l10n.t("\u5C06\u628A {0} \u4E2A\u63D0\u4EA4\u4ECE\u300C{1}\u300D\u4F18\u9009\u5230\u5F53\u524D\u5206\u652F\u300C{2}\u300D\uFF1A\n", String(selectedCommits.length), String(sourceBranch), String(currentBranch)) +
                    selectedCommits
                        .map((c) => `${c.shortHash} ${c.subject}`)
                        .slice(0, 8)
                        .join("\n") +
                    (selectedCommits.length > 8
                        ? vscode.l10n.t("\n\u2026 \u53E6\u6709 {0} \u4E2A", String(selectedCommits.length - 8)) : "") + vscode.l10n.t("\n\n\u6309\u4ECE\u65E7\u5230\u65B0\u987A\u5E8F\u4F9D\u6B21 cherry-pick") +
                    (recordOrigin ? vscode.l10n.t("\uFF08\u5E26 -x \u8BB0\u5F55\u6765\u6E90\uFF09") : "") +
                    "。", { modal: true }, vscode.l10n.t("\u5F00\u59CB\u4F18\u9009"));
                if (confirm !== vscode.l10n.t("\u5F00\u59CB\u4F18\u9009")) {
                    throw AppError.userCancelled(vscode.l10n.t("\u5DF2\u53D6\u6D88\u6279\u91CF\u4F18\u9009"));
                }
                const result = await this.applyCherryPicks(selectedCommits, recordOrigin, progress);
                if (result.aborted) {
                    throw AppError.userCancelled(vscode.l10n.t("\u5DF2\u4E2D\u6B62\u3002\u6210\u529F {0} \u4E2A\uFF0C\u8DF3\u8FC7 {1} \u4E2A", String(result.successCount), String(result.skippedCount)));
                }
                vscode.window.showInformationMessage(vscode.l10n.t("\u2713 \u6279\u91CF\u4F18\u9009\u5B8C\u6210\uFF1A\u6210\u529F {0} \u4E2A", String(result.successCount)) +
                    (result.skippedCount > 0
                        ? vscode.l10n.t("\uFF0C\u8DF3\u8FC7 {0} \u4E2A\uFF08\u7A7A\u63D0\u4EA4/\u5DF2\u5305\u542B\uFF09", String(result.skippedCount)) : ""));
            });
        }
        catch (error: unknown) {
            const appError = toAppError(error, vscode.l10n.t("\u672A\u77E5\u9519\u8BEF"));
            if (isUserCancelledError(appError)) {
                vscode.window.showInformationMessage(vscode.l10n.t("\u5DF2\u53D6\u6D88\u4F18\u9009: {0}", String(appError.message)));
                return;
            }
            const stageText = appError.stage ? ` [${appError.stage}]` : "";
            vscode.window.showErrorMessage(vscode.l10n.t("\u6279\u91CF\u4F18\u9009\u5931\u8D25{0}: {1}", String(stageText), String(appError.message)));
        }
        finally {
            BatchCherryPickService.isOperationInProgress = false;
        }
    }
    private async selectSourceBranch(currentBranch: string): Promise<string | undefined> {
        const configBranches = vscode.workspace
            .getConfiguration("gitWorkflowHelper")
            .get<string[]>("targetBranches", []);
        const allNames = [
            ...new Set([...configBranches, ...(await this.gitOps.listBranchNames())]),
        ]
            .filter((name) => name !== currentBranch)
            .sort((a, b) => a.localeCompare(b));
        if (allNames.length === 0) {
            throw new AppError(vscode.l10n.t("\u6CA1\u6709\u53EF\u9009\u62E9\u7684\u6E90\u5206\u652F"), "UNKNOWN", {
                stage: "selectSourceBranch",
            });
        }
        const picked = await vscode.window.showQuickPick(allNames.map((name) => ({
            label: name,
            description: configBranches.includes(name) ? vscode.l10n.t("\u914D\u7F6E\u4E2D\u7684\u76EE\u6807\u5206\u652F") : undefined,
        })), {
            placeHolder: vscode.l10n.t("\u5F53\u524D\u5206\u652F\uFF1A{0}\uFF0C\u8BF7\u9009\u62E9\u63D0\u4EA4\u6765\u6E90\u5206\u652F", String(currentBranch)),
            title: vscode.l10n.t("\u6279\u91CF\u4F18\u9009 - \u6E90\u5206\u652F"),
        });
        return picked?.label;
    }
    private async applyCherryPicks(commits: CherryPickCommitInfo[], recordOrigin: boolean, progress: vscode.Progress<{
        message?: string;
        increment?: number;
    }>): Promise<{
        successCount: number;
        skippedCount: number;
        aborted: boolean;
    }> {
        let successCount = 0;
        let skippedCount = 0;
        const conflictHandler = this.getConflictHandler();
        for (let i = 0; i < commits.length; i++) {
            const commit = commits[i];
            const step = Math.floor(((i + 1) / commits.length) * 80) + 15;
            progress.report({
                message: vscode.l10n.t("\u4F18\u9009 {0}/{1}: {2}", String(i + 1), String(commits.length), String(commit.shortHash)),
                increment: step,
            });
            const outcome = await this.gitOps.cherryPickCommit(commit.hash, recordOrigin);
            if (outcome === "success") {
                successCount++;
                continue;
            }
            if (outcome === "empty") {
                const action = await vscode.window.showWarningMessage(vscode.l10n.t("\u63D0\u4EA4 {0} \u4F18\u9009\u540E\u65E0\u53D8\u66F4\uFF08\u53EF\u80FD\u5DF2\u5305\u542B\uFF09\uFF0C\u662F\u5426\u8DF3\u8FC7\u5E76\u7EE7\u7EED\uFF1F", String(commit.shortHash)), { modal: true }, vscode.l10n.t("\u8DF3\u8FC7\u5E76\u7EE7\u7EED"), vscode.l10n.t("\u4E2D\u6B62\u4F18\u9009"));
                if (action === vscode.l10n.t("\u8DF3\u8FC7\u5E76\u7EE7\u7EED")) {
                    try {
                        if (await this.gitOps.isCherryPickInProgress()) {
                            await this.gitOps.cherryPickSkip();
                        }
                    }
                    catch {
                        // 可能无需 skip
                    }
                    skippedCount++;
                    continue;
                }
                await this.abortCherryPickIfNeeded();
                return { successCount, skippedCount, aborted: true };
            }
            const resolution = await this.handleCherryPickConflict(conflictHandler, commit);
            if (resolution === "aborted") {
                return { successCount, skippedCount, aborted: true };
            }
            if (resolution === "pending") {
                throw new AppError(vscode.l10n.t("\u63D0\u4EA4 {0} \u51B2\u7A81\u672A\u89E3\u51B3\uFF0C\u6279\u91CF\u4F18\u9009\u5DF2\u6682\u505C", String(commit.shortHash)), "UNKNOWN", { stage: "applyCherryPicks" });
            }
            successCount++;
        }
        return { successCount, skippedCount, aborted: false };
    }
    private async handleCherryPickConflict(conflictHandler: GitConflictHandler, commit: CherryPickCommitInfo): Promise<ConflictResolution> {
        vscode.window.showWarningMessage(vscode.l10n.t("\u4F18\u9009 {0} \u65F6\u53D1\u751F\u51B2\u7A81\uFF0C\u8BF7\u5904\u7406\u540E\u518D\u7EE7\u7EED", String(commit.shortHash)));
        let resolution = await conflictHandler.runConflictWizard("cherry_pick", await this.gitOps.getConflictFiles());
        while (resolution === "pending") {
            resolution = await conflictHandler.runConflictWizard("cherry_pick", await this.gitOps.getConflictFiles());
        }
        return resolution;
    }
    private async abortCherryPickIfNeeded(): Promise<void> {
        if (await this.gitOps.isCherryPickInProgress()) {
            await this.gitOps.abortCherryPick();
        }
    }
}
