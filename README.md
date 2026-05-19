# Git Workflow Helper

[中文文档](./README.zh-CN.md)

A Git workflow extension for VS Code / Cursor: standardizes branch creation, guides merges, resolves conflicts, formats commits, performs batch cherry-picks, etc. Code is modularized for easy maintenance and extension.

**Marketplace Info**: Publisher `Leo-Wei105`, Extension ID `Leo-Wei105.git-workflow-helper`.

**Source & Feedback**:
- Repository: <https://github.com/Leo-Wei105/git-workflow-helper>
- Issues: <https://github.com/Leo-Wei105/git-workflow-helper/issues>

---

## Features Overview

### Create Feature Branch
- One-click branch creation following team conventions (prefix, date, description, username configurable).
- Supports multiple date formats and branch naming template presets.
- Optional base branch, pre-creation preview, duplicate branch warnings; records base branch during creation for later queries.
- Option to automatically `checkout` after creation.

### Merge Feature Branch
- Guided target branch selection (from configurable list).
- Pull, merge, conflict detection and handling (opens conflict files, aborts merge, continues after resolution).
- Merge progress notifications, with warnings against manual Git operations.
- If there are uncommitted changes, you can use **Formatted Commit** templates before resuming the merge.

### Formatted Commit
- Built-in Conventional Commits templates (`feat`, `fix`, `docs`, `refactor`, `perf`, `chore`, etc., including scope / ticket / hotfix).
- Configurable `commitTemplates` and `defaultCommitTemplateId` in settings.
- Placeholders: `{description}`, `{scope}`, `{ticket}`, `{username}`.
- **Formatted Commit**: Select template → fill details → preview & confirm → commit (auto handles staged / stage-all).
- **Copy Formatted Commit Message**: Copies the generated message to clipboard to be used with the editor's built-in SCM input.

> Cursor / VS Code **built-in SCM commit box** does not provide a template wizard; use this extension's command for formatting, or combine with `git commit.template` / AI-generated messages.

### Resolve Git Conflicts
- Detects ongoing merge, revert, cherry-pick, and rebase.
- Guides: open merge editor, cancel current operation, mark as resolved and continue.

### Batch Cherry-pick
- Lists cherry-pickable commits from a specified source branch (option to exclude merge commits).
- Three entry points: recommended, custom filter, or all; search keywords in the list.
- Applies commits sequentially, falling back to unified conflict handling on conflicts.

### Other Commands
| Command | Description |
|------|------|
| Pull All Local Branches | Automatically fetch and safely fast-forward all local tracking branches, skipping diverged branches. |
| Rollback Last Merge | Locates the most recent merge (first-parent) in the current branch, supports reset or revert. |
| Show Current Branch Base | Displays the base branch recorded during creation or inferred from reflog. |
| Force Push (force-with-lease) | `git push --force-with-lease` |
| Manage Configuration | Opens extension-related settings (optimized for multi-root workspaces to filter by extension). |
| Manage Global Git Config | View and modify common global Git configs (e.g. user.name, user.email) through GUI. |
| **Internationalization (i18n)** | Automatically switches between English and Chinese environments based on VS Code language settings. |

### How to use
- **Command Palette**: `Ctrl+Shift+P` / `Cmd+Shift+P`, search for "Git Workflow Helper".
- **Shortcuts** (requires an active Git workspace)
  - Create Branch: `Ctrl+Alt+Shift+B` (Mac: `Cmd+Alt+Shift+B`)
  - Merge Branch: `Ctrl+Alt+Shift+M` (Mac: `Cmd+Alt+Shift+M`)
- **Source Control (SCM)**: Buttons in the title bar related to this extension.
- **Context Menu**: Explorer / Editor / SCM changes → **Git Workflow Helper** submenu.

---

## Quick Start
1. Open a **folder** or **multi-root workspace (`.code-workspace`)** in VS Code / Cursor.
2. Ensure it is a Git repository (`.git` exists in root).
3. Use Command Palette or SCM to execute commands (Create Branch, Merge, Formatted Commit, etc.).
4. To change default behaviors, use "**Git Workflow Helper: Manage Configuration**".

---

## Configuration Reference

All settings are under the **`gitWorkflowHelper`** namespace and can be edited in the Settings UI or `settings.json`.

