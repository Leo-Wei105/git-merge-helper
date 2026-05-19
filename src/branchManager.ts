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
            throw new Error(vscode.l10n.t("无法获取当前分支信息，请确保在Git仓库中操作"));
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
                vscode.window.showWarningMessage(vscode.l10n.t("获取远程分支信息失败，将基于本地缓存继续执行，结果可能不是最新状态"));
            }
            if (progress) {
                progress.report({ message: vscode.l10n.t("检查远程分支 {0}...", String(targetBranch)), increment: 5 });
            }
            const remoteExists = await this.gitOps.checkRemoteBranchExists(targetBranch);
            const localExists = await this.gitOps.checkLocalBranchExists(targetBranch);
            if (!remoteExists && !localExists) {
                throw new AppError(vscode.l10n.t("目标分支 {0} 不存在（本地/远程）", String(targetBranch)), "UNKNOWN", { stage: "safeMergeBranch" });
            }
            if (progress) {
                progress.report({ message: vscode.l10n.t("切换到目标分支 {0}...", String(targetBranch)), increment: 10 });
            }
            // 安全切换分支（如果本地不存在会从远程创建）
            await this.gitOps.checkoutBranch(targetBranch);
            // 如果远程分支存在，确保上游关联并拉取最新代码
            if (remoteExists) {
                if (progress) {
                    progress.report({ message: vscode.l10n.t("设置上游分支关联..."), increment: 5 });
                }
                await this.gitOps.ensureBranchUpstream(targetBranch);
                if (progress) {
                    progress.report({ message: vscode.l10n.t("拉取最新代码..."), increment: 10 });
                }
                await this.gitOps.pullBranch(targetBranch);
            }
            if (progress) {
                progress.report({ message: vscode.l10n.t("合并 {0} 到 {1}...", String(sourceBranch), String(targetBranch)), increment: 30 });
            }
            try {
                await this.gitOps.mergeBranch(sourceBranch);
            }
            catch (mergeError) {
                const hasConflicts = await this.gitOps.checkMergeConflicts();
                if (hasConflicts) {
                    if (progress) {
                        progress.report({ message: vscode.l10n.t("检测到合并冲突，等待处理..."), increment: 0 });
                    }
                    const conflictFiles = await this.gitOps.getConflictFiles();
                    const resolution = await conflictHandler(conflictFiles);
                    if (resolution === "aborted") {
                        throw AppError.userCancelled(vscode.l10n.t("用户中止了合并流程"));
                    }
                    if (resolution === "pending") {
                        throw new AppError(vscode.l10n.t("冲突尚未解决，合并未完成"), "UNKNOWN", {
                            stage: "safeMergeBranch",
                        });
                    }
                }
                else {
                    throw mergeError;
                }
            }
            if (progress) {
                progress.report({ message: vscode.l10n.t("推送合并结果到远程..."), increment: 20 });
            }
            if (remoteExists) {
                await this.gitOps.pushBranch(targetBranch);
            }
            else {
                await this.gitOps.pushBranch(targetBranch, true);
            }
        }
        catch (error) {
            console.error(vscode.l10n.t("合并到 {0} 失败:", String(targetBranch)), error);
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
            vscode.window.showWarningMessage(vscode.l10n.t("获取远程分支信息失败，将尝试直接推送并建立上游关联"));
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
