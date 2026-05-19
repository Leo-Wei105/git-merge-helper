import * as vscode from "vscode";
export interface TargetBranchConfig {
    name: string;
    description: string;
}
/**
 * 合并目标分支配置管理
 * 仅负责 targetBranches 相关配置
 */
export class MergeTargetConfigManager {
    private config: vscode.WorkspaceConfiguration;
    private readonly configurationSection = "gitWorkflowHelper";
    constructor(config: vscode.WorkspaceConfiguration) {
        this.config = config;
    }
    private parseTargetBranches(branchStrings: string[] | undefined): TargetBranchConfig[] {
        if (!branchStrings || !Array.isArray(branchStrings)) {
            return [
                { name: "uat", description: "uat" },
                { name: "pre", description: "pre" },
            ];
        }
        return branchStrings
            .filter((str): str is string => typeof str === "string" && str.trim().length > 0)
            .map((name) => ({ name: name.trim(), description: name.trim() }));
    }
    private serializeTargetBranches(branches: TargetBranchConfig[]): string[] {
        return branches.map((b) => b.name);
    }
    getTargetBranches(): TargetBranchConfig[] {
        const branchStrings = this.config.get<string[]>("targetBranches");
        return this.parseTargetBranches(branchStrings);
    }
    getWorkspaceTargetBranches(): TargetBranchConfig[] {
        const config = vscode.workspace.getConfiguration(this.configurationSection);
        const targetBranchesInspect = config.inspect<string[]>("targetBranches");
        const branchStrings = targetBranchesInspect?.workspaceValue ?? targetBranchesInspect?.defaultValue;
        return this.parseTargetBranches(branchStrings);
    }
    async addTargetBranch(name: string): Promise<void> {
        const currentBranches = this.getTargetBranches();
        if (currentBranches.some((branch) => branch.name === name)) {
            throw new Error(vscode.l10n.t("\u5206\u652F \"{0}\" \u5DF2\u5B58\u5728", String(name)));
        }
        const newBranches = [...currentBranches, { name, description: name }];
        const branchStrings = this.serializeTargetBranches(newBranches);
        await this.config.update("targetBranches", branchStrings, vscode.ConfigurationTarget.Workspace);
    }
    async removeTargetBranch(name: string): Promise<void> {
        const currentBranches = this.getTargetBranches();
        if (currentBranches.length <= 1) {
            throw new Error(vscode.l10n.t("\u81F3\u5C11\u9700\u8981\u4FDD\u7559\u4E00\u4E2A\u76EE\u6807\u5206\u652F"));
        }
        const newBranches = currentBranches.filter((branch) => branch.name !== name);
        const branchStrings = this.serializeTargetBranches(newBranches);
        await this.config.update("targetBranches", branchStrings, vscode.ConfigurationTarget.Workspace);
    }
}
