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
