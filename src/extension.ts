import * as vscode from 'vscode';
import { GitMergeService } from './gitMergeService';

/**
 * 插件激活函数
 * @param context - VSCode扩展上下文
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Git合并助手插件已激活');

    // 注册合并Feature分支命令
    const mergeFeatureBranchCommand = vscode.commands.registerCommand(
        'gitMergeHelper.mergeFeatureBranch',
        async () => {
            try {
                // 检查是否有工作区
                if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                    vscode.window.showErrorMessage('请先打开一个工作区文件夹');
                    return;
                }

                const gitMergeService = new GitMergeService();
                await gitMergeService.mergeFeatureBranch();
            } catch (error: any) {
                const errorMessage = error.message || '未知错误';
                vscode.window.showErrorMessage(`合并失败: ${errorMessage}`);
                console.error('合并失败:', error);
            }
        }
    );

    // 注册快速提交并合并命令
    const quickCommitAndMergeCommand = vscode.commands.registerCommand(
        'gitMergeHelper.quickCommitAndMerge',
        async () => {
            try {
                // 检查是否有工作区
                if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                    vscode.window.showErrorMessage('请先打开一个工作区文件夹');
                    return;
                }

                const gitMergeService = new GitMergeService();
                await gitMergeService.quickCommitAndMerge();
            } catch (error: any) {
                const errorMessage = error.message || '未知错误';
                vscode.window.showErrorMessage(`操作失败: ${errorMessage}`);
                console.error('操作失败:', error);
            }
        }
    );

    // 注册配置管理命令
    const manageConfigurationCommand = vscode.commands.registerCommand(
        'gitMergeHelper.manageConfiguration',
        async () => {
            try {
                // 检查是否有工作区
                if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                    vscode.window.showErrorMessage('请先打开一个工作区文件夹');
                    return;
                }

                const gitMergeService = new GitMergeService();
                await gitMergeService.manageConfiguration();
            } catch (error: any) {
                const errorMessage = error.message || '未知错误';
                vscode.window.showErrorMessage(`配置失败: ${errorMessage}`);
                console.error('配置失败:', error);
            }
        }
    );

    // 将命令添加到上下文订阅中
    context.subscriptions.push(mergeFeatureBranchCommand);
    context.subscriptions.push(quickCommitAndMergeCommand);
    context.subscriptions.push(manageConfigurationCommand);

    // 只在有工作区时显示激活消息
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        vscode.window.showInformationMessage('Git合并助手已准备就绪！');
    }
}

/**
 * 插件停用函数
 */
export function deactivate() {
    console.log('Git合并助手插件已停用');
} 