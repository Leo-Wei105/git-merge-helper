import * as vscode from 'vscode';
import { BatchCherryPickService } from './batchCherryPickService';
import { BranchBaseService } from './branchBaseService';
import { BranchConfigManager } from './branchConfigManager';
import { BranchCreator } from './branchCreator';
import { AppError, isUserCancelledError, toAppError } from './errors';
import { FormattedCommitService } from './formattedCommitService';
import { GitConflictHandler } from './gitConflictHandler';
import { GitMergeService } from './gitMergeService';
import { GitPushService } from './gitPushService';
import { GitPullService } from './gitPullService';
import { MergeRevertService } from './mergeRevertService';
import { openGitWorkflowHelperSettings } from './openExtensionSettings';
import { GlobalGitConfigService } from './globalGitConfigService';
async function selectWorkspaceRoot(): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new AppError(vscode.l10n.t("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u5DE5\u4F5C\u533A\u6587\u4EF6\u5939"), 'INVALID_WORKSPACE', { stage: 'selectWorkspaceRoot' });
    }
    if (workspaceFolders.length === 1) {
        return workspaceFolders[0].uri.fsPath;
    }
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri) {
        const activeFolder = vscode.workspace.getWorkspaceFolder(activeUri);
        if (activeFolder) {
            return activeFolder.uri.fsPath;
        }
    }
    const selected = await vscode.window.showQuickPick(workspaceFolders.map(folder => ({
        label: folder.name,
        description: folder.uri.fsPath,
        fsPath: folder.uri.fsPath
    })), {
        placeHolder: vscode.l10n.t("\u68C0\u6D4B\u5230\u591A\u4E2A\u5DE5\u4F5C\u533A\uFF0C\u8BF7\u9009\u62E9\u8981\u64CD\u4F5C\u7684 Git \u4ED3\u5E93")
    });
    if (!selected) {
        throw AppError.userCancelled(vscode.l10n.t("\u672A\u9009\u62E9\u5DE5\u4F5C\u533A\uFF0C\u64CD\u4F5C\u5DF2\u53D6\u6D88"));
    }
    return selected.fsPath;
}
function handleCommandError(action: string, error: unknown): void {
    const appError = toAppError(error, vscode.l10n.t("\u672A\u77E5\u9519\u8BEF"));
    if (isUserCancelledError(appError)) {
        vscode.window.showInformationMessage(vscode.l10n.t("\u5DF2\u53D6\u6D88{0}: {1}", String(action), String(appError.message)));
        return;
    }
    const stageText = appError.stage ? ` [${appError.stage}]` : '';
    vscode.window.showErrorMessage(vscode.l10n.t("{0}\u5931\u8D25{1}: {2}", String(action), String(stageText), String(appError.message)));
}
/**
 * 插件激活函数
 * @param context - VSCode扩展上下文
 */
