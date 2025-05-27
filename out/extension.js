"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const gitMergeService_1 = require("./gitMergeService");
/**
 * 插件激活函数
 * @param context - VSCode扩展上下文
 */
function activate(context) {
    console.log('Git合并助手插件已激活');
    // 注册合并Feature分支命令
    const mergeFeatureBranchCommand = vscode.commands.registerCommand('gitMergeHelper.mergeFeatureBranch', async () => {
        try {
            // 检查是否有工作区
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('请先打开一个工作区文件夹');
                return;
            }
            const gitMergeService = new gitMergeService_1.GitMergeService();
            await gitMergeService.mergeFeatureBranch();
        }
        catch (error) {
            const errorMessage = error.message || '未知错误';
            vscode.window.showErrorMessage(`合并失败: ${errorMessage}`);
            console.error('合并失败:', error);
        }
    });
    // 注册快速提交并合并命令
    const quickCommitAndMergeCommand = vscode.commands.registerCommand('gitMergeHelper.quickCommitAndMerge', async () => {
        try {
            // 检查是否有工作区
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('请先打开一个工作区文件夹');
                return;
            }
            const gitMergeService = new gitMergeService_1.GitMergeService();
            await gitMergeService.quickCommitAndMerge();
        }
        catch (error) {
            const errorMessage = error.message || '未知错误';
            vscode.window.showErrorMessage(`操作失败: ${errorMessage}`);
            console.error('操作失败:', error);
        }
    });
    // 注册配置管理命令
    const manageConfigurationCommand = vscode.commands.registerCommand('gitMergeHelper.manageConfiguration', async () => {
        try {
            // 检查是否有工作区
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('请先打开一个工作区文件夹');
                return;
            }
            const gitMergeService = new gitMergeService_1.GitMergeService();
            await gitMergeService.manageConfiguration();
        }
        catch (error) {
            const errorMessage = error.message || '未知错误';
            vscode.window.showErrorMessage(`配置失败: ${errorMessage}`);
            console.error('配置失败:', error);
        }
    });
    // 将命令添加到上下文订阅中
    context.subscriptions.push(mergeFeatureBranchCommand);
    context.subscriptions.push(quickCommitAndMergeCommand);
    context.subscriptions.push(manageConfigurationCommand);
    // 只在有工作区时显示激活消息
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        vscode.window.showInformationMessage('Git合并助手已准备就绪！');
    }
}
/**
 * 插件停用函数
 */
function deactivate() {
    console.log('Git合并助手插件已停用');
}
//# sourceMappingURL=extension.js.map