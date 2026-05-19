import * as vscode from "vscode";
import { DateFormat, ValidationResult } from './branchTypes';
export class BranchUtils {
    /**
     * 根据格式生成日期字符串
     */
    static formatDate(date: Date, format: DateFormat): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        switch (format) {
            case 'yyyyMMdd':
                return `${year}${month}${day}`;
            case 'yyyy-MM-dd':
                return `${year}-${month}-${day}`;
            case 'yyMMdd':
                return `${String(year).slice(2)}${month}${day}`;
            default:
                return `${year}${month}${day}`;
        }
    }
    /**
     * 验证分支描述信息
     */
    static validateDescription(description: string): ValidationResult {
        if (!description || description.trim().length === 0) {
            return {
                isValid: false,
                error: vscode.l10n.t("\u63CF\u8FF0\u4FE1\u606F\u4E0D\u80FD\u4E3A\u7A7A")
            };
        }
        return {
            isValid: true
        };
    }
    /**
     * 验证分支前缀
     */
    static validatePrefix(prefix: string): ValidationResult {
        if (!prefix || prefix.trim().length === 0) {
            return {
                isValid: false,
                error: vscode.l10n.t("\u5206\u652F\u524D\u7F00\u4E0D\u80FD\u4E3A\u7A7A")
            };
        }
        // 检查是否包含特殊字符
        const validPattern = /^[a-zA-Z0-9_-]+$/;
        if (!validPattern.test(prefix)) {
            return {
                isValid: false,
                error: vscode.l10n.t("\u5206\u652F\u524D\u7F00\u53EA\u80FD\u5305\u542B\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u548C\u77ED\u6A2A\u7EBF")
            };
        }
        return {
            isValid: true
        };
    }
    /**
     * 验证分支名称
     */
    static validateBranchName(branchName: string): ValidationResult {
        if (!branchName || branchName.trim().length === 0) {
            return {
                isValid: false,
                error: vscode.l10n.t("\u5206\u652F\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A")
            };
        }
        return {
            isValid: true
        };
    }
    /**
     * 生成分支名称
     */
    static generateBranchName(options: {
        prefix: string;
        description: string;
        username: string;
        date: string;
        format?: string;
    }): string {
        const { prefix, description, username, date, format } = options;
        const template = format && format.trim().length > 0
            ? format
            : '{prefix}/{date}/{description}_{username}';
        return template
            .replace(/\{prefix\}/g, prefix)
            .replace(/\{date\}/g, date)
            .replace(/\{description\}/g, description)
            .replace(/\{username\}/g, username);
    }
}
