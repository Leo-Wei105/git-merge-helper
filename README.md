# Git 工作流助手

一个面向 VS Code / Cursor 的 Git 工作流扩展：规范分支创建、引导式合并、冲突处理、格式化提交、批量 cherry-pick 等。代码按模块拆分，便于维护与扩展。

**市场标识**：发布者 `Leo-Wei105`，扩展 ID `Leo-Wei105.git-workflow-helper`。

**源码与反馈**：

- 仓库：<https://github.com/Leo-Wei105/git-workflow-helper>
- 问题反馈（Issues）：<https://github.com/Leo-Wei105/git-workflow-helper/issues>

---

## 功能概览

### 创建功能分支

- 一键按团队约定生成分支名（前缀、日期、描述、用户名等可配置）
- 支持多种日期格式与分支命名模板预设
- 可选基分支、创建前预览、重复分支名提示；创建时记录基分支供后续查询
- 可选创建后自动 `checkout`

### 合并功能分支

- 引导选择目标分支（来自配置的可选列表）
- 拉取、合并、冲突检测与处理（打开冲突文件、中止合并、解决后继续）
- 合并过程通知区进度提示，并提示勿手动操作 Git
- 遇到未提交更改时，可使用**格式化提交**模板后再继续合并

### 格式化提交

- 内置 Conventional Commits 推荐模板（`feat`、`fix`、`docs`、`refactor`、`perf`、`chore` 等，含 scope / 单号 / hotfix 等）
- 支持在设置中扩展 `commitTemplates` 与默认模板 `defaultCommitTemplateId`
- 占位符：`{description}`、`{scope}`、`{ticket}`、`{username}`
- **格式化提交**：选模板 → 填写 → 预览确认 → 提交（自动处理仅暂存 / 暂存全部）
- **复制格式化提交信息**：生成后写入剪贴板，可配合编辑器自带 SCM 提交框使用

> Cursor / VS Code **自带 SCM 提交框**不提供模板向导；需格式化时请用本扩展命令，或配合 `git commit.template` / AI 生成说明。

### 处理 Git 冲突

- 识别进行中的 merge、revert、cherry-pick、rebase
- 引导：打开合并编辑器、取消当前操作、标记已解决并继续

### 批量 Cherry-pick（优选）

- 从指定源分支列出可 cherry-pick 的提交（可排除 merge 提交）
- 推荐 / 自定义筛选 / 全部三种入口；列表内搜索关键字
- 依次应用，冲突时与统一冲突处理衔接

### 其他命令

| 命令 | 说明 |
|------|------|
| 一键拉取所有本地分支 | 自动 fetch 并使用快进（fast-forward）安全更新所有本地追踪分支，跳过存在分叉的分支 |
| 回滚合入当前分支的合并 | 定位当前分支最近一次 merge（first-parent），支持 reset 或 revert |
| 查看当前分支基分支 | 显示创建时记录的基分支或 reflog 推断结果 |
| 强制推送（force-with-lease） | `git push --force-with-lease` |
| 配置管理 | 打开本扩展相关设置（多根工作区时优化为按扩展筛选的用户设置） |

### 调用方式

- **命令面板**：`Ctrl+Shift+P` / `Cmd+Shift+P`，搜索「Git工作流助手」
- **快捷键**（需已打开含 Git 的工作区）  
  - 创建分支：`Ctrl+Alt+Shift+B`（Mac：`Cmd+Alt+Shift+B`）  
  - 合并分支：`Ctrl+Alt+Shift+M`（Mac：`Cmd+Alt+Shift+M`）
- **源代码管理 (SCM)**：标题栏内与本扩展相关的命令按钮
- **右键菜单**：资源管理器 / 编辑器 / SCM 变更项 → **Git工作流助手** 子菜单

---

## 快速开始

1. 在 VS Code / Cursor 中打开 **文件夹** 或 **多根工作区 / `.code-workspace`**
2. 确保该路径下为 Git 仓库（根目录存在 `.git`）
3. 使用命令面板或 SCM 执行所需命令（创建分支、合并、格式化提交等）
4. 需要改默认行为时，使用「**Git工作流助手: 配置管理**」打开设置

---

## 配置项说明

所有配置项位于 **`gitWorkflowHelper`** 段下，可在设置 UI 或 `settings.json` 中编辑。

| 配置键 | 类型 | 说明 |
|--------|------|------|
| `targetBranches` | `string[]` | 合并时可选的目标分支名列表 |
| `branchPrefixes` | `string[]` | 创建分支时的前缀列表；**第一项**作为默认前缀 |
| `customGitName` | `string` | 自定义用于分支名的用户名；留空则使用 Git 配置 |
| `dateFormat` | 枚举 | `yyyyMMdd`（默认）、`yyyy-MM-dd`、`yyMMdd` |
| `branchNameTemplatePreset` | 枚举 | 命名模板预设；选 `custom` 时使用 `branchNameFormat` |
| `branchNameFormat` | `string` | 自定义模板；占位符：`{prefix}`、`{date}`、`{description}`、`{username}` |
| `autoCheckout` | `boolean` | 创建分支后是否自动切换（默认 `true`） |
| `maxConflictFilesToOpen` | `number` | 冲突时批量打开文件上限（默认 `5`，范围 `1`–`20`） |
| `mergeRollbackStrategy` | 枚举 | 回滚 merge：`reset`（默认）、`revert`、`ask` |
| `skipHooksOnRevert` | `boolean` | revert 完成提交时是否始终 `--no-verify`（默认 `false`） |
| `maxCherryPickCommitsToList` | `number` | 批量优选列表最多展示提交数（默认 `50`） |
| `cherryPickRecordOrigin` | `boolean` | cherry-pick 是否加 `-x`（默认 `true`） |
| `cherryPickFilterPriority` | `string[]` | 高级：自定义筛选时 merge/author/time 的应用顺序 |
| `commitTemplates` | `array` | 自定义提交模板（字符串或 `{ id, name, template }`） |
| `defaultCommitTemplateId` | `string` | 格式化提交默认高亮模板 id（默认 `feat`） |

