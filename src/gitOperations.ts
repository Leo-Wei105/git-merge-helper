import { exec, execFile } from "child_process";
import { promisify } from "util";
import { AppError } from "./errors";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/** 当前分支的创建基分支解析结果 */
export interface BranchBaseInfo {
  branchName: string;
  baseBranch: string | null;
  baseCommit?: string;
  source: "config" | "reflog" | "inferred" | "unknown";
  /** 多个候选基分支（无法唯一确定时） */
  candidates?: string[];
}

/** 进行中的 Git 序列化操作（合并 / 回滚 / cherry-pick / rebase） */
export type GitSequencerOperation = "merge" | "revert" | "cherry_pick" | "rebase";

/** revert merge 的执行结果 */
export type RevertMergeResult =
  | { status: "staged" }
  | { status: "conflicts"; conflictFiles: string[] };

/** 可 cherry-pick 的提交（在源分支上、尚未包含于当前分支） */
export interface CherryPickCommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  /** 是否为 merge 提交（父提交数 > 1） */
  isMergeCommit: boolean;
}

export type CherryPickOutcome = "success" | "conflicts" | "empty";

/** 当前分支历史上最近的一次 merge 提交信息 */
export interface LatestMergeCommit {
  hash: string;
  subject: string;
  parentHashes: string[];
  /** 被合并分支的参考名（从第二父提交解析，可能为空） */
  mergedBranchHint?: string;
}

/**
 * Git操作类 - 负责所有Git命令操作
 */
