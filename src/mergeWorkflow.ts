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
            progress.report({ message: vscode.l10n.t("检查Git仓库状态..."), increment: 10 });
        }
        if (!(await this.gitOps.checkGitRepository())) {
            throw new AppError(vscode.l10n.t("当前目录不是有效的Git仓库"), "NOT_GIT_REPO", {
                stage: "prepareMergeEnvironment",
            });
        }
        if (progress) {
            progress.report({ message: vscode.l10n.t("验证当前分支..."), increment: 10 });
        }
        const currentBranch = await this.gitOps.getCurrentBranch();
        const branchPrefixes = this.branchConfigManager.getBranchPrefixes();
        const isFeatureBranch = await this.branchManager.checkFeatureBranch(branchPrefixes);
        if (!isFeatureBranch) {
            const patterns = branchPrefixes.map(p => p.prefix).join(", ");
            throw new AppError(vscode.l10n.t("当前分支不是功能分支。支持的分支前缀: {0}", String(patterns)), "UNKNOWN", { stage: "prepareMergeEnvironment" });
        }
        if (progress) {
            progress.report({ message: vscode.l10n.t("确保远程分支存在..."), increment: 10 });
        }
        await this.branchManager.ensureRemoteBranchExists(currentBranch);
        if (progress) {
            progress.report({ message: vscode.l10n.t("检查未提交的更改..."), increment: 10 });
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
        const action = await vscode.window.showWarningMessage(vscode.l10n.t("检测到未提交的更改，请选择处理方式"), vscode.l10n.t("仅提交已暂存"), vscode.l10n.t("暂存全部后提交"), vscode.l10n.t("取消"));
        if (!action || action === vscode.l10n.t("取消")) {
            throw AppError.userCancelled(vscode.l10n.t("请先提交或存储更改后再运行"));
        }
        if (action === vscode.l10n.t("仅提交已暂存")) {
            const hasStagedChanges = await this.gitOps.checkStagedChanges();
            if (!hasStagedChanges) {
                throw new AppError(vscode.l10n.t("当前没有已暂存内容，请先暂存后重试"), "UNKNOWN", {
                    stage: "handleUncommittedChanges",
                });
            }
        }
        if (action === vscode.l10n.t("暂存全部后提交")) {
            await this.gitOps.stageAllChanges();
        }
        const templateManager = new CommitTemplateManager(this.gitOps);
        const commitMessage = await templateManager.promptFormattedCommitMessage();
        if (!commitMessage) {
            throw AppError.userCancelled(vscode.l10n.t("未输入提交信息，操作已取消"));
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
            placeHolder: vscode.l10n.t("请选择要合并到的目标分支"),
        });
        if (!selected) {
            throw AppError.userCancelled(vscode.l10n.t("未选择目标分支，操作已取消"));
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
        progress.report({ message: vscode.l10n.t("切换到目标分支 {0}...", String(targetBranch)), increment: 20 });
        await this.mergeFeatureToTarget(currentBranch, targetBranch, progress);
        progress.report({ message: vscode.l10n.t("切回原分支 {0}...", String(currentBranch)), increment: 20 });
        await this.gitOps.checkoutBranch(currentBranch);
        const currentBranchExists = await this.gitOps.checkRemoteBranchExists(currentBranch);
        if (currentBranchExists) {
            progress.report({ message: vscode.l10n.t("设置上游分支关联..."), increment: 10 });
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
        progress.report({ message: vscode.l10n.t("合并 {0} 到 {1}...", String(currentBranch), String(targetBranch)), increment: 30 });
        await this.branchManager.safeMergeBranch(targetBranch, currentBranch, this.handleMergeConflicts.bind(this), progress);
        progress.report({ message: vscode.l10n.t("推送合并结果到远程..."), increment: 20 });
    }
    /**
     * 处理合并错误
     */
    async handleMergeError(error: any, currentBranch: string): Promise<void> {
        console.error(vscode.l10n.t("合并过程中发生错误:"), error);
        if (currentBranch) {
            try {
                await this.gitOps.checkoutBranch(currentBranch);
            }
            catch {
                vscode.window.showErrorMessage(vscode.l10n.t("无法切回原分支 {0}，请手动切换", String(currentBranch)));
            }
        }
    }
}
