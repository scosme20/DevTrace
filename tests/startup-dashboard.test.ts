import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pipeline } from "../src/components/index.js";
import { LAYOUTS } from "../src/core/appearance.js";
import { THEMES } from "../src/core/models.js";
import { validateStartupConfig } from "../src/core/validation.js";
import { generateStartupStats } from "../src/generators/startup.js";
import { buildStartupDashboardModel } from "../src/indicators/startup/dashboard.js";
import { computeStartupStats } from "../src/indicators/startup/stats.js";
import { renderStartupDashboard } from "../src/templates/startup-dashboard.js";
import { renderStartupStats } from "../src/templates/startup-stats.js";
import { LONG, tokensFor } from "./appearance-fixtures.js";
import { outOfBounds, parseBoxes } from "./component-geometry.js";
import { makeConfig, makeProject, makeRawConfig } from "./fixtures.js";
import { makeRepository } from "./github-fixtures.js";

const PORTFOLIO = [
  makeProject({
    id: "a",
    name: "Alpha",
    lifecycleStage: "GROWING",
    status: "ACTIVE",
    updatedAt: "2026-03-20",
  }),
  makeProject({
    id: "b",
    name: "Bravo",
    lifecycleStage: "LAUNCHED",
    status: "ACTIVE",
    updatedAt: "2026-02-01",
  }),
  makeProject({
    id: "c",
    name: "Charlie",
    lifecycleStage: "DEVELOPMENT",
    status: "ACTIVE",
    updatedAt: "2026-03-01",
  }),
  makeProject({
    id: "d",
    name: "Delta",
    lifecycleStage: "MVP",
    status: "PAUSED",
    updatedAt: "2026-02-20",
  }),
  makeProject({
    id: "e",
    name: "Echo",
    lifecycleStage: "IDEA",
    status: "INACTIVE",
    updatedAt: "2026-01-01",
  }),
];

const GITHUB = {
  a: makeRepository({ fullName: "me/alpha", pushedAt: "2026-03-18T10:00:00Z" }),
  b: makeRepository({
    fullName: "me/bravo",
    pushedAt: "2026-02-10T10:00:00Z",
    latestRelease: undefined,
  }),
};

const PANELS = {
  portfolio: "PROJECT PORTFOLIO",
  lifecycle: "LIFECYCLE STAGE",
  status: "OPERATIONAL STATUS",
  pipeline: "DEVELOPMENT PIPELINE",
  highlights: "PROJECT HIGHLIGHTS",
  github: "GITHUB DEVELOPMENT INSIGHTS",
} as const;

