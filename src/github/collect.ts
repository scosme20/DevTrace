import type { GitHubConfig, GitHubRepository } from "../core/github-models.js";
import { DevTraceError } from "../core/result.js";
import { GitHubApiError, type GitHubClient } from "./client.js";
import { mapRelease, mapRepository } from "./mapping.js";
import {
  fetchLatestRelease,
  fetchRepository,
  listUserRepositories,
  type RepositoryResponse,
} from "./repositories.js";

// A repository that cannot be read is "unavailable": it does not exist, was
// removed, or is blocked. Other failures (rate limit, outage) are not.
const UNAVAILABLE_KINDS = new Set(["not_found", "forbidden"]);

function toFullName(entry: string, username: string): string {
  return entry.includes("/") ? entry : `${username}/${entry}`;
}

function matches(entries: readonly string[], repository: RepositoryResponse): boolean {
  const names = new Set(entries.map((entry) => entry.toLowerCase()));
  return names.has(repository.full_name.toLowerCase()) || names.has(repository.name.toLowerCase());
}

/**
 * Reads the configured public repositories. The result is complete or the call
 * throws: there is no partial result that could be mistaken for a full one.
 */
export async function collectRepositories(
  client: GitHubClient,
  config: GitHubConfig,
  warn: (message: string) => void,
): Promise<GitHubRepository[]> {
  const { repositories: selection, collect, onUnavailable } = config;
  const explicit = selection.include.length > 0;

  function unavailable(label: string, reason: string): undefined {
    const message = `Repository "${label}" ${reason}.`;
    if (onUnavailable === "FAIL") throw new DevTraceError(message);
    warn(`${message} It was skipped.`);
    return undefined;
  }

  async function loadExplicit(): Promise<RepositoryResponse[]> {
    const found: RepositoryResponse[] = [];
    for (const entry of new Set(
      selection.include.map((item) => toFullName(item, config.username)),
    )) {
      try {
        found.push(await fetchRepository(client, entry));
      } catch (error) {
        if (error instanceof GitHubApiError && UNAVAILABLE_KINDS.has(error.kind)) {
          unavailable(entry, "is unavailable");
          continue;
        }
        throw error;
      }
    }
    return found;
  }

  const candidates = explicit
    ? await loadExplicit()
    : await listUserRepositories(client, config.username);

  const selected = candidates.filter((repository) => {
    if (repository.private) {
      unavailable(repository.full_name, "is not public");
      return false;
    }
    if (matches(selection.exclude, repository)) return false;
    // Naming a repository explicitly overrides the fork and archived filters.
    if (!explicit && repository.fork && !selection.includeForks) return false;
    if (!explicit && repository.archived && !selection.includeArchived) return false;
    return true;
  });

  const result: GitHubRepository[] = [];
  for (const repository of selected) {
    const rawRelease = collect.releases
      ? await fetchLatestRelease(client, repository.full_name)
      : undefined;
    const release = rawRelease === undefined ? undefined : mapRelease(rawRelease);
    result.push(mapRepository(repository, collect, release));
  }
  return result.sort((a, b) => a.fullName.localeCompare(b.fullName));
}
