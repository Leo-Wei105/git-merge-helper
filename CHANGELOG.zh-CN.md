# 更新日志

[English](./CHANGELOG.md)

本项目的所有重要变更均记录在此文件（格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)）。

## [0.5.4] - 2026-05-19

### 变更

- **中英文文档对齐**：全面对齐英文与中文 README 内容——为英文 README 补齐缺失的配置项说明、项目结构、本地开发与打包、故障排除、免责声明和版本与更新日志等章节。
- **补全更新日志**：补充了 0.5.2 和 0.5.3 版本缺失的更新日志条目。

### 修复

- **中文 README**：添加了缺失的 `[English]` 导航链接；修正了过时的版本引用（从 `0.5.1` 更新为 `0.5.4`）。

## [0.5.3] - 2026-05-19

### 变更

- **打包配置清理**：更新 `.vscodeignore`，排除开发脚本（`check-mojibake.js`、`gen-l10n.js`、`i18n-extract.json` 等）、中文文档副本（`README.zh-CN.md`、`CHANGELOG.zh-CN.md`）、临时文件及 macOS `.DS_Store`——使 `.vsix` 包更小更干净。
- **Gitignore 更新**：将 `.DS_Store`、`temp_vsix/`、`temp.zip` 加入 `.gitignore`。

## [0.5.2] - 2026-05-19

### 变更

- **版本号升级**：补丁版本升级（无功能变更）。

## [0.5.1] - 2026-05-19

### 修复

- **市场页面多语言**：将 `CHANGELOG.md` 拆分为中英双语，修复了扩展市场详情页默认显示中文更新日志的问题，改为默认英文并提供中文跳转。

## [0.5.0] - 2026-05-19

### 新增

- **国际化多语言支持 (i18n)**：
  - package.json 中的命令名称、设置项等支持中英文环境自动切换。
  - 代码内部提示和弹窗实现全面国际化支持 (vscode.l10n)。
  - 文档重构：提供全英文主 README.md，并附带中文 README.zh-CN.md。

## [0.4.0] - 2026-05-19

### 新增

- **查看并修改全局 Git 配置**：提供图形化界面（QuickPick 和 InputBox），用于查看和修改常用的全局 Git 配置（如 `user.name`、`user.email`、`core.autocrlf`、`init.defaultBranch`），支持清空配置。

## [0.3.0] - 2026-05-18

### 新增

- **一键拉取所有本地分支**：自动 fetch 最新远端信息，并智能且安全地更新所有未分叉的本地关联分支，当前分支使用 `merge --ff-only`，其他分支通过直接更新引用实现，既快又安全。支持自动跳过已更新或存在分叉的分支，并在完成后显示报告面板。

## [0.2.1] - 2026-05-18

### 修复

- **配置管理**：修复在大型项目工作区中点击“配置管理”打开设置时，因使用 `@ext:` 筛选器导致 VS Code 设置界面严重卡顿或卡死的问题。改为直接通过配置前缀 `gitWorkflowHelper` 搜索，大幅提升打开速度并避免性能问题。

## [0.2.0] - 2026-05-18
### 新增

- **格式化提交**：Conventional Commits 风格内置模板（feat、fix、docs、refactor 等），支持自定义模板（`commitTemplates`）与默认模板 id（`defaultCommitTemplateId`）；命令「格式化提交」「复制格式化提交信息」。
- **批量 Cherry-pick（优选）**：从源分支多选提交并依次 cherry-pick，支持推荐/自定义/全部三种入口与列表内搜索。
- **处理 Git 冲突**：统一识别 merge / revert / cherry-pick / rebase 冲突，提供打开合并编辑器、取消操作、已解决继续等引导。
- **回滚合入当前分支的合并**：按 first-parent 定位最近一次 merge，支持 `reset` / `revert` / 每次询问（`mergeRollbackStrategy`）。
- **查看当前分支基分支**：创建分支时记录基分支，并支持 reflog 推断。
- **强制推送（force-with-lease）**：安全强推当前分支到远程。
- **右键与子菜单**：资源管理器、编辑器、SCM 资源上下文中的「Git工作流助手」子菜单；SCM 标题栏快捷命令。

### 变更

- 合并流程中遇到未提交更改时，改用格式化提交模板，不再写死 `feat:` 前缀。
- Revert 回滚 merge 时支持冲突预检与可选跳过钩子（`skipHooksOnRevert`）；修正 `revert --continue` 与 `--no-verify` 的用法。
- 命令归类为「Git工作流助手」类别，标题与对话框文案精简。

### 配置

- `gitWorkflowHelper.commitTemplates`、`defaultCommitTemplateId`
- `gitWorkflowHelper.mergeRollbackStrategy`、`skipHooksOnRevert`
- `gitWorkflowHelper.maxCherryPickCommitsToList`、`cherryPickRecordOrigin`、`cherryPickFilterPriority`

## [0.1.2] - 2026-05-14

### 变更

- **配置管理**：在「多文件夹工作区」或「已保存的 `.code-workspace` 工作区」下，执行「Git工作流助手: 配置管理」时，改为打开 **用户设置** 的图形界面，并自动筛选本扩展（`@ext:Leo-Wei105.git-workflow-helper`），减轻多作用域设置页卡顿；单文件夹且非 `.code-workspace` 打开时仍为默认「打开设置」并筛选本扩展。
- 新增 `src/openExtensionSettings.ts` 封装上述打开策略；`GitMergeService.manageConfiguration` 与命令行为一致。

### 文档

- 重写 `README.md`（功能说明、配置表、故障排除、版本信息）；补充 **GitHub 仓库与 Issues** 链接；新增 **免责声明**。
- 更新 `package.json` 中的扩展描述（`description`）。

## [0.1.0] 及更早

- 早期版本未在此仓库中维护独立更新日志；请参考对应 Git 标签或提交历史。
