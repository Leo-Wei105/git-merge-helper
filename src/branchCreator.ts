import * as vscode from "vscode";
import { BranchConfigManager } from "./branchConfigManager";
import { BranchCreationOptions, BranchCreationResult, BranchPrefix, DateFormat, GitBranch, } from "./branchTypes";
import { BranchUtils } from "./branchUtils";
import { AppError, isUserCancelledError } from "./errors";
import { GitOperations } from "./gitOperations";
export class BranchCreator {
    private configManager: BranchConfigManager;
    private gitOps: GitOperations;
    constructor(configManager: BranchConfigManager, workspaceRoot: string) {
        this.configManager = configManager;
        this.gitOps = new GitOperations(workspaceRoot);
    }
    /**
     * 获取Git用户名
     */
    private async getGitUsername(): Promise<string> {
        const config = this.configManager.getConfiguration();
        if (config.customGitName) {
            return config.customGitName;
        }
        try {
            const username = await this.gitOps.execGitCommand("git config user.name");
            if (!username) {
                throw new Error(vscode.l10n.t("未设置Git用户名，请先配置Git用户名或在插件设置中指定"));
            }
            return username;
        }
        catch (error) {
            throw new AppError(vscode.l10n.t("获取Git用户名失败，请检查Git配置"), "UNKNOWN", {
                stage: "getGitUsername",
                cause: error,
            });
        }
    }
    /**
     * 获取所有分支
     */
    private async getAllBranches(): Promise<GitBranch[]> {
        try {
            const branches: GitBranch[] = [];
            let currentBranch = "";
            try {
                currentBranch = await this.gitOps.getCurrentBranch();
            }
            catch {
                currentBranch = "";
            }
            // 获取本地分支
            const localBranchOutput = await this.gitOps.execGitCommand('git branch --format="%(refname:short)|%(objectname:short)"');
            if (localBranchOutput) {
                localBranchOutput.split("\n").filter((line) => line.trim()).forEach((line) => {
                    const [name, commit] = line.split("|");
                    if (name?.trim()) {
                        branches.push({
                            name: name.trim(),
                            current: name.trim() === currentBranch,
                            isRemote: false,
                            commit: commit || "",
                        });
                    }
                });
            }
            // 获取远程分支
            try {
                const remoteBranchOutput = await this.gitOps.execGitCommand('git branch -r --format="%(refname:short)|%(objectname:short)"');
                if (remoteBranchOutput) {
                    remoteBranchOutput.split("\n").filter((line) => line.trim()).forEach((line) => {
                        const [name, commit] = line.split("|");
                        if (name?.trim() && !name.includes("HEAD")) {
                            branches.push({
                                name: name.trim(),
                                current: false,
                                isRemote: true,
                                commit: commit || "",
                            });
                        }
                    });
                }
            }
            catch {
                // 如果没有远程分支，忽略错误
            }
            return branches;
        }
        catch (error) {
            throw new Error(vscode.l10n.t("获取分支列表失败: {0}", String(error)));
        }
    }
    /**
     * 检查分支是否存在
     */
    private async branchExists(branchName: string): Promise<boolean> {
        const localExists = await this.gitOps.checkLocalBranchExists(branchName);
        if (localExists) {
            return true;
        }
        return await this.gitOps.checkRemoteBranchExists(branchName);
    }
    /**
     * 检查是否为远程分支
     */
    private isRemoteBranch(branchName: string): boolean {
        return branchName.includes("/") && !branchName.startsWith("refs/heads/");
    }
    /**
     * 创建并切换到新分支
     */
    private async createAndCheckoutBranch(branchName: string, baseBranch: string): Promise<void> {
        const config = this.configManager.getConfiguration();
        const isRemoteBaseBranch = this.isRemoteBranch(baseBranch);
        try {
            if (config.autoCheckout) {
                await this.gitOps.execGitArgs(["checkout", "-b", branchName, baseBranch]);
                vscode.window.showInformationMessage(vscode.l10n.t("✓ 成功创建分支: {0}", String(branchName)));
            }
            else {
                await this.gitOps.execGitArgs(["branch", branchName, baseBranch]);
                vscode.window.showInformationMessage(vscode.l10n.t("✓ 成功创建分支: {0}", String(branchName)));
            }
            if (isRemoteBaseBranch) {
                try {
                    await this.gitOps.execGitArgs(["branch", "--unset-upstream", branchName]);
                }
                catch {
                    // 忽略错误
                }
            }
            await this.gitOps.setBranchCreationBase(branchName, baseBranch);
        }
        catch (error) {
            throw new Error(vscode.l10n.t("创建分支失败: {0}", String(error)));
        }
    }
    /**
     * 切换到现有分支
     */
    private async checkoutBranch(branchName: string): Promise<void> {
        await this.gitOps.checkoutBranch(branchName);
    }
    /**
     * 选择分支前缀
     */
    private async selectBranchPrefix(): Promise<BranchPrefix | undefined> {
        const prefixes = this.configManager.getBranchPrefixes();
        if (prefixes.length === 0) {
            throw new Error(vscode.l10n.t("没有可用的分支前缀，请先配置分支前缀"));
        }
        // 如果只有一个前缀，直接使用
        if (prefixes.length === 1) {
            return prefixes[0];
        }
        // 创建选择项
        const items = prefixes.map((prefix) => ({
            label: prefix.prefix,
            description: "",
            detail: "",
            prefix: prefix,
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: vscode.l10n.t("选择分支前缀"),
            matchOnDescription: true,
        });
        return selected?.prefix;
    }
    /**
     * 选择基分支
     */
    private async selectBaseBranch(): Promise<string | undefined> {
        const branches = await this.getAllBranches();
        if (branches.length === 0) {
            throw new Error(vscode.l10n.t("没有可用的分支"));
        }
        // 按本地分支优先排序
        const sortedBranches = branches.sort((a, b) => {
            if (a.current) {
                return -1;
            }
            if (b.current) {
                return 1;
            }
            if (!a.isRemote && b.isRemote) {
                return -1;
            }
            if (a.isRemote && !b.isRemote) {
                return 1;
            }
            return a.name.localeCompare(b.name);
        });
        // 创建选择项
        const items = sortedBranches.map((branch) => ({
            label: branch.name,
            description: branch.isRemote ? vscode.l10n.t("远程分支") : vscode.l10n.t("本地分支"),
            detail: branch.current ? vscode.l10n.t("当前分支") : "",
            branchName: branch.name,
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: vscode.l10n.t("选择基分支"),
            matchOnDescription: true,
        });
        return selected?.branchName;
    }
    /**
     * 输入分支描述
     */
    private async inputBranchDescription(prefix: string, username: string): Promise<string | undefined> {
        const config = this.configManager.getConfiguration();
        const currentDate = BranchUtils.formatDate(new Date(), config.dateFormat as DateFormat);
        const description = await vscode.window.showInputBox({
            prompt: vscode.l10n.t("输入分支描述信息"),
            placeHolder: vscode.l10n.t("例如：用户登录功能"),
            validateInput: async (value) => {
                if (!value) {
                    return vscode.l10n.t("描述信息不能为空");
                }
                const validation = BranchUtils.validateDescription(value);
                if (!validation.isValid) {
                    return validation.error;
                }
                // 实时预览分支名称
                const previewName = BranchUtils.generateBranchName({
                    prefix,
                    description: value,
                    username,
                    date: currentDate,
                    format: config.branchNameFormat,
                });
                const branchValidation = await this.gitOps.validateBranchNameWithGit(previewName);
                if (!branchValidation.isValid) {
                    return branchValidation.error;
                }
                return null;
            },
        });
        return description;
    }
    /**
     * 确认创建分支
     */
    private async confirmBranchCreation(options: BranchCreationOptions): Promise<boolean> {
        const config = this.configManager.getConfiguration();
        const branchName = BranchUtils.generateBranchName({
            ...options,
            format: config.branchNameFormat,
        });
        const items = [
            vscode.l10n.t("基分支: {0}", String(options.baseBranch)),
            vscode.l10n.t("新分支: {0}", String(branchName)),
            vscode.l10n.t("描述: {0}", String(options.description)),
            vscode.l10n.t("创建者: {0}", String(options.username)),
        ];
        const confirmed = await vscode.window.showInformationMessage(vscode.l10n.t("确认创建分支？"), {
            modal: true,
            detail: items.join("\n"),
        }, vscode.l10n.t("确认"));
        return confirmed === vscode.l10n.t("确认");
    }
    /**
     * 主要的分支创建流程
     */
    async createBranch(): Promise<BranchCreationResult> {
        try {
            if (!(await this.gitOps.checkGitRepository())) {
                throw new Error(vscode.l10n.t("当前目录不是Git仓库"));
            }
            // 步骤1: 选择分支前缀
            const selectedPrefix = await this.selectBranchPrefix();
            if (!selectedPrefix) {
                return { success: false, error: vscode.l10n.t("未选择分支前缀") };
            }
            // 步骤2: 选择基分支
            const baseBranch = await this.selectBaseBranch();
            if (!baseBranch) {
                return { success: false, error: vscode.l10n.t("未选择基分支") };
            }
            // 步骤3: 获取用户名
            const username = await this.getGitUsername();
            // 步骤4: 输入描述信息
            const description = await this.inputBranchDescription(selectedPrefix.prefix, username);
            if (!description) {
                return { success: false, error: vscode.l10n.t("未输入描述信息") };
            }
            // 步骤5: 生成分支名称
            const config = this.configManager.getConfiguration();
            const currentDate = BranchUtils.formatDate(new Date(), config.dateFormat as DateFormat);
            const branchCreationOptions: BranchCreationOptions = {
                prefix: selectedPrefix.prefix,
                baseBranch,
                description,
                username,
                date: currentDate,
            };
            const configuredBranchName = BranchUtils.generateBranchName({
                ...branchCreationOptions,
                format: config.branchNameFormat,
            });
            const branchValidation = await this.gitOps.validateBranchNameWithGit(configuredBranchName);
            if (!branchValidation.isValid) {
                throw new AppError(branchValidation.error || vscode.l10n.t("分支名不合法"), "UNKNOWN", {
                    stage: "createBranch",
                });
            }
            // 步骤6: 检查分支是否存在
            const exists = await this.branchExists(configuredBranchName);
            if (exists) {
                const action = await vscode.window.showWarningMessage(vscode.l10n.t("分支 {0} 已存在", String(configuredBranchName)), vscode.l10n.t("切换到该分支"), vscode.l10n.t("重新输入"), vscode.l10n.t("取消"));
                if (action === vscode.l10n.t("切换到该分支")) {
                    await this.checkoutBranch(configuredBranchName);
                    return { success: true, branchName: configuredBranchName };
                }
                else if (action === vscode.l10n.t("重新输入")) {
                    return await this.createBranch();
                }
                else {
                    return { success: false, error: vscode.l10n.t("取消创建") };
                }
            }
            // 步骤7: 确认创建
            const confirmed = await this.confirmBranchCreation(branchCreationOptions);
            if (!confirmed) {
                return { success: false, error: vscode.l10n.t("用户取消创建") };
            }
            // 步骤8: 创建分支
            await this.createAndCheckoutBranch(configuredBranchName, baseBranch);
            return { success: true, branchName: configuredBranchName };
        }
        catch (error) {
            console.error(vscode.l10n.t("创建分支失败:"), error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!isUserCancelledError(error)) {
                vscode.window.showErrorMessage(vscode.l10n.t("创建分支失败: {0}", String(errorMessage)));
            }
            return { success: false, error: errorMessage };
        }
    }
}
