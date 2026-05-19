import * as vscode from "vscode";
export type ErrorCode = "USER_CANCELLED" | "GIT_COMMAND_FAILED" | "NOT_GIT_REPO" | "INVALID_WORKSPACE" | "UNKNOWN";
export class AppError extends Error {
    readonly code: ErrorCode;
    readonly stage?: string;
    readonly cause?: unknown;
    constructor(message: string, code: ErrorCode = "UNKNOWN", options?: {
        stage?: string;
        cause?: unknown;
    }) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.stage = options?.stage;
        this.cause = options?.cause;
    }
    static userCancelled(message: string): AppError {
        return new AppError(message, "USER_CANCELLED");
    }
    static gitFailed(message: string, stage?: string, cause?: unknown): AppError {
        return new AppError(message, "GIT_COMMAND_FAILED", { stage, cause });
    }
}
export function toAppError(error: unknown, fallbackMessage = vscode.l10n.t("\u672A\u77E5\u9519\u8BEF")): AppError {
    if (error instanceof AppError) {
        return error;
    }
    if (error instanceof Error) {
        return new AppError(error.message || fallbackMessage, "UNKNOWN", { cause: error });
    }
    return new AppError(String(error || fallbackMessage), "UNKNOWN", { cause: error });
}
/**
 * 判断 Git 提交是否被 pre-commit / husky / lint-staged 等钩子拦截
 */
export function isGitHookFailure(error: unknown): boolean {
    const message = error instanceof AppError
        ? error.message
        : error instanceof Error
            ? error.message
            : String(error || "");
    const lower = message.toLowerCase();
    return (lower.includes("husky") ||
        lower.includes("pre-commit") ||
        lower.includes("precommit") ||
        lower.includes("commit-msg") ||
        lower.includes("prepare-commit-msg") ||
        lower.includes("lint-staged") ||
        lower.includes("hook declined") ||
        lower.includes("hook failed") ||
        lower.includes("running tasks for staged") ||
        (lower.includes("eslint") && lower.includes("failed")));
}
export function isUserCancelledError(error: unknown): boolean {
    const appError = error instanceof AppError ? error : null;
    if (appError?.code === "USER_CANCELLED") {
        return true;
    }
    const message = error instanceof Error ? error.message : String(error || "");
    return message.includes(vscode.l10n.t("\u53D6\u6D88"));
}