| Setting Key | Type | Description |
|--------|------|------|
| `targetBranches` | `string[]` | List of target branch names available when merging |
| `branchPrefixes` | `string[]` | Prefix list for branch creation; **first item** is used as the default |
| `customGitName` | `string` | Custom username for branch names; leave empty to use Git config |
| `dateFormat` | enum | `yyyyMMdd` (default), `yyyy-MM-dd`, `yyMMdd` |
| `branchNameTemplatePreset` | enum | Naming template preset; choose `custom` to use `branchNameFormat` |
| `branchNameFormat` | `string` | Custom template; placeholders: `{prefix}`, `{date}`, `{description}`, `{username}` |
| `autoCheckout` | `boolean` | Whether to auto-checkout after branch creation (default `true`) |
| `maxConflictFilesToOpen` | `number` | Max conflict files to open at once (default `5`, range `1`–`20`) |
| `mergeRollbackStrategy` | enum | Merge rollback: `reset` (default), `revert`, `ask` |
| `skipHooksOnRevert` | `boolean` | Whether to always `--no-verify` when completing a revert commit (default `false`) |
| `maxCherryPickCommitsToList` | `number` | Max commits to list in batch cherry-pick (default `50`) |
| `cherryPickRecordOrigin` | `boolean` | Whether to add `-x` during cherry-pick (default `true`) |
| `cherryPickFilterPriority` | `string[]` | Advanced: order of merge/author/time filters in custom cherry-pick |
| `commitTemplates` | `array` | Custom commit templates (string or `{ id, name, template }`) |
| `defaultCommitTemplateId` | `string` | Default highlighted template id for formatted commit (default `feat`) |

### Configuration Management Command

Command: **Git Workflow Helper: Manage Configuration** (`gitWorkflowHelper.manageConfiguration`).

- **Multi-folder workspace** or **`.code-workspace`**: Opens **User** settings filtered by `@ext:Leo-Wei105.git-workflow-helper`.
- **Single folder**: Opens settings with the same extension ID filter.

For workspace-level overrides, switch to the **"Workspace"** tab on the settings page.

### `settings.json` Example

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

## Project Structure (Source)

| Module | Responsibility |
|------|------|
| `extension.ts` | Activates the extension, registers commands |
| `openExtensionSettings.ts` | "Manage Configuration" settings page strategy |
| `gitOperations.ts` | Git command wrappers |
| `branchCreator` / `branchManager` | Branch creation and detection |
| `mergeWorkflow` / `gitMergeService` | Merge workflow |
| `gitConflictHandler.ts` | Unified conflict handling |
| `formattedCommitService.ts` / `commitTemplateManager.ts` | Formatted commit |
| `batchCherryPickService.ts` | Batch cherry-pick |
| `gitPullService.ts` | Pull all local branches |
| `mergeRevertService.ts` / `gitPushService.ts` / `branchBaseService.ts` | Rollback, force push, branch base |
| `errors.ts` | Unified error and user cancellation handling |

---

## Local Development & Packaging

```bash
npm install
npm run compile      # Compile TypeScript → out/
npm run watch        # Watch mode compilation
npm run package      # Generate .vsix
npm run publish      # Publish to VS Code Marketplace (requires vsce login)
```

Debug: Open this repository in VS Code and press **F5** to launch the Extension Development Host.

---

## Troubleshooting

### Merge Conflicts

Use "**Resolve Git Conflicts**", or follow the notification prompts during the merge workflow; configure `maxConflictFilesToOpen` as needed.

### Formatted Commit vs. Built-in SCM Commit

The built-in commit input box **does not** have a template selector; use "**Formatted Commit**", or use "**Copy Formatted Commit Message**" and paste into the SCM input box before committing.

### Current Branch Not Recognized as a Feature Branch

Check whether the branch name contains one of the configured prefixes; add more to `branchPrefixes` if necessary.

### Configuration Management is Slow

In multi-root or `.code-workspace` setups, it defaults to the user-level filtered view; for workspace settings, switch to the **Workspace** tab or edit `.vscode/settings.json`.

### `ECONNRESET` / `cursor-always-local` in Extension Host

If the stack trace points to `cursor-always-local`, it is a network connectivity issue with Cursor's built-in extension, generally unrelated to Git Workflow Helper; try reloading the window or checking your proxy/VPN.

---

## Version & Changelog

- **Current Version**: `0.5.4` (matches `version` in `package.json`)
- **Detailed Changes**: See [`CHANGELOG.md`](./CHANGELOG.md)

---

## Disclaimer

This extension ("Git Workflow Helper") is provided solely as a **tool** to assist with Git-related operations in VS Code / Cursor and compatible editors. It **does not constitute** any form of legal, compliance, security, or operational advice.

- **Use at your own risk**: Branch creation, merging, pushing, cherry-picking, rollback, and conflict resolution modify local and remote repositories. Please **back up** important repositories and verify on a separate branch before using in production.
- **No warranty**: This extension is provided "**as is**"; the author and contributors are not liable for any damages arising from the use of this extension.
- **Scope of responsibility**: Whether to execute a Git operation is confirmed by you through the interface; please review the impact scope before proceeding.

By continuing to use this extension, you acknowledge that you have read and understood the above terms.

---

## License
MIT — See [`LICENSE`](./LICENSE).
