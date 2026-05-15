# Git 工作流助手

一个面向 VS Code / Cursor 的 Git 工作流扩展：快速创建规范分支、一键完成合并流程。代码按模块拆分，便于维护与扩展。

**市场标识**：发布者 `Leo-Wei105`，扩展 ID `Leo-Wei105.git-workflow-helper`。

**源码与反馈**：

- 仓库：<https://github.com/Leo-Wei105/git-workflow-helper>
- 问题反馈（Issues）：<https://github.com/Leo-Wei105/git-workflow-helper/issues>

---

## 功能概览

### 创建功能分支

- 一键按团队约定生成分支名（前缀、日期、描述、用户名等可配置）
- 支持多种日期格式与分支命名模板预设
- 可选基分支、创建前预览、重复分支名提示
- 可选创建后自动 `checkout`

### 合并功能分支

- 引导选择目标分支（来自配置的可选列表）
- 拉取、合并、冲突检测与处理（打开冲突文件、中止合并、解决后继续）
- 合并过程通知区进度提示，并提示勿手动操作 Git
- 合并流程互斥，避免并发执行多条合并

### 调用方式

- **命令面板**：`Ctrl+Shift+P` / `Cmd+Shift+P`，搜索「Git工作流助手」
- **快捷键**（需已打开含 Git 的工作区）  
  - 创建分支：`Ctrl+Alt+Shift+B`（Mac：`Cmd+Alt+Shift+B`）  
  - 合并分支：`Ctrl+Alt+Shift+M`（Mac：`Cmd+Alt+Shift+M`）
- **源代码管理 (SCM)**：标题栏内与本扩展相关的命令按钮

---

## 快速开始

1. 在 VS Code 中打开 **文件夹** 或 **多根工作区 / `.code-workspace`**
2. 确保该路径下为 Git 仓库（根目录存在 `.git`）
3. 使用上述任一方式执行「创建功能分支」或「合并功能分支」
4. 需要改默认行为时，使用「**Git工作流助手: 配置管理**」打开设置（见下文「配置管理命令」）

---

## 创建分支流程（摘要）

1. 选择前缀（如 `feature`、`bugfix`）
2. 选择作为基础的本地/远程分支
3. 输入描述（受命名规则校验）
4. 预览完整分支名并确认创建（可按配置自动切换）

**默认命名示例**：`feature/20250514/功能简述_username`（具体以当前配置与模板为准）

---

## 合并流程（摘要）

1. 校验仓库与工作区状态、当前分支是否视为功能分支
2. 选择目标分支（配置中的 `targetBranches`）
3. 拉取、合并；若有冲突则按提示处理
4. 成功后按流程推送并尽量切回原功能分支

详细步骤与错误恢复以实际版本行为为准。

---

## 配置项说明

所有配置项位于 **`gitWorkflowHelper`** 段下，可在设置 UI 或 `settings.json` 中编辑。

| 配置键 | 类型 | 说明 |
|--------|------|------|
| `targetBranches` | `string[]` | 合并时可选的目标分支名列表（插件内「添加目标分支」会写入**工作区**级配置） |
| `branchPrefixes` | `string[]` | 创建分支时的前缀列表；**第一项**作为默认前缀 |
| `customGitName` | `string` | 自定义用于分支名的用户名；留空则使用 Git 配置 |
| `dateFormat` | 枚举 | `yyyyMMdd`（默认）、`yyyy-MM-dd`、`yyMMdd` |
| `branchNameTemplatePreset` | 枚举 | 命名模板预设；选 `custom` 时使用 `branchNameFormat` |
| `branchNameFormat` | `string` | 自定义模板；占位符：`{prefix}`、`{date}`、`{description}`、`{username}` |
| `autoCheckout` | `boolean` | 创建分支后是否自动切换（默认 `true`） |
| `maxConflictFilesToOpen` | `number` | 冲突时批量打开文件上限（默认 `5`，范围 `1`–`20`） |

### 配置管理命令

命令：**Git工作流助手: 配置管理**（`gitWorkflowHelper.manageConfiguration`）。

- **多文件夹工作区**（工作区内根目录多于一个），或 **已通过 `.code-workspace` 打开的工作区**（即使后来删到只剩一个文件夹，只要仍是该工作区文件）：  
  会打开 **「用户」设置** 的图形界面，并自动在搜索框填入 `@ext:Leo-Wei105.git-workflow-helper`，只显示本扩展相关项，减轻多作用域设置页卡顿，且仍可用 UI 编辑。
- **仅打开单个文件夹**、且 **不是** 通过 `.code-workspace` 打开：  
  使用编辑器默认的「打开设置」并同样按扩展 ID 筛选。

