# 更新日志

本项目的所有重要变更均记录在此文件（格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)）。

## [0.1.2] - 2026-05-14

### 变更

- **配置管理**：在「多文件夹工作区」或「已保存的 `.code-workspace` 工作区」下，执行「Git工作流助手: 配置管理」时，改为打开 **用户设置** 的图形界面，并自动筛选本扩展（`@ext:Leo-Wei105.git-workflow-helper`），减轻多作用域设置页卡顿；单文件夹且非 `.code-workspace` 打开时仍为默认「打开设置」并筛选本扩展。
- 新增 `src/openExtensionSettings.ts` 封装上述打开策略；`GitMergeService.manageConfiguration` 与命令行为一致。

### 文档

- 重写 `README.md`（功能说明、配置表、故障排除、版本信息）；补充 **GitHub 仓库与 Issues** 链接；新增 **免责声明**。
- 更新 `package.json` 中的扩展描述（`description`）。

## [0.1.0] 及更早

- 早期版本未在此仓库中维护独立更新日志；请参考对应 Git 标签或提交历史。
