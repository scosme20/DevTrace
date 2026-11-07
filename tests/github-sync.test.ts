import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeError } from "../src/core/result.js";
import { syncGitHubSnapshot, type GitHubSyncOptions } from "../src/generators/github.js";
import {
  jsonResponse,
  makeReleaseResponse,
  makeRepoResponse,
  makeRepository,
  makeSnapshot,
  mockFetch,
  notFound,
  recordingSleep,
  routedFetch,
} from "./github-fixtures.js";

let root: string;
const NOW = new Date("2026-11-07T12:00:00.000Z");
const snapshotPath = () => path.join(root, "data", "github-snapshot.json");

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "devtrace-gh-"));
  await mkdir(path.join(root, "data"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeConfig(overrides: Record<string, unknown> = {}): Promise<void> {
  await writeFile(
    path.join(root, "data", "github.json"),
    JSON.stringify({ version: 1, username: "octo", ...overrides }),
    "utf8",
  );
}

async function readSnapshot(): Promise<
  { repositories: { fullName: string }[] } & Record<string, unknown>
> {
  return JSON.parse(await readFile(snapshotPath(), "utf8")) as never;
}

function options(
  fetch: ReturnType<typeof mockFetch>["fetch"],
  extra: Partial<GitHubSyncOptions> = {},
): GitHubSyncOptions {
  const { sleep } = recordingSleep();
  return { now: () => NOW, env: {}, client: { fetch, sleep, retryBaseDelayMs: 0 }, ...extra };
}

async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return describeError(error);
  }
  throw new Error("Expected the promise to reject.");
}

const listing =
  (...repos: Record<string, unknown>[]) =>
  () =>
    jsonResponse(repos);

