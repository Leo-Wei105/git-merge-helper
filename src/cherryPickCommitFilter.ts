import * as vscode from "vscode";
import { CherryPickCommitInfo } from "./gitOperations";
/** 过滤维度（关键字由列表内搜索框处理，不参与配置优先级） */
export type CherryPickFilterDimension = "merge" | "author" | "time" | "keyword";
export type CherryPickMergeFilterMode = "all" | "exclude_merge" | "only_merge";
export interface CherryPickFilterState {
    authors: string[];
    since?: Date;
    until?: Date;
    mergeMode: CherryPickMergeFilterMode;
}
interface CommitPickItem extends vscode.QuickPickItem {
    commit: CherryPickCommitInfo;
    sequence: number;
}
type FilterEntryMode = "recommended" | "custom" | "all" | "cancel";
const DEFAULT_PRIORITY: CherryPickFilterDimension[] = [
    "merge",
    "author",
    "time",
];
export function getDefaultCherryPickFilterState(): CherryPickFilterState {
    return {
        authors: [],
        mergeMode: "exclude_merge",
    };
}
export function getCherryPickFilterPriorityFromConfig(): CherryPickFilterDimension[] {
    const configured = vscode.workspace
        .getConfiguration("gitWorkflowHelper")
        .get<string[]>("cherryPickFilterPriority");
    if (!Array.isArray(configured) || configured.length === 0) {
        return [...DEFAULT_PRIORITY];
    }
    const valid = configured.filter((d): d is CherryPickFilterDimension => ["merge", "author", "time", "keyword"].includes(d));
    const order: CherryPickFilterDimension[] = [...new Set(valid)].filter((d): d is CherryPickFilterDimension => d !== "keyword");
    for (const dim of DEFAULT_PRIORITY) {
        if (!order.includes(dim)) {
            order.push(dim);
        }
    }
    return order;
}
export function applyCherryPickFilters(commits: CherryPickCommitInfo[], state: CherryPickFilterState, priority: CherryPickFilterDimension[] = getCherryPickFilterPriorityFromConfig()): CherryPickCommitInfo[] {
    let result = [...commits];
    for (const dimension of priority) {
        if (dimension === "keyword") {
            continue;
        }
        result = applyDimensionFilter(result, state, dimension);
    }
    return result;
}
function applyDimensionFilter(commits: CherryPickCommitInfo[], state: CherryPickFilterState, dimension: CherryPickFilterDimension): CherryPickCommitInfo[] {
    switch (dimension) {
        case "merge":
            if (state.mergeMode === "exclude_merge") {
                return commits.filter((c) => !c.isMergeCommit);
            }
            if (state.mergeMode === "only_merge") {
                return commits.filter((c) => c.isMergeCommit);
            }
            return commits;
        case "author":
            if (state.authors.length === 0) {
                return commits;
            }
            return commits.filter((c) => state.authors
                .map((a) => a.trim().toLowerCase())
                .includes(c.author.trim().toLowerCase()));
        case "time":
            return commits.filter((c) => matchesTimeRange(c, state.since, state.until));
        default:
            return commits;
    }
}
function matchesTimeRange(commit: CherryPickCommitInfo, since?: Date, until?: Date): boolean {
    const t = Date.parse(commit.date);
    if (Number.isNaN(t)) {
        return true;
    }
    if (since) {
        const s = new Date(since);
        s.setHours(0, 0, 0, 0);
        if (t < s.getTime()) {
            return false;
        }
    }
    if (until) {
        const u = new Date(until);
        u.setHours(23, 59, 59, 999);
        if (t > u.getTime()) {
            return false;
        }
    }
    return true;
}
function describeFilterState(state: CherryPickFilterState): string {
    const parts: string[] = [];
    if (state.mergeMode === "exclude_merge") {
        parts.push(vscode.l10n.t("\u5DF2\u6392\u9664 merge"));
    }
    else if (state.mergeMode === "only_merge") {
        parts.push(vscode.l10n.t("\u4EC5 merge"));
    }
    if (state.authors.length > 0) {
        parts.push(state.authors.join(", "));
    }
    if (state.since || state.until) {
        parts.push(vscode.l10n.t("\u5DF2\u9650\u65F6\u95F4"));
    }
    return parts.length > 0 ? parts.join(" · ") : vscode.l10n.t("\u672A\u7B5B\u9009");
}
function collectUniqueAuthors(commits: CherryPickCommitInfo[]): string[] {
    return [...new Set(commits.map((c) => c.author.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
/**
 * 简化后的优选提交流程：入口 →（可选 3 步筛选）→ 搜索多选
 */
export async function selectCommitsForCherryPick(allCommits: CherryPickCommitInfo[]): Promise<CherryPickCommitInfo[] | null> {
    const entry = await askFilterEntry();
    if (entry === "cancel") {
        return null;
    }
    let filterState: CherryPickFilterState;
    if (entry === "all") {
        filterState = { authors: [], mergeMode: "all" };
    }
    else if (entry === "custom") {
        const custom = await runCompactCustomFilters(allCommits);
        if (!custom) {
            return null;
        }
        filterState = custom;
    }
    else {
        filterState = getDefaultCherryPickFilterState();
    }
    return pickCommitsWithSearch(allCommits, filterState);
}
/** @deprecated 使用 selectCommitsForCherryPick */
export const configureAndFilterCommits = selectCommitsForCherryPick;
async function askFilterEntry(): Promise<FilterEntryMode> {
    const picked = await vscode.window.showQuickPick([
        {
            label: vscode.l10n.t("$(star-full) \u63A8\u8350"),
            description: vscode.l10n.t("\u6392\u9664 merge \u63D0\u4EA4\uFF0C\u8FDB\u5165\u5217\u8868\u591A\u9009\uFF08\u591A\u6570\u60C5\u51B5\u9009\u8FD9\u9879\uFF09"),
            value: "recommended" as const,
        },
        {
            label: vscode.l10n.t("$(settings-gear) \u81EA\u5B9A\u4E49\u7B5B\u9009"),
            description: vscode.l10n.t("\u6700\u591A 3 \u6B65\uFF1Amerge \u2192 \u63D0\u4EA4\u4EBA \u2192 \u65F6\u95F4"),
            value: "custom" as const,
        },
        {
            label: vscode.l10n.t("$(list-flat) \u663E\u793A\u5168\u90E8"),
            description: vscode.l10n.t("\u542B merge \u5728\u5185\uFF0C\u4E0D\u8FC7\u6EE4"),
            value: "all" as const,
        },
    ], {
        title: vscode.l10n.t("\u6279\u91CF\u4F18\u9009"),
        placeHolder: vscode.l10n.t("\u9009\u62E9\u5217\u8868\u8303\u56F4\uFF08Enter \u786E\u8BA4\uFF09"),
    });
    return picked?.value ?? "cancel";
}
/** 紧凑自定义筛选：固定 3 步，可跳过 */
async function runCompactCustomFilters(allCommits: CherryPickCommitInfo[]): Promise<CherryPickFilterState | null> {
    const mergeMode = await vscode.window.showQuickPick([
        {
            label: vscode.l10n.t("\u6392\u9664 merge \u63D0\u4EA4"),
            description: vscode.l10n.t("\u63A8\u8350"),
            value: "exclude_merge" as const,
        },
        { label: vscode.l10n.t("\u663E\u793A\u5168\u90E8"), value: "all" as const },
        { label: vscode.l10n.t("\u4EC5 merge \u63D0\u4EA4"), value: "only_merge" as const },
    ], { title: "1/3 · Merge", placeHolder: vscode.l10n.t("\u9009\u62E9 merge \u89C4\u5219") });
    if (!mergeMode) {
        return null;
    }
    const authors = await pickAuthorsStep(allCommits);
    if (authors === undefined) {
        return null;
    }
    const timeRange = await pickTimeStep();
    if (timeRange === undefined) {
        return null;
    }
    return {
        mergeMode: mergeMode.value,
        authors,
        since: timeRange.since,
        until: timeRange.until,
    };
}
async function pickAuthorsStep(allCommits: CherryPickCommitInfo[]): Promise<string[] | undefined> {
    const unique = collectUniqueAuthors(allCommits);
    if (unique.length === 0) {
        return [];
    }
    const picked = await vscode.window.showQuickPick([
        {
            label: vscode.l10n.t("$(check) \u4E0D\u9650\u63D0\u4EA4\u4EBA"),
            description: vscode.l10n.t("\u8DF3\u8FC7\u6B64\u6761\u4EF6"),
            value: "__all__",
        },
        ...unique.map((author) => ({
            label: author,
            value: author,
        })),
    ], {
        title: vscode.l10n.t("2/3 \u00B7 \u63D0\u4EA4\u4EBA"),
        placeHolder: vscode.l10n.t("\u53EF\u591A\u9009\uFF1B\u9009\u300C\u4E0D\u9650\u300D\u6216\u7559\u7A7A\u5373\u5168\u90E8"),
        canPickMany: true,
    });
    if (!picked) {
        return undefined;
    }
    if (picked.length === 0 || picked.some((p) => p.value === "__all__")) {
        return [];
    }
    return picked.map((p) => p.value).filter((v) => v !== "__all__");
}
async function pickTimeStep(): Promise<{
    since?: Date;
    until?: Date;
} | undefined> {
    const now = new Date();
    const picked = await vscode.window.showQuickPick([
        {
            label: vscode.l10n.t("$(check) \u4E0D\u9650\u65F6\u95F4"),
            description: vscode.l10n.t("\u8DF3\u8FC7\u6B64\u6761\u4EF6"),
            value: "none",
        },
        { label: vscode.l10n.t("\u6700\u8FD1 7 \u5929"), value: "7d" },
        { label: vscode.l10n.t("\u6700\u8FD1 30 \u5929"), value: "30d" },
        { label: vscode.l10n.t("\u6700\u8FD1 90 \u5929"), value: "90d" },
    ], { title: vscode.l10n.t("3/3 \u00B7 \u65F6\u95F4"), placeHolder: vscode.l10n.t("\u9009\u62E9\u65F6\u95F4\u8303\u56F4") });
    if (!picked) {
        return undefined;
    }
    switch (picked.value) {
        case "none":
            return {};
        case "7d":
            return { since: daysAgo(7), until: now };
        case "30d":
            return { since: daysAgo(30), until: now };
        case "90d":
            return { since: daysAgo(90), until: now };
        default:
            return {};
    }
}
function daysAgo(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d;
}
function pickCommitsWithSearch(allCommits: CherryPickCommitInfo[], filterState: CherryPickFilterState): Promise<CherryPickCommitInfo[] | null> {
    const priority = getCherryPickFilterPriorityFromConfig();
    const filtered = applyCherryPickFilters(allCommits, filterState, priority);
    if (filtered.length === 0) {
        vscode.window.showWarningMessage(vscode.l10n.t("\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u63D0\u4EA4\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u7B5B\u9009\u65B9\u5F0F"));
        return selectCommitsForCherryPick(allCommits);
    }
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value: CherryPickCommitInfo[] | null) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(value);
        };
        const quickPick = vscode.window.createQuickPick<CommitPickItem>();
        quickPick.canSelectMany = true;
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;
        quickPick.placeholder = vscode.l10n.t("\u8F93\u5165\u5173\u952E\u5B57\u641C\u7D22\uFF1B\u53EF\u591A\u9009\uFF1B\u6309\u4ECE\u65E7\u5230\u65B0\u987A\u5E8F\u4F18\u9009");
        quickPick.title = vscode.l10n.t("\u9009\u62E9\u63D0\u4EA4\uFF08{0}/{1}\uFF09\u00B7 {2}", String(filtered.length), String(allCommits.length), String(describeFilterState(filterState)));
        quickPick.buttons = [
            {
                iconPath: new vscode.ThemeIcon("filter"),
                tooltip: vscode.l10n.t("\u91CD\u65B0\u9009\u62E9\u7B5B\u9009\u65B9\u5F0F"),
            },
        ];
        const bindItems = (commits: CherryPickCommitInfo[]) => {
            quickPick.items = commits.map((commit, index) => ({
                label: `${commit.shortHash} ${commit.subject}${commit.isMergeCommit ? " $(git-merge)" : ""}`,
                description: `${commit.author} · ${commit.date}`,
                detail: commit.hash,
                commit,
                sequence: index,
            }));
        };
        bindItems(filtered);
        quickPick.show();
        quickPick.onDidTriggerButton(async () => {
            quickPick.hide();
            finish(await selectCommitsForCherryPick(allCommits));
        });
        quickPick.onDidAccept(() => {
            const selected = quickPick.selectedItems;
            quickPick.hide();
            if (selected.length === 0) {
                finish([]);
                return;
            }
            finish([...selected]
                .sort((a, b) => a.sequence - b.sequence)
                .map((item) => item.commit));
        });
        quickPick.onDidHide(() => {
            if (!settled) {
                finish(null);
            }
        });
    });
}
