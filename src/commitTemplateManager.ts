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
    name: "feat · 新功能",
    description: "Conventional Commits：新功能",
    template: "feat: {description}",
    builtin: true,
  },
  {
    id: "fix",
    name: "fix · 修复",
    description: "修复缺陷或 bug",
    template: "fix: {description}",
    builtin: true,
  },
  {
    id: "docs",
    name: "docs · 文档",
    description: "仅文档变更",
    template: "docs: {description}",
    builtin: true,
  },
  {
    id: "style",
    name: "style · 格式",
    description: "代码格式（不影响逻辑）",
    template: "style: {description}",
    builtin: true,
  },
  {
    id: "refactor",
    name: "refactor · 重构",
    description: "重构（非新功能、非修 bug）",
    template: "refactor: {description}",
    builtin: true,
  },
  {
    id: "perf",
    name: "perf · 性能",
    description: "性能优化",
    template: "perf: {description}",
    builtin: true,
  },
  {
    id: "test",
    name: "test · 测试",
    description: "测试相关",
    template: "test: {description}",
    builtin: true,
  },
  {
    id: "chore",
    name: "chore · 杂项",
    description: "构建/工具/依赖等",
    template: "chore: {description}",
    builtin: true,
  },
  {
    id: "feat-scope",
    name: "feat(scope) · 带模块",
    description: "新功能并标注影响范围",
    template: "feat({scope}): {description}",
    builtin: true,
  },
  {
    id: "fix-scope",
    name: "fix(scope) · 带模块修复",
    description: "修复并标注影响范围",
    template: "fix({scope}): {description}",
    builtin: true,
  },
  {
    id: "ticket",
    name: "单号 · 需求/缺陷号",
    description: "如 JIRA-123: 描述",
    template: "{ticket}: {description}",
    builtin: true,
  },
  {
    id: "hotfix",
    name: "hotfix · 热修",
    description: "紧急线上修复",
    template: "fix: hotfix {description}",
    builtin: true,
  },
  {
    id: "merge",
    name: "merge · 合并说明",
    description: "合并相关提交说明",
    template: "merge: {description}",
    builtin: true,
  },
];

/**
 * 提交模板管理：内置推荐 + 用户自定义（settings）
 */
export class CommitTemplateManager {
  private readonly configurationSection = "gitWorkflowHelper";

  constructor(private readonly gitOps?: GitOperations) {}

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
  async promptFormattedCommitMessage(
    options?: { defaultDescription?: string }
  ): Promise<string | undefined> {
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

    const picked = await vscode.window.showQuickPick(
      templates.map((t) => ({
        label: t.builtin ? `$(star) ${t.name}` : t.name,
        description: t.template,
        detail: t.description + (t.builtin ? " · 内置" : " · 自定义"),
        template: t,
        picked: t.id === defaultId,
      })),
      {
        title: "选择提交模板",
        placeHolder: "内置推荐模板 + 设置中的自定义模板",
      }
    );

    return picked?.template;
  }

  private async collectVariables(
    template: CommitMessageTemplate,
    defaultDescription?: string
  ): Promise<CommitTemplateVariables | undefined> {
    const required = this.getRequiredPlaceholders(template.template);
    const vars: CommitTemplateVariables = { description: "" };

    if (required.includes("description")) {
      const description = await vscode.window.showInputBox({
        prompt: "提交说明（必填）",
        placeHolder: "简要描述本次改动",
        value: defaultDescription ?? "",
        validateInput: (v) =>
          v.trim().length === 0 ? "说明不能为空" : null,
      });
      if (description === undefined) {
        return undefined;
      }
      vars.description = description.trim();
    }

    if (required.includes("scope")) {
      const scope = await vscode.window.showInputBox({
        prompt: "影响范围 scope（必填）",
        placeHolder: "如 user、order、api",
        validateInput: (v) =>
          v.trim().length === 0 ? "scope 不能为空" : null,
      });
      if (scope === undefined) {
        return undefined;
      }
      vars.scope = scope.trim();
    }

    if (required.includes("ticket")) {
      const ticket = await vscode.window.showInputBox({
        prompt: "单号（必填）",
        placeHolder: "如 PROJ-123、#456",
        validateInput: (v) =>
          v.trim().length === 0 ? "单号不能为空" : null,
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

  private async confirmMessage(
    message: string,
    template: CommitMessageTemplate
  ): Promise<string | undefined> {
    const preview = await vscode.window.showInformationMessage(
      `模板「${template.name}」\n\n提交信息：\n${message}`,
      { modal: true },
      "确认提交",
      "返回修改"
    );

    if (preview === "确认提交") {
      return message;
    }
    if (preview === "返回修改") {
      return this.promptFormattedCommitMessage();
    }
    return undefined;
  }

  private parseCustomTemplate(
    item: unknown,
    index: number
  ): CommitMessageTemplate | null {
    if (typeof item === "string" && item.trim()) {
      return {
        id: `custom-${index}`,
        name: `自定义 ${index + 1}`,
        description: "用户自定义模板",
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
        description: String(obj.description ?? "用户自定义模板").trim(),
        template,
        builtin: false,
      };
    }

    return null;
  }
}
