import type { AiMilestone } from "../../core/ai-engineering-models.js";
import type { GitHubRepository } from "../../core/github-models.js";

// What the GitHub snapshot says about AI in the owner's repositories. All of it
// is OBSERVED on GitHub, and none of it is a measure of how much work an AI did:
// a co-author trailer is a statement in a commit message, a configuration file
// shows that an assistant was set up, and a topic is a label the owner chose.
// The snapshot holds public repositories only, so nothing private can get here.

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** A release is a dated, public event, so it can stand as a milestone without any judgment. */
export function releaseMilestones(repositories: readonly GitHubRepository[]): AiMilestone[] {
  return repositories.flatMap((repository) => {
    const releases =
      repository.releases ??
      (repository.latestRelease === undefined ? [] : [repository.latestRelease]);
    return releases.map((release): AiMilestone => ({
      id: `release-${slug(repository.fullName)}-${slug(release.tagName)}`,
      title: `${repository.name} ${release.tagName}`,
      description: `Release of ${repository.fullName}`,
      date: release.publishedAt,
      visibility: "PUBLIC",
      provenance: "OBSERVED",
    }));
  });
}

export interface FoundRepository {
  readonly name: string;
  readonly toolFiles: readonly string[];
  readonly aiTopics: readonly string[];
  readonly coauthored: { readonly inspected: number; readonly matching: number } | undefined;
}

export interface FoundInRepositories {
  /** Repositories where at least one signal was found, most co-authored commits first. */
  readonly repositories: readonly FoundRepository[];
  /** Over every repository whose commits were looked at; absent when none were. */
  readonly coauthored?: {
    readonly repositories: number;
    readonly inspected: number;
    readonly matching: number;
    readonly assistants: readonly { readonly name: string; readonly count: number }[];
  };
  /** Assistants with a configuration file in at least one repository. */
  readonly tools: readonly string[];
}

export function foundInRepositories(
  repositories: readonly GitHubRepository[],
): FoundInRepositories | undefined {
  const looked = repositories.filter((repository) => repository.findings !== undefined);
  if (looked.length === 0) return undefined;

  const rows: FoundRepository[] = looked.flatMap((repository) => {
    const findings = repository.findings;
    if (findings === undefined) return [];
    const matching = findings.coauthored?.matching ?? 0;
    if (findings.toolFiles.length === 0 && findings.aiTopics.length === 0 && matching === 0)
      return [];
    return [
      {
        name: repository.name,
        toolFiles: findings.toolFiles,
        aiTopics: findings.aiTopics,
        coauthored:
          findings.coauthored === undefined
            ? undefined
            : { inspected: findings.coauthored.inspected, matching },
      },
    ];
  });
  rows.sort(
    (a, b) =>
      (b.coauthored?.matching ?? 0) - (a.coauthored?.matching ?? 0) || a.name.localeCompare(b.name),
  );

  const withCommits = looked.flatMap((repository) => repository.findings?.coauthored ?? []);
  const assistants = new Map<string, number>();
  for (const entry of withCommits) {
    for (const { name, count } of entry.assistants) {
      assistants.set(name, (assistants.get(name) ?? 0) + count);
    }
  }
  const tools = [
    ...new Set(looked.flatMap((repository) => repository.findings?.toolFiles ?? [])),
  ].sort();

  return {
    repositories: rows,
    tools,
    ...(withCommits.length === 0
      ? {}
      : {
          coauthored: {
            repositories: withCommits.length,
            inspected: withCommits.reduce((sum, entry) => sum + entry.inspected, 0),
            matching: withCommits.reduce((sum, entry) => sum + entry.matching, 0),
            assistants: [...assistants]
              .sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB))
              .map(([name, count]) => ({ name, count })),
          },
        }),
  };
}
