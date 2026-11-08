import type { GitHubConfig, GitHubRepository, RepositoryFindings } from "../core/github-models.js";
import { DevTraceError } from "../core/result.js";
import { GitHubApiError, type GitHubClient } from "./client.js";
import { aiTopics, coauthorAssistants, detectToolFiles } from "./ai-signals.js";
import { mapCommitActivity, mapLanguages, mapRelease, mapRepository } from "./mapping.js";
import {
  fetchCommitActivity,
  fetchCommitMessages,
  fetchReleases,
  fetchTreePaths,
  fetchLanguages,
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
    const languages =
      collect.languages === true
        ? mapLanguages(await fetchLanguages(client, repository.full_name))
        : undefined;
    let commitActivity;
    if (collect.commitActivity === true) {
      const weeks = await fetchCommitActivity(client, repository.full_name);
      if (weeks === undefined) {
        // Not ready or empty: it stays unknown, which is not the same as no commits.
        warn(
          `Commit activity of "${repository.full_name}" is not available yet. Run the sync again later.`,
        );
      } else {
        commitActivity = mapCommitActivity(weeks);
      }
    }
    const releases =
      collect.releaseHistory === true
        ? (await fetchReleases(client, repository.full_name))
            // Drafts are not public, and a pre-release is not a milestone.
            .filter((raw) => raw.prerelease !== true)
            .flatMap((raw) => mapRelease(raw) ?? [])
            .sort(
              (a, b) =>
                b.publishedAt.localeCompare(a.publishedAt) || a.tagName.localeCompare(b.tagName),
            )
        : undefined;
    const findings =
      collect.aiSignals === true
        ? await findRepositoryFindings(client, repository, config.username)
        : undefined;
    result.push(
      mapRepository(repository, collect, {
        release,
        languages,
        commitActivity,
        releases,
        findings,
      }),
    );
  }
  return result.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/**
 * Looks for AI signals in one repository: configuration files of assistants,
 * AI-related topics, and commits by the user that name an AI co-author.
 */
async function findRepositoryFindings(
  client: GitHubClient,
  repository: RepositoryResponse,
  username: string,
): Promise<RepositoryFindings> {
  const paths = await fetchTreePaths(client, repository.full_name);
  const messages = await fetchCommitMessages(client, repository.full_name, username);

  const counts = new Map<string, number>();
  let matching = 0;
  for (const message of messages) {
    const assistants = coauthorAssistants(message);
    if (assistants.length > 0) matching += 1;
    for (const name of assistants) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return {
    toolFiles: detectToolFiles(paths ?? []),
    aiTopics: aiTopics(repository.topics ?? []),
    ...(messages.length === 0
      ? {}
      : {
          coauthored: {
            inspected: messages.length,
            matching,
            assistants: [...counts]
              .sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB))
              .map(([name, count]) => ({ name, count })),
          },
        }),
  };
}
