import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { BranchConfigManager } from "./branchConfigManager";
import { BranchManager } from "./branchManager";
import { GitOperations } from "./gitOperations";
import { MergeWorkflow } from "./mergeWorkflow";
import { MergeTargetConfigManager } from "./mergeTargetConfigManager";
import { AppError, isUserCancelledError, toAppError } from "./errors";
import { openGitWorkflowHelperSettings } from "./openExtensionSettings";
/**
 * Git合并服务类
 * 提供自动化的Git分支合并功能
 */
export class GitMergeService {
    private workspaceRoot: string;
    private static isOperationInProgress = false;
    private gitOps: GitOperations;
    private branchManager: BranchManager;
    private mergeWorkflow: MergeWorkflow;
    private branchConfigManager: BranchConfigManager;
    private mergeTargetConfigManager: MergeTargetConfigManager;
    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        const gitDir = path.join(this.workspaceRoot, ".git");
        if (!fs.existsSync(gitDir)) {
            throw new AppError(vscode.l10n.t("当前工作区不是Git仓库，请在Git项目中使用此插件"), "NOT_GIT_REPO", { stage: "init" });
        }
        this.gitOps = new GitOperations(this.workspaceRoot);
        this.branchManager = new BranchManager(this.gitOps);
        this.branchConfigManager = new BranchConfigManager();
        this.mergeTargetConfigManager = new MergeTargetConfigManager(vscode.workspace.getConfiguration("gitWorkflowHelper"));
        this.mergeWorkflow = new MergeWorkflow(this.gitOps, this.branchManager, this.branchConfigManager, this.mergeTargetConfigManager);
    }
    /**
     * 合并功能分支主流程
     */
    public async mergeFeatureBranch(): Promise<void> {
        if (GitMergeService.isOperationInProgress) {
            vscode.window.showWarningMessage(vscode.l10n.t("已有合并操作正在进行中，请等待完成后再试"));
            return;
        }
        GitMergeService.isOperationInProgress = true;
        let currentBranch = "";
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t("Git合并流程进行中"),
                cancellable: false
            }, async (progress) => {
                try {
                    progress.report({ message: vscode.l10n.t("⚠️ 合并过程中请不要手动操作Git！准备合并环境..."), increment: 0 });
                    currentBranch = await this.mergeWorkflow.prepareMergeEnvironment(progress);
                    progress.report({ message: vscode.l10n.t("请选择目标分支..."), increment: 0 });
                    const targetBranch = await this.mergeWorkflow.gatherMergeParameters();
                    progress.report({ message: vscode.l10n.t("⚠️ 正在合并到 {0}，请勿手动操作Git！", String(targetBranch)), increment: 10 });
                    await this.mergeWorkflow.executeMainMergeFlow(currentBranch, targetBranch, progress);
                    progress.report({ message: vscode.l10n.t("✅ 合并完成！"), increment: 100 });
                    vscode.window.showInformationMessage(vscode.l10n.t("✓ 合并流程完成！"));
                }
                catch (error: any) {
                    await this.mergeWorkflow.handleMergeError(error, currentBranch);
                    throw error;
                }
            });
        }
        catch (error: any) {
            const appError = toAppError(error, vscode.l10n.t("未知错误"));
            if (isUserCancelledError(appError)) {
                vscode.window.showInformationMessage(vscode.l10n.t("已取消合并: {0}", String(appError.message)));
                return;
            }
            const stageText = appError.stage ? ` [${appError.stage}]` : "";
            vscode.window.showErrorMessage(vscode.l10n.t("合并失败{0}: {1}", String(stageText), String(appError.message)));
        }
        finally {
            GitMergeService.isOperationInProgress = false;
        }
    }
    /**
     * 配置管理 - 直接跳转到插件设置页
     */
    public async manageConfiguration(): Promise<void> {
        await openGitWorkflowHelperSettings();
    }
}
