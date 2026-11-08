import type {
  GitHubRepository,
  GitHubSnapshot,
  OpenSourceContribution,
} from "../../core/github-models.js";
import type { GitRepositorySummary, GitSnapshot } from "../../core/git-snapshot.js";
import type { DeveloperActivitySettings } from "../../core/developer-activity-models.js";

// What the Developer Activity dashboard shows, computed from the GitHub
// snapshot only. Nothing is guessed:
// - a number exists only when GitHub reported the data behind it;
// - a missing value is "unknown", never zero;
// - every number covers the repositories in the snapshot, not everything the
//   user ever did on GitHub.
// The snapshot holds public repositories only, so there is no private data to
// filter here: the integration never requests it.

const DAYS = 7;
const MONTHS_SHOWN = 12;
const TREND_WEEKS = 13;
const BY_REPOSITORY_LIMIT = 5;
const LANGUAGES_SHOWN = 6;

export interface MonthCommits {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly commits: number;
  /** The window starts or ends inside this month, so it is not a full month. */
  readonly partial: boolean;
}

export interface CommitStats {
  /** Repositories that reported commit activity, out of all in the snapshot. */
  readonly reposWithData: number;
  /** Commits in the window, on the default branch of those repositories. */
  readonly total: number;
  readonly from: string;
  /** The last day that had already happened when the data was fetched. */
  readonly to: string;
  readonly weeks: number;
  /** Column-major: seven values per week, Sunday first. `null` is a day that has not happened. */
  readonly heatmap: readonly (number | null)[];
  readonly months: readonly MonthCommits[];
  readonly byRepository: readonly { readonly fullName: string; readonly commits: number }[];
  /** Two equal, complete periods from the same data; absent when they cannot be compared. */
  readonly trend?: { readonly weeks: number; readonly current: number; readonly previous: number };
}

export interface LanguageShare {
  readonly name: string;
  readonly bytes: number;
  /** Percent of the reported bytes, with one decimal. */
  readonly percent: number;
}

export interface LanguageStats {
  readonly reposWithData: number;
  readonly totalBytes: number;
  readonly shares: readonly LanguageShare[];
}

export interface ReleaseEntry {
  readonly repository: string;
  readonly tag: string;
  readonly name?: string | undefined;
  readonly date: string;
}

export interface ActivityStats {
  readonly observedAt: string | undefined;
  readonly repositoryCount: number;
  /** Most recently pushed first; the name keeps the order stable. */
  readonly repositories: readonly GitHubRepository[];
  readonly listedRepositories: readonly GitHubRepository[];
  readonly withRelease: number;
  readonly lastPush: string | undefined;
  readonly commits?: CommitStats;
  readonly languages?: LanguageStats;
  /** Primary language per repository, as counts. Only when no byte data exists. */
  readonly primaryLanguages: readonly { readonly name: string; readonly repositories: number }[];
  readonly releases: readonly ReleaseEntry[];
  readonly hiddenReleases: number;
  /** Repositories imported from local clones, by label. Empty when none was imported. */
  readonly localGit: readonly GitRepositorySummary[];
  /** Pull requests in other owners' public repositories. Empty when not collected or not asked for. */
  readonly contributions: readonly OpenSourceContribution[];
  readonly contributionsTruncated: boolean;
}

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(month: string): string {
  const [year = 0, number = 1] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
}

function newestFirst(a: GitHubRepository, b: GitHubRepository): number {
  return (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "") || a.fullName.localeCompare(b.fullName);
}

