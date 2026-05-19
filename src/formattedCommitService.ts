import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { CommitTemplateManager } from "./commitTemplateManager";
import { AppError, isUserCancelledError, toAppError } from "./errors";
import { GitOperations } from "./gitOperations";
/**
 * 使用模板格式化并提交
 */
export class FormattedCommitService {
    private gitOps: GitOperations;
    private templateManager: CommitTemplateManager;
    constructor(workspaceRoot: string) {
        const gitDir = path.join(workspaceRoot, ".git");
        if (!fs.existsSync(gitDir)) {
            throw new AppError(vscode.l10n.t("当前工作区不是Git仓库，请在Git项目中使用此插件"), "NOT_GIT_REPO", { stage: "init" });
        }
        this.gitOps = new GitOperations(workspaceRoot);
        this.templateManager = new CommitTemplateManager(this.gitOps);
    }
    async commitWithTemplate(): Promise<void> {
        try {
            if (!(await this.gitOps.checkGitRepository())) {
                throw new AppError(vscode.l10n.t("当前目录不是有效的Git仓库"), "NOT_GIT_REPO", {
                    stage: "commitWithTemplate",
                });
            }
            const hasChanges = await this.gitOps.checkUncommittedChanges();
            const hasStaged = await this.gitOps.checkStagedChanges();
            if (!hasChanges && !hasStaged) {
                vscode.window.showInformationMessage(vscode.l10n.t("当前没有可提交的更改"));
                return;
            }
            const stageMode = await this.resolveStageMode(hasChanges, hasStaged);
            if (!stageMode) {
                return;
            }
            const message = await this.templateManager.promptFormattedCommitMessage();
            if (!message) {
                return;
            }
            if (stageMode === "stage-all") {
                await this.gitOps.stageAllChanges();
            }
            await this.gitOps.commitStagedChanges(message);
            vscode.window.showInformationMessage(vscode.l10n.t("✓ 已提交: {0}", String(message)));
        }
        catch (error: unknown) {
            const appError = toAppError(error, vscode.l10n.t("未知错误"));
            if (isUserCancelledError(appError)) {
                vscode.window.showInformationMessage(vscode.l10n.t("已取消提交: {0}", String(appError.message)));
                return;
            }
            const stageText = appError.stage ? ` [${appError.stage}]` : "";
            vscode.window.showErrorMessage(vscode.l10n.t("提交失败{0}: {1}", String(stageText), String(appError.message)));
        }
    }
    /**
     * 仅生成格式化后的提交信息（复制到剪贴板，不提交）
     */
    async copyFormattedMessageToClipboard(): Promise<void> {
        const message = await this.templateManager.promptFormattedCommitMessage();
        if (!message) {
            return;
        }
        await vscode.env.clipboard.writeText(message);
        vscode.window.showInformationMessage(vscode.l10n.t("已复制提交信息:\n{0}", String(message)));
    }
    private async resolveStageMode(hasChanges: boolean, hasStaged: boolean): Promise<"staged-only" | "stage-all" | null> {
        if (!hasChanges) {
            return null;
        }
        if (hasStaged) {
            const hasUnstaged = await this.gitOps.checkUnstagedChanges();
            if (!hasUnstaged) {
                return "staged-only";
            }
        }
        if (hasStaged && hasChanges) {
            const choice = await vscode.window.showQuickPick([
                {
                    label: vscode.l10n.t("仅提交已暂存"),
                    description: vscode.l10n.t("只提交 git add 过的文件"),
                    value: "staged-only" as const,
                },
                {
                    label: vscode.l10n.t("暂存全部后提交"),
                    description: vscode.l10n.t("git add . 后提交所有改动"),
                    value: "stage-all" as const,
                },
            ], { title: vscode.l10n.t("提交范围"), placeHolder: vscode.l10n.t("检测到未暂存的改动") });
            return choice?.value ?? null;
        }
        if (!hasStaged && hasChanges) {
            const confirm = await vscode.window.showWarningMessage(vscode.l10n.t("当前没有已暂存文件，是否暂存全部更改后提交？"), { modal: true }, vscode.l10n.t("暂存并提交"));
            return confirm === vscode.l10n.t("暂存并提交") ? "stage-all" : null;
        }
        return "staged-only";
    }
}
