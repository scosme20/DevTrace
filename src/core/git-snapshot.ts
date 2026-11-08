import { z } from "zod";
import type { Result } from "./result.js";
import { requiredText, validateWith } from "./schema-primitives.js";

// What `devtrace import git` reads from a local clone. It holds counts and
// dates under a label the user chose, and nothing else: no commit messages,
// author names, file names, paths or hashes. A private repository can be
// shown this way without exposing anything about its content.

export interface GitMonth {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly commits: number;
}

export interface GitLanguage {
  readonly name: string;
  /** Tracked files with this language's extension. A count of files, not of code. */
  readonly files: number;
}

export interface GitRepositorySummary {
  /** The name shown in the indicator, chosen by the user. */
  readonly label: string;
  readonly commits: number;
  /** `YYYY-MM-DD`. */
  readonly firstCommit: string;
  readonly lastCommit: string;
  readonly months: readonly GitMonth[];
  readonly languages: readonly GitLanguage[];
  /** Whether only the commits of one author were counted. */
  readonly filteredByAuthor: boolean;
  /** `YYYY-MM-DD` of the import. */
  readonly importedAt: string;
}

export interface GitSnapshot {
  readonly version: 1;
  readonly kind: "LOCAL_GIT";
  readonly repositories: readonly GitRepositorySummary[];
}

const count = z.number().int().nonnegative();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date like 2026-03-31.");

const repositorySchema = z.strictObject({
  label: requiredText("label").max(60),
  commits: count,
  firstCommit: day,
  lastCommit: day,
  months: z
    .array(
      z.strictObject({
        month: z.string().regex(/^\d{4}-\d{2}$/, "Expected a month like 2026-03."),
        commits: count,
      }),
    )
    .max(600),
  languages: z.array(z.strictObject({ name: requiredText("name").max(40), files: count })).max(50),
  filteredByAuthor: z.boolean(),
  importedAt: day,
});

const snapshotSchema = z.strictObject({
  version: z.literal(1, { error: "Unsupported git snapshot version. Expected 1." }),
  kind: z.literal("LOCAL_GIT"),
  repositories: z.array(repositorySchema).max(50),
});

export function validateGitSnapshot(input: unknown): Result<GitSnapshot> {
  return validateWith(snapshotSchema, input);
}
