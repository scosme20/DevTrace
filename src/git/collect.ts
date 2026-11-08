import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitLanguage, GitMonth } from "../core/git-snapshot.js";
import { DevTraceError } from "../core/result.js";

// Reads a local clone with two read-only git commands: `git log` for the dates
// of the commits and `git ls-files` for the extensions of the tracked files.
// Nothing is written and nothing leaves the machine. Only dates are kept from
// the log and only extensions from the file list: never messages, names or paths.

const run = promisify(execFile);
const MAX_OUTPUT = 256 * 1024 * 1024;

export type GitRunner = (args: readonly string[]) => Promise<string>;

export interface GitCollected {
  readonly commits: number;
  readonly firstCommit: string;
  readonly lastCommit: string;
  readonly months: readonly GitMonth[];
  readonly languages: readonly GitLanguage[];
}

const LANGUAGES: Readonly<Record<string, string>> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  java: "Java",
  kt: "Kotlin",
  kts: "Kotlin",
  py: "Python",
  go: "Go",
  rs: "Rust",
  rb: "Ruby",
  php: "PHP",
  cs: "C#",
  c: "C",
  h: "C",
  cpp: "C++",
  hpp: "C++",
  swift: "Swift",
  dart: "Dart",
  sql: "SQL",
  prisma: "Prisma",
  html: "HTML",
  css: "CSS",
  scss: "CSS",
  sh: "Shell",
  yml: "YAML",
  yaml: "YAML",
};

/** Runs git inside the folder, with no pager and no prompts. */
export function gitRunner(folder: string): GitRunner {
  return async (args) => {
    try {
      const { stdout } = await run("git", ["-C", folder, ...args], {
        maxBuffer: MAX_OUTPUT,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" },
      });
      return stdout;
    } catch (cause) {
      throw new DevTraceError(`Cannot read the git repository in "${folder}".`, {
        cause,
        hint: "Pass the folder of a local clone, and check that git is installed.",
      });
    }
  };
}

export function languageOf(file: string): string | undefined {
  const name = file.split("/").at(-1) ?? file;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return undefined;
  return LANGUAGES[name.slice(dot + 1).toLowerCase()];
}

/**
 * Summarizes the history of the checked-out branch. With `author`, only the
 * commits whose author or committer e-mail matches are counted.
 */
export async function collectGit(
  git: GitRunner,
  options: { readonly author?: string | undefined } = {},
): Promise<GitCollected> {
  const log = await git([
    "log",
    "--format=%aI",
    ...(options.author === undefined ? [] : [`--author=${options.author}`]),
  ]);
  const days = log
    .split("\n")
    .map((line) => line.trim().slice(0, 10))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  const first = days[0];
  const last = days.at(-1);
  if (first === undefined || last === undefined) {
    throw new DevTraceError("The repository has no commits to count.", {
      hint:
        options.author === undefined
          ? "Check that the folder is a clone with history."
          : "Check that --author matches the e-mail used in your commits.",
    });
  }

  const byMonth = new Map<string, number>();
  for (const day of days) byMonth.set(day.slice(0, 7), (byMonth.get(day.slice(0, 7)) ?? 0) + 1);

  const byLanguage = new Map<string, number>();
  for (const file of (await git(["ls-files"])).split("\n")) {
    const language = languageOf(file.trim());
    if (language !== undefined) byLanguage.set(language, (byLanguage.get(language) ?? 0) + 1);
  }

  return {
    commits: days.length,
    firstCommit: first,
    lastCommit: last,
    months: [...byMonth]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, commits]) => ({
        month,
        commits,
      })),
    languages: [...byLanguage]
      .sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB))
      .slice(0, 8)
      .map(([name, files]) => ({ name, files })),
  };
}
