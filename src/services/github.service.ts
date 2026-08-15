import { env } from "@/config/env.js";
import { logger } from "@/lib/logger.js";

const API = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;
/**
 * Repos we pull commits and branches for. Each costs two API calls, and the
 * unauthenticated budget is 60/hour, so this stays small.
 */
const ACTIVITY_REPO_LIMIT = 5;

export type GitHubActivity = {
  org: string;
  fetchedAt: string;
  authenticated: boolean;
  rateLimited: boolean;
  repositories: Array<{
    name: string;
    description: string | null;
    url: string;
    defaultBranch: string;
    language: string | null;
    openIssues: number;
    pushedAt: string | null;
  }>;
  commits: Array<{
    sha: string;
    message: string;
    author: string;
    avatarUrl: string | null;
    repo: string;
    url: string;
    committedAt: string;
  }>;
  pullRequests: Array<{
    number: number;
    title: string;
    author: string;
    avatarUrl: string | null;
    repo: string;
    url: string;
    state: string;
    isDraft: boolean;
    updatedAt: string;
  }>;
  issues: Array<{
    number: number;
    title: string;
    author: string;
    avatarUrl: string | null;
    repo: string;
    url: string;
    state: string;
    updatedAt: string;
  }>;
  branches: Array<{ repo: string; name: string; url: string; isDefault: boolean }>;
};

type CacheEntry = { value: GitHubActivity; expiresAt: number };
let cache: CacheEntry | null = null;
let inFlight: Promise<GitHubActivity> | null = null;

function headers(): Record<string, string> {
  const base: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "KStacks-Dashboard/1.0",
  };
  if (env.GITHUB_TOKEN) base.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return base;
}

/** Returns parsed JSON, or null on any failure — one bad call never fails the page. */
async function get<T>(path: string, rateLimited: { hit: boolean }): Promise<T | null> {
  try {
    const response = await fetch(`${API}${path}`, {
      headers: headers(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      rateLimited.hit = true;
      logger.warn("GitHub API rate limit reached; set GITHUB_TOKEN to raise it");
      return null;
    }
    if (!response.ok) {
      logger.warn({ path, status: response.status }, "GitHub request failed");
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    logger.warn({ err: error, path }, "GitHub request threw");
    return null;
  }
}

// Minimal shapes for the fields actually consumed.
type RepoDto = {
  name: string;
  description: string | null;
  html_url: string;
  default_branch: string;
  language: string | null;
  open_issues_count: number;
  pushed_at: string | null;
  fork: boolean;
};
type SearchDto = {
  items?: Array<{
    number: number;
    title: string;
    html_url: string;
    state: string;
    draft?: boolean;
    updated_at: string;
    repository_url: string;
    user: { login: string; avatar_url: string };
  }>;
};
type BranchDto = { name: string };
type CommitDto = {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name?: string; date?: string } | null };
  author: { login: string; avatar_url: string } | null;
};

function repoNameFrom(url: string): string {
  return url.split("/").pop() ?? "";
}

async function fetchActivity(): Promise<GitHubActivity> {
  const org = env.GITHUB_ORG;
  const rateLimited = { hit: false };

  const [repoData, prData, issueData] = await Promise.all([
    get<RepoDto[]>(`/orgs/${org}/repos?per_page=100&sort=pushed`, rateLimited),
    get<SearchDto>(
      `/search/issues?q=${encodeURIComponent(`org:${org} is:pr is:open`)}&sort=updated&per_page=15`,
      rateLimited,
    ),
    get<SearchDto>(
      `/search/issues?q=${encodeURIComponent(`org:${org} is:issue is:open`)}&sort=updated&per_page=15`,
      rateLimited,
    ),
  ]);

  const repositories = (repoData ?? [])
    .filter((repo) => !repo.fork)
    .map((repo) => ({
      name: repo.name,
      description: repo.description,
      url: repo.html_url,
      defaultBranch: repo.default_branch,
      language: repo.language,
      openIssues: repo.open_issues_count,
      pushedAt: repo.pushed_at,
    }));

  const toItems = (data: SearchDto | null) =>
    (data?.items ?? []).map((item) => ({
      number: item.number,
      title: item.title,
      author: item.user.login,
      avatarUrl: item.user.avatar_url ?? null,
      repo: repoNameFrom(item.repository_url),
      url: item.html_url,
      state: item.state,
      updatedAt: item.updated_at,
      isDraft: item.draft ?? false,
    }));

  const pullRequests = toItems(prData);

  // Commits and branches are per-repo calls, so only the most recently pushed
  // repos are covered. The org events feed was tried first and rejected: it
  // carries only public events and returned no pushes for this org at all.
  const activeRepos = repositories.slice(0, ACTIVITY_REPO_LIMIT);

  const perRepo = await Promise.all(
    activeRepos.map(async (repo) => {
      const [commitData, branchData] = await Promise.all([
        get<CommitDto[]>(`/repos/${org}/${repo.name}/commits?per_page=5`, rateLimited),
        get<BranchDto[]>(`/repos/${org}/${repo.name}/branches?per_page=20`, rateLimited),
      ]);

      return {
        commits: (commitData ?? []).map((entry) => ({
          sha: entry.sha.slice(0, 7),
          // Subject line only; commit bodies would swamp the feed.
          message: entry.commit.message.split("\n")[0] ?? entry.commit.message,
          author: entry.author?.login ?? entry.commit.author?.name ?? "unknown",
          avatarUrl: entry.author?.avatar_url ?? null,
          repo: repo.name,
          url: entry.html_url,
          committedAt: entry.commit.author?.date ?? new Date(0).toISOString(),
        })),
        branches: (branchData ?? []).map((branch) => ({
          repo: repo.name,
          name: branch.name,
          url: `https://github.com/${org}/${repo.name}/tree/${branch.name}`,
          isDefault: branch.name === repo.defaultBranch,
        })),
      };
    }),
  );

  const commits = perRepo
    .flatMap((entry) => entry.commits)
    .sort((a, b) => b.committedAt.localeCompare(a.committedAt))
    .slice(0, 20);

  return {
    org,
    fetchedAt: new Date().toISOString(),
    authenticated: Boolean(env.GITHUB_TOKEN),
    rateLimited: rateLimited.hit,
    repositories,
    commits,
    pullRequests,
    issues: toItems(issueData).map(({ isDraft: _isDraft, ...issue }) => issue),
    branches: perRepo.flatMap((entry) => entry.branches),
  };
}

/**
 * Cached org activity. The unauthenticated GitHub limit is 60 requests/hour and
 * a refresh costs ~10, so results are held for a while and concurrent callers
 * share one in-flight refresh rather than each triggering their own.
 */
export async function getActivity(force = false): Promise<GitHubActivity> {
  const now = Date.now();
  if (!force && cache && cache.expiresAt > now) return cache.value;
  if (inFlight) return inFlight;

  inFlight = fetchActivity()
    .then((value) => {
      // A rate-limited result is cached briefly so we back off rather than retry hard.
      const ttlMinutes = value.rateLimited ? 5 : env.GITHUB_CACHE_MINUTES;
      cache = { value, expiresAt: Date.now() + ttlMinutes * 60_000 };
      return value;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
