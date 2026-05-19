import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AppError, isUserCancelledError, toAppError } from "./errors";
import { GitOperations } from "./gitOperations";
/**
 * 安全强制推送（git push --force-with-lease）
 */
export class GitPushService {
    private gitOps: GitOperations;
    constructor(workspaceRoot: string) {
        const gitDir = path.join(workspaceRoot, ".git");
        if (!fs.existsSync(gitDir)) {
            throw new AppError(vscode.l10n.t("\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u662FGit\u4ED3\u5E93\uFF0C\u8BF7\u5728Git\u9879\u76EE\u4E2D\u4F7F\u7528\u6B64\u63D2\u4EF6"), "NOT_GIT_REPO", { stage: "init" });
        }
        this.gitOps = new GitOperations(workspaceRoot);
    }
    async pushForceWithLease(): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t("force-with-lease \u63A8\u9001"),
                cancellable: false,
            }, async (progress) => {
                progress.report({ message: vscode.l10n.t("\u68C0\u67E5\u4ED3\u5E93\u72B6\u6001..."), increment: 10 });
                if (!(await this.gitOps.checkGitRepository())) {
                    throw new AppError(vscode.l10n.t("\u5F53\u524D\u76EE\u5F55\u4E0D\u662F\u6709\u6548\u7684Git\u4ED3\u5E93"), "NOT_GIT_REPO", {
                        stage: "pushForceWithLease",
                    });
                }
                const branchName = await this.gitOps.getCurrentBranch();
                if (!branchName) {
                    throw new AppError(vscode.l10n.t("\u5F53\u524D\u5904\u4E8E detached HEAD\uFF0C\u65E0\u6CD5\u63A8\u9001"), "UNKNOWN", { stage: "pushForceWithLease" });
                }
                if (await this.gitOps.checkUncommittedChanges()) {
                    throw new AppError(vscode.l10n.t("\u5DE5\u4F5C\u533A\u6709\u672A\u63D0\u4EA4\u7684\u66F4\u6539\uFF0C\u8BF7\u5148\u63D0\u4EA4\u6216\u8D2E\u85CF\u540E\u518D\u63A8\u9001"), "UNKNOWN", { stage: "pushForceWithLease" });
                }
                progress.report({ message: vscode.l10n.t("\u540C\u6B65\u8FDC\u7A0B\u5F15\u7528..."), increment: 20 });
                try {
                    await this.gitOps.fetchRemote("origin");
                }
                catch {
                    vscode.window.showWarningMessage(vscode.l10n.t("\u83B7\u53D6\u8FDC\u7A0B\u4FE1\u606F\u5931\u8D25\uFF0Cforce-with-lease \u4ECD\u5C06\u6267\u884C\uFF0C\u4F46\u4FDD\u62A4\u53EF\u80FD\u4E0D\u662F\u6700\u65B0"));
                }
                const upstream = await this.gitOps.getBranchUpstream(branchName);
                const remoteExists = await this.gitOps.checkRemoteBranchExists(branchName);
                const setUpstream = !upstream && !remoteExists;
                const pushTarget = setUpstream
                    ? vscode.l10n.t("origin/{0}\uFF08\u5C06\u5EFA\u7ACB\u4E0A\u6E38\uFF09", String(branchName)) : upstream ?? `origin/${branchName}`;
                const confirm = await vscode.window.showWarningMessage(vscode.l10n.t("\u5C06\u628A\u5F53\u524D\u5206\u652F\u300C{0}\u300D\u4EE5 --force-with-lease \u63A8\u9001\u5230 {1}\u3002\n\n", String(branchName), String(pushTarget)) + vscode.l10n.t("\u82E5\u8FDC\u7A0B\u5206\u652F\u5DF2\u6709\u4ED6\u4EBA\u63A8\u9001\u7684\u65B0\u63D0\u4EA4\uFF0C\u64CD\u4F5C\u4F1A\u88AB\u62D2\u7EDD\uFF08\u6BD4 --force \u66F4\u5B89\u5168\uFF09\u3002\n") + vscode.l10n.t("\u4ECD\u4F1A\u8986\u76D6\u8FDC\u7A0B\u4E0A\u4E0E\u4F60\u672C\u5730\u4E0D\u4E00\u81F4\u7684\u63D0\u4EA4\uFF0C\u8BF7\u786E\u8BA4\u56E2\u961F\u5141\u8BB8\u540E\u518D\u7EE7\u7EED\u3002"), { modal: true }, vscode.l10n.t("\u786E\u8BA4\u63A8\u9001"));
                if (confirm !== vscode.l10n.t("\u786E\u8BA4\u63A8\u9001")) {
                    throw AppError.userCancelled(vscode.l10n.t("\u5DF2\u53D6\u6D88\u63A8\u9001"));
                }
                progress.report({ message: vscode.l10n.t("\u6B63\u5728\u63A8\u9001..."), increment: 60 });
                await this.gitOps.pushBranchForceWithLease(branchName, "origin", setUpstream);
                progress.report({ message: vscode.l10n.t("\u5B8C\u6210"), increment: 100 });
                vscode.window.showInformationMessage(vscode.l10n.t("\u2713 \u5DF2\u6267\u884C git push --force-with-lease origin {0}", String(branchName)));
            });
        }
        catch (error: unknown) {
            const appError = toAppError(error, vscode.l10n.t("\u672A\u77E5\u9519\u8BEF"));
            if (isUserCancelledError(appError)) {
                vscode.window.showInformationMessage(vscode.l10n.t("\u5DF2\u53D6\u6D88\u63A8\u9001: {0}", String(appError.message)));
                return;
            }
            const stageText = appError.stage ? ` [${appError.stage}]` : "";
            vscode.window.showErrorMessage(vscode.l10n.t("\u63A8\u9001\u5931\u8D25{0}: {1}", String(stageText), String(appError.message)));
        }
    }
}
