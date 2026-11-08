import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateAiEngineeringStats } from "../src/generators/ai-engineering.js";
import { generateDeveloperActivity } from "../src/generators/developer-activity.js";
import { aggregateUsage, mondayOf } from "../src/usage/aggregate.js";
import type { UsageRecord } from "../src/usage/parsers.js";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function project(files: Record<string, unknown>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "devtrace-panels-"));
  temporary.push(root);
  await mkdir(path.join(root, "data"), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(root, name), JSON.stringify(content));
  }
  return root;
}

const record = (timestamp: string, input: number, output: number): UsageRecord => ({
  source: "CLAUDE_CODE",
  model: "claude-sonnet-5-5",
  timestamp,
  input,
  cached: 0,
  output,
});

describe("weekly usage", () => {
  it("finds the Monday of a week", () => {
    expect(mondayOf("2026-11-08")).toBe("2026-11-02"); // a Sunday
    expect(mondayOf("2026-11-02")).toBe("2026-11-02");
    expect(mondayOf("2026-11-04")).toBe("2026-11-02");
  });

  it("sums input and output per week, inside the period only", () => {
    const snapshot = aggregateUsage(
      [
        record("2026-11-02T10:00:00Z", 10, 5),
        record("2026-11-05T10:00:00Z", 20, 5),
        record("2026-11-09T10:00:00Z", 100, 0),
        record("2026-10-01T10:00:00Z", 999, 999),
      ],
      { start: "2026-11-01", end: "2026-11-30" },
      { CLAUDE_CODE: 1, CODEX: 0 },
    );
    expect(snapshot.weekly).toEqual([
      { weekStart: "2026-11-02", tokens: 40 },
      { weekStart: "2026-11-09", tokens: 100 },
    ]);
  });
});

const aiConfig = (settings: object) => ({
  version: 1,
  profile: { displayName: "Test" },
  settings: { dashboard: true, usageSnapshot: true, showTokenUsage: true, ...settings },
  tools: [],
  models: [],
  skills: [],
  projects: [],
  activities: [],
  tokenUsage: [],
});

const usageSnapshot = (weeks: number) => {
  const weekly = Array.from({ length: weeks }, (_, index) => {
    const start = new Date(Date.UTC(2026, 8, 7 + index * 7));
    return { weekStart: start.toISOString().slice(0, 10), tokens: 1000 * (index + 1) };
  });
  const last = new Date(`${weekly.at(-1)?.weekStart ?? ""}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() + 6);
  return {
    version: 1,
    kind: "LOCAL_USAGE",
    period: { start: weekly[0]?.weekStart, end: last.toISOString().slice(0, 10) },
    sources: [{ label: "Claude Code", files: 1 }],
    models: [
      {
        name: "claude-sonnet-5-5",
        provider: "Anthropic",
        modelFamily: "Claude",
        sources: ["Claude Code"],
        inputTokens: 1000,
        cachedInputTokens: 0,
        outputTokens: 10,
      },
    ],
    weekly,
  };
};

async function aiSvg(settings: object, weeks: number): Promise<string> {
  const root = await project({
    "data/ai-engineering.json": aiConfig(settings),
    "data/usage-snapshot.json": usageSnapshot(weeks),
  });
  return readFile(await generateAiEngineeringStats(root), "utf8");
}

describe("the token trend panel", () => {
  it("is off by default", async () => {
    expect(await aiSvg({}, 9)).not.toMatch(/token trend/i);
  });

  it("shows the weeks and the change when there are 8 complete weeks", async () => {
    const svg = await aiSvg({ showTokenTrend: true }, 8);
    expect(svg).toMatch(/token trend/i);
    // Weeks 5-8 (5+6+7+8=26) against weeks 1-4 (1+2+3+4=10), in thousands: +160%.
    expect(svg).toContain("+160%");
  });

  it("says a change needs more weeks instead of inventing one", async () => {
    const svg = await aiSvg({ showTokenTrend: true }, 4);
    expect(svg).toMatch(/token trend/i);
    expect(svg).toMatch(/a change needs 8 complete weeks of data/i);
    expect(svg).not.toMatch(/last 4 weeks vs/i);
  });

  it("is not drawn for a snapshot made before weekly data existed", async () => {
    const root = await project({
      "data/ai-engineering.json": aiConfig({ showTokenTrend: true }),
      "data/usage-snapshot.json": { ...usageSnapshot(4), weekly: undefined },
    });
    const svg = await readFile(await generateAiEngineeringStats(root), "utf8");
    expect(svg).not.toMatch(/token trend/i);
  });
});

const gitSnapshot = {
  version: 1,
  kind: "LOCAL_GIT",
  repositories: [
    {
      label: "BuildFlow",
      commits: 240,
      firstCommit: "2026-06-26",
      lastCommit: "2026-11-07",
      months: [
        { month: "2026-06", commits: 40 },
        { month: "2026-11", commits: 200 },
      ],
      languages: [{ name: "TypeScript", files: 120 }],
      filteredByAuthor: false,
      importedAt: "2026-11-07",
    },
  ],
};

describe("the local repositories panel", () => {
  it("is off unless showLocalGit is set, even when the data exists", async () => {
    const root = await project({
      "data/developer-activity.json": { version: 1 },
      "data/git-snapshot.json": gitSnapshot,
    });
    const warnings: string[] = [];
    const svg = await readFile(
      await generateDeveloperActivity(root, { warn: (m) => warnings.push(m) }),
      "utf8",
    );
    expect(svg).not.toContain("BuildFlow");
  });

  it("lists the repository by its label with counts only", async () => {
    const root = await project({
      "data/developer-activity.json": { version: 1, settings: { showLocalGit: true } },
      "data/git-snapshot.json": gitSnapshot,
    });
    const svg = await readFile(await generateDeveloperActivity(root), "utf8");
    expect(svg).toMatch(/local repositories/i);
    expect(svg).toContain("BuildFlow");
    expect(svg).toContain("240 commits");
    expect(svg).toContain("2 months with activity");
  });

  it("warns when it is on but nothing was imported", async () => {
    const root = await project({
      "data/developer-activity.json": { version: 1, settings: { showLocalGit: true } },
    });
    const warnings: string[] = [];
    await generateDeveloperActivity(root, { warn: (m) => warnings.push(m) });
    expect(warnings.join("\n")).toContain("devtrace import git");
  });
});
