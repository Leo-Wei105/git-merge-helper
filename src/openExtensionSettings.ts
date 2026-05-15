import * as vscode from 'vscode';

/** 与 package.json publisher + name 一致，用于设置 UI 中的 @ext 筛选。 */
const EXTENSION_SETTINGS_FILTER = '@ext:Leo-Wei105.git-workflow-helper';

/**
 * 多根文件夹或已保存的 .code-workspace 下，默认「设置」会合并多作用域，带 @ext 筛选时容易卡顿。
 * 改为打开「用户」设置页的图形界面并应用同一筛选，仍可正常用开关/枚举等控件编辑；
 * 配置仍会按 VS Code 规则与用户/工作区/文件夹作用域合并生效。
 */
function shouldOpenUserSettingsUi(): boolean {
    const folderCount = vscode.workspace.workspaceFolders?.length ?? 0;
    return folderCount > 1 || vscode.workspace.workspaceFile !== undefined;
}

export async function openGitWorkflowHelperSettings(): Promise<void> {
    if (shouldOpenUserSettingsUi()) {
        await vscode.commands.executeCommand('workbench.action.openGlobalSettings', {
            query: EXTENSION_SETTINGS_FILTER,
        });
        return;
    }

    await vscode.commands.executeCommand('workbench.action.openSettings', EXTENSION_SETTINGS_FILTER);
}
