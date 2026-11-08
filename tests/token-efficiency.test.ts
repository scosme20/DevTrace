import { describe, expect, it } from "vitest";
import { validateDeveloperActivityConfig } from "../src/core/developer-activity-validation.js";
import { validateUsageSnapshot, type UsageSnapshot } from "../src/core/usage-snapshot.js";
import {
  computeActivityStats,
  EFFICIENCY_MIN_DAYS,
} from "../src/indicators/developer-activity/stats.js";
import { renderDeveloperActivityDashboard } from "../src/templates/developer-activity-dashboard.js";
import { aggregateUsage } from "../src/usage/aggregate.js";
import { makeRepository, makeSnapshot } from "./github-fixtures.js";

// The efficiency heatmap colors a day by the tokens spent per commit. It is a
// use measure ranked against the user's own days, so these tests check that it
// never turns missing data into a verdict.

const FETCHED = "2026-03-19T08:00:00.000Z"; // a Thursday
const LAST_SUNDAY = "2026-03-15";
const WEEK_STARTS = ["2026-03-01", "2026-03-08", LAST_SUNDAY];

const settingsOf = (overrides: Record<string, unknown> = {}) => {
  const result = validateDeveloperActivityConfig({ version: 1, settings: overrides });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.value.settings;
};

const repository = makeRepository({
  fullName: "octo/alpha",
  name: "alpha",
  commitActivity: WEEK_STARTS.map((weekStart) => ({ weekStart, days: [2, 2, 2, 2, 2, 2, 2] })),
});
const snapshot = makeSnapshot([repository], { fetchedAt: FETCHED });

/** Tokens for the days from 2026-03-01 on, one value per day. */
function usageOf(perDay: readonly number[]): UsageSnapshot {
  return {
    version: 1,
    kind: "LOCAL_USAGE",
    period: { start: "2026-03-01", end: "2026-03-19" },
    sources: [{ label: "Claude Code", files: 1 }],
    models: [],
    days: perDay.map((tokens, index) => ({
      date: `2026-03-${String(index + 1).padStart(2, "0")}`,
      tokens,
    })),
  };
}

const EFFICIENCY = { heatmapMode: "TOKEN_EFFICIENCY" };

describe("the heatmapMode setting", () => {
  it("defaults to COMMITS and only accepts the two modes", () => {
    expect(settingsOf().heatmapMode).toBe("COMMITS");
    expect(validateDeveloperActivityConfig({ version: 1, settings: { heatmapMode: "X" } }).ok).toBe(
      false,
    );
  });

  it("adds no efficiency data in COMMITS mode", () => {
    expect(computeActivityStats(snapshot, settingsOf(), usageOf([100])).efficiency).toBeUndefined();
  });
});

describe("tokens per commit", () => {
  const settings = settingsOf(EFFICIENCY);

  it("ranks days against each other: fewer tokens per commit scores higher", () => {
    // 2 commits a day on 19 days; tokens grow with the day, so day 1 is the best.
    const usage = usageOf(Array.from({ length: 19 }, (_, index) => (index + 1) * 200));
    const efficiency = computeActivityStats(snapshot, settings, usage).efficiency;
    expect(efficiency?.ready).toBe(true);
    expect(efficiency?.matchedDays).toBe(19);
    const scores = efficiency?.heatmap ?? [];
    expect(scores[0]).toBe(4);
    expect(scores[18]).toBe(1);
    expect(Math.min(...scores.filter((s): s is number => s !== null))).toBe(1);
  });

  it("leaves a day unknown when it has no tokens, and when it has no commits", () => {
    const usage = usageOf([0, 400, 400, 400, 400, 400, 400, 400, 400, 400]);
    const efficiency = computeActivityStats(snapshot, settings, usage).efficiency;
    expect(efficiency?.heatmap[0]).toBeNull();
    // Days after the fetch date have not happened.
    expect(efficiency?.heatmap.at(-1)).toBeNull();
    expect(efficiency?.matchedDays).toBe(9);
  });

  it("is not ready, and colors nothing, below the minimum number of days", () => {
    const usage = usageOf(Array.from({ length: EFFICIENCY_MIN_DAYS - 1 }, () => 500));
    const efficiency = computeActivityStats(snapshot, settings, usage).efficiency;
    expect(efficiency?.ready).toBe(false);
    expect(efficiency?.heatmap.every((value) => value === null)).toBe(true);
  });

  it("is not ready when the usage snapshot has no daily tokens", () => {
    const without = { ...usageOf([]), days: undefined };
    expect(computeActivityStats(snapshot, settings, without).efficiency?.ready).toBe(false);
    expect(computeActivityStats(snapshot, settings, undefined).efficiency?.matchedDays).toBe(0);
  });

  it("reports the median tokens per commit", () => {
    const usage = usageOf(Array.from({ length: 10 }, () => 1000));
    expect(computeActivityStats(snapshot, settings, usage).efficiency?.median).toBe(500);
  });
});

