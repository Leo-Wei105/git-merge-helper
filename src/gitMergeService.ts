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
            throw new AppError(vscode.l10n.t("\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u662FGit\u4ED3\u5E93\uFF0C\u8BF7\u5728Git\u9879\u76EE\u4E2D\u4F7F\u7528\u6B64\u63D2\u4EF6"), "NOT_GIT_REPO", { stage: "init" });
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
            vscode.window.showWarningMessage(vscode.l10n.t("\u5DF2\u6709\u5408\u5E76\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210\u540E\u518D\u8BD5"));
            return;
        }
        GitMergeService.isOperationInProgress = true;
        let currentBranch = "";
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t("Git\u5408\u5E76\u6D41\u7A0B\u8FDB\u884C\u4E2D"),
                cancellable: false
            }, async (progress) => {
                try {
                    progress.report({ message: vscode.l10n.t("\u26A0\uFE0F \u5408\u5E76\u8FC7\u7A0B\u4E2D\u8BF7\u4E0D\u8981\u624B\u52A8\u64CD\u4F5CGit\uFF01\u51C6\u5907\u5408\u5E76\u73AF\u5883..."), increment: 0 });
                    currentBranch = await this.mergeWorkflow.prepareMergeEnvironment(progress);
                    progress.report({ message: vscode.l10n.t("\u8BF7\u9009\u62E9\u76EE\u6807\u5206\u652F..."), increment: 0 });
                    const targetBranch = await this.mergeWorkflow.gatherMergeParameters();
                    progress.report({ message: vscode.l10n.t("\u26A0\uFE0F \u6B63\u5728\u5408\u5E76\u5230 {0}\uFF0C\u8BF7\u52FF\u624B\u52A8\u64CD\u4F5CGit\uFF01", String(targetBranch)), increment: 10 });
                    await this.mergeWorkflow.executeMainMergeFlow(currentBranch, targetBranch, progress);
                    progress.report({ message: vscode.l10n.t("\u2705 \u5408\u5E76\u5B8C\u6210\uFF01"), increment: 100 });
                    vscode.window.showInformationMessage(vscode.l10n.t("\u2713 \u5408\u5E76\u6D41\u7A0B\u5B8C\u6210\uFF01"));
                }
                catch (error: any) {
                    await this.mergeWorkflow.handleMergeError(error, currentBranch);
                    throw error;
                }
            });
        }
        catch (error: any) {
            const appError = toAppError(error, vscode.l10n.t("\u672A\u77E5\u9519\u8BEF"));
            if (isUserCancelledError(appError)) {
                vscode.window.showInformationMessage(vscode.l10n.t("\u5DF2\u53D6\u6D88\u5408\u5E76: {0}", String(appError.message)));
                return;
            }
            const stageText = appError.stage ? ` [${appError.stage}]` : "";
            vscode.window.showErrorMessage(vscode.l10n.t("\u5408\u5E76\u5931\u8D25{0}: {1}", String(stageText), String(appError.message)));
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