export class GitOperations {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * 执行Git命令并返回输出
   */
  async execGitCommand(command: string): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workspaceRoot,
        encoding: "utf8",
      });

      if (stderr && !stderr.includes("warning")) {
        console.warn("Git命令警告:", stderr);
      }

      return stdout.trim();
    } catch (error: any) {
      const errorMessage = error.stderr || error.message || "未知错误";
      throw AppError.gitFailed(`Git命令执行失败: ${errorMessage}`, "execGitCommand", error);
    }
  }

  /**
   * 使用参数数组执行Git命令，避免命令注入和转义问题
   */
  async execGitArgs(args: string[]): Promise<string> {
    try {
      const { stdout, stderr } = await execFileAsync("git", args, {
        cwd: this.workspaceRoot,
        encoding: "utf8",
      });

      if (stderr && !stderr.includes("warning")) {
        console.warn("Git命令警告:", stderr);
      }

      return stdout.trim();
    } catch (error: any) {
      const errorMessage = error.stderr || error.message || "未知错误";
      const renderedArgs = args.join(" ");
      throw AppError.gitFailed(
        `Git命令执行失败(git ${renderedArgs}): ${errorMessage}`,
        "execGitArgs",
        error
      );
    }
  }

  /**
   * 检查Git仓库状态
   */
  async checkGitRepository(): Promise<boolean> {
    try {
      await this.execGitArgs(["status"]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取当前分支名
   */
  async getCurrentBranch(): Promise<string> {
    return await this.execGitArgs(["branch", "--show-current"]);
  }

  /**
   * 检查是否有未提交的更改
   */
  async checkUncommittedChanges(): Promise<boolean> {
    const status = await this.execGitArgs(["status", "--porcelain"]);
    return status.length > 0;
  }

  /**
   * 检查是否存在已暂存但未提交的更改
   */
  async checkStagedChanges(): Promise<boolean> {
    const staged = await this.execGitArgs(["diff", "--cached", "--name-only"]);
    return staged.length > 0;
  }

  /**
   * 检查是否存在未暂存的工作区更改
   */
  async checkUnstagedChanges(): Promise<boolean> {
    const unstaged = await this.execGitArgs(["diff", "--name-only"]);
    return unstaged.length > 0;
  }

  /**
   * 获取 Git 配置的用户名
   */
  async getGitUserName(): Promise<string> {
    try {
      return (await this.execGitArgs(["config", "user.name"])).trim();
    } catch {
      return "";
    }
  }

  /**
   * 检查是否存在合并冲突
   */
  async checkMergeConflicts(): Promise<boolean> {
    try {
      const status = await this.execGitArgs(["status", "--porcelain"]);
      return status.split("\n").some((line) => {
        const statusCode = line.substring(0, 2);
        return ["UU", "AA", "DD", "AU", "UA", "DU", "UD"].includes(statusCode);
      });
    } catch {
      return false;
    }
  }

  /**
   * 获取冲突文件列表
   */
  async getConflictFiles(): Promise<string[]> {
    try {
      const status = await this.execGitArgs([
        "diff",
        "--name-only",
        "--diff-filter=U",
      ]);
      return status ? status.split("\n").filter((file) => file.trim()) : [];
    } catch {
      return [];
    }
  }

  /**
   * 检查远程分支是否存在
   */
  async checkRemoteBranchExists(branchName: string): Promise<boolean> {
    try {
      const remoteBranch = await this.execGitArgs([
        "ls-remote",
        "--heads",
        "origin",
        branchName,
      ]);
      return !!remoteBranch;
    } catch {
      return false;
    }
  }

  /**
   * 拉取远程引用信息（不合并代码）
   */
  async fetchRemote(remoteName: string = "origin"): Promise<void> {
    await this.execGitArgs(["fetch", remoteName]);
  }

  /**
   * 推送分支到远程
   */
  async pushBranch(
    branchName: string,
    setUpstream: boolean = false
  ): Promise<void> {
    const args = setUpstream
      ? ["push", "-u", "origin", branchName]
      : ["push", "origin", branchName];
    await this.execGitArgs(args);
  }

  /**
   * 推送到远程（--force-with-lease，远程有他人新提交时会拒绝）
   */
  async pushBranchForceWithLease(
    branchName: string,
    remoteName: string = "origin",
    setUpstream: boolean = false
  ): Promise<void> {
    const args = ["push", "--force-with-lease"];
    if (setUpstream) {
      args.push("-u");
    }
    args.push(remoteName, branchName);
    await this.execGitArgs(args);
  }

  /**
   * 获取当前分支的上游引用（如 origin/main），无上游时返回 undefined
   */
  async getBranchUpstream(branchName: string): Promise<string | undefined> {
    try {
      return await this.execGitArgs([
        "rev-parse",
        "--abbrev-ref",
        `${branchName}@{upstream}`,
      ]);
    } catch {
      return undefined;
    }
  }

  /**
   * 检查本地分支是否存在
   */
  async checkLocalBranchExists(branchName: string): Promise<boolean> {
    try {
      await this.execGitArgs(["show-ref", "--verify", `refs/heads/${branchName}`]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 使用Git原生命令验证分支名合法性
   */
  async validateBranchNameWithGit(branchName: string): Promise<{ isValid: boolean; error?: string }> {
    if (!branchName || branchName.trim().length === 0) {
      return { isValid: false, error: "分支名称不能为空" };
    }

    try {
      await this.execGitArgs(["check-ref-format", "--branch", branchName]);
      return { isValid: true };
    } catch (error: any) {
      const message = error?.message || "分支名称不符合Git规则";
      return { isValid: false, error: `分支名不合法: ${message}` };
    }
  }

  /**
   * 切换分支（如果本地不存在则从远程创建）
   */
  async checkoutBranch(branchName: string, baseRef?: string): Promise<void> {
    const localExists = await this.checkLocalBranchExists(branchName);
    
    if (localExists) {
      await this.execGitArgs(["checkout", branchName]);
    } else {
      // 检查远程是否存在
      const remoteExists = await this.checkRemoteBranchExists(branchName);
      if (remoteExists) {
        // 从远程创建本地分支并切换
        await this.execGitArgs([
          "checkout",
          "-b",
          branchName,
          `origin/${branchName}`,
        ]);
      } else {
        // 只有显式提供 baseRef 时才允许创建新分支，避免误从当前分支派生
        if (!baseRef) {
          throw new AppError(
            `分支 ${branchName} 在本地和远程均不存在，已阻止自动创建`,
            "UNKNOWN",
            { stage: "checkoutBranch" }
          );
        }
        await this.execGitArgs(["checkout", "-b", branchName, baseRef]);
      }
    }
  }

  /**
   * 拉取远程分支
   */
  async pullBranch(branchName: string): Promise<void> {
    await this.execGitArgs(["pull", "origin", branchName]);
  }

  /**
   * 合并分支
   */
  async mergeBranch(sourceBranch: string): Promise<void> {
    await this.execGitArgs(["merge", sourceBranch]);
  }

  /**
   * 提交更改
   */
  async stageAllChanges(): Promise<void> {
    await this.execGitArgs(["add", "."]);
  }

  /**
   * 仅提交已暂存的更改
   */
  async commitStagedChanges(message: string): Promise<void> {
    await this.execGitArgs(["commit", "-m", message]);
  }

  /**
   * 暂存全部并提交
   */
  async commitAllChanges(message: string): Promise<void> {
    await this.stageAllChanges();
    await this.commitStagedChanges(message);
  }

  /**
   * 中止合并
   */
  async abortMerge(): Promise<void> {
    await this.execGitArgs(["merge", "--abort"]);
  }

  async isCherryPickInProgress(): Promise<boolean> {
    try {
      await this.execGitArgs(["rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD"]);
      return true;
    } catch {
      return false;
    }
  }

  async isRebaseInProgress(): Promise<boolean> {
    try {
      await this.execGitArgs(["rev-parse", "-q", "--verify", "REBASE_HEAD"]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检测当前进行中的 Git 序列化操作（优先级：merge > revert > cherry-pick > rebase）
   */
  async detectGitSequencerOperation(): Promise<GitSequencerOperation | null> {
    if (await this.isMergeInProgress()) {
      return "merge";
    }
    if (await this.isRevertInProgress()) {
      return "revert";
    }
    if (await this.isCherryPickInProgress()) {
      return "cherry_pick";
    }
    if (await this.isRebaseInProgress()) {
      return "rebase";
    }
    return null;
  }

  async isGitSequencerActive(operation: GitSequencerOperation): Promise<boolean> {
    switch (operation) {
      case "merge":
        return this.isMergeInProgress();
      case "revert":
        return this.isRevertInProgress();
      case "cherry_pick":
        return this.isCherryPickInProgress();
      case "rebase":
        return this.isRebaseInProgress();
    }
  }

  async abortGitSequencerOperation(operation: GitSequencerOperation): Promise<void> {
    switch (operation) {
      case "merge":
        await this.abortMerge();
        return;
      case "revert":
        await this.abortRevert();
        return;
      case "cherry_pick":
        await this.abortCherryPick();
        return;
      case "rebase":
        await this.abortRebase();
        return;
    }
  }

  async abortCherryPick(): Promise<void> {
    await this.execGitArgs(["cherry-pick", "--abort"]);
  }

  async abortRebase(): Promise<void> {
    await this.execGitArgs(["rebase", "--abort"]);
  }

  async continueCherryPick(): Promise<void> {
    await this.execGitArgs(["cherry-pick", "--continue"]);
  }

  async cherryPickSkip(): Promise<void> {
    await this.execGitArgs(["cherry-pick", "--skip"]);
  }

  /**
   * 列出源分支上尚未包含于当前分支（HEAD）的提交，按时间从旧到新
   */
  async getCherryPickCandidates(
    sourceBranch: string,
    maxCount: number = 50
  ): Promise<CherryPickCommitInfo[]> {
    const limit = Math.min(200, Math.max(1, Math.floor(maxCount)));
    let output: string;
    try {
      output = await this.execGitArgs([
        "log",
        `HEAD..${sourceBranch}`,
        `--max-count=${limit}`,
        "--reverse",
        "--format=%H%x1e%s%x1e%an%x1e%ci%x1e%P",
      ]);
    } catch {
      return [];
    }

    if (!output.trim()) {
      return [];
    }

    return output
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [hash, subject, author, date, parents] = line.split("\x1e");
        const parentHashes = (parents || "").trim().split(/\s+/).filter(Boolean);
        return {
          hash,
          shortHash: hash.slice(0, 7),
          subject: subject || "",
          author: author || "",
          date: date || "",
          isMergeCommit: parentHashes.length > 1,
        };
      });
  }

  /**
   * 将单个提交 cherry-pick 到当前分支
   */
  async cherryPickCommit(
    commitHash: string,
    recordOrigin: boolean = true
  ): Promise<CherryPickOutcome> {
    const args = ["cherry-pick"];
    if (recordOrigin) {
      args.push("-x");
    }
    args.push(commitHash);

    try {
      await this.execGitArgs(args);
      return "success";
    } catch (error: unknown) {
      const message =
        error instanceof AppError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      const lower = message.toLowerCase();

      if (
        lower.includes("empty") ||
        lower.includes("为空") ||
        lower.includes("now empty")
      ) {
        return "empty";
      }

      if (
        (await this.checkMergeConflicts()) ||
        (await this.isCherryPickInProgress())
      ) {
        return "conflicts";
      }

      throw AppError.gitFailed(
        `Cherry-pick 失败: ${message}`,
        "cherryPickCommit",
        error
      );
    }
  }

  async continueRebase(): Promise<void> {
    await this.execGitArgs(["rebase", "--continue"]);
  }

  /**
   * 合并冲突解决后完成 merge 提交
   */
  async completeMergeAfterConflicts(
    commitMessage: string = "feat: 合并冲突解决"
  ): Promise<void> {
    if (!(await this.isMergeInProgress())) {
      return;
    }
    if (await this.checkMergeConflicts()) {
      throw new AppError("仍存在未解决的冲突", "UNKNOWN", {
        stage: "completeMergeAfterConflicts",
      });
    }
    if (!(await this.checkStagedChanges())) {
      await this.stageAllChanges();
    }
    await this.commitStagedChanges(commitMessage);
  }

  /**
   * 是否处于未完成的 merge 状态
   */
  async isMergeInProgress(): Promise<boolean> {
    try {
      await this.execGitArgs(["rev-parse", "-q", "--verify", "MERGE_HEAD"]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取「其他分支合入当前分支」的最近一次 merge 提交。
   * 使用 --first-parent，只沿当前分支主线查找，避免误选并入历史的、发生在别的分支上的 merge。
   * revert 时使用 -m 1（第一父提交为合入前的当前分支尖端）。
   */
  async getLatestIncomingMergeCommit(
    branchName?: string
  ): Promise<LatestMergeCommit | null> {
    const branch = branchName ?? (await this.getCurrentBranch());
    if (!branch) {
      return null;
    }

    let output: string;
    try {
      output = await this.execGitArgs([
        "log",
        branch,
        "-1",
        "--first-parent",
        "--merges",
        "--format=%H%x1e%s%x1e%P",
      ]);
    } catch {
      return null;
    }

    if (!output) {
      return null;
    }

    const parts = output.split("\x1e");
    if (parts.length < 3) {
      return null;
    }

    const [hash, subject, parentsLine] = parts;
    const parentHashes = parentsLine.trim().split(/\s+/).filter(Boolean);
    if (parentHashes.length < 2) {
      return null;
    }

    const mergedBranchHint = await this.resolveBranchHintForCommit(
      parentHashes[1],
      branch
    );

    return {
      hash,
      subject,
      parentHashes,
      mergedBranchHint,
    };
  }

  /**
   * 根据提交解析可读的引用名（优先本地分支）
   */
  private async resolveBranchHintForCommit(
    commitHash: string,
    excludeBranch?: string
  ): Promise<string | undefined> {
    try {
      const branches = await this.execGitArgs([
        "branch",
        "-a",
        "--points-at",
        commitHash,
        "--format=%(refname:short)",
      ]);
      const candidates = branches
        .split("\n")
        .map((b) => b.trim())
        .filter((b) => {
          if (!b || b.endsWith("/HEAD")) {
            return false;
          }
          if (!excludeBranch) {
            return true;
          }
          return (
            b !== excludeBranch &&
            b !== `origin/${excludeBranch}` &&
            b !== `refs/heads/${excludeBranch}`
          );
        });
      if (candidates.length === 0) {
        return undefined;
      }
      const local = candidates.find((b) => !b.startsWith("origin/"));
      return local ?? candidates[0];
    } catch {
      return undefined;
    }
  }

  /**
   * 是否处于未完成的 revert 状态
   */
  async isRevertInProgress(): Promise<boolean> {
    try {
      await this.execGitArgs(["rev-parse", "-q", "--verify", "REVERT_HEAD"]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 硬重置到指定提交（丢弃该提交之后的本地提交）
   */
  async resetHardToCommit(commitHash: string): Promise<void> {
    await this.execGitArgs(["reset", "--hard", commitHash]);
  }

  /**
   * 中止进行中的 revert
   */
  async abortRevert(): Promise<void> {
    await this.execGitArgs(["revert", "--abort"]);
  }

  /**
   * 在冲突解决后继续完成 revert
   * @param skipHooks 为 true 时用 git commit --no-verify 完成（revert --continue 不支持 --no-verify）
   */
  async continueRevert(options?: { skipHooks?: boolean }): Promise<void> {
    if (options?.skipHooks) {
      await this.execGitArgs(["commit", "--no-edit", "--no-verify"]);
      return;
    }
    await this.execGitArgs(["revert", "--continue", "--no-edit"]);
  }

  /**
   * 统计某提交之后当前分支新增的提交数
   */
  async countCommitsSince(commitHash: string): Promise<number> {
    try {
      const count = await this.execGitArgs([
        "rev-list",
        "--count",
        `${commitHash}..HEAD`,
      ]);
      return parseInt(count, 10) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * 预检 revert 是否会产生冲突（执行后立即 abort，不改变仓库最终状态）
   */
  async previewRevertMergeConflicts(
    commitHash: string,
    mainlineParent: number = 1
  ): Promise<string[]> {
    try {
      await this.execGitArgs([
        "revert",
        "-m",
        String(mainlineParent),
        "--no-commit",
        commitHash,
      ]);
    } catch {
      // 可能已部分应用并产生冲突
    }

    const conflictFiles = await this.getConflictFiles();

    try {
      if (await this.isRevertInProgress()) {
        await this.abortRevert();
      }
    } catch {
      // 尽力恢复干净状态
    }

    return conflictFiles;
  }

  /**
   * 安全回滚 merge：先 --no-commit，无冲突再 --continue 生成提交
   */
  async revertMergeCommitSafe(
    commitHash: string,
    mainlineParent: number = 1
  ): Promise<RevertMergeResult> {
    try {
      await this.execGitArgs([
        "revert",
        "-m",
        String(mainlineParent),
        "--no-commit",
        commitHash,
      ]);
    } catch {
      if (
        (await this.isRevertInProgress()) ||
        (await this.checkMergeConflicts())
      ) {
        return {
          status: "conflicts",
          conflictFiles: await this.getConflictFiles(),
        };
      }
      throw AppError.gitFailed(
        "启动 revert 失败",
        "revertMergeCommitSafe"
      );
    }

    if (await this.checkMergeConflicts()) {
      return {
        status: "conflicts",
        conflictFiles: await this.getConflictFiles(),
      };
    }

    return { status: "staged" };
  }

  /**
   * 确保分支有正确的上游关联
   */
  async ensureBranchUpstream(branchName: string): Promise<void> {
    try {
      const remoteExists = await this.checkRemoteBranchExists(branchName);
      if (!remoteExists) {
        return;
      }

      const upstream = await this.execGitArgs([
        "rev-parse",
        "--abbrev-ref",
        `${branchName}@{upstream}`,
      ]).catch(() => null);
      
      if (upstream !== `origin/${branchName}`) {
        await this.execGitArgs([
          "branch",
          `--set-upstream-to=origin/${branchName}`,
          branchName,
        ]);
      }
    } catch (error: any) {
      if (error.message?.includes("no upstream")) {
        const remoteExists = await this.checkRemoteBranchExists(branchName);
        if (remoteExists) {
          await this.execGitArgs([
            "branch",
            `--set-upstream-to=origin/${branchName}`,
            branchName,
          ]);
        }
      }
    }
  }

  private branchBaseConfigKey(branchName: string): string {
    return `branch.${branchName}.gitWorkflowHelper.base`;
  }

  /**
   * 记录分支创建时所基于的分支（写入本地 git config）
   */
  async setBranchCreationBase(
    branchName: string,
    baseBranch: string
  ): Promise<void> {
    await this.execGitArgs([
      "config",
      this.branchBaseConfigKey(branchName),
      baseBranch,
    ]);
  }

  /**
   * 读取插件记录的创建基分支
   */
  async getBranchCreationBase(branchName: string): Promise<string | undefined> {
    try {
      const value = await this.execGitArgs([
        "config",
        "--get",
        this.branchBaseConfigKey(branchName),
      ]);
      return value || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 列出本地与远程分支名（去重）
   */
  async listBranchNames(): Promise<string[]> {
    const names = new Set<string>();
    const local = await this.execGitArgs(["branch", "--format=%(refname:short)"]);
    local
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean)
      .forEach((n) => names.add(n));

    try {
      const remote = await this.execGitArgs([
        "branch",
        "-r",
        "--format=%(refname:short)",
      ]);
      remote
        .split("\n")
        .map((n) => n.trim())
        .filter((n) => n && !n.includes("HEAD"))
        .forEach((n) => names.add(n));
    } catch {
      // 无远程分支时忽略
    }

    return [...names];
  }

  /**
   * 解析当前分支基于哪个分支创建
   */
  async resolveBranchBaseInfo(
    branchName: string,
    extraCandidates: string[] = []
  ): Promise<BranchBaseInfo> {
    const fromConfig = await this.getBranchCreationBase(branchName);
    if (fromConfig) {
      return {
        branchName,
        baseBranch: fromConfig,
        source: "config",
        baseCommit: await this.getBranchForkCommit(branchName),
      };
    }

    const fromReflog = await this.inferBaseFromReflog(branchName);
    if (fromReflog.baseBranch) {
      return {
        branchName,
        baseBranch: fromReflog.baseBranch,
        baseCommit: fromReflog.baseCommit,
        source: "reflog",
      };
    }
    if (fromReflog.candidates?.length) {
      return {
        branchName,
        baseBranch: null,
        baseCommit: fromReflog.baseCommit,
        source: "reflog",
        candidates: fromReflog.candidates,
      };
    }

    const candidates = [
      ...new Set([...(await this.listBranchNames()), ...extraCandidates]),
    ].filter((name) => name !== branchName);

    const inferred = await this.inferBaseFromForkPoint(branchName, candidates);
    if (inferred.baseBranch) {
      return {
        branchName,
        baseBranch: inferred.baseBranch,
        baseCommit: inferred.baseCommit,
        source: "inferred",
      };
    }
    if (inferred.candidates?.length) {
      return {
        branchName,
        baseBranch: null,
        candidates: inferred.candidates,
        source: "inferred",
      };
    }

    return { branchName, baseBranch: null, source: "unknown" };
  }

  /**
   * 获取分支创建时指向的提交（reflog 最早一条）
   */
  private async getBranchForkCommit(branchName: string): Promise<string | undefined> {
    try {
      const hash = await this.execGitArgs([
        "reflog",
        "show",
        branchName,
        "--reverse",
        "--format=%H",
        "-1",
      ]);
      return hash || undefined;
    } catch {
      return undefined;
    }
  }

  private normalizeBranchRef(ref: string): string {
    return ref
      .replace(/^refs\/heads\//, "")
      .replace(/^refs\/remotes\/origin\//, "origin/")
      .trim();
  }

  private async inferBaseFromReflog(branchName: string): Promise<{
    baseBranch?: string;
    baseCommit?: string;
    candidates?: string[];
  }> {
    let output: string;
    try {
      output = await this.execGitArgs([
        "reflog",
        "show",
        branchName,
        "--format=%H %gs",
      ]);
    } catch {
      return {};
    }

    const entries = output.split("\n").filter((line) => line.trim());
    if (entries.length === 0) {
      return {};
    }

    const chronological = [...entries].reverse();

    for (const line of chronological) {
      const spaceIdx = line.indexOf(" ");
      if (spaceIdx <= 0) {
        continue;
      }
      const hash = line.slice(0, spaceIdx);
      const message = line.slice(spaceIdx + 1);

      const createdMatch = message.match(/^branch: Created from (.+)$/);
      if (createdMatch) {
        const ref = createdMatch[1].trim();
        if (ref !== "HEAD") {
          return {
            baseBranch: this.normalizeBranchRef(ref),
            baseCommit: hash,
          };
        }
        const pointingAt = await this.getBranchesPointingAtCommit(
          hash,
          branchName
        );
        if (pointingAt.length === 1) {
          return { baseBranch: pointingAt[0], baseCommit: hash };
        }
        if (pointingAt.length > 1) {
          return { candidates: pointingAt, baseCommit: hash };
        }
      }

      const checkoutMatch = message.match(/^checkout: moving from (.+) to (.+)$/);
      if (checkoutMatch && checkoutMatch[2] === branchName) {
        return {
          baseBranch: this.normalizeBranchRef(checkoutMatch[1]),
          baseCommit: hash,
        };
      }
    }

    return {};
  }

  private async getBranchesPointingAtCommit(
    commitHash: string,
    excludeBranch: string
  ): Promise<string[]> {
    try {
      const branches = await this.execGitArgs([
        "branch",
        "-a",
        "--points-at",
        commitHash,
        "--format=%(refname:short)",
      ]);
      return branches
        .split("\n")
        .map((b) => b.trim())
        .filter((b) => b && !b.endsWith("/HEAD") && b !== excludeBranch);
    } catch {
      return [];
    }
  }

  private async inferBaseFromForkPoint(
    branchName: string,
    candidates: string[]
  ): Promise<{
    baseBranch?: string;
    baseCommit?: string;
    candidates?: string[];
  }> {
    const scores: Array<{ name: string; behind: number; ahead: number }> = [];

    for (const candidate of candidates) {
      if (candidate === branchName) {
        continue;
      }
      try {
        const mergeBase = await this.execGitArgs([
          "merge-base",
          branchName,
          candidate,
        ]);
        const behind = parseInt(
          await this.execGitArgs([
            "rev-list",
            "--count",
            `${mergeBase}..${candidate}`,
          ]),
          10
        );
        const ahead = parseInt(
          await this.execGitArgs([
            "rev-list",
            "--count",
            `${mergeBase}..${branchName}`,
          ]),
          10
        );
        if (ahead > 0) {
          scores.push({ name: candidate, behind, ahead });
        }
      } catch {
        // 跳过无法比较的分支
      }
    }

    if (scores.length === 0) {
      return {};
    }

    scores.sort((a, b) => a.behind - b.behind || a.ahead - b.ahead);
    const best = scores[0];
    const ties = scores.filter(
      (s) => s.behind === best.behind && Math.abs(s.ahead - best.ahead) <= 2
    );

    if (ties.length > 1) {
      return { candidates: ties.map((t) => t.name) };
    }

    let baseCommit: string | undefined;
    try {
      baseCommit = await this.execGitArgs(["merge-base", branchName, best.name]);
    } catch {
      // ignore
    }

    return { baseBranch: best.name, baseCommit };
  }

  /**
   * 获取工作区根目录
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }
}
