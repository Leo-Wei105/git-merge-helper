import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AppError, isGitHookFailure, isUserCancelledError, toAppError, } from "./errors";
import { GitOperations, GitSequencerOperation } from "./gitOperations";
export type ConflictResolution = "resolved" | "aborted" | "pending";
const OPERATION_LABELS: Record<Exclude<GitSequencerOperation, null>, {
    name: string;
    abort: string;
    continue: string;
}> = {
    merge: {
        name: vscode.l10n.t("\u5408\u5E76"),
        abort: vscode.l10n.t("\u53D6\u6D88\u5408\u5E76"),
        continue: vscode.l10n.t("\u5B8C\u6210\u5408\u5E76"),
    },
    revert: {
        name: vscode.l10n.t("\u56DE\u6EDA"),
        abort: vscode.l10n.t("\u53D6\u6D88\u56DE\u6EDA"),
        continue: vscode.l10n.t("\u5B8C\u6210\u56DE\u6EDA"),
    },
    cherry_pick: {
        name: "Cherry-pick",
        abort: vscode.l10n.t("\u53D6\u6D88 Cherry-pick"),
        continue: vscode.l10n.t("\u5B8C\u6210 Cherry-pick"),
    },
    rebase: {
        name: "Rebase",
        abort: vscode.l10n.t("\u53D6\u6D88 Rebase"),
        continue: vscode.l10n.t("\u5B8C\u6210 Rebase"),
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
            throw new AppError(vscode.l10n.t("\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u662FGit\u4ED3\u5E93"), "NOT_GIT_REPO", { stage: "GitConflictHandler" });
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
            vscode.window.showInformationMessage(vscode.l10n.t("\u5F53\u524D\u6CA1\u6709\u68C0\u6D4B\u5230 Git \u51B2\u7A81\u6216\u8FDB\u884C\u4E2D\u7684\u5408\u5E76\u7C7B\u64CD\u4F5C"));
            return;
        }
        if (!operation && hasConflicts) {
            await this.showConflictNotification(conflictFiles, null, vscode.l10n.t("\u68C0\u6D4B\u5230\u6587\u4EF6\u51B2\u7A81\uFF0C\u4F46\u672A\u8BC6\u522B\u5230\u8FDB\u884C\u4E2D\u7684 merge/revert/cherry-pick/rebase\u3002\u8BF7\u624B\u52A8\u5904\u7406\u6216\u6E05\u7406\u4ED3\u5E93\u72B6\u6001\u3002"));
            return;
        }
        const result = await this.runConflictWizard(operation!, conflictFiles.length > 0 ? conflictFiles : await this.gitOps.getConflictFiles());
        if (result === "resolved") {
            vscode.window.showInformationMessage(vscode.l10n.t("\u2713 \u51B2\u7A81\u5DF2\u5904\u7406\u5B8C\u6210"));
        }
        else if (result === "aborted") {
            vscode.window.showInformationMessage(vscode.l10n.t("\u5DF2\u53D6\u6D88\u5F53\u524D Git \u64CD\u4F5C\uFF0C\u4ED3\u5E93\u5DF2\u6062\u590D"));
        }
    }
    /**
     * 流程内调用：有冲突文件时进入向导
     */
    async runConflictWizard(operation: GitSequencerOperation, conflictFiles: string[]): Promise<ConflictResolution> {
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
    private async showConflictNotification(conflictFiles: string[], operation: GitSequencerOperation | null, customMessage?: string): Promise<void> {
        const opName = operation ? OPERATION_LABELS[operation].name : vscode.l10n.t("Git \u64CD\u4F5C");
        const preview = conflictFiles.slice(0, 5).join("\n");
        const more = conflictFiles.length > 5
            ? vscode.l10n.t("\n\u2026 \u53E6\u6709 {0} \u4E2A\u6587\u4EF6", String(conflictFiles.length - 5)) : "";
        const message = customMessage ?? vscode.l10n.t("{0}\u5B58\u5728 {1} \u4E2A\u51B2\u7A81\u6587\u4EF6\uFF1A\n{2}{3}", String(opName), String(conflictFiles.length), String(preview), String(more));
        const op = operation ?? "merge";
        const labels = OPERATION_LABELS[op];
        await vscode.window
            .showWarningMessage(message, { modal: false }, vscode.l10n.t("\u89E3\u51B3\u51B2\u7A81"), labels.abort)
            .then(async (choice) => {
            if (choice === vscode.l10n.t("\u89E3\u51B3\u51B2\u7A81")) {
                await this.resolveConflicts(conflictFiles);
            }
            else if (choice === labels.abort && operation) {
                await this.gitOps.abortGitSequencerOperation(operation);
                vscode.window.showInformationMessage(vscode.l10n.t("\u5DF2{0}", String(labels.abort)));
            }
        });
    }
    private async promptConflictAction(conflictFiles: string[], operation: GitSequencerOperation): Promise<"resolve" | "abort" | "continue" | "dismiss"> {
        const labels = OPERATION_LABELS[operation];
        const preview = conflictFiles.slice(0, 8).join("\n");
        const more = conflictFiles.length > 8
            ? vscode.l10n.t("\n\u2026 \u5171 {0} \u4E2A\u6587\u4EF6", String(conflictFiles.length)) : "";
        const choice = await vscode.window.showWarningMessage(vscode.l10n.t("{0}\u51B2\u7A81\uFF08{1} \u4E2A\u6587\u4EF6\uFF09\uFF1A\n{2}{3}", String(labels.name), String(conflictFiles.length), String(preview), String(more)), { modal: true }, vscode.l10n.t("\u89E3\u51B3\u51B2\u7A81"), labels.abort, vscode.l10n.t("\u5DF2\u89E3\u51B3\uFF0C\u7EE7\u7EED"));
        if (choice === vscode.l10n.t("\u89E3\u51B3\u51B2\u7A81")) {
            return "resolve";
        }
        if (choice === labels.abort) {
            return "abort";
        }
        if (choice === vscode.l10n.t("\u5DF2\u89E3\u51B3\uFF0C\u7EE7\u7EED")) {
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
        const action = await vscode.window.showQuickPick([
            {
                label: vscode.l10n.t("$(git-merge) \u7528\u5408\u5E76\u7F16\u8F91\u5668\u6253\u5F00\uFF08\u63A8\u8350\uFF09"),
                value: "merge-editor",
                description: vscode.l10n.t("\u9010\u4E2A\u6253\u5F00 VS Code \u4E09\u5411\u5408\u5E76\u89C6\u56FE"),
            },
            {
                label: vscode.l10n.t("$(files) \u6279\u91CF\u6253\u5F00\u524D N \u4E2A\u6587\u4EF6"),
                value: "open-top-n",
                description: vscode.l10n.t("N = {0}\uFF08\u53EF\u5728\u8BBE\u7F6E\u4E2D\u8C03\u6574\uFF09", String(maxOpen)),
            },
            {
                label: vscode.l10n.t("$(file) \u9009\u62E9\u5355\u4E2A\u6587\u4EF6\u6253\u5F00"),
                value: "pick-one",
            },
        ], { placeHolder: vscode.l10n.t("\u9009\u62E9\u89E3\u51B3\u51B2\u7A81\u7684\u65B9\u5F0F"), title: vscode.l10n.t("\u89E3\u51B3\u51B2\u7A81") });
        if (!action) {
            return;
        }
        if (action.value === "pick-one") {
            const selected = await vscode.window.showQuickPick(conflictFiles.map((file) => ({ label: file, value: file })), { placeHolder: vscode.l10n.t("\u9009\u62E9\u51B2\u7A81\u6587\u4EF6") });
            if (selected) {
                await this.openConflictFile(selected.value, true);
            }
            return;
        }
        const filesToOpen = action.value === "open-top-n"
            ? conflictFiles.slice(0, maxOpen)
            : conflictFiles.slice(0, Math.min(3, conflictFiles.length));
        for (const relativePath of filesToOpen) {
            await this.openConflictFile(relativePath, action.value === "merge-editor");
        }
    }
    private async openConflictFile(relativePath: string, preferMergeEditor: boolean): Promise<void> {
        const uri = vscode.Uri.file(path.join(this.workspaceRoot, relativePath));
        if (preferMergeEditor) {
            try {
                await vscode.commands.executeCommand("git.openMergeEditor", uri);
                return;
            }
            catch {
                // 未安装内置 Git 或版本不支持时回退
            }
        }
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });
    }
    private async waitUntilResolved(operation: GitSequencerOperation): Promise<ConflictResolution> {
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
            }
            catch (error: unknown) {
                const appError = toAppError(error);
                if (isUserCancelledError(appError)) {
                    return "aborted";
                }
                const conflictAgain = await this.gitOps.getConflictFiles();
                if (conflictAgain.length > 0) {
                    continue;
                }
                vscode.window.showErrorMessage(vscode.l10n.t("\u7EE7\u7EED{0}\u5931\u8D25: {1}", String(labels.name), String(appError.message)));
                return "pending";
            }
        }
    }
    /** 完成进行中的 revert（含钩子失败时的跳过确认） */
    async completeRevertOperation(): Promise<void> {
        await this.completeSequencerOperation("revert");
    }
    private async completeSequencerOperation(operation: GitSequencerOperation): Promise<void> {
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
        }
        catch (error: unknown) {
            if (!isGitHookFailure(error)) {
                throw error;
            }
            const retry = await vscode.window.showWarningMessage(vscode.l10n.t("\u5B8C\u6210\u56DE\u6EDA\u65F6\u88AB Git \u94A9\u5B50\u62E6\u622A\u3002\u662F\u5426\u8DF3\u8FC7\u94A9\u5B50\u7EE7\u7EED\uFF1F"), { modal: true }, vscode.l10n.t("\u8DF3\u8FC7\u94A9\u5B50\u5B8C\u6210"));
            if (retry !== vscode.l10n.t("\u8DF3\u8FC7\u94A9\u5B50\u5B8C\u6210")) {
                throw AppError.userCancelled(vscode.l10n.t("\u5DF2\u53D6\u6D88\u5B8C\u6210\u56DE\u6EDA"));
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
