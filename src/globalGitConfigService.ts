import * as vscode from 'vscode';
import { GitOperations } from './gitOperations';
import { AppError } from './errors';
interface GitConfigItem extends vscode.QuickPickItem {
    key: string;
}
export class GlobalGitConfigService {
    private gitOps: GitOperations;
    private configItems = [
        { key: 'user.name', label: vscode.l10n.t("$(person) 用户名 (user.name)") },
        { key: 'user.email', label: vscode.l10n.t("$(mail) 邮箱 (user.email)") },
        { key: 'core.autocrlf', label: vscode.l10n.t("$(symbol-string) 换行符转换 (core.autocrlf)") },
        { key: 'init.defaultBranch', label: vscode.l10n.t("$(git-branch) 默认分支 (init.defaultBranch)") }
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
                    description: value || vscode.l10n.t("(未设置)"),
                    key: config.key
                });
            }
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: vscode.l10n.t("选择要查看或修改的全局 Git 配置")
            });
            if (!selected) {
                return; // 用户取消退出
            }
            const key = selected.key;
            const currentValue = await this.gitOps.getGlobalGitConfig(key);
            const newValue = await vscode.window.showInputBox({
                prompt: vscode.l10n.t("修改全局配置: {0}", String(key)),
                value: currentValue,
                placeHolder: vscode.l10n.t("输入新配置值，清空并回车以移除该配置")
            });
            if (newValue !== undefined) {
                if (newValue !== currentValue) {
                    if (newValue.trim() === '') {
                        const confirm = await vscode.window.showWarningMessage(vscode.l10n.t("确定要清除全局配置 {0} 吗？", String(key)), { modal: true }, vscode.l10n.t("确定"));
                        if (confirm === vscode.l10n.t("确定")) {
                            try {
                                await this.gitOps.unsetGlobalGitConfig(key);
                                vscode.window.showInformationMessage(vscode.l10n.t("已清除全局配置: {0}", String(key)));
                            }
                            catch (e: any) {
                                // 如果本来就不存在，unset 可能会报错，忽略或提示
                                vscode.window.showInformationMessage(vscode.l10n.t("清除配置失败或已不存在: {0}", String(key)));
                            }
                        }
                    }
                    else {
                        await this.gitOps.setGlobalGitConfig(key, newValue.trim());
                        vscode.window.showInformationMessage(vscode.l10n.t("全局配置 {0} 已更新为: {1}", String(key), String(newValue.trim())));
                    }
                }
            }
        }
    }
}
