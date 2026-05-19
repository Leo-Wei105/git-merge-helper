import * as vscode from 'vscode';
import { GitOperations } from './gitOperations';
import { AppError } from './errors';

interface GitConfigItem extends vscode.QuickPickItem {
    key: string;
}

export class GlobalGitConfigService {
    private gitOps: GitOperations;
    private configItems = [
        { key: 'user.name', label: '$(person) 用户名 (user.name)' },
        { key: 'user.email', label: '$(mail) 邮箱 (user.email)' },
        { key: 'core.autocrlf', label: '$(symbol-string) 换行符转换 (core.autocrlf)' },
        { key: 'init.defaultBranch', label: '$(git-branch) 默认分支 (init.defaultBranch)' }
    ];

    constructor(workspaceRoot: string) {
        this.gitOps = new GitOperations(workspaceRoot);
    }

    async manageConfig(): Promise<void> {
        while (true) {
            const items: GitConfigItem[] = [];
            for (const config of this.configItems) {
                const value = await this.gitOps.getGlobalGitConfig(config.key);
                items.push({
                    label: config.label,
                    description: value || '(未设置)',
                    key: config.key
                });
            }

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: '选择要查看或修改的全局 Git 配置'
            });

            if (!selected) {
                return; // 用户取消退出
            }

            const key = selected.key;
            const currentValue = await this.gitOps.getGlobalGitConfig(key);

            const newValue = await vscode.window.showInputBox({
                prompt: `修改全局配置: ${key}`,
                value: currentValue,
                placeHolder: '输入新配置值，清空并回车以移除该配置'
            });

            if (newValue !== undefined) {
                if (newValue !== currentValue) {
                    if (newValue.trim() === '') {
                        const confirm = await vscode.window.showWarningMessage(
                            `确定要清除全局配置 ${key} 吗？`,
                            { modal: true },
                            '确定'
                        );
                        if (confirm === '确定') {
                            try {
                                await this.gitOps.unsetGlobalGitConfig(key);
                                vscode.window.showInformationMessage(`已清除全局配置: ${key}`);
                            } catch (e: any) {
                                // 如果本来就不存在，unset 可能会报错，忽略或提示
                                vscode.window.showInformationMessage(`清除配置失败或已不存在: ${key}`);
                            }
                        }
                    } else {
                        await this.gitOps.setGlobalGitConfig(key, newValue.trim());
                        vscode.window.showInformationMessage(`全局配置 ${key} 已更新为: ${newValue.trim()}`);
                    }
                }
            }
        }
    }
}
