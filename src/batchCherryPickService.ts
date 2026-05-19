import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { selectCommitsForCherryPick } from "./cherryPickCommitFilter";
import { AppError, isUserCancelledError, toAppError } from "./errors";
import { ConflictResolution, GitConflictHandler } from "./gitConflictHandler";
import { CherryPickCommitInfo, GitOperations } from "./gitOperations";
/**
 * 批量 Cherry-pick（优选）：从源分支选取多个提交应用到当前分支
 */
export class BatchCherryPickService {
    private gitOps: GitOperations;
    private static isOperationInProgress = false;
    constructor(workspaceRoot: string) {
        const gitDir = path.join(workspaceRoot, ".git");
        if (!fs.existsSync(gitDir)) {
            throw new AppError(vscode.l10n.t("当前工作区不是Git仓库，请在Git项目中使用此插件"), "NOT_GIT_REPO", { stage: "init" });
        }
        this.gitOps = new GitOperations(workspaceRoot);
    }
    private getMaxCommitsToList(): number {
        const configured = vscode.workspace
            .getConfiguration("gitWorkflowHelper")
            .get<number>("maxCherryPickCommitsToList", 50);
        if (!Number.isFinite(configured)) {
            return 50;
        }
        return Math.min(200, Math.max(10, Math.floor(configured)));
    }
    private shouldRecordOrigin(): boolean {
        return vscode.workspace
            .getConfiguration("gitWorkflowHelper")
            .get<boolean>("cherryPickRecordOrigin", true);
    }
    private getConflictHandler(): GitConflictHandler {
        return new GitConflictHandler(this.gitOps.getWorkspaceRoot());
    }
    async runBatchCherryPick(): Promise<void> {
        if (BatchCherryPickService.isOperationInProgress) {
            vscode.window.showWarningMessage(vscode.l10n.t("已有 Git 工作流操作正在进行中，请等待完成后再试"));
            return;
        }
        BatchCherryPickService.isOperationInProgress = true;
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t("批量 Cherry-pick"),
                cancellable: false,
            }, async (progress) => {
                progress.report({ message: vscode.l10n.t("检查仓库状态..."), increment: 5 });
                if (!(await this.gitOps.checkGitRepository())) {
                    throw new AppError(vscode.l10n.t("当前目录不是有效的Git仓库"), "NOT_GIT_REPO", {
                        stage: "runBatchCherryPick",
                    });
                }
                const ongoing = await this.gitOps.detectGitSequencerOperation();
                if (ongoing) {
                    throw new AppError(vscode.l10n.t("当前存在未完成的 {0} 操作，请先完成或取消后再批量优选", String(ongoing)), "UNKNOWN", { stage: "runBatchCherryPick" });
                }
                if (await this.gitOps.checkUncommittedChanges()) {
                    throw new AppError(vscode.l10n.t("工作区有未提交的更改，请先提交或贮藏后再优选"), "UNKNOWN", { stage: "runBatchCherryPick" });
                }
                const currentBranch = await this.gitOps.getCurrentBranch();
                if (!currentBranch) {
                    throw new AppError(vscode.l10n.t("当前处于 detached HEAD，无法执行 cherry-pick"), "UNKNOWN", { stage: "runBatchCherryPick" });
                }
                progress.report({ message: vscode.l10n.t("同步远程引用..."), increment: 10 });
                try {
                    await this.gitOps.fetchRemote("origin");
                }
                catch {
                    vscode.window.showWarningMessage(vscode.l10n.t("获取远程分支失败，将基于本地分支列表继续"));
                }
                const sourceBranch = await this.selectSourceBranch(currentBranch);
                if (!sourceBranch) {
                    throw AppError.userCancelled(vscode.l10n.t("未选择源分支"));
                }
                progress.report({
                    message: vscode.l10n.t("加载 {0} 上可优选的提交...", String(sourceBranch)),
                    increment: 15,
                });
                const candidates = await this.gitOps.getCherryPickCandidates(sourceBranch, this.getMaxCommitsToList());
                if (candidates.length === 0) {
                    throw new AppError(vscode.l10n.t("分支「{0}」上没有可优选的提交（相对当前分支已全部包含）", String(sourceBranch)), "UNKNOWN", { stage: "runBatchCherryPick" });
                }
                const selectedCommits = await selectCommitsForCherryPick(candidates);
                if (!selectedCommits || selectedCommits.length === 0) {
                    throw AppError.userCancelled(vscode.l10n.t("未选择提交"));
                }
                const recordOrigin = this.shouldRecordOrigin();
                const confirm = await vscode.window.showWarningMessage(vscode.l10n.t("将把 {0} 个提交从「{1}」优选到当前分支「{2}」：\n", String(selectedCommits.length), String(sourceBranch), String(currentBranch)) +
                    selectedCommits
                        .map((c) => `${c.shortHash} ${c.subject}`)
                        .slice(0, 8)
                        .join("\n") +
                    (selectedCommits.length > 8
                        ? vscode.l10n.t("\n… 另有 {0} 个", String(selectedCommits.length - 8)) : "") + vscode.l10n.t("\n\n按从旧到新顺序依次 cherry-pick") +
                    (recordOrigin ? vscode.l10n.t("（带 -x 记录来源）") : "") +
                    "。", { modal: true }, vscode.l10n.t("开始优选"));
                if (confirm !== vscode.l10n.t("开始优选")) {
                    throw AppError.userCancelled(vscode.l10n.t("已取消批量优选"));
                }
                const result = await this.applyCherryPicks(selectedCommits, recordOrigin, progress);
                if (result.aborted) {
                    throw AppError.userCancelled(vscode.l10n.t("已中止。成功 {0} 个，跳过 {1} 个", String(result.successCount), String(result.skippedCount)));
                }
                vscode.window.showInformationMessage(vscode.l10n.t("✓ 批量优选完成：成功 {0} 个", String(result.successCount)) +
                    (result.skippedCount > 0
                        ? vscode.l10n.t("，跳过 {0} 个（空提交/已包含）", String(result.skippedCount)) : ""));
            });
        }
        catch (error: unknown) {
            const appError = toAppError(error, vscode.l10n.t("未知错误"));
            if (isUserCancelledError(appError)) {
                vscode.window.showInformationMessage(vscode.l10n.t("已取消优选: {0}", String(appError.message)));
                return;
            }
            const stageText = appError.stage ? ` [${appError.stage}]` : "";
            vscode.window.showErrorMessage(vscode.l10n.t("批量优选失败{0}: {1}", String(stageText), String(appError.message)));
        }
        finally {
            BatchCherryPickService.isOperationInProgress = false;
        }
    }
    private async selectSourceBranch(currentBranch: string): Promise<string | undefined> {
        const configBranches = vscode.workspace
            .getConfiguration("gitWorkflowHelper")
            .get<string[]>("targetBranches", []);
        const allNames = [
            ...new Set([...configBranches, ...(await this.gitOps.listBranchNames())]),
        ]
            .filter((name) => name !== currentBranch)
            .sort((a, b) => a.localeCompare(b));
        if (allNames.length === 0) {
            throw new AppError(vscode.l10n.t("没有可选择的源分支"), "UNKNOWN", {
                stage: "selectSourceBranch",
            });
        }
        const picked = await vscode.window.showQuickPick(allNames.map((name) => ({
            label: name,
            description: configBranches.includes(name) ? vscode.l10n.t("配置中的目标分支") : undefined,
        })), {
            placeHolder: vscode.l10n.t("当前分支：{0}，请选择提交来源分支", String(currentBranch)),
            title: vscode.l10n.t("批量优选 - 源分支"),
        });
        return picked?.label;
    }
    private async applyCherryPicks(commits: CherryPickCommitInfo[], recordOrigin: boolean, progress: vscode.Progress<{
        message?: string;
        increment?: number;
    }>): Promise<{
        successCount: number;
        skippedCount: number;
        aborted: boolean;
    }> {
        let successCount = 0;
        let skippedCount = 0;
        const conflictHandler = this.getConflictHandler();
        for (let i = 0; i < commits.length; i++) {
            const commit = commits[i];
            const step = Math.floor(((i + 1) / commits.length) * 80) + 15;
            progress.report({
                message: vscode.l10n.t("优选 {0}/{1}: {2}", String(i + 1), String(commits.length), String(commit.shortHash)),
                increment: step,
            });
            const outcome = await this.gitOps.cherryPickCommit(commit.hash, recordOrigin);
            if (outcome === "success") {
                successCount++;
                continue;
            }
            if (outcome === "empty") {
                const action = await vscode.window.showWarningMessage(vscode.l10n.t("提交 {0} 优选后无变更（可能已包含），是否跳过并继续？", String(commit.shortHash)), { modal: true }, vscode.l10n.t("跳过并继续"), vscode.l10n.t("中止优选"));
                if (action === vscode.l10n.t("跳过并继续")) {
                    try {
                        if (await this.gitOps.isCherryPickInProgress()) {
                            await this.gitOps.cherryPickSkip();
                        }
                    }
                    catch {
                        // 可能无需 skip
                    }
                    skippedCount++;
                    continue;
                }
                await this.abortCherryPickIfNeeded();
                return { successCount, skippedCount, aborted: true };
            }
            const resolution = await this.handleCherryPickConflict(conflictHandler, commit);
            if (resolution === "aborted") {
                return { successCount, skippedCount, aborted: true };
            }
            if (resolution === "pending") {
                throw new AppError(vscode.l10n.t("提交 {0} 冲突未解决，批量优选已暂停", String(commit.shortHash)), "UNKNOWN", { stage: "applyCherryPicks" });
            }
            successCount++;
        }
        return { successCount, skippedCount, aborted: false };
    }
    private async handleCherryPickConflict(conflictHandler: GitConflictHandler, commit: CherryPickCommitInfo): Promise<ConflictResolution> {
        vscode.window.showWarningMessage(vscode.l10n.t("优选 {0} 时发生冲突，请处理后再继续", String(commit.shortHash)));
        let resolution = await conflictHandler.runConflictWizard("cherry_pick", await this.gitOps.getConflictFiles());
        while (resolution === "pending") {
            resolution = await conflictHandler.runConflictWizard("cherry_pick", await this.gitOps.getConflictFiles());
        }
        return resolution;
    }
    private async abortCherryPickIfNeeded(): Promise<void> {
        if (await this.gitOps.isCherryPickInProgress()) {
            await this.gitOps.abortCherryPick();
        }
    }
}
