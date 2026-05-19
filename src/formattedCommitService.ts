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
            throw new AppError(vscode.l10n.t("\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u662FGit\u4ED3\u5E93\uFF0C\u8BF7\u5728Git\u9879\u76EE\u4E2D\u4F7F\u7528\u6B64\u63D2\u4EF6"), "NOT_GIT_REPO", { stage: "init" });
        }
        this.gitOps = new GitOperations(workspaceRoot);
        this.templateManager = new CommitTemplateManager(this.gitOps);
    }
    async commitWithTemplate(): Promise<void> {
        try {
            if (!(await this.gitOps.checkGitRepository())) {
                throw new AppError(vscode.l10n.t("\u5F53\u524D\u76EE\u5F55\u4E0D\u662F\u6709\u6548\u7684Git\u4ED3\u5E93"), "NOT_GIT_REPO", {
                    stage: "commitWithTemplate",
                });
            }
            const hasChanges = await this.gitOps.checkUncommittedChanges();
            const hasStaged = await this.gitOps.checkStagedChanges();
            if (!hasChanges && !hasStaged) {
                vscode.window.showInformationMessage(vscode.l10n.t("\u5F53\u524D\u6CA1\u6709\u53EF\u63D0\u4EA4\u7684\u66F4\u6539"));
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
            vscode.window.showInformationMessage(vscode.l10n.t("\u2713 \u5DF2\u63D0\u4EA4: {0}", String(message)));
        }
        catch (error: unknown) {
            const appError = toAppError(error, vscode.l10n.t("\u672A\u77E5\u9519\u8BEF"));
            if (isUserCancelledError(appError)) {
                vscode.window.showInformationMessage(vscode.l10n.t("\u5DF2\u53D6\u6D88\u63D0\u4EA4: {0}", String(appError.message)));
                return;
            }
            const stageText = appError.stage ? ` [${appError.stage}]` : "";
            vscode.window.showErrorMessage(vscode.l10n.t("\u63D0\u4EA4\u5931\u8D25{0}: {1}", String(stageText), String(appError.message)));
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
        vscode.window.showInformationMessage(vscode.l10n.t("\u5DF2\u590D\u5236\u63D0\u4EA4\u4FE1\u606F:\n{0}", String(message)));
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
                    label: vscode.l10n.t("\u4EC5\u63D0\u4EA4\u5DF2\u6682\u5B58"),
                    description: vscode.l10n.t("\u53EA\u63D0\u4EA4 git add \u8FC7\u7684\u6587\u4EF6"),
                    value: "staged-only" as const,
                },
                {
                    label: vscode.l10n.t("\u6682\u5B58\u5168\u90E8\u540E\u63D0\u4EA4"),
                    description: vscode.l10n.t("git add . \u540E\u63D0\u4EA4\u6240\u6709\u6539\u52A8"),
                    value: "stage-all" as const,
                },
            ], { title: vscode.l10n.t("\u63D0\u4EA4\u8303\u56F4"), placeHolder: vscode.l10n.t("\u68C0\u6D4B\u5230\u672A\u6682\u5B58\u7684\u6539\u52A8") });
            return choice?.value ?? null;
        }
        if (!hasStaged && hasChanges) {
            const confirm = await vscode.window.showWarningMessage(vscode.l10n.t("\u5F53\u524D\u6CA1\u6709\u5DF2\u6682\u5B58\u6587\u4EF6\uFF0C\u662F\u5426\u6682\u5B58\u5168\u90E8\u66F4\u6539\u540E\u63D0\u4EA4\uFF1F"), { modal: true }, vscode.l10n.t("\u6682\u5B58\u5E76\u63D0\u4EA4"));
            return confirm === vscode.l10n.t("\u6682\u5B58\u5E76\u63D0\u4EA4") ? "stage-all" : null;
        }
        return "staged-only";
    }
}
