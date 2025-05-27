import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

/**
 * 目标分支配置接口
 */
interface TargetBranchConfig {
    name: string;
    description: string;
}

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
     * 获取插件配置
     * @returns 插件配置对象
     */
    private getConfiguration() {
        return vscode.workspace.getConfiguration('gitMergeHelper');
    }

    /**
     * 获取主分支名称
     * @returns Promise<string>
     */
    private async getMainBranch(): Promise<string> {
        const config = this.getConfiguration();
        const autoDetect = config.get<boolean>('autoDetectMainBranch', true);
        
        if (autoDetect) {
            try {
                // 尝试自动检测主分支
                const branches = await this.execGitCommand('git branch -r');
                if (branches.includes('origin/main')) {
                    return 'main';
                } else if (branches.includes('origin/master')) {
                    return 'master';
                }
            } catch (error) {
                console.warn('自动检测主分支失败，使用配置的分支:', error);
            }
        }
        
        // 使用配置的主分支
        return config.get<string>('mainBranch', 'master');
    }

    /**
     * 获取目标分支列表
     * @returns TargetBranchConfig[]
     */
    private getTargetBranches(): TargetBranchConfig[] {
        const config = this.getConfiguration();
        const defaultBranches: TargetBranchConfig[] = [
            { name: 'uat', description: '测试环境' },
            { name: 'pre', description: '预发布环境' }
        ];
        
        return config.get<TargetBranchConfig[]>('targetBranches', defaultBranches);
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
            
            // 获取主分支名称
            const mainBranch = await this.getMainBranch();
            this.showProgress(`检测到主分支: ${mainBranch}`);

            // 获取目标分支列表
            const targetBranches = this.getTargetBranches();
            
            // 让用户选择目标分支
            const targetBranchOptions = targetBranches.map(branch => ({
                label: branch.name,
                description: branch.description
            }));

            const targetBranch = await vscode.window.showQuickPick(
                targetBranchOptions,
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
                // 更新并合并主分支
                this.showProgress(`更新${mainBranch}分支...`);
                await this.execGitCommand(`git checkout ${mainBranch}`);
                await this.execGitCommand(`git pull origin ${mainBranch}`);

                // 合并主分支到feature分支
                this.showProgress(`合并${mainBranch}到feature分支...`);
                await this.execGitCommand(`git checkout ${currentBranch}`);
                await this.execGitCommand(`git merge ${mainBranch}`);
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

    /**
     * 配置管理
     * @returns Promise<void>
     */
    public async manageConfiguration(): Promise<void> {
        const action = await vscode.window.showQuickPick([
            { label: '设置主分支', description: '配置主分支为main或master' },
            { label: '管理目标分支', description: '添加、编辑或删除目标分支' },
            { label: '切换自动检测', description: '开启/关闭主分支自动检测' },
            { label: '重置为默认配置', description: '恢复所有配置为默认值' }
        ], {
            placeHolder: '选择要执行的配置操作'
        });

        if (!action) {
            return;
        }

        switch (action.label) {
            case '设置主分支':
                await this.configureMainBranch();
                break;
            case '管理目标分支':
                await this.manageTargetBranches();
                break;
            case '切换自动检测':
                await this.toggleAutoDetect();
                break;
            case '重置为默认配置':
                await this.resetConfiguration();
                break;
        }
    }

    /**
     * 配置主分支
     * @returns Promise<void>
     */
    private async configureMainBranch(): Promise<void> {
        const config = this.getConfiguration();
        const currentMainBranch = config.get<string>('mainBranch', 'master');
        
        const selectedBranch = await vscode.window.showQuickPick([
            { 
                label: 'master', 
                description: currentMainBranch === 'master' ? '(当前设置)' : '',
                picked: currentMainBranch === 'master'
            },
            { 
                label: 'main', 
                description: currentMainBranch === 'main' ? '(当前设置)' : '',
                picked: currentMainBranch === 'main'
            }
        ], {
            placeHolder: '选择主分支名称'
        });

        if (selectedBranch) {
            await config.update('mainBranch', selectedBranch.label, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`✅ 主分支已设置为: ${selectedBranch.label}`);
        }
    }

    /**
     * 管理目标分支
     * @returns Promise<void>
     */
    private async manageTargetBranches(): Promise<void> {
        const action = await vscode.window.showQuickPick([
            { label: '查看当前分支', description: '显示当前配置的目标分支' },
            { label: '添加新分支', description: '添加一个新的目标分支' },
            { label: '删除分支', description: '删除一个现有的目标分支' }
        ], {
            placeHolder: '选择目标分支管理操作'
        });

        if (!action) {
            return;
        }

        switch (action.label) {
            case '查看当前分支':
                await this.showCurrentTargetBranches();
                break;
            case '添加新分支':
                await this.addTargetBranch();
                break;
            case '删除分支':
                await this.removeTargetBranch();
                break;
        }
    }

    /**
     * 显示当前目标分支
     * @returns Promise<void>
     */
    private async showCurrentTargetBranches(): Promise<void> {
        const targetBranches = this.getTargetBranches();
        const branchList = targetBranches.map(branch => `• ${branch.name}: ${branch.description}`).join('\n');
        
        vscode.window.showInformationMessage(
            `当前配置的目标分支:\n\n${branchList}`,
            { modal: true }
        );
    }

    /**
     * 添加目标分支
     * @returns Promise<void>
     */
    private async addTargetBranch(): Promise<void> {
        const branchName = await vscode.window.showInputBox({
            prompt: '请输入新分支名称',
            placeHolder: '例如: dev, staging, prod'
        });

        if (!branchName) {
            return;
        }

        const branchDescription = await vscode.window.showInputBox({
            prompt: '请输入分支描述',
            placeHolder: '例如: 开发环境, 预发布环境'
        });

        if (!branchDescription) {
            return;
        }

        const config = this.getConfiguration();
        const currentBranches = this.getTargetBranches();
        
        // 检查分支是否已存在
        if (currentBranches.some(branch => branch.name === branchName)) {
            vscode.window.showWarningMessage(`分支 "${branchName}" 已存在`);
            return;
        }

        const newBranches = [...currentBranches, { name: branchName, description: branchDescription }];
        await config.update('targetBranches', newBranches, vscode.ConfigurationTarget.Workspace);
        
        vscode.window.showInformationMessage(`✅ 已添加目标分支: ${branchName} (${branchDescription})`);
    }

    /**
     * 删除目标分支
     * @returns Promise<void>
     */
    private async removeTargetBranch(): Promise<void> {
        const targetBranches = this.getTargetBranches();
        
        if (targetBranches.length === 0) {
            vscode.window.showWarningMessage('没有可删除的目标分支');
            return;
        }

        const branchToRemove = await vscode.window.showQuickPick(
            targetBranches.map(branch => ({
                label: branch.name,
                description: branch.description
            })),
            {
                placeHolder: '选择要删除的目标分支'
            }
        );

        if (!branchToRemove) {
            return;
        }

        const config = this.getConfiguration();
        const newBranches = targetBranches.filter(branch => branch.name !== branchToRemove.label);
        await config.update('targetBranches', newBranches, vscode.ConfigurationTarget.Workspace);
        
        vscode.window.showInformationMessage(`✅ 已删除目标分支: ${branchToRemove.label}`);
    }

    /**
     * 切换自动检测
     * @returns Promise<void>
     */
    private async toggleAutoDetect(): Promise<void> {
        const config = this.getConfiguration();
        const currentValue = config.get<boolean>('autoDetectMainBranch', true);
        const newValue = !currentValue;
        
        await config.update('autoDetectMainBranch', newValue, vscode.ConfigurationTarget.Workspace);
        
        const status = newValue ? '已开启' : '已关闭';
        vscode.window.showInformationMessage(`✅ 主分支自动检测${status}`);
    }

    /**
     * 重置配置
     * @returns Promise<void>
     */
    private async resetConfiguration(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            '确定要重置所有配置为默认值吗？此操作不可撤销。',
            '确定',
            '取消'
        );

        if (confirm === '确定') {
            const config = this.getConfiguration();
            await config.update('mainBranch', undefined, vscode.ConfigurationTarget.Workspace);
            await config.update('targetBranches', undefined, vscode.ConfigurationTarget.Workspace);
            await config.update('autoDetectMainBranch', undefined, vscode.ConfigurationTarget.Workspace);
            
            vscode.window.showInformationMessage('✅ 配置已重置为默认值');
        }
    }
}