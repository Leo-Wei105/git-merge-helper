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

## License
MIT — See [`LICENSE`](./LICENSE).
