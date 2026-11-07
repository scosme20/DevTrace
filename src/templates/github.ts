import type { GitHubRepository } from "../core/github-models.js";

function count(value: number, singular: string): string {
  // Fixed locale so the SVG does not depend on the machine that generates it.
  return `${value.toLocaleString("en-US")} ${value === 1 ? singular : `${singular}s`}`;
}

/**
 * One muted line of observed GitHub data. The leading "GitHub" marks the
 * source, so it is never confused with values the user declared. These are
 * GitHub metrics, not measures of commercial success.
 */
export function formatGitHubLine(repository: GitHubRepository): string {
  const parts = ["GitHub"];
  if (repository.stars !== undefined) parts.push(count(repository.stars, "star"));
  if (repository.forks !== undefined) parts.push(count(repository.forks, "fork"));
  if (repository.language !== undefined) parts.push(repository.language);
  if (repository.latestRelease !== undefined) {
    const { tagName, publishedAt } = repository.latestRelease;
    parts.push(`release ${tagName} (${publishedAt.slice(0, 10)})`);
  }
  return parts.join(" · ");
}
