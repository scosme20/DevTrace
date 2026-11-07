import path from "node:path";
import { loadGitHubConfig, loadGitHubSnapshot } from "../core/config.js";
import type { GitHubSnapshot } from "../core/github-models.js";
import { DevTraceError } from "../core/result.js";
import { writeGitHubSnapshot } from "../core/snapshot-output.js";
import { DEVTRACE_VERSION } from "../core/version.js";
import { createGitHubClient, type GitHubClientOptions } from "../github/client.js";
import { collectRepositories } from "../github/collect.js";

export const GITHUB_CONFIG_FILE = "data/github.json";
export const GITHUB_SNAPSHOT_FILE = "data/github-snapshot.json";

export interface GitHubSyncOptions {
  /** Ignore the cache and call the API even if the snapshot is recent. */
  readonly force?: boolean;
  readonly warn?: (message: string) => void;
  /** Where GITHUB_TOKEN is read from. Defaults to `process.env`. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly now?: () => Date;
  /** Overrides for the HTTP client. Used by tests; the token and user agent are not overridable. */
  readonly client?: Omit<GitHubClientOptions, "token" | "userAgent">;
}

function ageInMinutes(snapshot: GitHubSnapshot, now: Date): number {
  return (now.getTime() - Date.parse(snapshot.fetchedAt)) / 60_000;
}

/**
 * Reads public repository data from GitHub into `data/github-snapshot.json`.
 * This is the only code that uses the network. If anything fails, the
 * previous snapshot is left exactly as it was.
 */
export async function syncGitHubSnapshot(
  rootDir: string,
  options: GitHubSyncOptions = {},
): Promise<string> {
  const warn = options.warn ?? (() => undefined);
  const now = options.now ?? (() => new Date());
  const env = options.env ?? process.env;

  try {
    const config = await loadGitHubConfig(path.join(rootDir, GITHUB_CONFIG_FILE));
    if (config === undefined) {
      return `GitHub integration is not configured (${GITHUB_CONFIG_FILE} not found). Nothing to sync.`;
    }

    const snapshotPath = path.join(rootDir, GITHUB_SNAPSHOT_FILE);
    const existing = await loadGitHubSnapshot(snapshotPath);
    if (
      options.force !== true &&
      existing !== undefined &&
      existing.username.toLowerCase() === config.username.toLowerCase()
    ) {
      const age = ageInMinutes(existing, now());
      if (age >= 0 && age < config.cacheTtlMinutes) {
        return `GitHub snapshot is up to date (synced ${String(Math.floor(age))} minute(s) ago). Use --force to refresh.`;
      }
    }

    const token = env["GITHUB_TOKEN"]?.trim();
    const client = createGitHubClient({
      ...options.client,
      token: token === "" ? undefined : token,
      userAgent: `devtrace/${DEVTRACE_VERSION}`,
    });
    const repositories = await collectRepositories(client, config, warn);

    await writeGitHubSnapshot(snapshotPath, {
      version: 1,
      source: "GitHub REST API",
      username: config.username,
      fetchedAt: now().toISOString(),
      repositories,
    });
    return `GitHub snapshot written to ${snapshotPath} (${String(repositories.length)} repositories).`;
  } catch (cause) {
    throw new DevTraceError("Failed to sync GitHub data.", { cause });
  }
}
