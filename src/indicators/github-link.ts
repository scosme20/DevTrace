import type { GitHubRepository, GitHubSnapshot } from "../core/github-models.js";
import type { Visibility } from "../core/models.js";

export interface LinkableProject {
  readonly id: string;
  readonly visibility: Visibility;
  readonly githubRepository?: string | undefined;
  readonly repositoryUrl?: string | undefined;
}

export interface GitHubLinks {
  /** Observed repository data by project ID. Public projects only. */
  readonly byProjectId: Readonly<Record<string, GitHubRepository>>;
  readonly warnings: readonly string[];
}

/** Keeps only the entries of projects that are actually listed on the card. */
export function restrictToProjects(
  byProjectId: Readonly<Record<string, GitHubRepository>>,
  projects: readonly { readonly id: string }[],
): Record<string, GitHubRepository> {
  const restricted: Record<string, GitHubRepository> = {};
  for (const { id } of projects) {
    const repository = byProjectId[id];
    if (repository !== undefined) restricted[id] = repository;
  }
  return restricted;
}

function normalizeUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
}

/**
 * Connects projects to the GitHub data they explicitly point at. Manual
 * values always win: this only attaches observed data, it never edits a
 * project. A mismatch is reported, not resolved.
 *
 * Private projects are ignored entirely, so their IDs cannot appear in
 * warnings that end up in public CI logs.
 */
export function linkGitHubRepositories(
  projects: readonly LinkableProject[],
  snapshot: GitHubSnapshot | undefined,
): GitHubLinks {
  const repositories = new Map(
    (snapshot?.repositories ?? []).map((repository) => [
      repository.fullName.toLowerCase(),
      repository,
    ]),
  );
  const byProjectId: Record<string, GitHubRepository> = {};
  const warnings: string[] = [];

  for (const project of projects) {
    if (project.visibility !== "PUBLIC" || project.githubRepository === undefined) continue;
    const repository = repositories.get(project.githubRepository.toLowerCase());
    if (repository === undefined) {
      warnings.push(
        `Project "${project.id}" links GitHub repository "${project.githubRepository}" but no data is available for it. Run "pnpm sync:github".`,
      );
      continue;
    }
    byProjectId[project.id] = repository;
    if (
      project.repositoryUrl !== undefined &&
      normalizeUrl(project.repositoryUrl) !== normalizeUrl(repository.url)
    ) {
      warnings.push(
        `Project "${project.id}" declares repositoryUrl "${project.repositoryUrl}", which differs from GitHub repository ${repository.fullName}. The declared value is kept.`,
      );
    }
  }
  return { byProjectId, warnings };
}