若某项需要 **仅作用于当前工作区**，可在打开的设置页顶部切换到 **「工作区」** 标签后再修改；合并流程里通过界面「添加目标分支」写入的仍是 **工作区** 级 `targetBranches`。

### `settings.json` 示例

```json
{
  "gitWorkflowHelper.targetBranches": ["uat", "pre"],
  "gitWorkflowHelper.branchPrefixes": ["feature", "feat", "bugfix", "hotfix", "fix"],
  "gitWorkflowHelper.customGitName": "",
  "gitWorkflowHelper.dateFormat": "yyyyMMdd",
  "gitWorkflowHelper.branchNameTemplatePreset": "default",
  "gitWorkflowHelper.branchNameFormat": "{prefix}/{date}/{description}_{username}",
  "gitWorkflowHelper.autoCheckout": true,
  "gitWorkflowHelper.maxConflictFilesToOpen": 5
}
```

---

## 项目结构（源码）

| 模块 | 职责 |
|------|------|
| `extension.ts` | 激活扩展、注册命令 |
| `openExtensionSettings.ts` | 「配置管理」打开设置页的策略（单文件夹 vs 多根 / 工作区文件） |
| `gitOperations.ts` | Git 命令封装（参数数组执行，降低注入风险） |
| `branchManager` / `branchCreator` | 分支检测与创建流程 |
| `branchConfigManager` | 创建侧：前缀、日期、模板等配置读取 |
| `mergeTargetConfigManager` | 合并侧：目标分支列表；支持读写工作区级 `targetBranches` |
| `mergeWorkflow` / `gitMergeService` | 合并主流程与服务入口 |
| `errors.ts` | 统一错误类型与用户取消等区分 |

---

## 本地开发与打包

```bash
npm install
npm run compile      # 编译 TypeScript → out/
npm run watch        # 监听编译
npm run package      # 生成 .vsix（需已安装 @vscode/vsce）
```

调试：在 VS Code 中打开本仓库，按 **F5** 启动扩展开发宿主（依赖 `.vscode/launch.json`）。

---

## 故障排除

### 合并冲突

按通知与对话框选择：打开冲突文件、中止合并（`merge --abort`）、解决后继续等；可配置单次最多打开多少个冲突文件。

### 当前分支不被识别为功能分支

检查分支名是否包含配置的前缀之一（如 `feature/`）；必要时在设置中增加 `branchPrefixes`。

### 打开「配置管理」仍较慢或希望只改工作区

- 确认是否处于多根或 `.code-workspace`；此时默认打开的是 **用户** 设置筛选视图。  
- 需要工作区级覆盖时，手动切换到设置页的 **「工作区」** 再编辑。  
- 也可直接使用工作区下的 `.vscode/settings.json` 或多根工作区 JSON 中的 `settings` 字段。

### 远程分支 / 网络问题

确认 `git remote`、网络与分支名拼写；目标分支在本地不存在时，扩展会尝试按流程从远程拉取或创建（具体以当前版本逻辑为准）。

---

## 版本与更新日志

- **当前发布版本**：`0.1.2`（与 `package.json` 中 `version` 一致）
- **详细变更**：见仓库根目录 [`CHANGELOG.md`](./CHANGELOG.md)

---

## 免责声明

本扩展（「Git 工作流助手」）仅作为在 VS Code / Cursor 等兼容编辑器中辅助执行 Git 相关操作的**工具**，**不构成**任何形式的法律、合规、安全或运维建议。

- **使用风险自负**：分支创建、合并、推送、变基、冲突处理等操作会直接或间接修改您的本地仓库与远程仓库状态。请在重要仓库中**事先备份**、在独立分支或沙箱环境中验证流程后再用于生产数据。
- **无担保**：本扩展按「**现状**」提供，作者及贡献者**不对**因使用或无法使用本扩展而导致的任何直接、间接、偶然或后果性损害（包括但不限于数据丢失、业务中断、合并错误、与团队规范不符等）承担责任，亦**不提供**任何明示或默示的适销性、特定用途适用性担保。
- **环境与兼容性**：本扩展依赖您本机安装的 Git、编辑器版本、网络与远程托管服务行为；因第三方软件、策略或网络原因导致的功能异常或损失，不在本扩展可控范围内。
- **责任边界**：是否执行某项 Git 操作由您通过界面确认；请在执行前自行审阅将要运行的命令与影响范围。

继续使用本扩展即表示您已阅读并理解上述条款；若不同意，请勿安装或使用。

---

## 许可证

MIT — 见 [`LICENSE`](./LICENSE)。