function render(
  projects: unknown[] = PORTFOLIO,
  settings: Record<string, unknown> = {},
  github: Record<string, ReturnType<typeof makeRepository>> = GITHUB,
): string {
  const config = makeConfig(projects, { settings: { dashboard: true, ...settings } });
  return renderStartupDashboard(computeStartupStats(config.projects, github), {
    profile: config.profile,
    settings: config.settings,
    generatorVersion: "0.0.0-test",
  });
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

describe("Startup & SaaS Dashboard with complete data", () => {
  const svg = render();

  it("draws every panel and the overview metrics", () => {
    for (const title of Object.values(PANELS)) expect(svg).toContain(`>${title}<`);
    for (const name of [
      "Total Projects",
      "Active Projects",
      "Launched Projects",
      "In Development",
      "Paused Projects",
    ]) {
      expect(svg).toContain(`>${name}<`);
    }
    expect(svg).toContain(">Startup &amp; SaaS Dashboard<");
    expect(svg).toContain("<title");
    expect(svg).toContain("<desc");
  });

  it("is wider than the card, well formed and inside its bounds", () => {
    expect(size(svg).width).toBe(880);
    assertInside(svg);
  });

  it("uses the same aggregation rules as the card for the shared numbers", () => {
    const config = makeConfig(PORTFOLIO, {});
    const stats = computeStartupStats(config.projects);
    expect(stats.totalProjects).toBe(5);
    expect(stats.activeProjects).toBe(3);
    expect(stats.launchedProjects).toBe(2);
    const model = buildStartupDashboardModel(stats, { ...config.settings, dashboard: true });
    expect(Object.fromEntries(model.metrics.map((m) => [m.key, m.value]))).toEqual({
      total: 5,
      active: 3,
      launched: 2,
      inDevelopment: 1,
      paused: 1,
    });
  });
});

describe("lifecycle stage and operational status are separate", () => {
  const config = makeConfig(PORTFOLIO, {});
  const model = buildStartupDashboardModel(computeStartupStats(config.projects), {
    ...config.settings,
    dashboard: true,
  });

  it("counts each dimension on its own", () => {
    expect(model.lifecycle?.map((e) => e.stage)).toEqual([
      "IDEA",
      "MVP",
      "DEVELOPMENT",
      "LAUNCHED",
      "GROWING",
    ]);
    expect(model.status?.map((e) => [e.status, e.count])).toEqual([
      ["ACTIVE", 3],
      ["PAUSED", 1],
      ["INACTIVE", 1],
    ]);
  });

  it("gives percentages of the public projects that add up", () => {
    expect(model.status?.map((e) => e.percent)).toEqual([60, 20, 20]);
  });

  it("never offers a status the schema does not have", () => {
    const svg = render();
    expect(svg).not.toMatch(/>(Completed|Archived share)</);
  });

  it("keeps the stage as a badge and the status as a dot and a word", () => {
    const svg = render([
      makeProject({ name: "Solo", lifecycleStage: "DEVELOPMENT", status: "PAUSED" }),
    ]);
    expect(svg).toContain(">Development<");
    expect(svg).toContain(">Paused<");
  });
});

describe("development pipeline", () => {
  it("lists every stage in lifecycle order, including empty ones", () => {
    const config = makeConfig(PORTFOLIO, {});
    const model = buildStartupDashboardModel(computeStartupStats(config.projects), config.settings);
    expect(model.pipeline?.map((e) => e.stage)).toHaveLength(9);
    expect(model.pipeline?.find((e) => e.stage === "ARCHIVED")?.count).toBe(0);
  });

  it("is labeled as a snapshot, not a history", () => {
    expect(render()).toContain("A SNAPSHOT, NOT A HISTORY");
  });

  it("keeps its steps inside the width and handles zero counts", () => {
    const fragment = pipeline(tokensFor({}), [
      { label: "Idea", count: 0 },
      { label: "MVP", count: 2, highlight: true },
    ])(300);
    expect(
      outOfBounds(parseBoxes(fragment.body, tokensFor({}).metrics), 300, fragment.height),
    ).toEqual([]);
    expect(fragment.body).toContain(">2<");
  });
});

describe("project highlights", () => {
  const config = makeConfig(PORTFOLIO, {});
  const model = buildStartupDashboardModel(computeStartupStats(config.projects), config.settings);

  it("selects launched and in-progress projects, newest update first", () => {
    expect(model.highlights?.launched.map((p) => p.id)).toEqual(["a", "b"]);
    expect(model.highlights?.inProgress.map((p) => p.id)).toEqual(["c", "d"]);
  });

  it("breaks ties by id so the order is stable", () => {
    const tied = makeConfig([
      makeProject({ id: "z", name: "Zed", lifecycleStage: "LAUNCHED", updatedAt: "2026-01-01" }),
      makeProject({ id: "m", name: "Em", lifecycleStage: "LAUNCHED", updatedAt: "2026-01-01" }),
    ]);
    const tiedModel = buildStartupDashboardModel(computeStartupStats(tied.projects), tied.settings);
    expect(tiedModel.highlights?.launched.map((p) => p.id)).toEqual(["m", "z"]);
  });

  it("does not rank by GitHub activity", () => {
    const busy = { b: makeRepository({ stars: 99999, pushedAt: "2026-03-30T00:00:00Z" }) };
    const withGithub = buildStartupDashboardModel(
      computeStartupStats(config.projects, busy),
      config.settings,
    );
    expect(withGithub.highlights?.launched.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("is left out when no project is launched, growing, MVP or in development", () => {
    const svg = render([makeProject({ name: "Idea", lifecycleStage: "IDEA" })]);
    expect(svg).not.toContain(PANELS.highlights);
  });
});

describe("GitHub insights", () => {
  it("shows only what was observed, marked as observed", () => {
    const svg = render();
    expect(svg).toContain(">Linked public repositories<");
    expect(svg).toContain(">With a published release<");
    expect(svg).toContain(">2026-03-18<");
    expect(svg).toContain(">Observed<");
    expect(svg).toContain("me/alpha");
  });

  it("counts releases only where one exists", () => {
    const config = makeConfig(PORTFOLIO, {});
    const model = buildStartupDashboardModel(
      computeStartupStats(config.projects, GITHUB),
      config.settings,
    );
    expect(model.github).toMatchObject({
      total: 2,
      withRelease: 1,
      lastPush: "2026-03-18T10:00:00Z",
    });
  });

  it("is left out without GitHub data or when switched off", () => {
    expect(render(PORTFOLIO, {}, {})).not.toContain(PANELS.github);
    expect(render(PORTFOLIO, { showGitHubInsights: false })).not.toContain(PANELS.github);
  });

  it("claims nothing about revenue, customers or growth", () => {
    const visibleText = [...render().matchAll(/>([^<]+)</g)].map((match) => match[1]).join(" ");
    expect(visibleText).not.toMatch(/b(revenue|MRR|ARR|customers|conversion|GMV|score)b/i);
  });
});

describe("partial, empty and capped data", () => {
  it("shows an empty state for a portfolio with no public project", () => {
    const svg = render([makeProject({ visibility: "PRIVATE" })]);
    expect(svg).toContain(">No public projects configured.<");
    assertInside(svg);
  });

  it("repacks the grid when panels are missing, leaving no placeholder", () => {
    const svg = render(PORTFOLIO, {
      showLifecycleDistribution: false,
      showOperationalStatus: false,
      showPipeline: false,
      showHighlights: false,
      showGitHubInsights: false,
    });
    expect(svg).toContain(`>${PANELS.portfolio}<`);
    for (const key of ["lifecycle", "status", "pipeline", "highlights", "github"] as const) {
      expect(svg).not.toContain(PANELS[key]);
    }
    assertInside(svg);
  });

  it("says so when every panel is switched off", () => {
    const svg = render(PORTFOLIO, {
      showProjectList: false,
      showLifecycleDistribution: false,
      showOperationalStatus: false,
      showPipeline: false,
      showHighlights: false,
      showGitHubInsights: false,
      showSummary: false,
    });
    expect(svg).toContain(">Nothing to display.<");
  });

  it("caps the portfolio at the limit and reports the rest", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      makeProject({ id: `p${String(i)}`, name: `Project ${String(i)}` }),
    );
    expect(render(many)).toContain("+6 more");
    expect(render(many, { projectListLimit: 10 })).toContain("+2 more");
    expect(render(many, { projectListLimit: 20 })).not.toContain("more<");
  });
});

describe("display settings", () => {
  it("hides the metrics strip, header and footer on request", () => {
    const svg = render(PORTFOLIO, { showSummary: false, showTitle: false, showFooter: false });
    expect(svg).not.toContain(">Total Projects<");
    expect(svg).not.toContain(">DevTrace<");
    expect(svg).not.toContain("Generated by DevTrace");
    assertInside(svg);
  });

  it("hides link kinds when showLinks is false", () => {
    const linked = [
      makeProject({ repositoryUrl: "https://example.com/r", websiteUrl: "https://example.com" }),
    ];
    expect(render(linked, {}, {})).toContain("repo · site");
    expect(render(linked, { showLinks: false }, {})).not.toContain("repo");
  });

  it("uses the layout presets and a declared width", () => {
    expect(LAYOUTS.map((layout) => size(render(PORTFOLIO, { layout })).width)).toEqual([
      720, 880, 960,
    ]);
    expect(size(render(PORTFOLIO, { dimensions: { width: 700 } })).width).toBe(700);
  });
});

describe("themes", () => {
  it.each(THEMES)("renders a bounded dashboard in the %s theme", (theme) => {
    const svg = render(PORTFOLIO, { theme });
    assertInside(svg);
    expect(svg).not.toMatch(/<script|href=|<image|<foreignObject|url\(/i);
  });

  it.each(LAYOUTS)("renders a bounded dashboard in the %s layout", (layout) => {
    assertInside(render(PORTFOLIO, { layout }));
  });
});

describe("privacy", () => {
  const SECRET = "ZZ-PRIVATE-MARKER";
  const withPrivate = [
    ...PORTFOLIO,
    makeProject({
      id: "hidden",
      name: SECRET,
      category: SECRET,
      description: SECRET,
      lifecycleStage: "LAUNCHED",
      status: "ACTIVE",
      visibility: "PRIVATE",
      repositoryUrl: "https://example.com/secret",
      githubRepository: "me/secret",
      updatedAt: "2030-01-01",
    }),
  ];

  it("never draws a private project, in any panel", () => {
    const svg = render(
      withPrivate,
      { showDescriptions: true },
      { ...GITHUB, hidden: makeRepository({ fullName: `me/${SECRET}` }) },
    );
    expect(svg).not.toContain(SECRET);
  });

  it("gives the same SVG with or without the private project", () => {
    expect(render(withPrivate, {}, GITHUB)).toBe(render(PORTFOLIO, {}, GITHUB));
  });
});

describe("provenance", () => {
  it("labels each project with how its data was obtained, in different tones", () => {
    const svg = render([
      makeProject({ id: "o", name: "Seen", dataSource: "OBSERVED" }),
      makeProject({ id: "e", name: "Guessed", dataSource: "ESTIMATED" }),
      makeProject({ id: "d", name: "Said", dataSource: "DECLARED" }),
    ]);
    for (const word of ["Observed", "Estimated", "Declared"]) expect(svg).toContain(`>${word}<`);
    const stroke = (word: string) =>
      new RegExp(`stroke="(#[0-9a-f]{6})"/><text [^>]*>${word}<`).exec(svg)?.[1];
    expect(stroke("Observed")).not.toBe(stroke("Estimated"));
  });
});

describe("text safety and fit", () => {
  const hostile = `<script>alert(1)</script> & "quotes"`;

  it("escapes every user text", () => {
    const svg = render(
      [makeProject({ name: hostile, category: hostile, description: hostile })],
      { showDescriptions: true },
      {},
    );
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;script&gt;");
    assertInside(svg);
  });

  it("shortens very long names", () => {
    assertInside(
      render(
        [makeProject({ name: LONG, category: LONG, description: `${LONG} ${LONG}` })],
        { showDescriptions: true, theme: "LIGHT" },
        {},
      ),
    );
  });
});

describe("determinism and compatibility", () => {
  it("gives the same SVG for the same input", () => {
    expect(render()).toBe(render());
  });

  it("keeps the card when the dashboard setting is absent or false", () => {
    for (const settings of [{}, { dashboard: false }]) {
      const config = makeConfig(PORTFOLIO, { settings });
      const svg = renderStartupStats(computeStartupStats(config.projects), {
        profile: config.profile,
        settings: config.settings,
        generatorVersion: "0.0.0-test",
      });
      expect(svg).toContain(">Startup &amp; SaaS Statistics<");
    }
  });

  it("validates the new options and writes no defaults back", () => {
    const ok = validateStartupConfig(
      makeRawConfig([makeProject()], {
        settings: { dashboard: true, showPipeline: false, projectListLimit: 3 },
      }),
    );
    expect(ok.ok).toBe(true);
    const plain = validateStartupConfig(makeRawConfig([makeProject()]));
    expect(plain.ok && "dashboard" in plain.value.settings).toBe(false);
    for (const bad of [
      { dashboard: "yes" },
      { projectListLimit: 0 },
      { projectListLimit: 99 },
      { projectListLimit: 1.5 },
    ]) {
      expect(validateStartupConfig(makeRawConfig([makeProject()], { settings: bad })).ok).toBe(
        false,
      );
    }
  });
});

describe("generator", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "devtrace-sdash-"));
    await mkdir(path.join(root, "data"), { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function generate(settings: Record<string, unknown>): Promise<string> {
    await writeFile(
      path.join(root, "data", "startup.json"),
      JSON.stringify(makeRawConfig(PORTFOLIO, { settings })),
      "utf8",
    );
    return readFile(await generateStartupStats(root), "utf8");
  }

  it("writes the dashboard to the usual output file when enabled", async () => {
    const svg = await generate({ dashboard: true });
    expect(svg).toContain(">Startup &amp; SaaS Dashboard<");
    expect(
      await readFile(path.join(root, "public", "indicators", "startup-stats.svg"), "utf8"),
    ).toBe(svg);
  });

  it("still writes the card by default", async () => {
    expect(await generate({})).toContain(">Startup &amp; SaaS Statistics<");
  });
});
