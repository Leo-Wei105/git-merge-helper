import * as vscode from "vscode";
import { BranchConfigManager } from "./branchConfigManager";
import { BranchManager, MergeConflictResolution } from "./branchManager";
import { CommitTemplateManager } from "./commitTemplateManager";
import { AppError } from "./errors";
import { GitConflictHandler } from "./gitConflictHandler";
import { GitOperations } from "./gitOperations";
import { MergeTargetConfigManager } from "./mergeTargetConfigManager";
/**
 * 合并流程类 - 负责合并流程编排
 */
export class MergeWorkflow {
    private gitOps: GitOperations;
    private branchManager: BranchManager;
    private branchConfigManager: BranchConfigManager;
    private mergeTargetConfigManager: MergeTargetConfigManager;
    constructor(gitOps: GitOperations, branchManager: BranchManager, branchConfigManager: BranchConfigManager, mergeTargetConfigManager: MergeTargetConfigManager) {
        this.gitOps = gitOps;
        this.branchManager = branchManager;
        this.branchConfigManager = branchConfigManager;
        this.mergeTargetConfigManager = mergeTargetConfigManager;
    }
    private getConflictHandler(): GitConflictHandler {
        return new GitConflictHandler(this.gitOps.getWorkspaceRoot());
    }
    /**
     * 处理合并冲突
     */
    private async handleMergeConflicts(conflictFiles: string[]): Promise<MergeConflictResolution> {
        return this.getConflictHandler().runConflictWizard("merge", conflictFiles);
    }
    /**
     * 准备合并环境
     */
    async prepareMergeEnvironment(progress?: vscode.Progress<{
        message?: string;
        increment?: number;
    }>): Promise<string> {
        if (progress) {
            progress.report({ message: vscode.l10n.t("\u68C0\u67E5Git\u4ED3\u5E93\u72B6\u6001..."), increment: 10 });
        }
        if (!(await this.gitOps.checkGitRepository())) {
            throw new AppError(vscode.l10n.t("\u5F53\u524D\u76EE\u5F55\u4E0D\u662F\u6709\u6548\u7684Git\u4ED3\u5E93"), "NOT_GIT_REPO", {
                stage: "prepareMergeEnvironment",
            });
        }
        if (progress) {
            progress.report({ message: vscode.l10n.t("\u9A8C\u8BC1\u5F53\u524D\u5206\u652F..."), increment: 10 });
        }
        const currentBranch = await this.gitOps.getCurrentBranch();
        const branchPrefixes = this.branchConfigManager.getBranchPrefixes();
        const isFeatureBranch = await this.branchManager.checkFeatureBranch(branchPrefixes);
        if (!isFeatureBranch) {
            const patterns = branchPrefixes.map(p => p.prefix).join(", ");
            throw new AppError(vscode.l10n.t("\u5F53\u524D\u5206\u652F\u4E0D\u662F\u529F\u80FD\u5206\u652F\u3002\u652F\u6301\u7684\u5206\u652F\u524D\u7F00: {0}", String(patterns)), "UNKNOWN", { stage: "prepareMergeEnvironment" });
        }
        if (progress) {
            progress.report({ message: vscode.l10n.t("\u786E\u4FDD\u8FDC\u7A0B\u5206\u652F\u5B58\u5728..."), increment: 10 });
        }
        await this.branchManager.ensureRemoteBranchExists(currentBranch);
        if (progress) {
            progress.report({ message: vscode.l10n.t("\u68C0\u67E5\u672A\u63D0\u4EA4\u7684\u66F4\u6539..."), increment: 10 });
        }
        await this.handleUncommittedChanges(currentBranch);
        return currentBranch;
    }
    /**
     * 处理未提交的更改
     */
    private async handleUncommittedChanges(currentBranch: string): Promise<void> {
        if (!(await this.gitOps.checkUncommittedChanges())) {
            return;
        }
        const action = await vscode.window.showWarningMessage(vscode.l10n.t("\u68C0\u6D4B\u5230\u672A\u63D0\u4EA4\u7684\u66F4\u6539\uFF0C\u8BF7\u9009\u62E9\u5904\u7406\u65B9\u5F0F"), vscode.l10n.t("\u4EC5\u63D0\u4EA4\u5DF2\u6682\u5B58"), vscode.l10n.t("\u6682\u5B58\u5168\u90E8\u540E\u63D0\u4EA4"), vscode.l10n.t("\u53D6\u6D88"));
        if (!action || action === vscode.l10n.t("\u53D6\u6D88")) {
            throw AppError.userCancelled(vscode.l10n.t("\u8BF7\u5148\u63D0\u4EA4\u6216\u5B58\u50A8\u66F4\u6539\u540E\u518D\u8FD0\u884C"));
        }
        if (action === vscode.l10n.t("\u4EC5\u63D0\u4EA4\u5DF2\u6682\u5B58")) {
            const hasStagedChanges = await this.gitOps.checkStagedChanges();
            if (!hasStagedChanges) {
                throw new AppError(vscode.l10n.t("\u5F53\u524D\u6CA1\u6709\u5DF2\u6682\u5B58\u5185\u5BB9\uFF0C\u8BF7\u5148\u6682\u5B58\u540E\u91CD\u8BD5"), "UNKNOWN", {
                    stage: "handleUncommittedChanges",
                });
            }
        }
        if (action === vscode.l10n.t("\u6682\u5B58\u5168\u90E8\u540E\u63D0\u4EA4")) {
            await this.gitOps.stageAllChanges();
        }
        const templateManager = new CommitTemplateManager(this.gitOps);
        const commitMessage = await templateManager.promptFormattedCommitMessage();
        if (!commitMessage) {
            throw AppError.userCancelled(vscode.l10n.t("\u672A\u8F93\u5165\u63D0\u4EA4\u4FE1\u606F\uFF0C\u64CD\u4F5C\u5DF2\u53D6\u6D88"));
        }
        await this.gitOps.commitStagedChanges(commitMessage);
        await this.gitOps.pushBranch(currentBranch);
    }
    /**
     * 收集合并参数（选择目标分支）
     */
    async gatherMergeParameters(): Promise<string> {
        const targetBranches = this.mergeTargetConfigManager.getTargetBranches();
        const targetBranchOptions = targetBranches.map((branch) => ({
            label: branch.name,
            value: branch.name,
        }));
        const selected = await vscode.window.showQuickPick(targetBranchOptions, {
            placeHolder: vscode.l10n.t("\u8BF7\u9009\u62E9\u8981\u5408\u5E76\u5230\u7684\u76EE\u6807\u5206\u652F"),
        });
        if (!selected) {
            throw AppError.userCancelled(vscode.l10n.t("\u672A\u9009\u62E9\u76EE\u6807\u5206\u652F\uFF0C\u64CD\u4F5C\u5DF2\u53D6\u6D88"));
        }
        return selected.value;
    }
    /**
     * 执行主合并流程
     */
    async executeMainMergeFlow(currentBranch: string, targetBranch: string, progress: vscode.Progress<{
        message?: string;
        increment?: number;
    }>): Promise<void> {
        progress.report({ message: vscode.l10n.t("\u5207\u6362\u5230\u76EE\u6807\u5206\u652F {0}...", String(targetBranch)), increment: 20 });
        await this.mergeFeatureToTarget(currentBranch, targetBranch, progress);
        progress.report({ message: vscode.l10n.t("\u5207\u56DE\u539F\u5206\u652F {0}...", String(currentBranch)), increment: 20 });
        await this.gitOps.checkoutBranch(currentBranch);
        const currentBranchExists = await this.gitOps.checkRemoteBranchExists(currentBranch);
        if (currentBranchExists) {
            progress.report({ message: vscode.l10n.t("\u8BBE\u7F6E\u4E0A\u6E38\u5206\u652F\u5173\u8054..."), increment: 10 });
            await this.gitOps.ensureBranchUpstream(currentBranch);
        }
    }
    /**
     * 合并功能分支到目标分支
     */
    private async mergeFeatureToTarget(currentBranch: string, targetBranch: string, progress: vscode.Progress<{
        message?: string;
        increment?: number;
    }>): Promise<void> {
        progress.report({ message: vscode.l10n.t("\u5408\u5E76 {0} \u5230 {1}...", String(currentBranch), String(targetBranch)), increment: 30 });
        await this.branchManager.safeMergeBranch(targetBranch, currentBranch, this.handleMergeConflicts.bind(this), progress);
        progress.report({ message: vscode.l10n.t("\u63A8\u9001\u5408\u5E76\u7ED3\u679C\u5230\u8FDC\u7A0B..."), increment: 20 });
    }
    /**
     * 处理合并错误
     */
    async handleMergeError(error: any, currentBranch: string): Promise<void> {
        console.error(vscode.l10n.t("\u5408\u5E76\u8FC7\u7A0B\u4E2D\u53D1\u751F\u9519\u8BEF:"), error);
        if (currentBranch) {
            try {
                await this.gitOps.checkoutBranch(currentBranch);
            }
            catch {
                vscode.window.showErrorMessage(vscode.l10n.t("\u65E0\u6CD5\u5207\u56DE\u539F\u5206\u652F {0}\uFF0C\u8BF7\u624B\u52A8\u5207\u6362", String(currentBranch)));
            }
        }
    }
}
