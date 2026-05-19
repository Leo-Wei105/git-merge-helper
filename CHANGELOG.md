# Changelog

[中文更新日志](./CHANGELOG.zh-CN.md)

All notable changes to this project will be documented in this file (format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)).

## [0.5.4] - 2026-05-19

### Changed

- **Documentation Alignment**: Fully aligned English and Chinese README content — added missing Configuration Reference, Project Structure, Local Development & Packaging, Troubleshooting, Disclaimer, and Version & Changelog sections to the English README.
- **Changelog Backfill**: Added missing changelog entries for versions 0.5.2 and 0.5.3.

### Fixed

- **Chinese README**: Added missing `[English]` navigation link; corrected stale version reference from `0.5.1` to `0.5.4`.

## [0.5.3] - 2026-05-19

### Changed

- **Packaging Cleanup**: Updated `.vscodeignore` to exclude development scripts (`check-mojibake.js`, `gen-l10n.js`, `i18n-extract.json`, etc.), Chinese documentation duplicates (`README.zh-CN.md`, `CHANGELOG.zh-CN.md`), temporary files, and macOS `.DS_Store` — resulting in a smaller, cleaner `.vsix` package.
- **Gitignore**: Added `.DS_Store`, `temp_vsix/`, and `temp.zip` to `.gitignore`.

## [0.5.2] - 2026-05-19

### Changed

- **Version Bump**: Patch version bump (no functional changes).

## [0.5.1] - 2026-05-19

### Fixed

- **Marketplace Localization**: Split `CHANGELOG.md` into English and Chinese versions to ensure the extension marketplace displays an English changelog by default.

## [0.5.0] - 2026-05-19

### Added

- **Internationalization (i18n) Support**:
  - Command names, configuration items, etc., in `package.json` now automatically switch between English and Chinese environments.
  - Comprehensive internationalization for internal code prompts and dialogs (`vscode.l10n`).
  - Documentation refactoring: Provided an English main `README.md`, accompanied by a Chinese `README.zh-CN.md`.

## [0.4.0] - 2026-05-19

### Added

- **View and Modify Global Git Config**: Provided a graphical interface (QuickPick and InputBox) to view and modify common global Git configurations (such as `user.name`, `user.email`, `core.autocrlf`, `init.defaultBranch`), with support for clearing configurations.

## [0.3.0] - 2026-05-18

### Added

- **Pull All Local Branches**: Automatically fetch the latest remote information and safely update all non-diverged local tracking branches. The current branch uses `merge --ff-only`, while other branches update their references directly, making it both fast and safe. Skips branches that are already up-to-date or diverged, and displays a report panel upon completion.

## [0.2.1] - 2026-05-18

### Fixed

- **Configuration Management**: Fixed an issue where clicking "Manage Configuration" in large multi-root workspaces caused severe UI lag or freezing in the VS Code Settings page due to the `@ext:` filter. Changed to search directly via the configuration prefix `gitWorkflowHelper`, significantly improving opening speed and avoiding performance issues.

## [0.2.0] - 2026-05-18

### Added

- **Formatted Commit**: Built-in Conventional Commits templates (`feat`, `fix`, `docs`, `refactor`, etc.), supporting custom templates (`commitTemplates`) and default template ID (`defaultCommitTemplateId`); added commands "Formatted Commit" and "Copy Formatted Commit Message".
- **Batch Cherry-pick**: Multi-select commits from a source branch and sequentially cherry-pick them. Supports recommended/custom/all entry points and search within the list.
- **Resolve Git Conflicts**: Unified recognition of merge / revert / cherry-pick / rebase conflicts, providing guides to open the merge editor, cancel the operation, or mark as resolved and continue.
- **Rollback Last Merge**: Locates the most recent merge (first-parent) and supports `reset` / `revert` / ask each time (`mergeRollbackStrategy`).
- **Show Current Branch Base**: Records the base branch when creating a branch and supports reflog inference.
- **Force Push (force-with-lease)**: Safely force push the current branch to remote.
- **Context Menus & Submenus**: "Git Workflow Helper" submenus in Explorer, Editor, and SCM resource context; inline shortcut commands in the SCM title bar.

### Changed

- When encountering uncommitted changes during the merge process, it now uses the formatted commit template instead of hardcoding the `feat:` prefix.
- Revert rollback of a merge now supports pre-checking for conflicts and optionally skipping hooks (`skipHooksOnRevert`); fixed usage of `revert --continue` and `--no-verify`.
- Commands categorized under "Git Workflow Helper", with simplified titles and dialog text.

### Configurations

- `gitWorkflowHelper.commitTemplates`, `defaultCommitTemplateId`
- `gitWorkflowHelper.mergeRollbackStrategy`, `skipHooksOnRevert`
- `gitWorkflowHelper.maxCherryPickCommitsToList`, `cherryPickRecordOrigin`, `cherryPickFilterPriority`

## [0.1.2] - 2026-05-14

### Changed

- **Configuration Management**: When running "Git Workflow Helper: Manage Configuration" in a "multi-root workspace", it now opens the **User Settings** GUI and automatically filters for this extension (`@ext:Leo-Wei105.git-workflow-helper`), mitigating UI lag; single-folder workspaces continue to use default behavior.
- Added `src/openExtensionSettings.ts` to encapsulate the above logic; `GitMergeService.manageConfiguration` behaves consistently with the command.

### Documentation

- Rewrote `README.md` (Features, Configurations, Troubleshooting, Version Info); added **GitHub Repository and Issues** links; added **Disclaimer**.
- Updated extension description in `package.json`.

## [0.1.0] and earlier

- Early versions did not maintain a separate changelog in this repository; please refer to the corresponding Git tags or commit history.