function computeCommits(
  repositories: readonly GitHubRepository[],
  fetchedDay: string,
): CommitStats | undefined {
  const withData = repositories.filter((repository) => repository.commitActivity !== undefined);
  if (withData.length === 0) return undefined;

  const weekStarts = [
    ...new Set(
      withData.flatMap((repository) => (repository.commitActivity ?? []).map((w) => w.weekStart)),
    ),
  ]
    .sort()
    .slice(-52);

  // Per repository and week, its seven daily counts.
  const byRepo = withData.map((repository) => ({
    fullName: repository.fullName,
    weeks: new Map((repository.commitActivity ?? []).map((w) => [w.weekStart, w.days])),
  }));

  const heatmap: (number | null)[] = [];
  const dayTotals = new Map<string, number>();
  const repoTotals = new Map<string, number>();
  const weekComplete: { total: number; complete: boolean }[] = [];
  for (const weekStart of weekStarts) {
    let total = 0;
    let complete = true;
    for (let index = 0; index < DAYS; index += 1) {
      const day = addDays(weekStart, index);
      if (day > fetchedDay) {
        heatmap.push(null);
        complete = false;
        continue;
      }
      let count = 0;
      for (const repository of byRepo) {
        const commits = repository.weeks.get(weekStart)?.[index] ?? 0;
        count += commits;
        repoTotals.set(repository.fullName, (repoTotals.get(repository.fullName) ?? 0) + commits);
      }
      heatmap.push(count);
      dayTotals.set(day, count);
      total += count;
    }
    weekComplete.push({ total, complete });
  }

  const days = [...dayTotals.keys()].sort();
  const from = days[0];
  const to = days.at(-1);
  if (from === undefined || to === undefined) return undefined;

  const byMonth = new Map<string, number>();
  for (const [day, count] of dayTotals) {
    const month = day.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + count);
  }
  const months = [...byMonth.keys()]
    .sort()
    .slice(-MONTHS_SHOWN)
    .map((month): MonthCommits => {
      const startsInside = month === from.slice(0, 7) && from !== `${month}-01`;
      const endsInside = month === to.slice(0, 7) && to !== lastDayOfMonth(month);
      return { month, commits: byMonth.get(month) ?? 0, partial: startsInside || endsInside };
    });

  // Comparison needs the same method on equal periods, and every repository.
  const complete = weekComplete.filter(
    (week, index) => week.complete || index < weekComplete.length - 1,
  );
  const settled = complete.filter((week) => week.complete);
  const canCompare = withData.length === repositories.length && settled.length >= 2 * TREND_WEEKS;
  const recent = settled.slice(-TREND_WEEKS);
  const earlier = settled.slice(-2 * TREND_WEEKS, -TREND_WEEKS);
  const sum = (weeks: readonly { total: number }[]): number =>
    weeks.reduce((total, week) => total + week.total, 0);

  return {
    reposWithData: withData.length,
    total: [...dayTotals.values()].reduce((total, count) => total + count, 0),
    from,
    to,
    weeks: weekStarts.length,
    heatmap,
    months,
    byRepository: [...repoTotals]
      .filter(([, commits]) => commits > 0)
      .sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB))
      .slice(0, BY_REPOSITORY_LIMIT)
      .map(([fullName, commits]) => ({ fullName, commits })),
    ...(canCompare
      ? { trend: { weeks: TREND_WEEKS, current: sum(recent), previous: sum(earlier) } }
      : {}),
  };
}

function computeLanguages(repositories: readonly GitHubRepository[]): LanguageStats | undefined {
  const withData = repositories.filter((repository) => (repository.languages ?? []).length > 0);
  if (withData.length === 0) return undefined;
  const bytesByName = new Map<string, number>();
  for (const repository of withData) {
    for (const language of repository.languages ?? []) {
      bytesByName.set(language.name, (bytesByName.get(language.name) ?? 0) + language.bytes);
    }
  }
  const totalBytes = [...bytesByName.values()].reduce((total, bytes) => total + bytes, 0);
  if (totalBytes === 0) return undefined;
  const sorted = [...bytesByName]
    .sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB))
    .map(([name, bytes]) => ({ name, bytes }));
  const top = sorted.slice(0, LANGUAGES_SHOWN);
  const otherBytes = sorted.slice(LANGUAGES_SHOWN).reduce((total, entry) => total + entry.bytes, 0);
  const shown = otherBytes > 0 ? [...top, { name: "Other", bytes: otherBytes }] : top;
  return {
    reposWithData: withData.length,
    totalBytes,
    shares: shown.map((entry) => ({
      ...entry,
      percent: Math.round((entry.bytes / totalBytes) * 1000) / 10,
    })),
  };
}

export function computeActivityStats(
  snapshot: GitHubSnapshot | undefined,
  settings: DeveloperActivitySettings,
  gitSnapshot?: GitSnapshot,
): ActivityStats {
  const repositories = [...(snapshot?.repositories ?? [])].sort(newestFirst);
  const fetchedDay = snapshot?.fetchedAt.slice(0, 10) ?? "";

  const languages = computeLanguages(repositories);
  const primary = new Map<string, number>();
  for (const repository of repositories) {
    if (repository.language !== undefined) {
      primary.set(repository.language, (primary.get(repository.language) ?? 0) + 1);
    }
  }

  const releases = repositories
    .flatMap((repository) =>
      repository.latestRelease === undefined
        ? []
        : [
            {
              repository: repository.fullName,
              tag: repository.latestRelease.tagName,
              name: repository.latestRelease.name,
              date: repository.latestRelease.publishedAt,
            } satisfies ReleaseEntry,
          ],
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.repository.localeCompare(b.repository));

  const commits = computeCommits(repositories, fetchedDay);
  const pushes = repositories.flatMap((repository) =>
    repository.pushedAt === undefined ? [] : [repository.pushedAt],
  );

  return {
    observedAt: snapshot?.fetchedAt,
    repositoryCount: repositories.length,
    repositories,
    listedRepositories: repositories.slice(0, settings.repositoryLimit),
    withRelease: releases.length,
    lastPush: pushes.sort().at(-1),
    ...(commits === undefined ? {} : { commits }),
    ...(languages === undefined ? {} : { languages }),
    primaryLanguages:
      languages === undefined
        ? [...primary]
            .sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB))
            .map(([name, count]) => ({ name, repositories: count }))
        : [],
    releases: releases.slice(0, settings.releaseLimit),
    hiddenReleases: Math.max(0, releases.length - settings.releaseLimit),
    localGit: settings.showLocalGit ? [...(gitSnapshot?.repositories ?? [])] : [],
    contributions: settings.showContributions ? [...(snapshot?.contributions ?? [])] : [],
    contributionsTruncated: settings.showContributions && snapshot?.contributionsTruncated === true,
  };
}
