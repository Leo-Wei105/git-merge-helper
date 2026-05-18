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

  const valid = configured.filter((d): d is CherryPickFilterDimension =>
    ["merge", "author", "time", "keyword"].includes(d)
  );

  const order: CherryPickFilterDimension[] = [...new Set(valid)].filter(
    (d): d is CherryPickFilterDimension => d !== "keyword"
  );
  for (const dim of DEFAULT_PRIORITY) {
    if (!order.includes(dim)) {
      order.push(dim);
    }
  }
  return order;
}

export function applyCherryPickFilters(
  commits: CherryPickCommitInfo[],
  state: CherryPickFilterState,
  priority: CherryPickFilterDimension[] = getCherryPickFilterPriorityFromConfig()
): CherryPickCommitInfo[] {
  let result = [...commits];
  for (const dimension of priority) {
    if (dimension === "keyword") {
      continue;
    }
    result = applyDimensionFilter(result, state, dimension);
  }
  return result;
}

function applyDimensionFilter(
  commits: CherryPickCommitInfo[],
  state: CherryPickFilterState,
  dimension: CherryPickFilterDimension
): CherryPickCommitInfo[] {
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
      return commits.filter((c) =>
        state.authors
          .map((a) => a.trim().toLowerCase())
          .includes(c.author.trim().toLowerCase())
      );
    case "time":
      return commits.filter((c) => matchesTimeRange(c, state.since, state.until));
    default:
      return commits;
  }
}

function matchesTimeRange(
  commit: CherryPickCommitInfo,
  since?: Date,
  until?: Date
): boolean {
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
    parts.push("已排除 merge");
  } else if (state.mergeMode === "only_merge") {
    parts.push("仅 merge");
  }
  if (state.authors.length > 0) {
    parts.push(state.authors.join(", "));
  }
  if (state.since || state.until) {
    parts.push("已限时间");
  }
  return parts.length > 0 ? parts.join(" · ") : "未筛选";
}

function collectUniqueAuthors(commits: CherryPickCommitInfo[]): string[] {
  return [...new Set(commits.map((c) => c.author.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b)
  );
}

/**
 * 简化后的优选提交流程：入口 →（可选 3 步筛选）→ 搜索多选
 */
export async function selectCommitsForCherryPick(
  allCommits: CherryPickCommitInfo[]
): Promise<CherryPickCommitInfo[] | null> {
  const entry = await askFilterEntry();
  if (entry === "cancel") {
    return null;
  }

  let filterState: CherryPickFilterState;
  if (entry === "all") {
    filterState = { authors: [], mergeMode: "all" };
  } else if (entry === "custom") {
    const custom = await runCompactCustomFilters(allCommits);
    if (!custom) {
      return null;
    }
    filterState = custom;
  } else {
    filterState = getDefaultCherryPickFilterState();
  }

  return pickCommitsWithSearch(allCommits, filterState);
}

/** @deprecated 使用 selectCommitsForCherryPick */
export const configureAndFilterCommits = selectCommitsForCherryPick;

async function askFilterEntry(): Promise<FilterEntryMode> {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "$(star-full) 推荐",
        description: "排除 merge 提交，进入列表多选（多数情况选这项）",
        value: "recommended" as const,
      },
      {
        label: "$(settings-gear) 自定义筛选",
        description: "最多 3 步：merge → 提交人 → 时间",
        value: "custom" as const,
      },
      {
        label: "$(list-flat) 显示全部",
        description: "含 merge 在内，不过滤",
        value: "all" as const,
      },
    ],
    {
      title: "批量优选",
      placeHolder: "选择列表范围（Enter 确认）",
    }
  );

  return picked?.value ?? "cancel";
}

/** 紧凑自定义筛选：固定 3 步，可跳过 */
async function runCompactCustomFilters(
  allCommits: CherryPickCommitInfo[]
): Promise<CherryPickFilterState | null> {
  const mergeMode = await vscode.window.showQuickPick(
    [
      {
        label: "排除 merge 提交",
        description: "推荐",
        value: "exclude_merge" as const,
      },
      { label: "显示全部", value: "all" as const },
      { label: "仅 merge 提交", value: "only_merge" as const },
    ],
    { title: "1/3 · Merge", placeHolder: "选择 merge 规则" }
  );
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

async function pickAuthorsStep(
  allCommits: CherryPickCommitInfo[]
): Promise<string[] | undefined> {
  const unique = collectUniqueAuthors(allCommits);
  if (unique.length === 0) {
    return [];
  }

  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "$(check) 不限提交人",
        description: "跳过此条件",
        value: "__all__",
      },
      ...unique.map((author) => ({
        label: author,
        value: author,
      })),
    ],
    {
      title: "2/3 · 提交人",
      placeHolder: "可多选；选「不限」或留空即全部",
      canPickMany: true,
    }
  );

  if (!picked) {
    return undefined;
  }
  if (picked.length === 0 || picked.some((p) => p.value === "__all__")) {
    return [];
  }
  return picked.map((p) => p.value).filter((v) => v !== "__all__");
}

async function pickTimeStep(): Promise<
  { since?: Date; until?: Date } | undefined
> {
  const now = new Date();
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "$(check) 不限时间",
        description: "跳过此条件",
        value: "none",
      },
      { label: "最近 7 天", value: "7d" },
      { label: "最近 30 天", value: "30d" },
      { label: "最近 90 天", value: "90d" },
    ],
    { title: "3/3 · 时间", placeHolder: "选择时间范围" }
  );

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

function pickCommitsWithSearch(
  allCommits: CherryPickCommitInfo[],
  filterState: CherryPickFilterState
): Promise<CherryPickCommitInfo[] | null> {
  const priority = getCherryPickFilterPriorityFromConfig();
  const filtered = applyCherryPickFilters(allCommits, filterState, priority);

  if (filtered.length === 0) {
    vscode.window.showWarningMessage(
      "没有符合条件的提交，请重新选择筛选方式"
    );
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
    quickPick.placeholder =
      "输入关键字搜索；可多选；按从旧到新顺序优选";
    quickPick.title = `选择提交（${filtered.length}/${allCommits.length}）· ${describeFilterState(filterState)}`;
    quickPick.buttons = [
      {
        iconPath: new vscode.ThemeIcon("filter"),
        tooltip: "重新选择筛选方式",
      },
    ];

    const bindItems = (commits: CherryPickCommitInfo[]) => {
      quickPick.items = commits.map((commit, index) => ({
        label: `${commit.shortHash} ${commit.subject}${
          commit.isMergeCommit ? " $(git-merge)" : ""
        }`,
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
      finish(
        [...selected]
          .sort((a, b) => a.sequence - b.sequence)
          .map((item) => item.commit)
      );
    });

    quickPick.onDidHide(() => {
      if (!settled) {
        finish(null);
      }
    });
  });
}
