import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli/main.js";
import { LAYOUTS } from "../src/core/appearance.js";
import { validateDeveloperActivityConfig } from "../src/core/developer-activity-validation.js";
import type { GitHubRepository, GitHubSnapshot } from "../src/core/github-models.js";
import { validateGitHubConfig, validateGitHubSnapshot } from "../src/core/github-validation.js";
import { THEMES } from "../src/core/models.js";
import { generateDeveloperActivity } from "../src/generators/developer-activity.js";
import { GitHubApiError } from "../src/github/client.js";
import { collectRepositories } from "../src/github/collect.js";
import { computeActivityStats } from "../src/indicators/developer-activity/stats.js";
import { renderDeveloperActivityDashboard } from "../src/templates/developer-activity-dashboard.js";
import { LONG, tokensFor } from "./appearance-fixtures.js";
import { outOfBounds, parseBoxes } from "./component-geometry.js";
import {
  fakeClient,
  makeRepoResponse,
  makeReleaseResponse,
  makeRepository,
  makeSnapshot,
} from "./github-fixtures.js";

// ---------------------------------------------------------------- fixtures

const FETCHED = "2026-03-19T08:00:00.000Z"; // a Thursday
const LAST_SUNDAY = "2026-03-15";

/** `count` weeks ending on LAST_SUNDAY. `days(week, day)` gives the commits of a day. */
function weeks(count: number, days: (week: number, day: number) => number = () => 1) {
  const end = new Date(`${LAST_SUNDAY}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7 * (count - 1 - index));
    return {
      weekStart: start.toISOString().slice(0, 10),
      days: Array.from({ length: 7 }, (_unused, day) => days(index, day)),
    };
  });
}

function repo(name: string, overrides: Partial<GitHubRepository> = {}): GitHubRepository {
  return makeRepository({
    fullName: `octo/${name}`,
    name,
    url: `https://github.com/octo/${name}`,
    pushedAt: "2026-03-10T00:00:00Z",
    latestRelease: undefined,
    ...overrides,
  });
}

const settingsOf = (overrides: Record<string, unknown> = {}) => {
  const result = validateDeveloperActivityConfig({ version: 1, settings: overrides });
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.value.settings;
};

const FULL_REPOS = [
  repo("alpha", {
    language: "TypeScript",
    commitActivity: weeks(52, (w, d) => (w + d) % 4),
    languages: [
      { name: "TypeScript", bytes: 9000 },
      { name: "CSS", bytes: 1000 },
    ],
    latestRelease: { tagName: "v1.0.0", publishedAt: "2026-02-01T10:00:00Z" },
    pushedAt: "2026-03-18T10:00:00Z",
  }),
  repo("bravo", {
    language: "Go",
    commitActivity: weeks(52, (w, d) => (w * d) % 3),
    languages: [{ name: "Go", bytes: 5000 }],
    latestRelease: { tagName: "v0.2.0", publishedAt: "2026-03-01T10:00:00Z" },
    pushedAt: "2026-03-05T10:00:00Z",
  }),
];

function snapshotOf(
  repositories: readonly GitHubRepository[],
  fetchedAt = FETCHED,
): GitHubSnapshot {
  return makeSnapshot(repositories, { fetchedAt });
}

function render(
  repositories: readonly GitHubRepository[] | null = FULL_REPOS,
  overrides: Record<string, unknown> = {},
): string {
  const settings = settingsOf(overrides);
  return renderDeveloperActivityDashboard(
    computeActivityStats(repositories === null ? undefined : snapshotOf(repositories), settings),
    { profile: { displayName: "Octo" }, settings, generatorVersion: "0.0.0-test" },
  );
}

