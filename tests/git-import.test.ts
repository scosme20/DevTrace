import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";
import { validateGitSnapshot } from "../src/core/git-snapshot.js";
import { collectGit, languageOf, type GitRunner } from "../src/git/collect.js";
import { GIT_SNAPSHOT_FILE, importGit } from "../src/generators/git.js";

// The import keeps counts and dates only. These tests use a fake git for the
// parsing and one real temporary repository for the end to end path.

const fake =
  (log: string, files = ""): GitRunner =>
  (args) =>
    Promise.resolve(args[0] === "log" ? log : files);

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const scratch = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "devtrace-git-"));
  temporary.push(dir);
  return dir;
};

describe("collectGit", () => {
  it("counts commits per month and keeps the first and last day", async () => {
    const log = "2026-03-05T10:00:00+00:00\n2026-03-20T10:00:00+00:00\n2026-01-31T23:59:00-03:00\n";
    const result = await collectGit(fake(log, "src/a.ts\nsrc/b.ts\nREADME.md\nApp.java\n"));
    expect(result.commits).toBe(3);
    expect(result.firstCommit).toBe("2026-01-31");
    expect(result.lastCommit).toBe("2026-03-20");
    expect(result.months).toEqual([
      { month: "2026-01", commits: 1 },
      { month: "2026-03", commits: 2 },
    ]);
    expect(result.languages).toEqual([
      { name: "TypeScript", files: 2 },
      { name: "Java", files: 1 },
    ]);
  });

  it("passes the author filter to git and says what is wrong when nothing matches", async () => {
    const seen: string[][] = [];
    const runner: GitRunner = (args) => {
      seen.push([...args]);
      return Promise.resolve("");
    };
    await expect(collectGit(runner, { author: "me@example.com" })).rejects.toThrow(
      "no commits to count",
    );
    expect(seen[0]).toContain("--author=me@example.com");
  });

  it("maps extensions to languages and ignores unknown files", () => {
    expect(languageOf("a/b/c.tsx")).toBe("TypeScript");
    expect(languageOf("Makefile")).toBeUndefined();
    expect(languageOf(".gitignore")).toBeUndefined();
  });
});

describe("importGit", () => {
  it("writes a snapshot with counts only, and replaces a repository by its label", async () => {
    const root = await scratch();
    const now = () => new Date("2026-11-07T12:00:00Z");
    const log = "2026-03-05T10:00:00+00:00\n";
    await importGit(root, { repositoryPath: "x", label: "Private one", git: fake(log), now });
    await importGit(root, { repositoryPath: "x", label: "Another", git: fake(log), now });
    await importGit(root, {
      repositoryPath: "x",
      label: "Private one",
      git: fake(`${log}2026-04-01T00:00:00Z\n`),
      now,
    });
    const raw = await readFile(path.join(root, GIT_SNAPSHOT_FILE), "utf8");
    const snapshot = validateGitSnapshot(JSON.parse(raw));
    expect(snapshot.ok).toBe(true);
    if (snapshot.ok) {
      expect(snapshot.value.repositories.map((entry) => entry.label)).toEqual([
        "Another",
        "Private one",
      ]);
      expect(snapshot.value.repositories[1]?.commits).toBe(2);
    }
    expect(raw).not.toContain("x");
  });

  it("rejects an empty label", async () => {
    const root = await scratch();
    await expect(
      importGit(root, { repositoryPath: "x", label: "  ", git: fake("2026-01-01T00:00:00Z") }),
    ).rejects.toThrow("label");
  });

  it("reads a real repository and never stores messages, names or paths", async () => {
    const repo = await scratch();
    const root = await scratch();
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", repo, ...args], { stdio: "pipe", encoding: "utf8" });
    git("init", "-q");
    git("config", "user.email", "dev@example.com");
    git("config", "user.name", "Secret Person");
    await writeFile(path.join(repo, "secret-file.ts"), "export {}\n");
    git("add", ".");
    git("commit", "-q", "-m", "confidential message");
    const lines = await importGit(root, { repositoryPath: repo, label: "Real" });
    expect(lines[0]).toContain("1 commit(s)");
    const raw = await readFile(path.join(root, GIT_SNAPSHOT_FILE), "utf8");
    for (const secret of ["confidential", "Secret Person", "secret-file", "dev@example.com"]) {
      expect(raw).not.toContain(secret);
    }
    expect(raw).toContain("TypeScript");
  });
});

describe("devtrace import git arguments", () => {
  it("needs a folder and a label", () => {
    expect(() => parseArgs(["import", "git"])).toThrow("folder");
    expect(() => parseArgs(["import", "git", "../x"])).toThrow("--label");
    expect(
      parseArgs(["import", "git", "../x", "--label", "BuildFlow", "--author", "a@b.c"]).invocation,
    ).toEqual({
      kind: "importGit",
      repositoryPath: "../x",
      label: "BuildFlow",
      author: "a@b.c",
    });
  });

  it("keeps the usage import and refuses git options there", () => {
    expect(parseArgs(["import", "usage"]).invocation.kind).toBe("import");
    expect(() => parseArgs(["import", "usage", "--label", "x"])).toThrow("import git");
  });
});
