import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

/**
 * Git合并服务类
 * 提供自动化的Git分支合并功能
 */
export class GitMergeService {
    private workspaceRoot: string;

    constructor() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('请先打开一个工作区文件夹');
        }
        
        this.workspaceRoot = workspaceFolders[0].uri.fsPath;
        
        // 检查是否是Git仓库
        const gitDir = path.join(this.workspaceRoot, '.git');
        if (!fs.existsSync(gitDir)) {
            throw new Error('当前工作区不是Git仓库，请在Git项目中使用此插件');
        }
    }

    /**
     * 执行Git命令并返回输出
     * @param command - Git命令
     * @returns Promise<string>
     */
    private async execGitCommand(command: string): Promise<string> {
        try {
            const { stdout, stderr } = await execAsync(command, { 
                cwd: this.workspaceRoot,
                encoding: 'utf8'
            });
            
            if (stderr && !stderr.includes('warning')) {
                console.warn('Git命令警告:', stderr);
            }
            
            return stdout.trim();
        } catch (error: any) {
            const errorMessage = error.stderr || error.message || '未知错误';
            throw new Error(`Git命令执行失败: ${errorMessage}`);
        }
    }

    /**
     * 检查Git仓库状态
     * @returns Promise<boolean>
     */
    private async checkGitRepository(): Promise<boolean> {
        try {
            await this.execGitCommand('git status');
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 检查当前分支是否为feature分支
     * @returns Promise<boolean>
     */
    private async checkFeatureBranch(): Promise<boolean> {
        try {
            const currentBranch = await this.execGitCommand('git branch --show-current');
            return currentBranch.toLowerCase().includes('feature');
        } catch (error) {
            throw new Error('无法获取当前分支信息，请确保在Git仓库中操作');
        }
    }

    /**
     * 检查是否有未提交的更改
     * @returns Promise<boolean>
     */
    private async checkUncommittedChanges(): Promise<boolean> {
        const status = await this.execGitCommand('git status --porcelain');
        return status.length > 0;
    }

    /**
     * 合并分支
     * @param targetBranch - 目标分支
     * @param sourceBranch - 源分支
     * @returns Promise<void>
     */
    private async mergeBranch(targetBranch: string, sourceBranch: string): Promise<void> {
        await this.execGitCommand(`git checkout ${targetBranch}`);
        await this.execGitCommand(`git pull origin ${targetBranch}`);
        await this.execGitCommand(`git merge ${sourceBranch}`);
        await this.execGitCommand(`git push origin ${targetBranch}`);
    }

    /**
     * 显示进度消息
     * @param message - 消息内容
     */
    private showProgress(message: string): void {
        vscode.window.showInformationMessage(`🔄 ${message}`);
        console.log(message);
    }

    /**
     * 合并Feature分支主流程
     * @returns Promise<void>
     */
    public async mergeFeatureBranch(): Promise<void> {
        try {
            // 首先检查Git仓库状态
            if (!(await this.checkGitRepository())) {
                throw new Error('当前目录不是有效的Git仓库');
            }

            this.showProgress('检查当前分支...');

            // 检查是否在feature分支
            if (!(await this.checkFeatureBranch())) {
                throw new Error('当前不在feature分支上，请切换到feature分支后再运行');
            }

            // 检查是否有未提交的更改
            if (await this.checkUncommittedChanges()) {
                const shouldCommit = await vscode.window.showWarningMessage(
                    '检测到未提交的更改，是否现在提交？',
                    '是',
                    '否'
                );

                if (shouldCommit === '是') {
                    const commitMessage = await vscode.window.showInputBox({
                        prompt: '请输入commit内容',
                        placeHolder: '输入提交信息...'
                    });

                    if (!commitMessage) {
                        throw new Error('未输入提交信息，操作已取消');
                    }

                    await this.execGitCommand('git add .');
                    await this.execGitCommand(`git commit -m "feat: ${commitMessage}"`);
                    this.showProgress('更改已提交');
                } else {
                    throw new Error('请先提交或存储更改后再运行');
                }
            }

            // 获取当前分支名
            const currentBranch = await this.execGitCommand('git branch --show-current');

            // 让用户选择目标分支
            const targetBranch = await vscode.window.showQuickPick(
                [
                    { label: 'pre', description: '预发布环境' },
                    { label: 'uat', description: '测试环境' }
                ],
                {
                    placeHolder: '请选择要合并到的目标分支',
                    canPickMany: false
                }
            );

            if (!targetBranch) {
                throw new Error('未选择目标分支，操作已取消');
            }

            this.showProgress(`开始合并流程，目标分支: ${targetBranch.label}`);

            try {
                // 更新并合并master分支
                this.showProgress('更新master分支...');
                await this.execGitCommand('git checkout master');
                await this.execGitCommand('git pull origin master');

                // 合并master到feature分支
                this.showProgress('合并master到feature分支...');
                await this.execGitCommand(`git checkout ${currentBranch}`);
                await this.execGitCommand('git merge master');
                await this.execGitCommand(`git push origin ${currentBranch}`);

                // 合并feature分支到目标分支
                this.showProgress(`合并${currentBranch}到${targetBranch.label}分支...`);
                await this.mergeBranch(targetBranch.label, currentBranch);

                // 切回原分支
                await this.execGitCommand(`git checkout ${currentBranch}`);

                vscode.window.showInformationMessage('✅ 合并流程完成！');
            } catch (error) {
                // 确保切回原分支
                try {
                    await this.execGitCommand(`git checkout ${currentBranch}`);
                } catch (e) {
                    console.error('切回原分支失败：', e);
                }
                throw error;
            }
        } catch (error: any) {
            console.error('合并过程中发生错误:', error);
            throw error;
        }
    }

    /**
     * 快速提交并合并
     * @returns Promise<void>
     */
    public async quickCommitAndMerge(): Promise<void> {
        try {
            // 首先检查Git仓库状态
            if (!(await this.checkGitRepository())) {
                throw new Error('当前目录不是有效的Git仓库');
            }

            // 检查是否有未提交的更改
            if (!(await this.checkUncommittedChanges())) {
                vscode.window.showInformationMessage('没有需要提交的更改');
                return;
            }

            const commitMessage = await vscode.window.showInputBox({
                prompt: '请输入commit内容',
                placeHolder: '输入提交信息...'
            });

            if (!commitMessage) {
                throw new Error('未输入提交信息，操作已取消');
            }

            await this.execGitCommand('git add .');
            await this.execGitCommand(`git commit -m "feat: ${commitMessage}"`);
            
            vscode.window.showInformationMessage('✅ 更改已提交');

            // 询问是否继续合并流程
            const shouldMerge = await vscode.window.showInformationMessage(
                '提交完成，是否继续执行合并流程？',
                '是',
                '否'
            );

            if (shouldMerge === '是') {
                await this.mergeFeatureBranch();
            }
        } catch (error: any) {
            console.error('快速提交过程中发生错误:', error);
            throw error;
        }
    }
}