describe("syncGitHubSnapshot", () => {
  it("does nothing, without network, when the integration is not configured", async () => {
    const { fetch, calls } = mockFetch(() => notFound());
    const message = await syncGitHubSnapshot(root, options(fetch));
    expect(message).toContain("not configured");
    expect(calls).toHaveLength(0);
    await expect(readFile(snapshotPath())).rejects.toThrow();
  });

  it("writes a validated snapshot of public repositories, sorted by name", async () => {
    await writeConfig();
    const { fetch, calls } = routedFetch({
      "/users/octo/repos": listing(
        makeRepoResponse({ full_name: "octo/zeta", name: "zeta" }),
        makeRepoResponse({ full_name: "octo/app", name: "app" }),
      ),
      "/repos/octo/app/releases/latest": () => jsonResponse(makeReleaseResponse()),
    });
    const message = await syncGitHubSnapshot(root, options(fetch));
    expect(message).toContain("(2 repositories)");

    const snapshot = await readSnapshot();
    expect(snapshot).toMatchObject({
      version: 1,
      source: "GitHub REST API",
      username: "octo",
      fetchedAt: NOW.toISOString(),
    });
    expect(snapshot.repositories.map((repository) => repository.fullName)).toEqual([
      "octo/app",
      "octo/zeta",
    ]);
    expect(snapshot.repositories[0]).toMatchObject({
      provenance: "OBSERVED",
      latestRelease: { tagName: "v1.2.0" },
    });
    expect(snapshot.repositories[1]).not.toHaveProperty("latestRelease");
    expect(calls[0]?.url.searchParams.get("per_page")).toBe("100");
  });

  it("leaves no temporary file behind", async () => {
    await writeConfig();
    const { fetch } = routedFetch({ "/users/octo/repos": listing(makeRepoResponse()) });
    await syncGitHubSnapshot(root, options(fetch));
    expect(await readdir(path.join(root, "data"))).toEqual(["github-snapshot.json", "github.json"]);
  });

  describe("repository selection", () => {
    const repos = [
      makeRepoResponse({ full_name: "octo/app", name: "app" }),
      makeRepoResponse({ full_name: "octo/forked", name: "forked", fork: true }),
      makeRepoResponse({ full_name: "octo/old", name: "old", archived: true }),
      makeRepoResponse({ full_name: "octo/scratch", name: "scratch" }),
    ];

    async function names(config: Record<string, unknown>): Promise<string[]> {
      await writeConfig(config);
      const { fetch } = routedFetch({ "/users/octo/repos": listing(...repos) });
      await syncGitHubSnapshot(root, options(fetch, { force: true }));
      return (await readSnapshot()).repositories.map((repository) => repository.fullName);
    }

    it("skips forks and archived repositories by default", async () => {
      expect(await names({ collect: { releases: false } })).toEqual(["octo/app", "octo/scratch"]);
    });

    it("includes forks and archived repositories when asked", async () => {
      expect(
        await names({
          collect: { releases: false },
          repositories: { includeForks: true, includeArchived: true },
        }),
      ).toEqual(["octo/app", "octo/forked", "octo/old", "octo/scratch"]);
    });

    it("excludes repositories by name or full name, ignoring case", async () => {
      expect(
        await names({
          collect: { releases: false },
          repositories: { exclude: ["Scratch", "OCTO/app"] },
        }),
      ).toEqual([]);
    });

    it("fetches only the listed repositories and never lists the account", async () => {
      await writeConfig({
        collect: { releases: false },
        repositories: { include: ["app", "other/tool"] },
      });
      const { fetch, calls } = routedFetch({
        "/repos/octo/app": () => jsonResponse(makeRepoResponse()),
        "/repos/other/tool": () =>
          jsonResponse(makeRepoResponse({ full_name: "other/tool", name: "tool" })),
      });
      await syncGitHubSnapshot(root, options(fetch));
      expect(calls.map((call) => call.url.pathname)).toEqual([
        "/repos/octo/app",
        "/repos/other/tool",
      ]);
      expect((await readSnapshot()).repositories.map((repository) => repository.fullName)).toEqual([
        "octo/app",
        "other/tool",
      ]);
    });

    it("lets an explicit include override the fork and archived filters", async () => {
      await writeConfig({ collect: { releases: false }, repositories: { include: ["forked"] } });
      const { fetch } = routedFetch({
        "/repos/octo/forked": () =>
          jsonResponse(makeRepoResponse({ full_name: "octo/forked", name: "forked", fork: true })),
      });
      await syncGitHubSnapshot(root, options(fetch));
      expect((await readSnapshot()).repositories).toHaveLength(1);
    });

    it("lets exclude win over include", async () => {
      await writeConfig({
        collect: { releases: false },
        repositories: { include: ["app"], exclude: ["app"] },
      });
      const { fetch } = routedFetch({ "/repos/octo/app": () => jsonResponse(makeRepoResponse()) });
      await syncGitHubSnapshot(root, options(fetch));
      expect((await readSnapshot()).repositories).toEqual([]);
    });
  });

  describe("collected information", () => {
    it("does not request releases when they are not collected", async () => {
      await writeConfig({ collect: { releases: false } });
      const { fetch, calls } = routedFetch({ "/users/octo/repos": listing(makeRepoResponse()) });
      await syncGitHubSnapshot(root, options(fetch));
      expect(calls.some((call) => call.url.pathname.endsWith("/releases/latest"))).toBe(false);
    });

    it("omits stars, forks, language and description that are not collected", async () => {
      await writeConfig({
        collect: {
          stars: false,
          forks: false,
          language: false,
          description: false,
          releases: false,
        },
      });
      const { fetch } = routedFetch({ "/users/octo/repos": listing(makeRepoResponse()) });
      await syncGitHubSnapshot(root, options(fetch));
      const [repository] = (await readSnapshot()).repositories;
      for (const field of ["stars", "forks", "language", "description"]) {
        expect(repository).not.toHaveProperty(field);
      }
    });

    it("treats a repository without releases as having none", async () => {
      await writeConfig();
      const { fetch } = routedFetch({ "/users/octo/repos": listing(makeRepoResponse()) });
      await syncGitHubSnapshot(root, options(fetch));
      expect((await readSnapshot()).repositories[0]).not.toHaveProperty("latestRelease");
    });

    it("ignores draft releases", async () => {
      await writeConfig();
      const { fetch } = routedFetch({
        "/users/octo/repos": listing(makeRepoResponse()),
        "/repos/octo/app/releases/latest": () => jsonResponse(makeReleaseResponse({ draft: true })),
      });
      await syncGitHubSnapshot(root, options(fetch));
      expect((await readSnapshot()).repositories[0]).not.toHaveProperty("latestRelease");
    });
  });

  describe("unavailable repositories", () => {
    const include = { collect: { releases: false }, repositories: { include: ["app", "ghost"] } };
    const routes = { "/repos/octo/app": () => jsonResponse(makeRepoResponse()) };

    it("skips them with a warning by default", async () => {
      await writeConfig(include);
      const warnings: string[] = [];
      const { fetch } = routedFetch(routes);
      await syncGitHubSnapshot(root, options(fetch, { warn: (message) => warnings.push(message) }));
      expect(warnings).toEqual(['Repository "octo/ghost" is unavailable. It was skipped.']);
      expect((await readSnapshot()).repositories.map((repository) => repository.fullName)).toEqual([
        "octo/app",
      ]);
    });

    it("fails the whole sync when configured to, leaving the previous snapshot untouched", async () => {
      await writeConfig({ ...include, onUnavailable: "FAIL" });
      await writeFile(
        snapshotPath(),
        JSON.stringify(makeSnapshot([makeRepository({ stars: 99 })])),
        "utf8",
      );
      const before = await readFile(snapshotPath(), "utf8");
      const { fetch } = routedFetch(routes);
      const message = await failureOf(syncGitHubSnapshot(root, options(fetch, { force: true })));
      expect(message).toContain("Failed to sync GitHub data.");
      expect(message).toContain('Repository "octo/ghost" is unavailable.');
      expect(await readFile(snapshotPath(), "utf8")).toBe(before);
    });

    it("never stores a repository that is not public, even if the API returns it", async () => {
      await writeConfig({ collect: { releases: false } });
      const warnings: string[] = [];
      const { fetch } = routedFetch({
        "/users/octo/repos": listing(
          makeRepoResponse({ full_name: "octo/open", name: "open" }),
          makeRepoResponse({ full_name: "octo/secret", name: "secret", private: true }),
        ),
      });
      await syncGitHubSnapshot(root, options(fetch, { warn: (message) => warnings.push(message) }));
      const stored = await readFile(snapshotPath(), "utf8");
      expect(stored).toContain("octo/open");
      expect(stored).not.toContain("secret");
      expect(warnings).toEqual(['Repository "octo/secret" is not public. It was skipped.']);
    });

    it("can fail on a repository that is not public", async () => {
      await writeConfig({
        collect: { releases: false },
        onUnavailable: "FAIL",
        repositories: { include: ["secret"] },
      });
      const { fetch } = routedFetch({
        "/repos/octo/secret": () =>
          jsonResponse(
            makeRepoResponse({ full_name: "octo/secret", name: "secret", private: true }),
          ),
      });
      expect(await failureOf(syncGitHubSnapshot(root, options(fetch)))).toContain("is not public");
    });
  });

  describe("failures", () => {
    it("keeps the previous snapshot byte for byte when the API is down", async () => {
      await writeConfig();
      await writeFile(snapshotPath(), JSON.stringify(makeSnapshot()), "utf8");
      const before = await readFile(snapshotPath(), "utf8");
      const { fetch, calls } = mockFetch(() =>
        jsonResponse({ message: "Service Unavailable" }, { status: 503 }),
      );
      const message = await failureOf(syncGitHubSnapshot(root, options(fetch, { force: true })));
      expect(message).toContain("Failed to sync GitHub data.");
      expect(message).toContain("HTTP 503");
      expect(calls).toHaveLength(3);
      expect(await readFile(snapshotPath(), "utf8")).toBe(before);
      expect(await readdir(path.join(root, "data"))).not.toContain("github-snapshot.json.tmp");
    });

    it("writes nothing when a later request fails, so a partial result is never stored", async () => {
      await writeConfig();
      const { fetch } = routedFetch({
        "/users/octo/repos": listing(makeRepoResponse()),
        "/repos/octo/app/releases/latest": () => jsonResponse({}, { status: 500 }),
      });
      await failureOf(syncGitHubSnapshot(root, options(fetch)));
      await expect(readFile(snapshotPath())).rejects.toThrow();
    });

    it("explains how to raise the rate limit", async () => {
      await writeConfig();
      const { fetch } = mockFetch(() =>
        jsonResponse(
          { message: "API rate limit exceeded" },
          {
            status: 403,
            headers: {
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": String(Math.floor(NOW.getTime() / 1000) + 7200),
            },
          },
        ),
      );
      const message = await failureOf(
        syncGitHubSnapshot(
          root,
          options(fetch, {
            client: { fetch, now: () => NOW.getTime(), sleep: () => Promise.resolve() },
          }),
        ),
      );
      expect(message).toContain("rate limit exceeded");
      expect(message).toContain("GITHUB_TOKEN");
    });

    it("rejects an invalid configuration with details", async () => {
      await writeConfig({ username: "not valid!" });
      const { fetch, calls } = mockFetch(() => notFound());
      const message = await failureOf(syncGitHubSnapshot(root, options(fetch)));
      expect(message).toContain("Failed to load GitHub configuration.");
      expect(message).toContain("Invalid GitHub username.");
      expect(calls).toHaveLength(0);
    });

    it("refuses to continue when the existing snapshot is invalid", async () => {
      await writeConfig();
      await writeFile(snapshotPath(), JSON.stringify({ version: 1 }), "utf8");
      const { fetch } = mockFetch(() => notFound());
      expect(await failureOf(syncGitHubSnapshot(root, options(fetch)))).toContain(
        "Failed to load GitHub snapshot configuration.",
      );
    });
  });

  describe("cache", () => {
    const fresh = (minutesAgo: number, overrides = {}) =>
      JSON.stringify(
        makeSnapshot([makeRepository()], {
          fetchedAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
          ...overrides,
        }),
      );

    it("reuses a recent snapshot without calling the API", async () => {
      await writeConfig({ cacheTtlMinutes: 60 });
      await writeFile(snapshotPath(), fresh(10), "utf8");
      const { fetch, calls } = mockFetch(() => notFound());
      const message = await syncGitHubSnapshot(root, options(fetch));
      expect(message).toContain("up to date (synced 10 minute(s) ago)");
      expect(calls).toHaveLength(0);
    });

    it("refreshes a snapshot older than the TTL", async () => {
      await writeConfig({ cacheTtlMinutes: 5, collect: { releases: false } });
      await writeFile(snapshotPath(), fresh(10), "utf8");
      const { fetch, calls } = routedFetch({ "/users/octo/repos": listing(makeRepoResponse()) });
      await syncGitHubSnapshot(root, options(fetch));
      expect(calls.length).toBeGreaterThan(0);
      expect((await readSnapshot()).fetchedAt).toBe(NOW.toISOString());
    });

    it("refreshes when forced", async () => {
      await writeConfig({ collect: { releases: false } });
      await writeFile(snapshotPath(), fresh(1), "utf8");
      const { fetch, calls } = routedFetch({ "/users/octo/repos": listing(makeRepoResponse()) });
      await syncGitHubSnapshot(root, options(fetch, { force: true }));
      expect(calls.length).toBeGreaterThan(0);
    });

    it("always refreshes when the TTL is zero", async () => {
      await writeConfig({ cacheTtlMinutes: 0, collect: { releases: false } });
      await writeFile(snapshotPath(), fresh(0), "utf8");
      const { fetch, calls } = routedFetch({ "/users/octo/repos": listing(makeRepoResponse()) });
      await syncGitHubSnapshot(root, options(fetch));
      expect(calls.length).toBeGreaterThan(0);
    });

    it("does not reuse a snapshot of another user", async () => {
      await writeConfig({ collect: { releases: false } });
      await writeFile(snapshotPath(), fresh(1, { username: "someone-else" }), "utf8");
      const { fetch, calls } = routedFetch({ "/users/octo/repos": listing(makeRepoResponse()) });
      await syncGitHubSnapshot(root, options(fetch));
      expect(calls.length).toBeGreaterThan(0);
    });

    it("does not trust a snapshot dated in the future", async () => {
      await writeConfig({ collect: { releases: false } });
      await writeFile(snapshotPath(), fresh(-30), "utf8");
      const { fetch, calls } = routedFetch({ "/users/octo/repos": listing(makeRepoResponse()) });
      await syncGitHubSnapshot(root, options(fetch));
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  describe("token", () => {
    it("uses GITHUB_TOKEN from the environment", async () => {
      await writeConfig({ collect: { releases: false } });
      const { fetch, calls } = routedFetch({ "/users/octo/repos": listing(makeRepoResponse()) });
      await syncGitHubSnapshot(root, options(fetch, { env: { GITHUB_TOKEN: " secret-token " } }));
      expect(calls[0]?.headers.get("authorization")).toBe("Bearer secret-token");
    });

    it("works without a token", async () => {
      await writeConfig({ collect: { releases: false } });
      for (const env of [{}, { GITHUB_TOKEN: "" }, { GITHUB_TOKEN: "   " }]) {
        const { fetch, calls } = routedFetch({ "/users/octo/repos": listing(makeRepoResponse()) });
        await syncGitHubSnapshot(root, options(fetch, { env, force: true }));
        expect(calls[0]?.headers.has("authorization")).toBe(false);
      }
    });

    it("never writes the token to the snapshot, the warnings or the result", async () => {
      await writeConfig({ repositories: { include: ["ghost"] } });
      const warnings: string[] = [];
      const { fetch } = routedFetch({});
      const message = await syncGitHubSnapshot(
        root,
        options(fetch, {
          env: { GITHUB_TOKEN: "secret-token" },
          warn: (warning) => warnings.push(warning),
        }),
      );
      const stored = await readFile(snapshotPath(), "utf8");
      expect([stored, message, ...warnings].join("\n")).not.toContain("secret-token");
    });

    it("never puts the token in a failure", async () => {
      await writeConfig();
      const { fetch } = mockFetch(() =>
        jsonResponse({ message: "Bad credentials" }, { status: 401 }),
      );
      const message = await failureOf(
        syncGitHubSnapshot(root, options(fetch, { env: { GITHUB_TOKEN: "secret-token" } })),
      );
      expect(message).toContain("GITHUB_TOKEN");
      expect(message).not.toContain("secret-token");
    });
  });
});
