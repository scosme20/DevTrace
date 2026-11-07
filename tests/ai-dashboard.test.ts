import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LAYOUTS } from "../src/core/appearance.js";
import { validateAiEngineeringConfig } from "../src/core/ai-engineering-validation.js";
import { THEMES } from "../src/core/models.js";
import { generateAiEngineeringStats } from "../src/generators/ai-engineering.js";
import { computeAiEngineeringStats } from "../src/indicators/ai-engineering/stats.js";
import { packPanels } from "../src/components/index.js";
import { renderAiEngineeringDashboard } from "../src/templates/ai-engineering-dashboard.js";
import { renderAiEngineeringStats } from "../src/templates/ai-engineering-stats.js";
import {
  makeActivity,
  makeAiConfig,
  makeAiProject,
  makeModel,
  makeRawAiConfig,
  makeSkill,
  makeTokenMetric,
  makeTool,
} from "./ai-fixtures.js";
import { LONG, tokensFor } from "./appearance-fixtures.js";
import { outOfBounds, parseBoxes } from "./component-geometry.js";

const FULL = {
  tools: [
    makeTool({
      id: "assistant",
      name: "Claude Code",
      provider: "Anthropic",
      experienceLevel: "ADVANCED",
    }),
    makeTool({ id: "ide", name: "Copilot", provider: "GitHub", category: "IDE_ASSISTANT" }),
  ],
  models: [
    makeModel({ id: "sonnet", name: "Claude Sonnet", usageContext: "Daily work" }),
    makeModel({ id: "gpt", name: "GPT", provider: "OpenAI", modelFamily: "GPT" }),
  ],
  skills: [
    makeSkill({ id: "rag", name: "RAG", category: "RETRIEVAL_KNOWLEDGE" }),
    makeSkill({
      id: "agents",
      name: "Agents",
      category: "AI_AGENTS",
      proficiencyLevel: "ADVANCED",
    }),
  ],
  projects: [makeAiProject({ id: "p1", name: "Doc Assistant", tools: ["assistant"] })],
  activities: [
    makeActivity({ id: "a1", involvement: "AI_ASSISTED" }),
    makeActivity({ id: "a2", involvement: "AI_GENERATED", activityType: "AGENT_DEVELOPMENT" }),
  ],
  tokenUsage: [makeTokenMetric({ id: "u1", modelId: "sonnet", source: "Usage page" })],
};

const ALL_ON = {
  showActivity: true,
  showTokenUsage: true,
  showCost: true,
  dashboard: true,
};

function render(overrides: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) {
  const config = makeAiConfig({
    ...FULL,
    ...overrides,
    settings: { ...ALL_ON, ...settings },
  });
  return renderAiEngineeringDashboard(computeAiEngineeringStats(config), {
    profile: config.profile,
    settings: config.settings,
    generatorVersion: "0.0.0-test",
  });
}

const PANEL_TITLES = {
  tools: "AI TOOLS &amp; PROVIDERS",
  models: "AI FOUNDATION MODELS",
  skills: "AI ENGINEERING SKILLS · DECLARED LEVELS",
  projects: "AI PROJECTS",
  activity: "AI ENGINEERING ACTIVITY · DECLARED RECORDS",
  tokens: "TOKEN USAGE · REPORTED VALUES",
} as const;

