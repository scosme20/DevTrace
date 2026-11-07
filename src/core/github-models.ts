// Data observed on the GitHub REST API. Everything here is read-only and
// public: the integration never requests private repositories.

export const UNAVAILABLE_BEHAVIORS = ["SKIP", "FAIL"] as const;

export type UnavailableBehavior = (typeof UNAVAILABLE_BEHAVIORS)[number];

export interface GitHubCollectSettings {
  readonly description: boolean;
  readonly language: boolean;
  readonly stars: boolean;
  readonly forks: boolean;
  readonly releases: boolean;
  /** Bytes of code per language (one extra call per repository). Off unless set. */
  readonly languages?: boolean | undefined;
  /** Commits per day for the last 52 weeks (one extra call per repository). Off unless set. */
  readonly commitActivity?: boolean | undefined;
}

export interface GitHubRepositorySelection {
  /** Repository names (`name` or `owner/name`). Empty means "all public repositories". */
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly includeForks: boolean;
  readonly includeArchived: boolean;
}

/** Contents of `data/github.json`. It never holds credentials. */
export interface GitHubConfig {
  readonly version: 1;
  readonly username: string;
  readonly repositories: GitHubRepositorySelection;
  readonly collect: GitHubCollectSettings;
  /** What to do with a repository that cannot be read (missing, private, blocked). */
  readonly onUnavailable: UnavailableBehavior;
  /** A snapshot younger than this is reused instead of calling the API again. */
  readonly cacheTtlMinutes: number;
}

export interface GitHubRelease {
  readonly tagName: string;
  readonly name?: string | undefined;
  readonly publishedAt: string;
}

/** Bytes of code GitHub reports for a language. It is not time spent or skill. */
export interface RepositoryLanguage {
  readonly name: string;
  readonly bytes: number;
}

/** Commits on the default branch in one week, as GitHub counts them. */
export interface CommitWeek {
  /** The Sunday that starts the week, `YYYY-MM-DD`. */
  readonly weekStart: string;
  /** Sunday to Saturday. */
  readonly days: readonly number[];
}

export interface GitHubRepository {
  /** `owner/name`. */
  readonly fullName: string;
  readonly name: string;
  readonly url: string;
  readonly description?: string | undefined;
  readonly language?: string | undefined;
  readonly stars?: number | undefined;
  readonly forks?: number | undefined;
  readonly archived: boolean;
  readonly fork: boolean;
  readonly createdAt: string;
  readonly pushedAt?: string | undefined;
  readonly latestRelease?: GitHubRelease | undefined;
  /** Present only when `collect.languages` was on and GitHub answered. */
  readonly languages?: readonly RepositoryLanguage[] | undefined;
  /** Present only when `collect.commitActivity` was on and GitHub had the statistics ready. */
  readonly commitActivity?: readonly CommitWeek[] | undefined;
  /** Always OBSERVED: the value was read from the GitHub API, never typed in. */
  readonly provenance: "OBSERVED";
}

/** Contents of `data/github-snapshot.json`, written only by `pnpm sync:github`. */
export interface GitHubSnapshot {
  readonly version: 1;
  readonly source: "GitHub REST API";
  readonly username: string;
  readonly fetchedAt: string;
  readonly repositories: readonly GitHubRepository[];
}
