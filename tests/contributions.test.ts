import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateGitHubSnapshot } from "../src/core/github-validation.js";
import { generateDeveloperActivity } from "../src/generators/developer-activity.js";
import type { GitHubClient } from "../src/github/client.js";
import { collectContributions } from "../src/github/contributions.js";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const item = (repository: string, state: "open" | "closed", merged: boolean, updated: string) => ({
  repository_url: `https://api.github.com/repos/${repository}`,
  state,
  updated_at: updated,
  pull_request: { merged_at: merged ? updated : null },
  title: "a private title that must not be kept",
});

const clientReturning = (body: unknown, seen: string[] = []): GitHubClient => ({
  getJson: (requestPath) => {
    seen.push(requestPath);
    return Promise.resolve(body);
  },
  getAllPages: () => Promise.resolve([]),
});

describe("collectContributions", () => {
  it("counts merged, open and closed pull requests per repository", async () => {
    const seen: string[] = [];
    const result = await collectContributions(
      clientReturning(
        {
          total_count: 4,
          items: [
            item("acme/lib", "closed", true, "2026-10-01T00:00:00Z"),
            item("acme/lib", "closed", true, "2026-10-05T00:00:00Z"),
            item("acme/lib", "open", false, "2026-10-06T00:00:00Z"),
            item("other/tool", "closed", false, "2026-09-01T00:00:00Z"),
          ],
        },
        seen,
      ),
      "someone",
    );
    expect(result.truncated).toBe(false);
    expect(result.contributions).toEqual([
      {
        repository: "acme/lib",
        merged: 2,
        open: 1,
        closed: 0,
        lastActivity: "2026-10-06T00:00:00Z",
      },
      {
        repository: "other/tool",
        merged: 0,
        open: 0,
        closed: 1,
        lastActivity: "2026-09-01T00:00:00Z",
      },
    ]);
    const query = decodeURIComponent(seen[0] ?? "");
    expect(query).toContain("author:someone type:pr is:public -user:someone");
    expect(JSON.stringify(result)).not.toContain("private title");
  });

  it("says when more pull requests exist than one page holds", async () => {
    const result = await collectContributions(
      clientReturning({
        total_count: 250,
        items: [item("acme/lib", "closed", true, "2026-10-01T00:00:00Z")],
      }),
      "someone",
    );
    expect(result.truncated).toBe(true);
  });

  it("refuses a response of an unexpected shape", async () => {
    await expect(collectContributions(clientReturning({ nope: true }), "someone")).rejects.toThrow(
      "Unexpected GitHub response",
    );
  });
});

describe("the contributions panel", () => {
  const snapshot = (extra: object) => ({
    version: 1,
    source: "GitHub REST API",
    username: "someone",
    fetchedAt: "2026-11-07T00:00:00Z",
    repositories: [],
    ...extra,
  });

  it("is accepted by the snapshot schema", () => {
    const result = validateGitHubSnapshot(
      snapshot({
        contributions: [
          { repository: "acme/lib", merged: 1, open: 0, closed: 0, lastActivity: "2026-10-01" },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });

  async function render(settings: object, extra: object): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "devtrace-contrib-"));
    temporary.push(root);
    await mkdir(path.join(root, "data"));
    await writeFile(
      path.join(root, "data/developer-activity.json"),
      JSON.stringify({ version: 1, settings }),
    );
    await writeFile(path.join(root, "data/github-snapshot.json"), JSON.stringify(snapshot(extra)));
    return readFile(await generateDeveloperActivity(root), "utf8");
  }

  const contributions = [
    { repository: "acme/lib", merged: 3, open: 1, closed: 0, lastActivity: "2026-10-06" },
  ];

  it("lists the repositories when asked for", async () => {
    const svg = await render({ showContributions: true }, { contributions });
    expect(svg).toMatch(/open source contributions/i);
    expect(svg).toContain("acme/lib");
    expect(svg).toContain("3 merged");
    expect(svg).toContain("1 open");
  });

  it("stays out when the setting is off", async () => {
    const svg = await render({}, { contributions });
    expect(svg).not.toContain("acme/lib");
  });
});