export function activate(context: vscode.ExtensionContext) {
    console.log(vscode.l10n.t("Git\u5DE5\u4F5C\u6D41\u52A9\u624B\u63D2\u4EF6\u5DF2\u6FC0\u6D3B"));
    // 注册一键拉取所有分支命令
    const pullAllBranchesCommand = vscode.commands.registerCommand('gitWorkflowHelper.pullAllBranches', async () => {
        try {
            const workspaceRoot = await selectWorkspaceRoot();
            const gitPullService = new GitPullService(workspaceRoot);
            await gitPullService.pullAllBranches();
        }
        catch (error: any) {
            handleCommandError(vscode.l10n.t("\u4E00\u952E\u62C9\u53D6"), error);
        }
    });
    // 注册创建分支命令
    const createBranchCommand = vscode.commands.registerCommand('gitWorkflowHelper.createBranch', async () => {
        try {
            const workspaceRoot = await selectWorkspaceRoot();
            const branchConfigManager = new BranchConfigManager();
            const branchCreator = new BranchCreator(branchConfigManager, workspaceRoot);
            await branchCreator.createBranch();
        }
        catch (error: any) {
            handleCommandError(vscode.l10n.t("\u521B\u5EFA\u5206\u652F"), error);
        }
    });
    // 注册合并功能分支命令
    const mergeFeatureBranchCommand = vscode.commands.registerCommand('gitWorkflowHelper.mergeFeatureBranch', async () => {
        try {
            const workspaceRoot = await selectWorkspaceRoot();
            const gitMergeService = new GitMergeService(workspaceRoot);
            await gitMergeService.mergeFeatureBranch();
        }
        catch (error: any) {
            handleCommandError(vscode.l10n.t("\u5408\u5E76"), error);
        }
    });
    // 注册查看当前分支基分支命令
    const showBranchBaseCommand = vscode.commands.registerCommand('gitWorkflowHelper.showBranchBase', async () => {
        try {
            const workspaceRoot = await selectWorkspaceRoot();
            const branchBaseService = new BranchBaseService(workspaceRoot);
            await branchBaseService.showCurrentBranchBase();
        }
        catch (error: any) {
            handleCommandError(vscode.l10n.t("\u67E5\u8BE2\u57FA\u5206\u652F"), error);
        }
    });
    // 注册回滚最近一次 merge 命令
    const rollbackLastMergeCommand = vscode.commands.registerCommand('gitWorkflowHelper.rollbackLastMerge', async () => {
        try {
            const workspaceRoot = await selectWorkspaceRoot();
            const mergeRevertService = new MergeRevertService(workspaceRoot);
            await mergeRevertService.rollbackLastMerge();
        }
        catch (error: any) {
            handleCommandError(vscode.l10n.t("\u56DE\u6EDA\u5408\u5E76"), error);
        }
    });
    // 注册冲突处理命令
    const resolveConflictsCommand = vscode.commands.registerCommand('gitWorkflowHelper.resolveConflicts', async () => {
        try {
            const workspaceRoot = await selectWorkspaceRoot();
            const handler = new GitConflictHandler(workspaceRoot);
            await handler.handleConflictsInteractively();
        }
        catch (error: any) {
            handleCommandError(vscode.l10n.t("\u5904\u7406\u51B2\u7A81"), error);
        }
    });
    // 注册批量 Cherry-pick 命令
    const batchCherryPickCommand = vscode.commands.registerCommand('gitWorkflowHelper.batchCherryPick', async () => {
        try {
            const workspaceRoot = await selectWorkspaceRoot();
            const service = new BatchCherryPickService(workspaceRoot);
            await service.runBatchCherryPick();
        }
        catch (error: any) {
            handleCommandError(vscode.l10n.t("\u6279\u91CF\u4F18\u9009"), error);
        }
    });
    // 注册格式化提交命令
    const formattedCommitCommand = vscode.commands.registerCommand('gitWorkflowHelper.formattedCommit', async () => {
        try {
            const workspaceRoot = await selectWorkspaceRoot();
            const service = new FormattedCommitService(workspaceRoot);
            await service.commitWithTemplate();
        }
        catch (error: any) {
            handleCommandError(vscode.l10n.t("\u683C\u5F0F\u5316\u63D0\u4EA4"), error);
        }
    });
    const copyFormattedCommitMessageCommand = vscode.commands.registerCommand('gitWorkflowHelper.copyFormattedCommitMessage', async () => {
        try {
            const workspaceRoot = await selectWorkspaceRoot();
            const service = new FormattedCommitService(workspaceRoot);
            await service.copyFormattedMessageToClipboard();
        }
        catch (error: any) {
            handleCommandError(vscode.l10n.t("\u590D\u5236\u63D0\u4EA4\u4FE1\u606F"), error);
        }
    });
    // 注册 force-with-lease 推送命令
    const pushForceWithLeaseCommand = vscode.commands.registerCommand('gitWorkflowHelper.pushForceWithLease', async () => {
        try {
            const workspaceRoot = await selectWorkspaceRoot();
            const gitPushService = new GitPushService(workspaceRoot);
            await gitPushService.pushForceWithLease();
        }
        catch (error: any) {
            handleCommandError(vscode.l10n.t("\u63A8\u9001"), error);
        }
    });
    // 注册配置管理命令
    const manageConfigurationCommand = vscode.commands.registerCommand('gitWorkflowHelper.manageConfiguration', async () => {
        try {
            await openGitWorkflowHelperSettings();
        }
        catch (error: any) {
            handleCommandError(vscode.l10n.t("\u914D\u7F6E"), error);
        }
    });
    // 注册查看/修改全局 Git 配置命令
    const manageGlobalGitConfigCommand = vscode.commands.registerCommand('gitWorkflowHelper.manageGlobalGitConfig', async () => {
        try {
            const workspaceRoot = await selectWorkspaceRoot();
            const service = new GlobalGitConfigService(workspaceRoot);
            await service.manageConfig();
        }
        catch (error: any) {
            handleCommandError(vscode.l10n.t("\u5168\u5C40\u914D\u7F6E\u7BA1\u7406"), error);
        }
    });
    context.subscriptions.push(pullAllBranchesCommand, createBranchCommand, mergeFeatureBranchCommand, showBranchBaseCommand, rollbackLastMergeCommand, resolveConflictsCommand, batchCherryPickCommand, formattedCommitCommand, copyFormattedCommitMessageCommand, pushForceWithLeaseCommand, manageConfigurationCommand, manageGlobalGitConfigCommand);
}
/**
 * 插件停用函数
 */
export function deactivate() {
    console.log(vscode.l10n.t("Git\u5DE5\u4F5C\u6D41\u52A9\u624B\u63D2\u4EF6\u5DF2\u505C\u7528"));
}