describe("the efficiency panel", () => {
  const render = (usage: UsageSnapshot | undefined) => {
    const settings = settingsOf(EFFICIENCY);
    return renderDeveloperActivityDashboard(computeActivityStats(snapshot, settings, usage), {
      profile: { displayName: "Octo" },
      settings,
      generatorVersion: "0.0.0-test",
    });
  };

  it("says what it is and that it is an estimate, not a verdict on quality", () => {
    const svg = render(usageOf(Array.from({ length: 12 }, (_, index) => (index + 1) * 100)));
    expect(svg).toContain("TOKEN EFFICIENCY HEATMAP");
    expect(svg).toContain("Estimated");
    expect(svg.toLowerCase()).toContain("a use measure, not quality");
    expect(svg).toContain("More tokens");
    expect(svg).not.toContain("COMMIT HEATMAP");
  });

  it("explains what is missing instead of drawing an empty grid", () => {
    const svg = render(undefined);
    expect(svg.toLowerCase()).toContain(
      `needs ${String(EFFICIENCY_MIN_DAYS)} days with commits and tokens`,
    );
    expect(svg.toLowerCase()).toContain("0 found");
  });

  it("keeps the commit heatmap in the default mode", () => {
    const settings = settingsOf();
    const svg = renderDeveloperActivityDashboard(computeActivityStats(snapshot, settings), {
      profile: { displayName: "Octo" },
      settings,
      generatorVersion: "0.0.0-test",
    });
    expect(svg).toContain("COMMIT HEATMAP");
    expect(svg).not.toContain("TOKEN EFFICIENCY");
  });
});

describe("daily tokens in the usage import", () => {
  const record = (timestamp: string, input: number, output: number) => ({
    source: "CLAUDE_CODE" as const,
    model: "claude-test",
    timestamp,
    input,
    cached: 0,
    output,
  });

  it("sums input and output of all models per day, oldest first, inside the period", () => {
    const snap = aggregateUsage(
      [
        record("2026-03-02T10:00:00Z", 100, 10),
        record("2026-03-01T23:00:00Z", 50, 5),
        record("2026-03-02T11:00:00Z", 20, 2),
        record("2026-02-28T10:00:00Z", 999, 9),
      ],
      { start: "2026-03-01", end: "2026-03-31" },
      { CLAUDE_CODE: 1, CODEX: 0 },
    );
    expect(snap.days).toEqual([
      { date: "2026-03-01", tokens: 55 },
      { date: "2026-03-02", tokens: 132 },
    ]);
  });

  it("stores only a date and a number, and old files without days stay valid", () => {
    const snap = aggregateUsage(
      [record("2026-03-02T10:00:00Z", 1, 1)],
      {
        start: "2026-03-01",
        end: "2026-03-31",
      },
      { CLAUDE_CODE: 1, CODEX: 0 },
    );
    expect(validateUsageSnapshot(snap).ok).toBe(true);
    const older: Record<string, unknown> = { ...snap };
    delete older["days"];
    expect(validateUsageSnapshot(older).ok).toBe(true);
    expect(
      validateUsageSnapshot({ ...snap, days: [{ date: "2026-03-02", tokens: 1, x: 1 }] }).ok,
    ).toBe(false);
  });
});
