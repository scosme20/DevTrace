import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadGitSnapshot } from "../core/config.js";
import type { GitRepositorySummary, GitSnapshot } from "../core/git-snapshot.js";
import { DevTraceError } from "../core/result.js";
import { collectGit, gitRunner, type GitRunner } from "../git/collect.js";

export const GIT_SNAPSHOT_FILE = "data/git-snapshot.json";

export interface ImportGitOptions {
  /** The folder of a local clone. It is never stored. */
  readonly repositoryPath: string;
  /** The name shown in the indicator. */
  readonly label: string;
  readonly author?: string | undefined;
  readonly now?: () => Date;
  /** Replaces the real git. Used by tests. */
  readonly git?: GitRunner;
}

/**
 * Adds or replaces one repository of `data/git-snapshot.json`, keyed by its
 * label, so several clones can be imported one after the other. It reads the
 * clone and writes that one file: it uses no network.
 */
export async function importGit(rootDir: string, options: ImportGitOptions): Promise<string[]> {
  const label = options.label.trim();
  if (label === "" || label.length > 60) {
    throw new DevTraceError("The label must have 1 to 60 characters.", {
      hint: 'Use --label "BuildFlow", the name that should be shown.',
    });
  }
  const collected = await collectGit(options.git ?? gitRunner(options.repositoryPath), {
    author: options.author,
  });
  const summary: GitRepositorySummary = {
    label,
    ...collected,
    filteredByAuthor: options.author !== undefined,
    importedAt: (options.now ?? (() => new Date()))().toISOString().slice(0, 10),
  };

  const target = path.join(rootDir, GIT_SNAPSHOT_FILE);
  const previous = await loadGitSnapshot(target);
  const snapshot: GitSnapshot = {
    version: 1,
    kind: "LOCAL_GIT",
    repositories: [
      ...(previous?.repositories ?? []).filter((entry) => entry.label !== label),
      summary,
    ].sort((a, b) => a.label.localeCompare(b.label)),
  };
  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(`${target}.tmp`, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    await rename(`${target}.tmp`, target);
  } catch (cause) {
    throw new DevTraceError(`Cannot write ${GIT_SNAPSHOT_FILE}.`, { cause });
  }

  return [
    `${label}: ${String(summary.commits)} commit(s) from ${summary.firstCommit} to ${summary.lastCommit}, ${String(summary.months.length)} month(s) with activity.`,
    ...(summary.filteredByAuthor ? ["  Only the commits of the given author were counted."] : []),
    `Written to ${GIT_SNAPSHOT_FILE}. Only counts and dates were kept: no messages, names or paths.`,
    "Next: set settings.showLocalGit to true in data/developer-activity.json.",
  ];
}
