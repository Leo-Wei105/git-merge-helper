import * as vscode from "vscode";
import { BranchUtils } from "./branchUtils";
import { AppError } from "./errors";
import { ConflictResolution } from "./gitConflictHandler";
import { GitOperations } from "./gitOperations";
export type MergeConflictResolution = ConflictResolution;
/**
 * 分支管理类 - 负责分支相关操作和验证
 */
export class BranchManager {
    private gitOps: GitOperations;
    constructor(gitOps: GitOperations) {
        this.gitOps = gitOps;
    }
    /**
     * 验证分支名称是否合法
     */
    validateBranchName(branchName: string): boolean {
        return BranchUtils.validateBranchName(branchName).isValid;
    }
    /**
     * 检查当前分支是否为功能分支
     */
    async checkFeatureBranch(branchPrefixes: Array<{
        prefix: string;
    }>): Promise<boolean> {
        try {
            const currentBranch = await this.gitOps.getCurrentBranch();
            return branchPrefixes.some((prefixConfig) => currentBranch.toLowerCase().startsWith(prefixConfig.prefix.toLowerCase() + '/'));
        }
        catch {
            throw new Error(vscode.l10n.t("\u65E0\u6CD5\u83B7\u53D6\u5F53\u524D\u5206\u652F\u4FE1\u606F\uFF0C\u8BF7\u786E\u4FDD\u5728Git\u4ED3\u5E93\u4E2D\u64CD\u4F5C"));
        }
    }
    /**
     * 安全合并分支（带冲突处理）
     */
    async safeMergeBranch(targetBranch: string, sourceBranch: string, conflictHandler: (conflictFiles: string[]) => Promise<MergeConflictResolution>, progress?: vscode.Progress<{
        message?: string;
        increment?: number;
    }>): Promise<void> {
        try {
            try {
                await this.gitOps.fetchRemote("origin");
            }
            catch (error) {
                vscode.window.showWarningMessage(vscode.l10n.t("\u83B7\u53D6\u8FDC\u7A0B\u5206\u652F\u4FE1\u606F\u5931\u8D25\uFF0C\u5C06\u57FA\u4E8E\u672C\u5730\u7F13\u5B58\u7EE7\u7EED\u6267\u884C\uFF0C\u7ED3\u679C\u53EF\u80FD\u4E0D\u662F\u6700\u65B0\u72B6\u6001"));
            }
            if (progress) {
                progress.report({ message: vscode.l10n.t("\u68C0\u67E5\u8FDC\u7A0B\u5206\u652F {0}...", String(targetBranch)), increment: 5 });
            }
            const remoteExists = await this.gitOps.checkRemoteBranchExists(targetBranch);
            const localExists = await this.gitOps.checkLocalBranchExists(targetBranch);
            if (!remoteExists && !localExists) {
                throw new AppError(vscode.l10n.t("\u76EE\u6807\u5206\u652F {0} \u4E0D\u5B58\u5728\uFF08\u672C\u5730/\u8FDC\u7A0B\uFF09", String(targetBranch)), "UNKNOWN", { stage: "safeMergeBranch" });
            }
            if (progress) {
                progress.report({ message: vscode.l10n.t("\u5207\u6362\u5230\u76EE\u6807\u5206\u652F {0}...", String(targetBranch)), increment: 10 });
            }
            // 安全切换分支（如果本地不存在会从远程创建）
            await this.gitOps.checkoutBranch(targetBranch);
            // 如果远程分支存在，确保上游关联并拉取最新代码
            if (remoteExists) {
                if (progress) {
                    progress.report({ message: vscode.l10n.t("\u8BBE\u7F6E\u4E0A\u6E38\u5206\u652F\u5173\u8054..."), increment: 5 });
                }
                await this.gitOps.ensureBranchUpstream(targetBranch);
                if (progress) {
                    progress.report({ message: vscode.l10n.t("\u62C9\u53D6\u6700\u65B0\u4EE3\u7801..."), increment: 10 });
                }
                await this.gitOps.pullBranch(targetBranch);
            }
            if (progress) {
                progress.report({ message: vscode.l10n.t("\u5408\u5E76 {0} \u5230 {1}...", String(sourceBranch), String(targetBranch)), increment: 30 });
            }
            try {
                await this.gitOps.mergeBranch(sourceBranch);
            }
            catch (mergeError) {
                const hasConflicts = await this.gitOps.checkMergeConflicts();
                if (hasConflicts) {
                    if (progress) {
                        progress.report({ message: vscode.l10n.t("\u68C0\u6D4B\u5230\u5408\u5E76\u51B2\u7A81\uFF0C\u7B49\u5F85\u5904\u7406..."), increment: 0 });
                    }
                    const conflictFiles = await this.gitOps.getConflictFiles();
                    const resolution = await conflictHandler(conflictFiles);
                    if (resolution === "aborted") {
                        throw AppError.userCancelled(vscode.l10n.t("\u7528\u6237\u4E2D\u6B62\u4E86\u5408\u5E76\u6D41\u7A0B"));
                    }
                    if (resolution === "pending") {
                        throw new AppError(vscode.l10n.t("\u51B2\u7A81\u5C1A\u672A\u89E3\u51B3\uFF0C\u5408\u5E76\u672A\u5B8C\u6210"), "UNKNOWN", {
                            stage: "safeMergeBranch",
                        });
                    }
                }
                else {
                    throw mergeError;
                }
            }
            if (progress) {
                progress.report({ message: vscode.l10n.t("\u63A8\u9001\u5408\u5E76\u7ED3\u679C\u5230\u8FDC\u7A0B..."), increment: 20 });
            }
            if (remoteExists) {
                await this.gitOps.pushBranch(targetBranch);
            }
            else {
                await this.gitOps.pushBranch(targetBranch, true);
            }
        }
        catch (error) {
            console.error(vscode.l10n.t("\u5408\u5E76\u5230 {0} \u5931\u8D25:", String(targetBranch)), error);
            throw error;
        }
    }
    /**
     * 确保远程分支存在并设置正确的上游关联
     */
    async ensureRemoteBranchExists(branchName: string): Promise<void> {
        try {
            await this.gitOps.fetchRemote("origin");
        }
        catch {
            vscode.window.showWarningMessage(vscode.l10n.t("\u83B7\u53D6\u8FDC\u7A0B\u5206\u652F\u4FE1\u606F\u5931\u8D25\uFF0C\u5C06\u5C1D\u8BD5\u76F4\u63A5\u63A8\u9001\u5E76\u5EFA\u7ACB\u4E0A\u6E38\u5173\u8054"));
        }
        const exists = await this.gitOps.checkRemoteBranchExists(branchName);
        if (exists) {
            await this.gitOps.ensureBranchUpstream(branchName);
        }
        else {
            await this.gitOps.pushBranch(branchName, true);
        }
    }
}
