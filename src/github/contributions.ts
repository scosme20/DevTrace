import { z } from "zod";
import type { OpenSourceContribution } from "../core/github-models.js";
import { GitHubApiError, type GitHubClient } from "./client.js";

// Pull requests the user opened in public repositories of other owners, from
// the search API. Only the repository name, the state and one date per pull
// request are read: never titles, bodies or code. One page is read, so a user
// with more than 100 such pull requests gets the 100 most recently updated and
// the result says so.

export const CONTRIBUTIONS_PAGE_SIZE = 100;

const searchResponse = z.object({
  total_count: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      repository_url: z.string(),
      state: z.enum(["open", "closed"]),
      updated_at: z.string(),
      pull_request: z.object({ merged_at: z.string().nullish() }).nullish(),
    }),
  ),
});

const REPOSITORY_URL = /\/repos\/([^/]+\/[^/]+)$/;

export interface ContributionsResult {
  readonly contributions: readonly OpenSourceContribution[];
  /** More pull requests exist than were read. */
  readonly truncated: boolean;
}

export async function collectContributions(
  client: GitHubClient,
  username: string,
): Promise<ContributionsResult> {
  const query = `author:${username} type:pr is:public -user:${username}`;
  const body = await client.getJson(
    `/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${String(CONTRIBUTIONS_PAGE_SIZE)}`,
  );
  const parsed = searchResponse.safeParse(body);
  if (!parsed.success) {
    throw new GitHubApiError(
      "invalid_response",
      "Unexpected GitHub response for the contributions.",
    );
  }

  const byRepository = new Map<
    string,
    { merged: number; open: number; closed: number; last: string }
  >();
  for (const item of parsed.data.items) {
    const repository = REPOSITORY_URL.exec(item.repository_url)?.[1];
    if (repository === undefined) continue;
    const entry = byRepository.get(repository) ?? { merged: 0, open: 0, closed: 0, last: "" };
    if (item.pull_request?.merged_at != null) entry.merged += 1;
    else if (item.state === "open") entry.open += 1;
    else entry.closed += 1;
    if (item.updated_at > entry.last) entry.last = item.updated_at;
    byRepository.set(repository, entry);
  }

  return {
    contributions: [...byRepository]
      .map(([repository, entry]) => ({
        repository,
        merged: entry.merged,
        open: entry.open,
        closed: entry.closed,
        lastActivity: entry.last,
      }))
      .sort(
        (a, b) =>
          b.merged - a.merged ||
          b.lastActivity.localeCompare(a.lastActivity) ||
          a.repository.localeCompare(b.repository),
      ),
    truncated: parsed.data.total_count > parsed.data.items.length,
  };
}
