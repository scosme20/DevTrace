import type {
  CommitWeek,
  GitHubCollectSettings,
  GitHubRelease,
  GitHubRepository,
  RepositoryFindings,
  RepositoryLanguage,
} from "../core/github-models.js";
import type { CommitActivityWeek, ReleaseResponse, RepositoryResponse } from "./repositories.js";

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
/** Languages by bytes, largest first, then by name so the order never changes. */
export function mapLanguages(raw: Readonly<Record<string, number>>): RepositoryLanguage[] {
  return Object.entries(raw)
    .flatMap(([name, bytes]) => {
      const clean = sanitizeText(name, 50);
      return clean === undefined ? [] : [{ name: clean, bytes }];
    })
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
    .slice(0, 100);
}

export function mapCommitActivity(raw: readonly CommitActivityWeek[]): CommitWeek[] {
  return raw
    .map((week) => ({
      weekStart: new Date(week.week * 1000).toISOString().slice(0, 10),
      days: week.days,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(-53);
}

export interface ExtraData {
  readonly release?: GitHubRelease | undefined;
  readonly languages?: readonly RepositoryLanguage[] | undefined;
  readonly commitActivity?: readonly CommitWeek[] | undefined;
  readonly releases?: readonly GitHubRelease[] | undefined;
  readonly findings?: RepositoryFindings | undefined;
}

export function mapRepository(
  raw: RepositoryResponse,
  collect: GitHubCollectSettings,
  extra: ExtraData = {},
): GitHubRepository {
  const { release, languages, commitActivity, releases, findings } = extra;
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
    ...(languages === undefined || languages.length === 0 ? {} : { languages }),
    ...(commitActivity === undefined ? {} : { commitActivity }),
    ...(releases === undefined || releases.length === 0 ? {} : { releases }),
    ...(findings === undefined ? {} : { findings }),
    provenance: "OBSERVED",
  };
}
