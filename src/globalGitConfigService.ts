import * as vscode from 'vscode';
import { GitOperations } from './gitOperations';
import { AppError } from './errors';
interface GitConfigItem extends vscode.QuickPickItem {
    key: string;
}
export class GlobalGitConfigService {
    private gitOps: GitOperations;
    private configItems = [
        { key: 'user.name', label: vscode.l10n.t("$(person) \u7528\u6237\u540D (user.name)") },
        { key: 'user.email', label: vscode.l10n.t("$(mail) \u90AE\u7BB1 (user.email)") },
        { key: 'core.autocrlf', label: vscode.l10n.t("$(symbol-string) \u6362\u884C\u7B26\u8F6C\u6362 (core.autocrlf)") },
        { key: 'init.defaultBranch', label: vscode.l10n.t("$(git-branch) \u9ED8\u8BA4\u5206\u652F (init.defaultBranch)") }
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
                    description: value || vscode.l10n.t("(\u672A\u8BBE\u7F6E)"),
                    key: config.key
                });
            }
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: vscode.l10n.t("\u9009\u62E9\u8981\u67E5\u770B\u6216\u4FEE\u6539\u7684\u5168\u5C40 Git \u914D\u7F6E")
            });
            if (!selected) {
                return; // 用户取消退出
            }
            const key = selected.key;
            const currentValue = await this.gitOps.getGlobalGitConfig(key);
            const newValue = await vscode.window.showInputBox({
                prompt: vscode.l10n.t("\u4FEE\u6539\u5168\u5C40\u914D\u7F6E: {0}", String(key)),
                value: currentValue,
                placeHolder: vscode.l10n.t("\u8F93\u5165\u65B0\u914D\u7F6E\u503C\uFF0C\u6E05\u7A7A\u5E76\u56DE\u8F66\u4EE5\u79FB\u9664\u8BE5\u914D\u7F6E")
            });
            if (newValue !== undefined) {
                if (newValue !== currentValue) {
                    if (newValue.trim() === '') {
                        const confirm = await vscode.window.showWarningMessage(vscode.l10n.t("\u786E\u5B9A\u8981\u6E05\u9664\u5168\u5C40\u914D\u7F6E {0} \u5417\uFF1F", String(key)), { modal: true }, vscode.l10n.t("\u786E\u5B9A"));
                        if (confirm === vscode.l10n.t("\u786E\u5B9A")) {
                            try {
                                await this.gitOps.unsetGlobalGitConfig(key);
                                vscode.window.showInformationMessage(vscode.l10n.t("\u5DF2\u6E05\u9664\u5168\u5C40\u914D\u7F6E: {0}", String(key)));
                            }
                            catch (e: any) {
                                // 如果本来就不存在，unset 可能会报错，忽略或提示
                                vscode.window.showInformationMessage(vscode.l10n.t("\u6E05\u9664\u914D\u7F6E\u5931\u8D25\u6216\u5DF2\u4E0D\u5B58\u5728: {0}", String(key)));
                            }
                        }
                    }
                    else {
                        await this.gitOps.setGlobalGitConfig(key, newValue.trim());
                        vscode.window.showInformationMessage(vscode.l10n.t("\u5168\u5C40\u914D\u7F6E {0} \u5DF2\u66F4\u65B0\u4E3A: {1}", String(key), String(newValue.trim())));
                    }
                }
            }
        }
    }
}
