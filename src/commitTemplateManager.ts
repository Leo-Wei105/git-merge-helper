import * as vscode from "vscode";
import { GitOperations } from "./gitOperations";
/** 提交信息模板 */
export interface CommitMessageTemplate {
    id: string;
    name: string;
    description: string;
    /** 模板正文，占位符：{description}、{scope}、{ticket}、{username} */
    template: string;
    builtin: boolean;
}
export interface CommitTemplateVariables {
    description: string;
    scope?: string;
    ticket?: string;
    username?: string;
}
const BUILTIN_TEMPLATES: CommitMessageTemplate[] = [
    {
        id: "feat",
        name: vscode.l10n.t("feat \u00B7 \u65B0\u529F\u80FD"),
        description: vscode.l10n.t("Conventional Commits\uFF1A\u65B0\u529F\u80FD"),
        template: "feat: {description}",
        builtin: true,
    },
    {
        id: "fix",
        name: vscode.l10n.t("fix \u00B7 \u4FEE\u590D"),
        description: vscode.l10n.t("\u4FEE\u590D\u7F3A\u9677\u6216 bug"),
        template: "fix: {description}",
        builtin: true,
    },
    {
        id: "docs",
        name: vscode.l10n.t("docs \u00B7 \u6587\u6863"),
        description: vscode.l10n.t("\u4EC5\u6587\u6863\u53D8\u66F4"),
        template: "docs: {description}",
        builtin: true,
    },
    {
        id: "style",
        name: vscode.l10n.t("style \u00B7 \u683C\u5F0F"),
        description: vscode.l10n.t("\u4EE3\u7801\u683C\u5F0F\uFF08\u4E0D\u5F71\u54CD\u903B\u8F91\uFF09"),
        template: "style: {description}",
        builtin: true,
    },
    {
        id: "refactor",
        name: vscode.l10n.t("refactor \u00B7 \u91CD\u6784"),
        description: vscode.l10n.t("\u91CD\u6784\uFF08\u975E\u65B0\u529F\u80FD\u3001\u975E\u4FEE bug\uFF09"),
        template: "refactor: {description}",
        builtin: true,
    },
    {
        id: "perf",
        name: vscode.l10n.t("perf \u00B7 \u6027\u80FD"),
        description: vscode.l10n.t("\u6027\u80FD\u4F18\u5316"),
        template: "perf: {description}",
        builtin: true,
    },
    {
        id: "test",
        name: vscode.l10n.t("test \u00B7 \u6D4B\u8BD5"),
        description: vscode.l10n.t("\u6D4B\u8BD5\u76F8\u5173"),
        template: "test: {description}",
        builtin: true,
    },
    {
        id: "chore",
        name: vscode.l10n.t("chore \u00B7 \u6742\u9879"),
        description: vscode.l10n.t("\u6784\u5EFA/\u5DE5\u5177/\u4F9D\u8D56\u7B49"),
        template: "chore: {description}",
        builtin: true,
    },
    {
        id: "feat-scope",
        name: vscode.l10n.t("feat(scope) \u00B7 \u5E26\u6A21\u5757"),
        description: vscode.l10n.t("\u65B0\u529F\u80FD\u5E76\u6807\u6CE8\u5F71\u54CD\u8303\u56F4"),
        template: "feat({scope}): {description}",
        builtin: true,
    },
    {
        id: "fix-scope",
        name: vscode.l10n.t("fix(scope) \u00B7 \u5E26\u6A21\u5757\u4FEE\u590D"),
        description: vscode.l10n.t("\u4FEE\u590D\u5E76\u6807\u6CE8\u5F71\u54CD\u8303\u56F4"),
        template: "fix({scope}): {description}",
        builtin: true,
    },
    {
        id: "ticket",
        name: vscode.l10n.t("\u5355\u53F7 \u00B7 \u9700\u6C42/\u7F3A\u9677\u53F7"),
        description: vscode.l10n.t("\u5982 JIRA-123: \u63CF\u8FF0"),
        template: "{ticket}: {description}",
        builtin: true,
    },
    {
        id: "hotfix",
        name: vscode.l10n.t("hotfix \u00B7 \u70ED\u4FEE"),
        description: vscode.l10n.t("\u7D27\u6025\u7EBF\u4E0A\u4FEE\u590D"),
        template: "fix: hotfix {description}",
        builtin: true,
    },
    {
        id: "merge",
        name: vscode.l10n.t("merge \u00B7 \u5408\u5E76\u8BF4\u660E"),
        description: vscode.l10n.t("\u5408\u5E76\u76F8\u5173\u63D0\u4EA4\u8BF4\u660E"),
        template: "merge: {description}",
        builtin: true,
    },
];
/**
 * 提交模板管理：内置推荐 + 用户自定义（settings）
 */