function size(svg: string): { width: number; height: number } {
  const match = /<svg [^>]*width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  if (match === null) throw new Error("No SVG root.");
  expect([match[3], match[4]]).toEqual([match[1], match[2]]);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function assertInside(svg: string): void {
  const { width, height } = size(svg);
  const body = svg.slice(svg.indexOf("</desc>") + 7, svg.lastIndexOf("</svg>"));
  const metrics = tokensFor({}).metrics;
  expect(outOfBounds(parseBoxes(body, metrics), width, height)).toEqual([]);
}

describe("AI Engineering Dashboard with complete data", () => {
  const svg = render();

  it("draws every panel and a metrics strip", () => {
    for (const title of Object.values(PANEL_TITLES)) expect(svg).toContain(`>${title}<`);
    for (const name of [
      "AI Tools",
      "Providers",
      "AI Models",
      "AI Skills",
      "AI Projects",
      "AI Activities",
    ]) {
      expect(svg).toContain(`>${name}<`);
    }
    expect(svg).toContain(">AI Engineering Dashboard<");
    expect(svg).toContain("<title");
    expect(svg).toContain("<desc");
  });

  it("is wider than the single-column card and well formed", () => {
    expect(size(svg).width).toBe(880);
    assertInside(svg);
  });

  it("keeps provider, product and model apart", () => {
    expect(svg).toContain(">Anthropic · AI assistant<");
    expect(svg).toContain(">Claude Code<");
    expect(svg).toContain(">Anthropic · Claude<");
  });

  it("names the tools a project uses by their own names", () => {
    expect(svg).toContain(">Doc Assistant<");
    expect(svg).toMatch(/>Claude Code<\/text><\/g>|>Claude Code</);
  });

  it("presents skill levels as declared, on a five-step scale", () => {
    expect(svg).toContain("declared levels".toUpperCase());
    expect(svg).toContain(">Advanced<");
    expect(svg).toContain(">Practicing<");
  });

  it("keeps the three kinds of involvement distinct", () => {
    expect(svg).toContain("AI-assisted 1");
    expect(svg).toContain("AI-generated 1");
  });

  it("invents no score or percentage of AI work", () => {
    expect(svg).not.toMatch(/score|productivity|efficiency|% of (code|work)/i);
  });
});

describe("partial and empty data", () => {
  it("draws only the skills panel, at full width, when that is all there is", () => {
    const svg = render({
      tools: [],
      models: [],
      projects: [],
      activities: [],
      tokenUsage: [],
    });
    expect(svg).toContain(`>${PANEL_TITLES.skills}<`);
    for (const key of ["tools", "models", "projects", "activity", "tokens"] as const) {
      expect(svg).not.toContain(`>${PANEL_TITLES[key]}<`);
    }
    assertInside(svg);
  });

  it("widens a lone narrow panel to the whole row", () => {
    const alone = render({ models: [], skills: [], projects: [], activities: [], tokenUsage: [] });
    const widths = [
      ...alone.matchAll(
        /<rect x="0.5" y="0.5" width="(\d+)" height="\d+" rx="\d+" fill="#161b22"/g,
      ),
    ].map((match) => Number(match[1]));
    // The panel frame spans the content width (880 - 2 * 28), not half of it.
    expect(Math.max(...widths)).toBeGreaterThan(700);
  });

  it("shows an empty state when every section is empty or switched off", () => {
    const svg = render({
      tools: [],
      models: [],
      skills: [],
      projects: [],
      activities: [],
      tokenUsage: [],
    });
    expect(svg).toContain(">No AI engineering data to display.<");
    assertInside(svg);
  });

  it("leaves out an optional section that has no data, without a placeholder", () => {
    const svg = render({ activities: [], tokenUsage: [] });
    expect(svg).not.toContain(PANEL_TITLES.activity);
    expect(svg).not.toContain(PANEL_TITLES.tokens);
    expect(svg).not.toContain(">AI Activities<");
  });
});

describe("display settings", () => {
  it.each([
    ["showTools", "tools"],
    ["showModels", "models"],
    ["showSkills", "skills"],
    ["showProjects", "projects"],
    ["showActivity", "activity"],
    ["showTokenUsage", "tokens"],
  ] as const)("%s false removes its panel", (setting, key) => {
    const svg = render({}, { [setting]: false });
    expect(svg).not.toContain(`>${PANEL_TITLES[key]}<`);
    assertInside(svg);
  });

  it("hides the metrics strip, the header and the footer on request", () => {
    const svg = render({}, { showSummary: false, showTitle: false, showFooter: false });
    expect(svg).not.toContain(">AI Tools<");
    expect(svg).not.toContain(">DevTrace<");
    expect(svg).not.toContain("Generated by DevTrace");
    assertInside(svg);
  });

  it("hides link kinds when showLinks is false", () => {
    const withLinks = {
      projects: [makeAiProject({ id: "p1", repositoryUrl: "https://example.com/r" })],
    };
    expect(render(withLinks)).toContain("repo");
    expect(render(withLinks, { showLinks: false })).not.toContain("· repo ·");
  });

  it("uses the declared width and the layout presets", () => {
    expect(size(render({}, { dimensions: { width: 700 } })).width).toBe(700);
    const widths = LAYOUTS.map((layout) => size(render({}, { layout })).width);
    expect(widths).toEqual([720, 880, 960]);
  });
});

describe("themes", () => {
  it.each(THEMES)("renders a bounded dashboard in the %s theme", (theme) => {
    const svg = render({}, { theme });
    assertInside(svg);
    expect(svg).not.toMatch(/<script|href=|<image|<foreignObject|url\(/i);
  });

  it.each(LAYOUTS)("renders a bounded dashboard in the %s layout", (layout) => {
    assertInside(render({}, { layout }));
  });
});

describe("privacy", () => {
  const SECRET = "ZZ-PRIVATE-MARKER";
  const config = {
    tools: [
      ...FULL.tools,
      makeTool({
        id: "hidden-tool",
        name: `${SECRET} tool`,
        provider: `${SECRET} Provider`,
        visibility: "PRIVATE",
      }),
    ],
    models: [
      ...FULL.models,
      makeModel({
        id: "hidden-model",
        name: `${SECRET} model`,
        provider: `${SECRET} Lab`,
        visibility: "PRIVATE",
      }),
    ],
    skills: [
      ...FULL.skills,
      makeSkill({ id: "hidden-skill", name: `${SECRET} skill`, visibility: "PRIVATE" }),
    ],
    projects: [
      makeAiProject({ id: "p1", name: "Doc Assistant", tools: ["assistant", "hidden-tool"] }),
      makeAiProject({ id: "hidden-project", name: `${SECRET} project`, visibility: "PRIVATE" }),
    ],
    activities: [
      ...FULL.activities,
      makeActivity({ id: "hidden-a", description: `${SECRET} activity`, visibility: "PRIVATE" }),
      makeActivity({ id: "linked", description: `${SECRET} linked`, projectId: "hidden-project" }),
    ],
    tokenUsage: [
      ...FULL.tokenUsage,
      makeTokenMetric({ id: "hidden-u", modelId: "hidden-model", source: `${SECRET} usage` }),
      makeTokenMetric({
        id: "hidden-v",
        modelId: "sonnet",
        source: `${SECRET} usage 2`,
        visibility: "PRIVATE",
      }),
    ],
  };

  it("never draws a private record, or the name of a private record", () => {
    expect(render(config)).not.toContain(SECRET);
  });

  it("does not count private records in any total, distribution or list", () => {
    const withPrivate = render(config);
    const without = render({});
    // Same output for the parts that depend on counts: only the project's tool badges differ.
    expect(withPrivate).toBe(without.replace("Doc Assistant", "Doc Assistant"));
  });

  it("does not reveal a private tool through a public project that references it", () => {
    const svg = render(config);
    expect(svg).toContain(">Claude Code<");
    expect(svg).not.toContain("hidden-tool");
  });

  it("shows no cost unless showCost is on", () => {
    const cost = {
      tokenUsage: [
        makeTokenMetric({
          id: "c",
          kind: "ESTIMATED_COST",
          value: 12.5,
          unit: "USD",
          source: "Invoice",
        }),
      ],
    };
    expect(render(cost, { showCost: false })).not.toContain("$12.50");
    expect(render(cost, { showCost: true })).toContain("$12.50");
    expect(render(cost, { showCost: true })).toContain("Estimated cost");
  });
});

describe("provenance", () => {
  it("labels each record with how its data was obtained", () => {
    const svg = render({
      projects: [],
      tools: [
        makeTool({ id: "o", name: "Seen", provenance: "OBSERVED" }),
        makeTool({ id: "e", name: "Guessed", provenance: "ESTIMATED" }),
        makeTool({ id: "d", name: "Said", provenance: "DECLARED" }),
      ],
    });
    for (const word of ["Observed", "Estimated", "Declared"]) expect(svg).toContain(`>${word}<`);
  });

  it("draws an estimate in a different color than an observation", () => {
    const svg = render({
      projects: [],
      tools: [
        makeTool({ id: "o", name: "Seen", provenance: "OBSERVED" }),
        makeTool({ id: "e", name: "Guessed", provenance: "ESTIMATED" }),
      ],
    });
    const stroke = (label: string) =>
      new RegExp(`stroke="(#[0-9a-f]{6})"/><text [^>]*>${label}<`).exec(svg)?.[1];
    expect(stroke("Observed")).toBeDefined();
    expect(stroke("Observed")).not.toBe(stroke("Estimated"));
  });
});

describe("text safety", () => {
  const hostile = `<script>alert(1)</script> & "quotes"`;

  it("escapes every user text and emits no markup from it", () => {
    const svg = render(
      {
        tools: [makeTool({ name: hostile, provider: hostile })],
        models: [
          makeModel({
            name: hostile,
            provider: hostile,
            modelFamily: hostile,
            usageContext: hostile,
          }),
        ],
        skills: [makeSkill({ name: hostile })],
        projects: [makeAiProject({ name: hostile, description: hostile, category: hostile })],
        activities: [makeActivity({ description: hostile })],
        tokenUsage: [makeTokenMetric({ source: hostile })],
      },
      { showDescriptions: true },
    );
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;script&gt;");
    assertInside(svg);
  });

  it("shortens very long names instead of overflowing", () => {
    const svg = render(
      {
        tools: [makeTool({ name: LONG, provider: LONG })],
        models: [makeModel({ name: LONG, provider: LONG, modelFamily: LONG })],
        skills: [makeSkill({ name: LONG })],
        projects: [makeAiProject({ name: LONG, description: `${LONG} ${LONG}` })],
        activities: [makeActivity({ description: `${LONG} ${LONG}` })],
      },
      { showDescriptions: true },
    );
    assertInside(svg);
  });
});

describe("layout composition", () => {
  const slot = (id: string, span: 1 | 2) => ({
    build: () => ({ body: id, width: 0, height: 0 }),
    span,
  });

  it("pairs narrow panels, and gives wide or unpaired panels a row of their own", () => {
    expect(packPanels([slot("a", 1), slot("b", 1), slot("c", 2), slot("d", 1)], 12)).toHaveLength(
      3,
    );
    expect(packPanels([slot("a", 1), slot("c", 2), slot("d", 1), slot("e", 1)], 12)).toHaveLength(
      3,
    );
    expect(packPanels([], 12)).toEqual([]);
  });

  it("grows taller with more content but stays bounded by the list limits", () => {
    const many = (n: number, make: (i: number) => Record<string, unknown>) =>
      Array.from({ length: n }, (_, i) => make(i));
    const small = size(render()).height;
    const big = size(
      render({
        tools: many(40, (i) => makeTool({ id: `t${String(i)}`, name: `Tool ${String(i)}` })),
        models: many(40, (i) => makeModel({ id: `m${String(i)}`, name: `Model ${String(i)}` })),
        skills: many(40, (i) => makeSkill({ id: `s${String(i)}`, name: `Skill ${String(i)}` })),
        projects: many(40, (i) =>
          makeAiProject({ id: `p${String(i)}`, name: `Project ${String(i)}` }),
        ),
        activities: many(40, (i) => makeActivity({ id: `a${String(i)}` })),
        tokenUsage: [],
      }),
    ).height;
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThan(2600);
    expect(
      render({
        projects: [],
        tools: many(40, (i) => makeTool({ id: `t${String(i)}`, name: `Tool ${String(i)}` })),
      }),
    ).toContain("+35 more");
  });
});

describe("determinism and compatibility", () => {
  it("gives the same SVG for the same input", () => {
    expect(render()).toBe(render());
  });

  it("keeps the existing card when the dashboard setting is absent or false", () => {
    for (const settings of [{}, { dashboard: false }]) {
      const config = makeAiConfig({ ...FULL, settings });
      const svg = renderAiEngineeringStats(computeAiEngineeringStats(config), {
        profile: config.profile,
        settings: config.settings,
        generatorVersion: "0.0.0-test",
      });
      expect(svg).toContain(">AI Engineering Statistics<");
    }
  });

  it("accepts a boolean dashboard setting and rejects anything else", () => {
    const ok = validateAiEngineeringConfig(makeRawAiConfig({ settings: { dashboard: true } }));
    expect(ok.ok).toBe(true);
    const bad = validateAiEngineeringConfig(makeRawAiConfig({ settings: { dashboard: "yes" } }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join("\n")).toContain("settings.dashboard");
  });

  it("does not write the setting back into a configuration that omits it", () => {
    const result = validateAiEngineeringConfig(makeRawAiConfig({}));
    expect(result.ok && "dashboard" in result.value.settings).toBe(false);
  });
});

describe("generator", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "devtrace-dash-"));
    await mkdir(path.join(root, "data"), { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function generate(settings: Record<string, unknown>): Promise<string> {
    await writeFile(
      path.join(root, "data", "ai-engineering.json"),
      JSON.stringify(makeRawAiConfig({ ...FULL, settings })),
      "utf8",
    );
    return readFile(await generateAiEngineeringStats(root), "utf8");
  }

  it("writes the dashboard to the same output file when it is enabled", async () => {
    const svg = await generate({ dashboard: true });
    expect(svg).toContain(">AI Engineering Dashboard<");
    expect(
      await readFile(path.join(root, "public", "indicators", "ai-engineering-stats.svg"), "utf8"),
    ).toBe(svg);
  });

  it("still writes the card by default", async () => {
    expect(await generate({})).toContain(">AI Engineering Statistics<");
  });

  it("applies the --theme override to the dashboard", async () => {
    await writeFile(
      path.join(root, "data", "ai-engineering.json"),
      JSON.stringify(makeRawAiConfig({ ...FULL, settings: { dashboard: true } })),
      "utf8",
    );
    const svg = await readFile(await generateAiEngineeringStats(root, { theme: "LIGHT" }), "utf8");
    expect(svg).toContain('fill="#ffffff"');
  });
});
