import * as vscode from 'vscode';
/**
 * 由于在包含大量文件的工作区中使用 `@ext:` 筛选器会导致 VS Code 设置界面严重卡顿甚至卡死，
 * 这里改为直接搜索配置前缀，既能准确定位到本插件的配置，又能避免 VS Code 的性能问题。
 */
const EXTENSION_SETTINGS_FILTER = 'gitWorkflowHelper';
export async function openGitWorkflowHelperSettings(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.openSettings', EXTENSION_SETTINGS_FILTER);
}