export class CommitTemplateManager {
    private readonly configurationSection = "gitWorkflowHelper";
    constructor(private readonly gitOps?: GitOperations) { }
    getBuiltinTemplates(): CommitMessageTemplate[] {
        return BUILTIN_TEMPLATES.map((t) => ({ ...t }));
    }
    getCustomTemplates(): CommitMessageTemplate[] {
        const config = vscode.workspace.getConfiguration(this.configurationSection);
        const raw = config.get<unknown[]>("commitTemplates", []);
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw
            .map((item, index) => this.parseCustomTemplate(item, index))
            .filter((t): t is CommitMessageTemplate => t !== null);
    }
    getAllTemplates(): CommitMessageTemplate[] {
        const custom = this.getCustomTemplates();
        const customIds = new Set(custom.map((t) => t.id));
        const builtin = this.getBuiltinTemplates().filter((t) => !customIds.has(t.id));
        return [...builtin, ...custom];
    }
    getTemplateById(id: string): CommitMessageTemplate | undefined {
        return this.getAllTemplates().find((t) => t.id === id);
    }
    getDefaultTemplateId(): string {
        const config = vscode.workspace.getConfiguration(this.configurationSection);
        const configured = config.get<string>("defaultCommitTemplateId", "feat");
        return this.getTemplateById(configured)?.id ?? "feat";
    }
    getRequiredPlaceholders(template: string): string[] {
        const keys: string[] = [];
        const re = /\{(\w+)\}/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(template)) !== null) {
            if (!keys.includes(match[1])) {
                keys.push(match[1]);
            }
        }
        return keys;
    }
    renderTemplate(template: string, variables: CommitTemplateVariables): string {
        const map: Record<string, string> = {
            description: variables.description.trim(),
            scope: variables.scope?.trim() ?? "",
            ticket: variables.ticket?.trim() ?? "",
            username: variables.username?.trim() ?? "",
        };
        let result = template;
        for (const [key, value] of Object.entries(map)) {
            result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
        }
        // feat(): -> feat:
        result = result.replace(/\(\s*\)\s*:/g, ":");
        // 清理残留空占位符
        result = result.replace(/\{\w+\}/g, "").replace(/\s+/g, " ").trim();
        return result;
    }
    /**
     * 选择模板并填写变量，返回最终提交信息
     */
    async promptFormattedCommitMessage(options?: {
        defaultDescription?: string;
    }): Promise<string | undefined> {
        const template = await this.selectTemplate();
        if (!template) {
            return undefined;
        }
        const variables = await this.collectVariables(template, options?.defaultDescription);
        if (!variables) {
            return undefined;
        }
        const message = this.renderTemplate(template.template, variables);
        return this.confirmMessage(message, template);
    }
    private async selectTemplate(): Promise<CommitMessageTemplate | undefined> {
        const templates = this.getAllTemplates();
        const defaultId = this.getDefaultTemplateId();
        const picked = await vscode.window.showQuickPick(templates.map((t) => ({
            label: t.builtin ? `$(star) ${t.name}` : t.name,
            description: t.template,
            detail: t.description + (t.builtin ? vscode.l10n.t(" \u00B7 \u5185\u7F6E") : vscode.l10n.t(" \u00B7 \u81EA\u5B9A\u4E49")),
            template: t,
            picked: t.id === defaultId,
        })), {
            title: vscode.l10n.t("\u9009\u62E9\u63D0\u4EA4\u6A21\u677F"),
            placeHolder: vscode.l10n.t("\u5185\u7F6E\u63A8\u8350\u6A21\u677F + \u8BBE\u7F6E\u4E2D\u7684\u81EA\u5B9A\u4E49\u6A21\u677F"),
        });
        return picked?.template;
    }
    private async collectVariables(template: CommitMessageTemplate, defaultDescription?: string): Promise<CommitTemplateVariables | undefined> {
        const required = this.getRequiredPlaceholders(template.template);
        const vars: CommitTemplateVariables = { description: "" };
        if (required.includes("description")) {
            const description = await vscode.window.showInputBox({
                prompt: vscode.l10n.t("\u63D0\u4EA4\u8BF4\u660E\uFF08\u5FC5\u586B\uFF09"),
                placeHolder: vscode.l10n.t("\u7B80\u8981\u63CF\u8FF0\u672C\u6B21\u6539\u52A8"),
                value: defaultDescription ?? "",
                validateInput: (v) => v.trim().length === 0 ? vscode.l10n.t("\u8BF4\u660E\u4E0D\u80FD\u4E3A\u7A7A") : null,
            });
            if (description === undefined) {
                return undefined;
            }
            vars.description = description.trim();
        }
        if (required.includes("scope")) {
            const scope = await vscode.window.showInputBox({
                prompt: vscode.l10n.t("\u5F71\u54CD\u8303\u56F4 scope\uFF08\u5FC5\u586B\uFF09"),
                placeHolder: vscode.l10n.t("\u5982 user\u3001order\u3001api"),
                validateInput: (v) => v.trim().length === 0 ? vscode.l10n.t("scope \u4E0D\u80FD\u4E3A\u7A7A") : null,
            });
            if (scope === undefined) {
                return undefined;
            }
            vars.scope = scope.trim();
        }
        if (required.includes("ticket")) {
            const ticket = await vscode.window.showInputBox({
                prompt: vscode.l10n.t("\u5355\u53F7\uFF08\u5FC5\u586B\uFF09"),
                placeHolder: vscode.l10n.t("\u5982 PROJ-123\u3001#456"),
                validateInput: (v) => v.trim().length === 0 ? vscode.l10n.t("\u5355\u53F7\u4E0D\u80FD\u4E3A\u7A7A") : null,
            });
            if (ticket === undefined) {
                return undefined;
            }
            vars.ticket = ticket.trim();
        }
        if (required.includes("username")) {
            vars.username = await this.resolveGitUsername();
        }
        return vars;
    }
    private async resolveGitUsername(): Promise<string> {
        if (this.gitOps) {
            return await this.gitOps.getGitUserName();
        }
        return "";
    }
    private async confirmMessage(message: string, template: CommitMessageTemplate): Promise<string | undefined> {
        const preview = await vscode.window.showInformationMessage(vscode.l10n.t("\u6A21\u677F\u300C{0}\u300D\n\n\u63D0\u4EA4\u4FE1\u606F\uFF1A\n{1}", String(template.name), String(message)), { modal: true }, vscode.l10n.t("\u786E\u8BA4\u63D0\u4EA4"), vscode.l10n.t("\u8FD4\u56DE\u4FEE\u6539"));
        if (preview === vscode.l10n.t("\u786E\u8BA4\u63D0\u4EA4")) {
            return message;
        }
        if (preview === vscode.l10n.t("\u8FD4\u56DE\u4FEE\u6539")) {
            return this.promptFormattedCommitMessage();
        }
        return undefined;
    }
    private parseCustomTemplate(item: unknown, index: number): CommitMessageTemplate | null {
        if (typeof item === "string" && item.trim()) {
            return {
                id: `custom-${index}`,
                name: vscode.l10n.t("\u81EA\u5B9A\u4E49 {0}", String(index + 1)),
                description: vscode.l10n.t("\u7528\u6237\u81EA\u5B9A\u4E49\u6A21\u677F"),
                template: item.trim(),
                builtin: false,
            };
        }
        if (item && typeof item === "object") {
            const obj = item as Record<string, unknown>;
            const template = String(obj.template ?? obj.message ?? "").trim();
            if (!template) {
                return null;
            }
            const id = String(obj.id ?? `custom-${index}`).trim() || `custom-${index}`;
            return {
                id,
                name: String(obj.name ?? id).trim() || id,
                description: String(obj.description ?? vscode.l10n.t("\u7528\u6237\u81EA\u5B9A\u4E49\u6A21\u677F")).trim(),
                template,
                builtin: false,
            };
        }
        return null;
    }
}