### 配置管理命令

命令：**Git工作流助手: 配置管理**（`gitWorkflowHelper.manageConfiguration`）。

- **多文件夹工作区**或 **`.code-workspace` 工作区**：打开 **用户** 设置并筛选 `@ext:Leo-Wei105.git-workflow-helper`。
- **单文件夹**：默认打开设置并同样按扩展 ID 筛选。

工作区级覆盖请在设置页切换到 **「工作区」** 标签。

### `settings.json` 示例

```json
{
  "gitWorkflowHelper.targetBranches": ["uat", "pre"],
  "gitWorkflowHelper.branchPrefixes": ["feature", "feat", "bugfix", "hotfix", "fix"],
  "gitWorkflowHelper.mergeRollbackStrategy": "reset",
  "gitWorkflowHelper.defaultCommitTemplateId": "feat",
  "gitWorkflowHelper.commitTemplates": [
    "ci: {description}",
    {
      "id": "jira",
      "name": "JIRA",
      "template": "feat({scope}): [{ticket}] {description}"
    }
  ],
  "gitWorkflowHelper.maxCherryPickCommitsToList": 50,
  "gitWorkflowHelper.autoCheckout": true
}
```

---

## 项目结构（源码）

| 模块 | 职责 |
|------|------|
| `extension.ts` | 激活扩展、注册命令 |
| `openExtensionSettings.ts` | 「配置管理」打开设置页策略 |
| `gitOperations.ts` | Git 命令封装 |
| `branchCreator` / `branchManager` | 分支创建与检测 |
| `mergeWorkflow` / `gitMergeService` | 合并主流程 |
| `gitConflictHandler.ts` | 统一冲突处理 |
| `formattedCommitService.ts` / `commitTemplateManager.ts` | 格式化提交 |
| `batchCherryPickService.ts` | 批量 cherry-pick |
| `gitPullService.ts` | 一键拉取所有本地分支 |
| `mergeRevertService.ts` / `gitPushService.ts` / `branchBaseService.ts` | 回滚、强推、基分支 |
| `errors.ts` | 统一错误与用户取消 |

---

## 本地开发与打包

```bash
npm install
npm run compile      # 编译 TypeScript → out/
npm run watch        # 监听编译
npm run package      # 生成 .vsix
npm run publish      # 发布到 VS Code Marketplace（需 vsce 登录）
```

调试：在 VS Code 中打开本仓库，按 **F5** 启动扩展开发宿主。

---

## 故障排除

### 合并冲突

使用「**处理 Git 冲突**」，或按合并流程中的通知操作；可配置 `maxConflictFilesToOpen`。

### 格式化提交与自带 SCM 提交

自带提交输入框**没有**模板选择器；请使用「**格式化提交**」，或「**复制格式化提交信息**」后粘贴到 SCM 输入框再点提交。

### 当前分支不被识别为功能分支

检查分支名是否包含配置的前缀之一；必要时增加 `branchPrefixes`。

### 配置管理较慢

多根或 `.code-workspace` 下默认打开用户级筛选视图；工作区配置请切换到 **工作区** 标签或编辑 `.vscode/settings.json`。

### 扩展宿主中的 `ECONNRESET` / `cursor-always-local`

堆栈若指向 `cursor-always-local`，属于 Cursor 内置扩展的网络连接问题，一般与 Git 工作流助手无关；可重载窗口或检查代理/VPN。

---

## 版本与更新日志

- **当前发布版本**：`0.3.0`（与 `package.json` 中 `version` 一致）
- **详细变更**：见 [`CHANGELOG.md`](./CHANGELOG.md)

---

## 免责声明

本扩展（「Git 工作流助手」）仅作为在 VS Code / Cursor 等兼容编辑器中辅助执行 Git 相关操作的**工具**，**不构成**任何形式的法律、合规、安全或运维建议。

- **使用风险自负**：分支创建、合并、推送、cherry-pick、回滚、冲突处理等会修改本地与远程仓库。请在重要仓库中**事先备份**、在独立分支验证后再用于生产。
- **无担保**：本扩展按「**现状**」提供，作者及贡献者不对因使用本扩展导致的损害承担责任。
- **责任边界**：是否执行某项 Git 操作由您通过界面确认；执行前请自行审阅影响范围。

继续使用本扩展即表示您已阅读并理解上述条款。

---

## 许可证

MIT — 见 [`LICENSE`](./LICENSE)。
