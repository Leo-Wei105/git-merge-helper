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
            title: '正在一键拉取所有本地分支...',
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: '正在从远端拉取最新信息...' });
                await this.gitOps.execGitArgs(['fetch', '--all']);

                progress.report({ message: '正在分析本地分支与远端状态...' });
                const currentBranch = await this.gitOps.getCurrentBranch();

                const refsOutput = await this.gitOps.execGitArgs([
                    'for-each-ref',
                    '--format=%(refname:short)\t%(upstream:short)',
                    'refs/heads/'
                ]);

                if (!refsOutput.trim()) {
                    vscode.window.showInformationMessage('未找到本地分支。');
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
                            failDetails.push(`${branch}: 本地有新提交，与远端出现分叉，无法通过快进更新`);
                            continue;
                        }

                        progress.report({ message: `正在更新分支: ${branch}...` });
                        if (branch === currentBranch) {
                            await this.gitOps.execGitArgs(['merge', '--ff-only', upstream]);
                        } else {
                            await this.gitOps.execGitArgs(['branch', '-f', branch, upstream]);
                        }
                        successCount++;
                    } catch (error: any) {
                        failCount++;
                        failDetails.push(`${branch}: ${error.message || '更新失败'}`);
                    }
                }

                const summary = `一键拉取完成。成功更新 ${successCount} 个分支，跳过 ${skipCount} 个分支（无更新或无远端），失败/受阻 ${failCount} 个。`;
                if (failCount > 0) {
                    vscode.window.showWarningMessage(summary, '查看详情').then(selection => {
                        if (selection === '查看详情') {
                            const detailStr = failDetails.join('\n');
                            const doc = vscode.workspace.openTextDocument({ content: `一键拉取失败/受阻详情：\n\n${detailStr}`, language: 'text' });
                            doc.then(d => vscode.window.showTextDocument(d));
                        }
                    });
                } else {
                    vscode.window.showInformationMessage(summary);
                }

            } catch (error: any) {
                throw AppError.gitFailed('一键拉取失败', 'pullAllBranches', error);
            }
        });
    }
}
