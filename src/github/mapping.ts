import type {
  GitHubCollectSettings,
  GitHubRelease,
  GitHubRepository,
} from "../core/github-models.js";
import type { ReleaseResponse, RepositoryResponse } from "./repositories.js";

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F-\x9F]/g;

/** Text written by third parties: drop control characters, collapse spaces, cap the length. */
export function sanitizeText(value: string, maxLength: number): string | undefined {
  const cleaned = value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  if (cleaned === "") return undefined;
  const chars = Array.from(cleaned);
  return chars.length <= maxLength ? cleaned : `${chars.slice(0, maxLength - 1).join("")}…`;
}

export function mapRelease(raw: ReleaseResponse): GitHubRelease | undefined {
  // Drafts are never public, and a release without a date cannot be placed in time.
  if (raw.draft === true || raw.published_at === null) return undefined;
  const tagName = sanitizeText(raw.tag_name, 100);
  if (tagName === undefined) return undefined;
  const name = raw.name == null ? undefined : sanitizeText(raw.name, 100);
  return { tagName, ...(name === undefined ? {} : { name }), publishedAt: raw.published_at };
}

/**
 * Maps a validated API response to the domain model. Only the fields enabled
 * in `collect` are kept, and the URL is rebuilt instead of trusting the API.
 */
export function mapRepository(
  raw: RepositoryResponse,
  collect: GitHubCollectSettings,
  release?: GitHubRelease,
): GitHubRepository {
  const description =
    collect.description && raw.description != null ? sanitizeText(raw.description, 200) : undefined;
  const language =
    collect.language && raw.language != null ? sanitizeText(raw.language, 50) : undefined;
  return {
    fullName: raw.full_name,
    name: raw.name,
    url: `https://github.com/${raw.full_name}`,
    ...(description === undefined ? {} : { description }),
    ...(language === undefined ? {} : { language }),
    ...(collect.stars ? { stars: raw.stargazers_count } : {}),
    ...(collect.forks ? { forks: raw.forks_count } : {}),
    archived: raw.archived,
    fork: raw.fork,
    createdAt: raw.created_at,
    ...(raw.pushed_at == null ? {} : { pushedAt: raw.pushed_at }),
    ...(collect.releases && release !== undefined ? { latestRelease: release } : {}),
    provenance: "OBSERVED",
  };
}
