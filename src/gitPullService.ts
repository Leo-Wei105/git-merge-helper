import * as vscode from 'vscode';
import { GitOperations } from './gitOperations';
import { AppError } from './errors';
export class GitPullService {
    private gitOps: GitOperations;
    constructor(workspaceRoot: string) {
        this.gitOps = new GitOperations(workspaceRoot);
    }
    async pullAllBranches(): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t("\u6B63\u5728\u4E00\u952E\u62C9\u53D6\u6240\u6709\u672C\u5730\u5206\u652F..."),
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: vscode.l10n.t("\u6B63\u5728\u4ECE\u8FDC\u7AEF\u62C9\u53D6\u6700\u65B0\u4FE1\u606F...") });
                await this.gitOps.execGitArgs(['fetch', '--all']);
                progress.report({ message: vscode.l10n.t("\u6B63\u5728\u5206\u6790\u672C\u5730\u5206\u652F\u4E0E\u8FDC\u7AEF\u72B6\u6001...") });
                const currentBranch = await this.gitOps.getCurrentBranch();
                const refsOutput = await this.gitOps.execGitArgs([
                    'for-each-ref',
                    '--format=%(refname:short)\t%(upstream:short)',
                    'refs/heads/'
                ]);
                if (!refsOutput.trim()) {
                    vscode.window.showInformationMessage(vscode.l10n.t("\u672A\u627E\u5230\u672C\u5730\u5206\u652F\u3002"));
                    return;
                }
                const lines = refsOutput.split('\n').map(line => line.trim()).filter(Boolean);
                let successCount = 0;
                let skipCount = 0;
                let failCount = 0;
                let failDetails: string[] = [];
                for (const line of lines) {
                    const [branch, upstream] = line.split('\t');
                    if (!upstream) {
                        skipCount++;
                        continue;
                    }
                    try {
                        const countOutput = await this.gitOps.execGitArgs([
                            'rev-list',
                            '--left-right',
                            '--count',
                            `${branch}...${upstream}`
                        ]);
                        const [aheadStr, behindStr] = countOutput.trim().split(/\s+/);
                        const ahead = parseInt(aheadStr, 10);
                        const behind = parseInt(behindStr, 10);
                        if (behind === 0) {
                            skipCount++;
                            continue;
                        }
                        if (ahead > 0) {
                            failCount++;
                            failDetails.push(vscode.l10n.t("{0}: \u672C\u5730\u6709\u65B0\u63D0\u4EA4\uFF0C\u4E0E\u8FDC\u7AEF\u51FA\u73B0\u5206\u53C9\uFF0C\u65E0\u6CD5\u901A\u8FC7\u5FEB\u8FDB\u66F4\u65B0", String(branch)));
                            continue;
                        }
                        progress.report({ message: vscode.l10n.t("\u6B63\u5728\u66F4\u65B0\u5206\u652F: {0}...", String(branch)) });
                        if (branch === currentBranch) {
                            await this.gitOps.execGitArgs(['merge', '--ff-only', upstream]);
                        }
                        else {
                            await this.gitOps.execGitArgs(['branch', '-f', branch, upstream]);
                        }
                        successCount++;
                    }
                    catch (error: any) {
                        failCount++;
                        failDetails.push(`${branch}: ${error.message || vscode.l10n.t("\u66F4\u65B0\u5931\u8D25")}`);
                    }
                }
                const summary = vscode.l10n.t("\u4E00\u952E\u62C9\u53D6\u5B8C\u6210\u3002\u6210\u529F\u66F4\u65B0 {0} \u4E2A\u5206\u652F\uFF0C\u8DF3\u8FC7 {1} \u4E2A\u5206\u652F\uFF08\u65E0\u66F4\u65B0\u6216\u65E0\u8FDC\u7AEF\uFF09\uFF0C\u5931\u8D25/\u53D7\u963B {2} \u4E2A\u3002", String(successCount), String(skipCount), String(failCount));
                if (failCount > 0) {
                    vscode.window.showWarningMessage(summary, vscode.l10n.t("\u67E5\u770B\u8BE6\u60C5")).then(selection => {
                        if (selection === vscode.l10n.t("\u67E5\u770B\u8BE6\u60C5")) {
                            const detailStr = failDetails.join('\n');
                            const doc = vscode.workspace.openTextDocument({ content: vscode.l10n.t("\u4E00\u952E\u62C9\u53D6\u5931\u8D25/\u53D7\u963B\u8BE6\u60C5\uFF1A\n\n{0}", String(detailStr)), language: 'text' });
                            doc.then(d => vscode.window.showTextDocument(d));
                        }
                    });
                }
                else {
                    vscode.window.showInformationMessage(summary);
                }
            }
            catch (error: any) {
                throw AppError.gitFailed(vscode.l10n.t("\u4E00\u952E\u62C9\u53D6\u5931\u8D25"), 'pullAllBranches', error);
            }
        });
    }
}