function size(svg: string): { width: number; height: number } {
  const match = /<svg [^>]*width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  if (match === null) throw new Error("No SVG root.");
  expect([match[3], match[4]]).toEqual([match[1], match[2]]);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function assertInside(svg: string): void {
  const { width, height } = size(svg);
  const body = svg.slice(svg.indexOf("</desc>") + 7, svg.lastIndexOf("</svg>"));
  expect(outOfBounds(parseBoxes(body, tokensFor({}).metrics), width, height)).toEqual([]);
}

const PANELS = {
  heatmap: "COMMIT HEATMAP",
  commits: "COMMIT ACTIVITY",
  repositories: "REPOSITORY ACTIVITY",
  languages: "PROGRAMMING LANGUAGES",
  releases: "RELEASES",
} as const;

// -------------------------------------------------------------- collection

describe("collecting languages and commit activity", () => {
  const config = (collect: Record<string, unknown>) => {
    const result = validateGitHubConfig({ version: 1, username: "octo", collect });
    if (!result.ok) throw new Error(result.errors.join("\n"));
    return result.value;
  };
  const apiWeeks = [
    { week: 1_772_928_000, total: 3, days: [0, 1, 0, 2, 0, 0, 0] }, // 2026-03-08
    { week: 1_773_532_800, total: 1, days: [1, 0, 0, 0, 0, 0, 0] }, // 2026-03-15
  ];
  const client = (extra: (path: string) => unknown) =>
    fakeClient({
      getAllPages: () => [makeRepoResponse()],
      getJson: (path) => {
        if (path.endsWith("/releases/latest")) return makeReleaseResponse();
        return extra(path);
      },
    });

  it("makes no extra call unless the options are on", async () => {
    const paths: string[] = [];
    const result = await collectRepositories(
      client((path) => {
        paths.push(path);
        return {};
      }),
      config({}),
      () => undefined,
    );
    expect(paths.filter((path) => !path.endsWith("/releases/latest"))).toEqual([]);
    expect(result[0]).not.toHaveProperty("languages");
    expect(result[0]).not.toHaveProperty("commitActivity");
  });

  it("keeps bytes per language, largest first, and the weeks in order", async () => {
    const result = await collectRepositories(
      client((path) =>
        path.endsWith("/languages") ? { CSS: 10, TypeScript: 900 } : apiWeeks.slice().reverse(),
      ),
      config({ languages: true, commitActivity: true }),
      () => undefined,
    );
    expect(result[0]?.languages).toEqual([
      { name: "TypeScript", bytes: 900 },
      { name: "CSS", bytes: 10 },
    ]);
    expect(result[0]?.commitActivity?.map((week) => week.weekStart)).toEqual([
      "2026-03-08",
      "2026-03-15",
    ]);
  });

  it("treats statistics that are not ready as unknown, with a warning, never as zero", async () => {
    const warnings: string[] = [];
    const result = await collectRepositories(
      client((path) => (path.endsWith("/languages") ? {} : {})),
      config({ languages: true, commitActivity: true }),
      (message) => warnings.push(message),
    );
    expect(result[0]).not.toHaveProperty("commitActivity");
    expect(result[0]).not.toHaveProperty("languages");
    expect(warnings.join(" ")).toContain("not available yet");
  });

  it("treats an empty repository (no content) as unknown too", async () => {
    const result = await collectRepositories(
      fakeClient({
        getAllPages: () => [makeRepoResponse()],
        getJson: (path) => {
          if (path.endsWith("/stats/commit_activity")) {
            throw new GitHubApiError("invalid_response", "GitHub API returned invalid JSON.");
          }
          return path.endsWith("/releases/latest") ? makeReleaseResponse() : {};
        },
      }),
      config({ commitActivity: true }),
      () => undefined,
    );
    expect(result[0]).not.toHaveProperty("commitActivity");
  });

  it("still fails on a rate limit instead of returning partial data", async () => {
    await expect(
      collectRepositories(
        fakeClient({
          getAllPages: () => [makeRepoResponse()],
          getJson: (path) => {
            if (path.endsWith("/releases/latest")) return makeReleaseResponse();
            throw new GitHubApiError("rate_limited", "GitHub API rate limit exceeded.");
          },
        }),
        config({ commitActivity: true }),
        () => undefined,
      ),
    ).rejects.toThrow(/rate limit/);
  });

  it("validates the new snapshot fields and the new options", () => {
    expect(validateGitHubSnapshot(snapshotOf(FULL_REPOS)).ok).toBe(true);
    const bad = snapshotOf([
      repo("x", { commitActivity: [{ weekStart: "2026-03-15", days: [1, 2] }] }),
    ]);
    expect(validateGitHubSnapshot(bad).ok).toBe(false);
    expect(
      validateGitHubConfig({ version: 1, username: "octo", collect: { languages: "yes" } }).ok,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------- statistics

describe("commit activity statistics", () => {
  const stats = computeActivityStats(snapshotOf(FULL_REPOS), settingsOf());

  it("sums the commits of the repositories that reported them", () => {
    expect(stats.commits?.reposWithData).toBe(2);
    expect(stats.commits?.weeks).toBe(52);
    expect(stats.commits?.heatmap).toHaveLength(52 * 7);
  });

  it("marks days that have not happened as no data, not as zero", () => {
    const heatmap = stats.commits?.heatmap ?? [];
    // The data was fetched on a Thursday: Friday and Saturday of the last week are unknown.
    expect(heatmap.slice(-2)).toEqual([null, null]);
    expect(heatmap.slice(-7, -2).every((value) => value !== null)).toBe(true);
    expect(stats.commits?.to).toBe("2026-03-19");
  });

  it("tells a real zero from a missing value", () => {
    const quiet = computeActivityStats(
      snapshotOf([repo("quiet", { commitActivity: weeks(52, () => 0) })]),
      settingsOf(),
    );
    expect(quiet.commits?.total).toBe(0);
    expect(quiet.commits?.heatmap.filter((value) => value === 0).length).toBeGreaterThan(300);
    const unknown = computeActivityStats(snapshotOf([repo("none")]), settingsOf());
    expect(unknown.commits).toBeUndefined();
  });

  it("groups by month and flags the partial first and last months", () => {
    const months = stats.commits?.months ?? [];
    expect(months.length).toBeLessThanOrEqual(12);
    expect(months.at(-1)).toMatchObject({ month: "2026-03", partial: true });
    expect(months.slice(1, -1).every((month) => !month.partial)).toBe(true);
    const sum = months.reduce((total, month) => total + month.commits, 0);
    expect(sum).toBeLessThanOrEqual(stats.commits?.total ?? 0);
  });

  it("compares two equal complete periods only, from every repository", () => {
    expect(stats.commits?.trend).toMatchObject({ weeks: 13 });
    const partialCoverage = computeActivityStats(
      snapshotOf([...FULL_REPOS, repo("silent")]),
      settingsOf(),
    );
    expect(partialCoverage.commits?.trend).toBeUndefined();
    const short = computeActivityStats(
      snapshotOf([repo("young", { commitActivity: weeks(20) })]),
      settingsOf(),
    );
    expect(short.commits?.trend).toBeUndefined();
  });

  it("does not count the current, unfinished week in the comparison", () => {
    const only = computeActivityStats(
      snapshotOf([repo("one", { commitActivity: weeks(40, () => 1) })]),
      settingsOf(),
    );
    expect(only.commits?.trend).toEqual({ weeks: 13, current: 91, previous: 91 });
  });

  it("lists the commits of each repository, without ranking quality", () => {
    expect(stats.commits?.byRepository.map((entry) => entry.fullName).sort()).toEqual([
      "octo/alpha",
      "octo/bravo",
    ]);
  });
});

describe("language statistics", () => {
  it("shares the reported bytes and says how many repositories reported them", () => {
    const { languages } = computeActivityStats(snapshotOf(FULL_REPOS), settingsOf());
    expect(languages?.totalBytes).toBe(15000);
    expect(languages?.shares.map((share) => [share.name, share.percent])).toEqual(
      [
        ["Go", 33.3],
        ["TypeScript", 60],
        ["CSS", 6.7],
      ].sort((a, b) => Number(b[1]) - Number(a[1])),
    );
    expect(languages?.reposWithData).toBe(2);
  });

  it("groups the smallest languages as Other", () => {
    const many = Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [`L${String(i)}`, 100 - i]),
    );
    const result = computeActivityStats(
      snapshotOf([
        repo("poly", { languages: Object.entries(many).map(([name, bytes]) => ({ name, bytes })) }),
      ]),
      settingsOf(),
    );
    expect(result.languages?.shares).toHaveLength(7);
    expect(result.languages?.shares.at(-1)?.name).toBe("Other");
  });

  it("never turns repository counts into percentages", () => {
    const result = computeActivityStats(
      snapshotOf([
        repo("a", { language: "Go" }),
        repo("b", { language: "Go" }),
        repo("c", { language: "Rust" }),
      ]),
      settingsOf(),
    );
    expect(result.languages).toBeUndefined();
    expect(result.primaryLanguages).toEqual([
      { name: "Go", repositories: 2 },
      { name: "Rust", repositories: 1 },
    ]);
  });
});

describe("releases and repositories", () => {
  it("lists the latest release of each repository, newest first", () => {
    const { releases } = computeActivityStats(snapshotOf(FULL_REPOS), settingsOf());
    expect(releases.map((release) => release.tag)).toEqual(["v0.2.0", "v1.0.0"]);
  });

  it("limits the lists and reports the rest", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      repo(`r${String(i)}`, {
        latestRelease: { tagName: "v1", publishedAt: `2026-01-0${String(i + 1)}T00:00:00Z` },
      }),
    );
    const result = computeActivityStats(
      snapshotOf(many),
      settingsOf({ repositoryLimit: 3, releaseLimit: 2 }),
    );
    expect(result.listedRepositories).toHaveLength(3);
    expect(result.releases).toHaveLength(2);
    expect(result.hiddenReleases).toBe(7);
  });

  it("orders repositories by last push, then by name", () => {
    const result = computeActivityStats(
      snapshotOf([
        repo("b", { pushedAt: "2026-01-01T00:00:00Z" }),
        repo("a", { pushedAt: "2026-01-01T00:00:00Z" }),
        repo("c", { pushedAt: "2026-02-01T00:00:00Z" }),
      ]),
      settingsOf(),
    );
    expect(result.repositories.map((r) => r.name)).toEqual(["c", "a", "b"]);
  });
});

// ------------------------------------------------------------------ rendering

describe("Developer Activity Dashboard", () => {
  const svg = render();

  it("draws every panel and the metrics, with a title and a description", () => {
    for (const title of Object.values(PANELS)) expect(svg).toContain(`>${title}<`);
    for (const name of ["Public Repositories", "Commits", "With a Release", "Last Push"]) {
      expect(svg).toContain(`>${name}<`);
    }
    expect(svg).toContain(">Developer Activity Dashboard<");
    expect(svg).toContain("<title");
    expect(svg).toContain("<desc");
  });

  it("states the scope of the data and the meaning of its numbers", () => {
    expect(svg).toContain("NOT ALL GITHUB ACTIVITY");
    expect(svg).toContain("2 OF 2 REPOSITORIES");
    expect(svg).toContain("NOT TIME SPENT");
    expect(svg).toContain("NOT A RANKING OF QUALITY");
  });

  it("is well formed, 880 pixels wide and inside its bounds", () => {
    expect(size(svg).width).toBe(880);
    assertInside(svg);
  });

  it("draws a heatmap with weekday labels and a legend", () => {
    expect(svg).toContain(">Mon<");
    expect(svg).toContain(">Less<");
    expect(svg).toContain(">More<");
    // The two days that had not happened yet are outlined, not filled as zero.
    const outlined = /<g fill="none" stroke="#30363d">((?:<rect [^>]*\/>)+)<\/g>/.exec(svg);
    expect(outlined?.[1]?.match(/<rect /g)).toHaveLength(2);
  });

  it("claims no pull requests, issues, contributions, productivity or score", () => {
    const visible = [...svg.matchAll(/>([^<]+)</g)].map((match) => match[1]).join(" ");
    expect(visible).not.toMatch(
      /\b(pull requests?|issues?|contributions?|productivity|score|efficiency|performance)\b/i,
    );
  });

  it("is deterministic", () => {
    expect(render()).toBe(render());
  });
});

describe("partial and empty data", () => {
  it("draws only what was collected, without placeholders", () => {
    const svg = render([repo("plain", { language: "Go" })]);
    expect(svg).toContain(`>${PANELS.repositories}<`);
    expect(svg).toContain(`>${PANELS.languages}<`);
    for (const key of ["heatmap", "commits", "releases"] as const) {
      expect(svg).not.toContain(PANELS[key]);
    }
    expect(svg).not.toContain(">Commits<");
    assertInside(svg);
  });

  it("uses the primary language as counts when bytes were not collected", () => {
    const svg = render([repo("plain", { language: "Go" })]);
    expect(svg).toContain("COUNTS, NOT USAGE");
    expect(svg).not.toContain("%");
  });

  it("shows an empty state without a snapshot", () => {
    const svg = render(null);
    expect(svg).toContain(">No GitHub data yet. Run &quot;devtrace sync&quot; first.<");
    assertInside(svg);
  });

  it("shows an empty state for a snapshot with no repository", () => {
    expect(render([])).toContain("No GitHub data yet.");
  });
});

describe("display settings", () => {
  it.each([
    ["showHeatmap", "heatmap"],
    ["showCommitActivity", "commits"],
    ["showRepositories", "repositories"],
    ["showLanguages", "languages"],
    ["showReleases", "releases"],
  ] as const)("%s false removes its panel", (setting, key) => {
    const svg = render(FULL_REPOS, { [setting]: false });
    expect(svg).not.toContain(`>${PANELS[key]}<`);
    assertInside(svg);
  });

  it("hides the metrics, header and footer on request", () => {
    const svg = render(FULL_REPOS, { showSummary: false, showTitle: false, showFooter: false });
    expect(svg).not.toContain(">Public Repositories<");
    expect(svg).not.toContain(">DevTrace<");
    expect(svg).not.toContain("Generated by DevTrace");
  });

  it("uses the layout presets", () => {
    expect(LAYOUTS.map((layout) => size(render(FULL_REPOS, { layout })).width)).toEqual([
      720, 880, 960,
    ]);
  });

  it("validates the limits", () => {
    for (const bad of [{ repositoryLimit: 0 }, { releaseLimit: 99 }, { showHeatmap: "yes" }]) {
      expect(validateDeveloperActivityConfig({ version: 1, settings: bad }).ok).toBe(false);
    }
    expect(validateDeveloperActivityConfig({ version: 1 }).ok).toBe(true);
  });
});

describe("themes", () => {
  it.each(THEMES)("renders a bounded dashboard in the %s theme", (theme) => {
    const svg = render(FULL_REPOS, { theme });
    assertInside(svg);
    expect(svg).not.toMatch(/<script|href=|<image|<foreignObject|url\(/i);
  });

  it.each(LAYOUTS)("renders a bounded dashboard in the %s layout", (layout) => {
    assertInside(render(FULL_REPOS, { layout }));
  });
});

describe("text safety and fit", () => {
  const hostile = `<script>alert(1)</script> & "q"`;

  it("escapes names written by third parties", () => {
    const svg = render([
      repo("evil", {
        language: hostile,
        languages: [{ name: hostile, bytes: 10 }],
        latestRelease: { tagName: hostile, publishedAt: "2026-03-01T00:00:00Z" },
        commitActivity: weeks(52),
      }),
    ]);
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;script&gt;");
    assertInside(svg);
  });

  it("shortens very long names", () => {
    assertInside(
      render([
        repo(LONG.replaceAll(" ", "-"), {
          language: LONG,
          languages: [{ name: LONG, bytes: 10 }],
          latestRelease: { tagName: LONG, publishedAt: "2026-03-01T00:00:00Z" },
        }),
      ]),
    );
  });
});

describe("privacy", () => {
  it("is drawn from the snapshot, which holds public repositories only", async () => {
    const privateRepo = makeRepoResponse({
      full_name: "octo/secret",
      name: "secret",
      private: true,
    });
    const warnings: string[] = [];
    const collected = await collectRepositories(
      fakeClient({ getAllPages: () => [makeRepoResponse(), privateRepo], getJson: () => ({}) }),
      (() => {
        const result = validateGitHubConfig({
          version: 1,
          username: "octo",
          collect: { releases: false, languages: true, commitActivity: true },
        });
        if (!result.ok) throw new Error("bad");
        return result.value;
      })(),
      (message) => warnings.push(message),
    );
    expect(collected.map((r) => r.fullName)).toEqual(["octo/app"]);
    const svg = renderDeveloperActivityDashboard(
      computeActivityStats(snapshotOf(collected), settingsOf()),
      { profile: { displayName: "Octo" }, settings: settingsOf(), generatorVersion: "0" },
    );
    expect(svg).not.toContain("secret");
  });
});

// ------------------------------------------------------- generator and CLI

describe("generator and command line", () => {
  let root: string;
  let out: string[];
  let err: string[];
  const run = (...argv: string[]) =>
    runCli(argv, { rootDir: root, env: {}, out: (l) => out.push(l), err: (l) => err.push(l) });
  const write = async (name: string, value: unknown) => {
    await mkdir(path.join(root, "data"), { recursive: true });
    await writeFile(path.join(root, "data", name), JSON.stringify(value), "utf8");
  };
  const writeSnapshot = () => write("github-snapshot.json", snapshotOf(FULL_REPOS));

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "devtrace-activity-"));
    out = [];
    err = [];
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes public/indicators/developer-activity.svg from the snapshot", async () => {
    await write("developer-activity.json", { version: 1 });
    await writeSnapshot();
    const file = await generateDeveloperActivity(root);
    expect(file).toBe(path.join(root, "public", "indicators", "developer-activity.svg"));
    expect(await readFile(file, "utf8")).toContain(">Developer Activity Dashboard<");
  });

  it("warns and draws the empty state when no snapshot exists", async () => {
    await write("developer-activity.json", { version: 1 });
    const warnings: string[] = [];
    const file = await generateDeveloperActivity(root, { warn: (m) => warnings.push(m) });
    expect(warnings.join(" ")).toContain("devtrace sync");
    expect(await readFile(file, "utf8")).toContain("No GitHub data yet.");
  });

  it("refuses to generate without its configuration file", async () => {
    await expect(generateDeveloperActivity(root)).rejects.toThrow(/Failed to generate/);
  });

  it("generates it with `generate activity`, honoring --theme", async () => {
    await write("developer-activity.json", { version: 1 });
    await writeSnapshot();
    expect(await run("generate", "activity", "--theme", "LIGHT")).toBe(0);
    const svg = await readFile(
      path.join(root, "public", "indicators", "developer-activity.svg"),
      "utf8",
    );
    expect(svg).toContain('fill="#ffffff"');
  });

  it("includes it in `generate` only when it is configured", async () => {
    await write("startup.json", { version: 1, projects: [] });
    await write("ai-engineering.json", { version: 1 });
    expect(await run("generate")).toBe(0);
    expect(out.join("\n")).not.toContain("developer activity");

    out.length = 0;
    await write("developer-activity.json", { version: 1 });
    expect(await run("generate")).toBe(0);
    expect(out.join("\n")).toContain("Developer activity indicator written to");
  });

  it("validates its configuration, and skips it when it is not there", async () => {
    expect(await run("validate", "activity")).toBe(0);
    expect(out.join("\n")).toContain("Not configured");

    out.length = 0;
    await write("developer-activity.json", { version: 1, settings: { repositoryLimit: 0 } });
    expect(await run("validate", "activity")).toBe(1);
    expect(out.join("\n")).toContain("repositoryLimit");
  });

  it("warns when the heatmap cannot be built because commit activity is not collected", async () => {
    await write("developer-activity.json", { version: 1 });
    await write("github.json", { version: 1, username: "octo" });
    await writeSnapshot();
    expect(await run("validate", "activity")).toBe(0);
    expect(out.join("\n")).toContain("collect.commitActivity");
  });
});
