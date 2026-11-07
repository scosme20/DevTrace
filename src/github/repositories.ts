import { z } from "zod";
import { GitHubApiError, type GitHubClient } from "./client.js";

// External data is validated before it is used. Objects are not strict: GitHub
// adds fields over time and only the ones DevTrace reads matter here.

const repositoryResponse = z.object({
  full_name: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  language: z.string().nullish(),
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  archived: z.boolean(),
  fork: z.boolean(),
  private: z.boolean(),
  created_at: z.string(),
  pushed_at: z.string().nullish(),
});

const releaseResponse = z.object({
  tag_name: z.string(),
  name: z.string().nullish(),
  published_at: z.string().nullable(),
  draft: z.boolean().optional(),
});

const languagesResponse = z.record(z.string(), z.number().int().nonnegative());

const commitActivityResponse = z.array(
  z.object({
    week: z.number().int().nonnegative(),
    days: z.array(z.number().int().nonnegative()).length(7),
  }),
);

export type RepositoryResponse = z.infer<typeof repositoryResponse>;
export type ReleaseResponse = z.infer<typeof releaseResponse>;

function parseResponse<S extends z.ZodType>(schema: S, body: unknown, what: string): z.output<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where =
      issue === undefined ? "" : ` (${issue.path.join(".") || "root"}: ${issue.message})`;
    throw new GitHubApiError("invalid_response", `Unexpected GitHub response for ${what}${where}.`);
  }
  return parsed.data;
}

function repositoryPath(fullName: string): string {
  const [owner = "", name = ""] = fullName.split("/");
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

export async function fetchRepository(
  client: GitHubClient,
  fullName: string,
): Promise<RepositoryResponse> {
  return parseResponse(
    repositoryResponse,
    await client.getJson(repositoryPath(fullName)),
    `repository ${fullName}`,
  );
}

/**
 * Lists the public repositories of a user. `/users/{username}/repos` never
 * returns private repositories, even when a token is configured.
 */
export async function listUserRepositories(
  client: GitHubClient,
  username: string,
): Promise<RepositoryResponse[]> {
  const items = await client.getAllPages(
    `/users/${encodeURIComponent(username)}/repos?type=owner&sort=full_name`,
  );
  return items.map((item) =>
    parseResponse(repositoryResponse, item, `repositories of ${username}`),
  );
}

/** One call per repository. A repository without releases answers 404, which is not an error. */
export async function fetchLatestRelease(
  client: GitHubClient,
  fullName: string,
): Promise<ReleaseResponse | undefined> {
  try {
    const body = await client.getJson(`${repositoryPath(fullName)}/releases/latest`);
    return parseResponse(releaseResponse, body, `latest release of ${fullName}`);
  } catch (error) {
    if (error instanceof GitHubApiError && error.kind === "not_found") return undefined;
    throw error;
  }
}

/** Bytes of code per language, as GitHub reports them. An empty repository answers {}. */
export async function fetchLanguages(
  client: GitHubClient,
  fullName: string,
): Promise<Record<string, number>> {
  const body = await client.getJson(`${repositoryPath(fullName)}/languages`);
  return parseResponse(languagesResponse, body, `languages of ${fullName}`);
}

export interface CommitActivityWeek {
  readonly week: number;
  readonly days: readonly number[];
}

/**
 * Commits per day for the last 52 weeks. GitHub computes this on demand: while
 * it does, it answers 202 with an empty body, which is returned as undefined
 * ("not ready"), never as zero activity.
 */
export async function fetchCommitActivity(
  client: GitHubClient,
  fullName: string,
): Promise<CommitActivityWeek[] | undefined> {
  try {
    const body = await client.getJson(`${repositoryPath(fullName)}/stats/commit_activity`);
    if (!Array.isArray(body)) return undefined;
    return parseResponse(commitActivityResponse, body, `commit activity of ${fullName}`);
  } catch (error) {
    // 204 (an empty repository) is an empty body and reaches here as invalid JSON.
    if (error instanceof GitHubApiError && error.kind === "invalid_response") return undefined;
    throw error;
  }
}
