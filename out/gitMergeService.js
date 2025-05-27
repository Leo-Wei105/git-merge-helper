"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitMergeService = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const util_1 = require("util");
const vscode = __importStar(require("vscode"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Git合并服务类
 * 提供自动化的Git分支合并功能
 */
class GitMergeService {
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
    getConfiguration() {
        return vscode.workspace.getConfiguration('gitMergeHelper');
    }
    /**
     * 验证分支名称是否合法
     * @param branchName - 分支名称
     * @returns boolean
     */
    validateBranchName(branchName) {
        // Git分支命名规则：不能包含空格、特殊字符等
        const invalidChars = /[\s~^:?*\[\]\\]/;
        const invalidPatterns = /^-|--|\.\.|@{|\.lock$|\/$/;
        if (!branchName || branchName.length === 0) {
            return false;
        }
        if (invalidChars.test(branchName) || invalidPatterns.test(branchName)) {
            return false;
        }
        // 不能以.开头或结尾
        if (branchName.startsWith('.') || branchName.endsWith('.')) {
            return false;
        }
        return true;
    }
    /**
     * 检查操作是否正在进行中
     * @returns boolean
     */
    checkOperationInProgress() {
        if (GitMergeService.isOperationInProgress) {
            vscode.window.showWarningMessage('已有合并操作正在进行中，请等待完成后再试');
            return true;
        }
        return false;
    }
    /**
     * 设置操作状态
     * @param inProgress - 是否正在进行
     */
    setOperationStatus(inProgress) {
        GitMergeService.isOperationInProgress = inProgress;
    }
    /**
     * 获取功能分支配置
     * @returns FeatureBranchConfig
     */
    getFeatureBranchConfig() {
        const config = this.getConfiguration();
        const defaultConfig = {
            patterns: ['feature', 'feat', 'bugfix', 'hotfix', 'fix'],
            description: '功能分支命名模式'
        };
        return config.get('featureBranchConfig', defaultConfig);
    }
    /**
     * 获取主分支名称
     * @returns Promise<string>
     */
    async getMainBranch() {
        const config = this.getConfiguration();
        const autoDetect = config.get('autoDetectMainBranch', true);
        if (autoDetect) {
            try {
                // 尝试自动检测主分支
                const branches = await this.execGitCommand('git branch -r');
                const remoteBranches = branches.split('\n').map(b => b.trim());
                // 按优先级检查远程分支
                const priorityBranches = ['origin/main', 'origin/master', 'origin/release', 'origin/develop'];
                for (const branch of priorityBranches) {
                    if (remoteBranches.some(rb => rb.includes(branch))) {
                        const branchName = branch.replace('origin/', '');
                        // 验证远程分支是否真实存在
                        try {
                            await this.execGitCommand(`git ls-remote --heads origin ${branchName}`);
                            return branchName;
                        }
                        catch (error) {
                            console.warn(`远程分支 ${branchName} 不存在或无法访问`);
                            continue;
                        }
                    }
                }
                // 如果没有找到标准分支，提示用户
                vscode.window.showWarningMessage('未找到标准的主分支(main/master/release/develop)，请手动配置主分支');
            }
            catch (error) {
                console.warn('自动检测主分支失败，使用配置的分支:', error);
            }
        }
        // 使用配置的主分支
        const configuredBranch = config.get('mainBranch', 'master');
        // 验证配置的分支是否存在
        try {
            await this.execGitCommand(`git ls-remote --heads origin ${configuredBranch}`);
            return configuredBranch;
        }
        catch (error) {
            throw new Error(`配置的主分支 "${configuredBranch}" 在远程仓库中不存在，请检查配置`);
        }
    }
    /**
     * 获取目标分支列表
     * @returns TargetBranchConfig[]
     */
    getTargetBranches() {
        const config = this.getConfiguration();
        const defaultBranches = [
            { name: 'uat', description: '测试环境' },
            { name: 'pre', description: '预发布环境' }
        ];
        return config.get('targetBranches', defaultBranches);
    }
    /**
     * 执行Git命令并返回输出
     * @param command - Git命令
     * @returns Promise<string>
     */
    async execGitCommand(command) {
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: this.workspaceRoot,
                encoding: 'utf8'
            });
            if (stderr && !stderr.includes('warning')) {
                console.warn('Git命令警告:', stderr);
            }
            return stdout.trim();
        }
        catch (error) {
            const errorMessage = error.stderr || error.message || '未知错误';
            throw new Error(`Git命令执行失败: ${errorMessage}`);
        }
    }
    /**
     * 检查Git仓库状态
     * @returns Promise<boolean>
     */
    async checkGitRepository() {
        try {
            await this.execGitCommand('git status');
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * 检查当前分支是否为功能分支
     * @returns Promise<boolean>
     */
    async checkFeatureBranch() {
        try {
            const currentBranch = await this.execGitCommand('git branch --show-current');
            const featureConfig = this.getFeatureBranchConfig();
            // 检查分支名是否匹配任何配置的模式
            return featureConfig.patterns.some(pattern => currentBranch.toLowerCase().includes(pattern.toLowerCase()));
        }
        catch (error) {
            throw new Error('无法获取当前分支信息，请确保在Git仓库中操作');
        }
    }
    /**
     * 检查是否有未提交的更改
     * @returns Promise<boolean>
     */
    async checkUncommittedChanges() {
        const status = await this.execGitCommand('git status --porcelain');
        return status.length > 0;
    }
    /**
     * 检查是否存在合并冲突
     * @returns Promise<boolean>
     */
    async checkMergeConflicts() {
        try {
            const status = await this.execGitCommand('git status --porcelain');
            // 检查是否有冲突标记（UU, AA, DD等）
            return status.split('\n').some(line => {
                const statusCode = line.substring(0, 2);
                return ['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD'].includes(statusCode);
            });
        }
        catch (error) {
            return false;
        }
    }
    /**
     * 处理合并冲突
     * @returns Promise<boolean> - 返回是否成功解决冲突
     */
    async handleMergeConflicts() {
        const conflictFiles = await this.getConflictFiles();
        if (conflictFiles.length === 0) {
            return true;
        }
        const action = await vscode.window.showWarningMessage(`检测到 ${conflictFiles.length} 个文件存在合并冲突：\n${conflictFiles.join('\n')}`, '打开冲突文件', '中止合并', '手动解决后继续');
        switch (action) {
            case '打开冲突文件':
                // 打开第一个冲突文件
                if (conflictFiles.length > 0) {
                    const filePath = path.join(this.workspaceRoot, conflictFiles[0]);
                    const document = await vscode.workspace.openTextDocument(filePath);
                    await vscode.window.showTextDocument(document);
                }
                return false;
            case '中止合并':
                await this.execGitCommand('git merge --abort');
                vscode.window.showInformationMessage('合并已中止');
                return false;
            case '手动解决后继续':
                // 等待用户手动解决冲突
                const resolved = await this.waitForConflictResolution();
                return resolved;
            default:
                return false;
        }
    }
    /**
     * 获取冲突文件列表
     * @returns Promise<string[]>
     */
    async getConflictFiles() {
        try {
            const status = await this.execGitCommand('git diff --name-only --diff-filter=U');
            return status ? status.split('\n').filter(file => file.trim()) : [];
        }
        catch (error) {
            return [];
        }
    }
    /**
     * 等待冲突解决
     * @returns Promise<boolean>
     */
    async waitForConflictResolution() {
        const maxAttempts = 10;
        let attempts = 0;
        while (attempts < maxAttempts) {
            const hasConflicts = await this.checkMergeConflicts();
            if (!hasConflicts) {
                // 检查是否还有未暂存的更改
                const hasUnstagedChanges = await this.checkUncommittedChanges();
                if (hasUnstagedChanges) {
                    const shouldCommit = await vscode.window.showInformationMessage('冲突已解决，是否提交合并结果？', '提交', '取消');
                    if (shouldCommit === '提交') {
                        await this.execGitCommand('git add .');
                        await this.execGitCommand('git commit --no-edit');
                        return true;
                    }
                }
                return true;
            }
            const continueWaiting = await vscode.window.showInformationMessage('仍有未解决的冲突，请继续解决...', '重新检查', '中止合并');
            if (continueWaiting === '中止合并') {
                await this.execGitCommand('git merge --abort');
                return false;
            }
            attempts++;
        }
        vscode.window.showErrorMessage('等待冲突解决超时');
        return false;
    }
    /**
     * 安全合并分支（带冲突处理）
     * @param targetBranch - 目标分支
     * @param sourceBranch - 源分支
     * @returns Promise<boolean> - 返回合并是否成功
     */
    async safeMergeBranch(targetBranch, sourceBranch) {
        try {
            await this.execGitCommand(`git checkout ${targetBranch}`);
            await this.execGitCommand(`git pull origin ${targetBranch}`);
            // 尝试合并
            try {
                await this.execGitCommand(`git merge ${sourceBranch}`);
            }
            catch (mergeError) {
                // 检查是否是合并冲突
                const hasConflicts = await this.checkMergeConflicts();
                if (hasConflicts) {
                    const resolved = await this.handleMergeConflicts();
                    if (!resolved) {
                        return false;
                    }
                }
                else {
                    // 其他合并错误
                    throw mergeError;
                }
            }
            // 推送到远程
            await this.execGitCommand(`git push origin ${targetBranch}`);
            return true;
        }
        catch (error) {
            console.error(`合并到 ${targetBranch} 失败:`, error);
            throw error;
        }
    }
    /**
     * 合并分支
     * @param targetBranch - 目标分支
     * @param sourceBranch - 源分支
     * @returns Promise<void>
     */
    async mergeBranch(targetBranch, sourceBranch) {
        const success = await this.safeMergeBranch(targetBranch, sourceBranch);
        if (!success) {
            throw new Error(`合并到 ${targetBranch} 分支失败`);
        }
    }
    /**
     * 显示进度消息
     * @param message - 消息内容
     */
    showProgress(message) {
        vscode.window.showInformationMessage(`🔄 ${message}`);
        console.log(message);
    }
    /**
     * 合并Feature分支主流程
     * @returns Promise<void>
     */
    async mergeFeatureBranch() {
        // 检查并发控制
        if (this.checkOperationInProgress()) {
            return;
        }
        this.setOperationStatus(true);
        let currentBranch = '';
        try {
            // 首先检查Git仓库状态
            if (!(await this.checkGitRepository())) {
                throw new Error('当前目录不是有效的Git仓库');
            }
            this.showProgress('检查当前分支...');
            // 获取当前分支名（在检查之前先获取，以便错误处理时切回）
            currentBranch = await this.execGitCommand('git branch --show-current');
            // 检查是否在功能分支
            if (!(await this.checkFeatureBranch())) {
                const featureConfig = this.getFeatureBranchConfig();
                const patterns = featureConfig.patterns.join(', ');
                throw new Error(`当前分支不是功能分支。支持的分支模式: ${patterns}`);
            }
            // 检查是否有未提交的更改
            if (await this.checkUncommittedChanges()) {
                const shouldCommit = await vscode.window.showWarningMessage('检测到未提交的更改，是否现在提交？', '是', '否');
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
                }
                else {
                    throw new Error('请先提交或存储更改后再运行');
                }
            }
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
            const targetBranch = await vscode.window.showQuickPick(targetBranchOptions, {
                placeHolder: '请选择要合并到的目标分支',
                canPickMany: false
            });
            if (!targetBranch) {
                throw new Error('未选择目标分支，操作已取消');
            }
            this.showProgress(`开始合并流程，目标分支: ${targetBranch.label}`);
            // 更新并合并主分支
            this.showProgress(`更新${mainBranch}分支...`);
            await this.execGitCommand(`git checkout ${mainBranch}`);
            await this.execGitCommand(`git pull origin ${mainBranch}`);
            // 合并主分支到feature分支
            this.showProgress(`合并${mainBranch}到feature分支...`);
            await this.execGitCommand(`git checkout ${currentBranch}`);
            const mainMergeSuccess = await this.safeMergeBranch(currentBranch, mainBranch);
            if (!mainMergeSuccess) {
                throw new Error(`合并${mainBranch}到${currentBranch}失败`);
            }
            await this.execGitCommand(`git push origin ${currentBranch}`);
            // 合并feature分支到目标分支
            this.showProgress(`合并${currentBranch}到${targetBranch.label}分支...`);
            await this.mergeBranch(targetBranch.label, currentBranch);
            // 切回原分支
            await this.execGitCommand(`git checkout ${currentBranch}`);
            vscode.window.showInformationMessage('✅ 合并流程完成！');
        }
        catch (error) {
            console.error('合并过程中发生错误:', error);
            // 确保切回原分支
            if (currentBranch) {
                try {
                    await this.execGitCommand(`git checkout ${currentBranch}`);
                }
                catch (e) {
                    console.error('切回原分支失败：', e);
                    vscode.window.showErrorMessage(`无法切回原分支 ${currentBranch}，请手动切换`);
                }
            }
            throw error;
        }
        finally {
            this.setOperationStatus(false);
        }
    }
    /**
     * 快速提交并合并
     * @returns Promise<void>
     */
    async quickCommitAndMerge() {
        // 检查并发控制
        if (this.checkOperationInProgress()) {
            return;
        }
        this.setOperationStatus(true);
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
                placeHolder: '输入提交信息...',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return '提交信息不能为空';
                    }
                    if (value.length > 100) {
                        return '提交信息过长，请控制在100字符以内';
                    }
                    return null;
                }
            });
            if (!commitMessage) {
                throw new Error('未输入提交信息，操作已取消');
            }
            await this.execGitCommand('git add .');
            await this.execGitCommand(`git commit -m "feat: ${commitMessage}"`);
            vscode.window.showInformationMessage('✅ 更改已提交');
            // 询问是否继续合并流程
            const shouldMerge = await vscode.window.showInformationMessage('提交完成，是否继续执行合并流程？', '是', '否');
            if (shouldMerge === '是') {
                await this.mergeFeatureBranch();
            }
        }
        catch (error) {
            console.error('快速提交过程中发生错误:', error);
            throw error;
        }
        finally {
            this.setOperationStatus(false);
        }
    }
    /**
     * 配置管理
     * @returns Promise<void>
     */
    async manageConfiguration() {
        const action = await vscode.window.showQuickPick([
            { label: '设置主分支', description: '配置主分支为main或master' },
            { label: '管理目标分支', description: '添加、编辑或删除目标分支' },
            { label: '配置功能分支模式', description: '设置功能分支命名规则' },
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
            case '配置功能分支模式':
                await this.configureFeatureBranchPatterns();
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
    async configureMainBranch() {
        const config = this.getConfiguration();
        const currentMainBranch = config.get('mainBranch', 'master');
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
            },
            {
                label: 'release',
                description: currentMainBranch === 'release' ? '(当前设置)' : '',
                picked: currentMainBranch === 'release'
            },
            {
                label: 'develop',
                description: currentMainBranch === 'develop' ? '(当前设置)' : '',
                picked: currentMainBranch === 'develop'
            },
            {
                label: '自定义',
                description: '输入自定义分支名'
            }
        ], {
            placeHolder: '选择主分支名称'
        });
        if (!selectedBranch) {
            return;
        }
        let branchName = selectedBranch.label;
        if (selectedBranch.label === '自定义') {
            const customBranch = await vscode.window.showInputBox({
                prompt: '请输入自定义主分支名称',
                placeHolder: '例如: main, master, release',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return '分支名称不能为空';
                    }
                    if (!this.validateBranchName(value)) {
                        return '分支名称包含非法字符';
                    }
                    return null;
                }
            });
            if (!customBranch) {
                return;
            }
            branchName = customBranch;
        }
        // 验证分支是否存在
        try {
            await this.execGitCommand(`git ls-remote --heads origin ${branchName}`);
            await config.update('mainBranch', branchName, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`✅ 主分支已设置为: ${branchName}`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`分支 "${branchName}" 在远程仓库中不存在，请检查分支名称`);
        }
    }
    /**
     * 配置功能分支模式
     * @returns Promise<void>
     */
    async configureFeatureBranchPatterns() {
        const config = this.getConfiguration();
        const currentConfig = this.getFeatureBranchConfig();
        const action = await vscode.window.showQuickPick([
            { label: '查看当前模式', description: '显示当前配置的功能分支模式' },
            { label: '添加新模式', description: '添加新的分支命名模式' },
            { label: '删除模式', description: '删除现有的分支命名模式' },
            { label: '重置为默认', description: '恢复默认的分支命名模式' }
        ], {
            placeHolder: '选择功能分支模式配置操作'
        });
        if (!action) {
            return;
        }
        switch (action.label) {
            case '查看当前模式':
                const patterns = currentConfig.patterns.join(', ');
                vscode.window.showInformationMessage(`当前功能分支模式: ${patterns}`, { modal: true });
                break;
            case '添加新模式':
                const newPattern = await vscode.window.showInputBox({
                    prompt: '请输入新的分支命名模式',
                    placeHolder: '例如: task, story, epic',
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return '模式不能为空';
                        }
                        if (currentConfig.patterns.includes(value.toLowerCase())) {
                            return '该模式已存在';
                        }
                        return null;
                    }
                });
                if (newPattern) {
                    const newConfig = {
                        ...currentConfig,
                        patterns: [...currentConfig.patterns, newPattern.toLowerCase()]
                    };
                    await config.update('featureBranchConfig', newConfig, vscode.ConfigurationTarget.Workspace);
                    vscode.window.showInformationMessage(`✅ 已添加分支模式: ${newPattern}`);
                }
                break;
            case '删除模式':
                if (currentConfig.patterns.length <= 1) {
                    vscode.window.showWarningMessage('至少需要保留一个分支模式');
                    return;
                }
                const patternToRemove = await vscode.window.showQuickPick(currentConfig.patterns.map(pattern => ({ label: pattern })), { placeHolder: '选择要删除的分支模式' });
                if (patternToRemove) {
                    const newConfig = {
                        ...currentConfig,
                        patterns: currentConfig.patterns.filter(p => p !== patternToRemove.label)
                    };
                    await config.update('featureBranchConfig', newConfig, vscode.ConfigurationTarget.Workspace);
                    vscode.window.showInformationMessage(`✅ 已删除分支模式: ${patternToRemove.label}`);
                }
                break;
            case '重置为默认':
                await config.update('featureBranchConfig', undefined, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage('✅ 功能分支模式已重置为默认值');
                break;
        }
    }
    /**
     * 管理目标分支
     * @returns Promise<void>
     */
    async manageTargetBranches() {
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
    async showCurrentTargetBranches() {
        const targetBranches = this.getTargetBranches();
        const branchList = targetBranches.map(branch => `• ${branch.name}: ${branch.description}`).join('\n');
        vscode.window.showInformationMessage(`当前配置的目标分支:\n\n${branchList}`, { modal: true });
    }
    /**
     * 添加目标分支
     * @returns Promise<void>
     */
    async addTargetBranch() {
        const branchName = await vscode.window.showInputBox({
            prompt: '请输入新分支名称',
            placeHolder: '例如: dev, staging, prod',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return '分支名称不能为空';
                }
                if (!this.validateBranchName(value)) {
                    return '分支名称包含非法字符或格式不正确';
                }
                const currentBranches = this.getTargetBranches();
                if (currentBranches.some(branch => branch.name === value)) {
                    return `分支 "${value}" 已存在`;
                }
                return null;
            }
        });
        if (!branchName) {
            return;
        }
        const branchDescription = await vscode.window.showInputBox({
            prompt: '请输入分支描述',
            placeHolder: '例如: 开发环境, 预发布环境',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return '分支描述不能为空';
                }
                if (value.length > 50) {
                    return '分支描述过长，请控制在50字符以内';
                }
                return null;
            }
        });
        if (!branchDescription) {
            return;
        }
        // 可选：验证分支是否在远程存在
        const shouldValidateRemote = await vscode.window.showQuickPick([
            { label: '是', description: '验证分支在远程仓库中是否存在' },
            { label: '否', description: '跳过远程验证，直接添加' }
        ], {
            placeHolder: '是否验证分支在远程仓库中存在？'
        });
        if (shouldValidateRemote?.label === '是') {
            try {
                await this.execGitCommand(`git ls-remote --heads origin ${branchName}`);
            }
            catch (error) {
                const shouldContinue = await vscode.window.showWarningMessage(`分支 "${branchName}" 在远程仓库中不存在，是否仍要添加？`, '继续添加', '取消');
                if (shouldContinue !== '继续添加') {
                    return;
                }
            }
        }
        const config = this.getConfiguration();
        const currentBranches = this.getTargetBranches();
        const newBranches = [...currentBranches, { name: branchName, description: branchDescription }];
        await config.update('targetBranches', newBranches, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(`✅ 已添加目标分支: ${branchName} (${branchDescription})`);
    }
    /**
     * 删除目标分支
     * @returns Promise<void>
     */
    async removeTargetBranch() {
        const targetBranches = this.getTargetBranches();
        if (targetBranches.length === 0) {
            vscode.window.showWarningMessage('没有可删除的目标分支');
            return;
        }
        if (targetBranches.length === 1) {
            vscode.window.showWarningMessage('至少需要保留一个目标分支');
            return;
        }
        const branchToRemove = await vscode.window.showQuickPick(targetBranches.map(branch => ({
            label: branch.name,
            description: branch.description
        })), {
            placeHolder: '选择要删除的目标分支'
        });
        if (!branchToRemove) {
            return;
        }
        const confirm = await vscode.window.showWarningMessage(`确定要删除目标分支 "${branchToRemove.label}" 吗？`, '确定删除', '取消');
        if (confirm === '确定删除') {
            const config = this.getConfiguration();
            const newBranches = targetBranches.filter(branch => branch.name !== branchToRemove.label);
            await config.update('targetBranches', newBranches, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`✅ 已删除目标分支: ${branchToRemove.label}`);
        }
    }
    /**
     * 切换自动检测
     * @returns Promise<void>
     */
    async toggleAutoDetect() {
        const config = this.getConfiguration();
        const currentValue = config.get('autoDetectMainBranch', true);
        const newValue = !currentValue;
        await config.update('autoDetectMainBranch', newValue, vscode.ConfigurationTarget.Workspace);
        const status = newValue ? '已开启' : '已关闭';
        vscode.window.showInformationMessage(`✅ 主分支自动检测${status}`);
        if (newValue) {
            // 如果开启了自动检测，尝试检测当前主分支
            try {
                const detectedBranch = await this.getMainBranch();
                vscode.window.showInformationMessage(`检测到主分支: ${detectedBranch}`);
            }
            catch (error) {
                vscode.window.showWarningMessage('自动检测主分支失败，请手动配置');
            }
        }
    }
    /**
     * 重置配置
     * @returns Promise<void>
     */
    async resetConfiguration() {
        const resetOptions = await vscode.window.showQuickPick([
            {
                label: '重置所有配置',
                description: '恢复所有配置项为默认值',
                detail: '包括主分支、目标分支、功能分支模式和自动检测设置'
            },
            {
                label: '重置主分支配置',
                description: '仅重置主分支相关配置',
                detail: '包括主分支名称和自动检测设置'
            },
            {
                label: '重置目标分支配置',
                description: '仅重置目标分支配置',
                detail: '恢复为默认的uat和pre分支'
            },
            {
                label: '重置功能分支模式',
                description: '仅重置功能分支命名模式',
                detail: '恢复为默认的feature、feat、bugfix等模式'
            }
        ], {
            placeHolder: '选择要重置的配置范围'
        });
        if (!resetOptions) {
            return;
        }
        const confirm = await vscode.window.showWarningMessage(`确定要${resetOptions.label}吗？此操作不可撤销。`, '确定重置', '取消');
        if (confirm !== '确定重置') {
            return;
        }
        const config = this.getConfiguration();
        try {
            switch (resetOptions.label) {
                case '重置所有配置':
                    await config.update('mainBranch', undefined, vscode.ConfigurationTarget.Workspace);
                    await config.update('targetBranches', undefined, vscode.ConfigurationTarget.Workspace);
                    await config.update('featureBranchConfig', undefined, vscode.ConfigurationTarget.Workspace);
                    await config.update('autoDetectMainBranch', undefined, vscode.ConfigurationTarget.Workspace);
                    vscode.window.showInformationMessage('✅ 所有配置已重置为默认值');
                    break;
                case '重置主分支配置':
                    await config.update('mainBranch', undefined, vscode.ConfigurationTarget.Workspace);
                    await config.update('autoDetectMainBranch', undefined, vscode.ConfigurationTarget.Workspace);
                    vscode.window.showInformationMessage('✅ 主分支配置已重置为默认值');
                    break;
                case '重置目标分支配置':
                    await config.update('targetBranches', undefined, vscode.ConfigurationTarget.Workspace);
                    vscode.window.showInformationMessage('✅ 目标分支配置已重置为默认值');
                    break;
                case '重置功能分支模式':
                    await config.update('featureBranchConfig', undefined, vscode.ConfigurationTarget.Workspace);
                    vscode.window.showInformationMessage('✅ 功能分支模式已重置为默认值');
                    break;
            }
            // 显示重置后的配置信息
            const shouldShowConfig = await vscode.window.showInformationMessage('配置重置完成，是否查看当前配置？', '查看配置', '关闭');
            if (shouldShowConfig === '查看配置') {
                await this.showCurrentConfiguration();
            }
        }
        catch (error) {
            console.error('重置配置时发生错误:', error);
            vscode.window.showErrorMessage('重置配置失败，请重试');
        }
    }
    /**
     * 显示当前配置信息
     * @returns Promise<void>
     */
    async showCurrentConfiguration() {
        try {
            const config = this.getConfiguration();
            const mainBranch = config.get('mainBranch', 'master');
            const autoDetect = config.get('autoDetectMainBranch', true);
            const targetBranches = this.getTargetBranches();
            const featureConfig = this.getFeatureBranchConfig();
            const configInfo = [
                '📋 当前配置信息:',
                '',
                `🌿 主分支: ${mainBranch}`,
                `🔍 自动检测主分支: ${autoDetect ? '开启' : '关闭'}`,
                '',
                '🎯 目标分支:',
                ...targetBranches.map(branch => `  • ${branch.name}: ${branch.description}`),
                '',
                '🔧 功能分支模式:',
                `  • 支持的模式: ${featureConfig.patterns.join(', ')}`
            ].join('\n');
            vscode.window.showInformationMessage(configInfo, { modal: true });
        }
        catch (error) {
            console.error('获取配置信息时发生错误:', error);
            vscode.window.showErrorMessage('获取配置信息失败');
        }
    }
    /**
     * 获取当前Git状态信息
     * @returns Promise<string>
     */
    async getGitStatus() {
        try {
            const currentBranch = await this.execGitCommand('git branch --show-current');
            const hasUncommitted = await this.checkUncommittedChanges();
            const isFeatureBranch = await this.checkFeatureBranch();
            const mainBranch = await this.getMainBranch();
            const statusInfo = [
                `当前分支: ${currentBranch}`,
                `主分支: ${mainBranch}`,
                `是否为功能分支: ${isFeatureBranch ? '是' : '否'}`,
                `未提交更改: ${hasUncommitted ? '有' : '无'}`
            ].join('\n');
            return statusInfo;
        }
        catch (error) {
            return `获取Git状态失败: ${error}`;
        }
    }
    /**
     * 验证Git环境
     * @returns Promise<{isValid: boolean, issues: string[]}>
     */
    async validateGitEnvironment() {
        const issues = [];
        try {
            // 检查Git仓库
            if (!(await this.checkGitRepository())) {
                issues.push('当前目录不是有效的Git仓库');
            }
            // 检查远程仓库连接
            try {
                await this.execGitCommand('git remote -v');
            }
            catch (error) {
                issues.push('无法连接到远程仓库');
            }
            // 检查主分支配置
            try {
                await this.getMainBranch();
            }
            catch (error) {
                issues.push(`主分支配置有误: ${error}`);
            }
            // 检查目标分支
            const targetBranches = this.getTargetBranches();
            if (targetBranches.length === 0) {
                issues.push('未配置目标分支');
            }
            // 检查功能分支配置
            const featureConfig = this.getFeatureBranchConfig();
            if (featureConfig.patterns.length === 0) {
                issues.push('未配置功能分支模式');
            }
        }
        catch (error) {
            issues.push(`环境验证失败: ${error}`);
        }
        return {
            isValid: issues.length === 0,
            issues
        };
    }
}
exports.GitMergeService = GitMergeService;
GitMergeService.isOperationInProgress = false; // 并发控制标志
//# sourceMappingURL=gitMergeService.js.map