import { describe, expect, it } from "vitest";
import { validateAiEngineeringConfig } from "../src/core/ai-engineering-validation.js";
import { THEMES } from "../src/core/models.js";
import {
  computeCacheHits,
  computeModelShares,
} from "../src/indicators/ai-engineering/dashboard.js";
import {
  computeAiEngineeringStats,
  selectPublicAiData,
} from "../src/indicators/ai-engineering/stats.js";
import { renderAiEngineeringDashboard } from "../src/templates/ai-engineering-dashboard.js";
import {
  makeAiConfig,
  makeAiProject,
  makeModel,
  makeRawAiConfig,
  makeSkill,
  makeTokenMetric,
  makeTool,
} from "./ai-fixtures.js";
import { levelMeter } from "../src/components/index.js";
import { tokensFor } from "./appearance-fixtures.js";
import { outOfBounds, parseBoxes } from "./component-geometry.js";

const JAN = { start: "2026-01-01", end: "2026-01-31" };
const FEB = { start: "2026-02-01", end: "2026-02-28" };

const milestone = (overrides: Record<string, unknown> = {}) => ({
  id: "m1",
  title: "First agent in production",
  description: "Shipped a tool-using agent.",
  date: "2026-02-10",
  visibility: "PUBLIC",
  provenance: "DECLARED",
  ...overrides,
});

const usage = (overrides: Record<string, unknown>) => makeTokenMetric(overrides);

function configOf(overrides: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) {
  return makeAiConfig({
    tools: [
      makeTool({ id: "a", name: "Alpha" }),
      makeTool({ id: "b", name: "Beta", provider: "Other" }),
    ],
    models: [
      makeModel({ id: "m-big", name: "Big", contextWindow: 200000, capability: "Agentic" }),
      makeModel({ id: "m-small", name: "Small", provider: "Other", modelFamily: "Small" }),
    ],
    skills: [makeSkill({ id: "s1", name: "Agents", category: "AI_AGENTS", frequency: "DAILY" })],
    milestones: [milestone()],
    tokenUsage: [
      usage({ id: "u1", modelId: "m-big", kind: "INPUT_TOKENS", value: 1000, period: JAN }),
      usage({ id: "u2", modelId: "m-big", kind: "CACHED_INPUT_TOKENS", value: 600, period: JAN }),
      usage({ id: "u3", modelId: "m-big", kind: "TOTAL_TOKENS", value: 3000, period: JAN }),
      usage({ id: "u4", modelId: "m-small", kind: "TOTAL_TOKENS", value: 1000, period: JAN }),
    ],
    ...overrides,
    settings: { dashboard: true, showTokenUsage: true, showCost: true, ...settings },
  });
}

function render(config = configOf()) {
  return renderAiEngineeringDashboard(computeAiEngineeringStats(config), {
    profile: config.profile,
    settings: config.settings,
    generatorVersion: "0.0.0-test",
  });
}

function assertInside(svg: string): void {
  const match = /<svg [^>]*width="(\d+)" height="(\d+)"/.exec(svg);
  const width = Number(match?.[1]);
  const height = Number(match?.[2]);
  const body = svg.slice(svg.indexOf("</desc>") + 7, svg.lastIndexOf("</svg>"));
  expect(outOfBounds(parseBoxes(body, tokensFor({}).metrics), width, height)).toEqual([]);
}

describe("schema additions", () => {
  it("accepts milestones, cached input tokens, a skill frequency and a model context", () => {
    expect(validateAiEngineeringConfig(makeRawAiConfig({ milestones: [milestone()] })).ok).toBe(
      true,
    );
    const config = configOf();
    expect(config.skills[0]?.frequency).toBe("DAILY");
    expect(config.models[0]?.contextWindow).toBe(200000);
    expect(config.tokenUsage.some((metric) => metric.kind === "CACHED_INPUT_TOKENS")).toBe(true);
  });

  it("keeps older configurations valid: every new field is optional", () => {
    const old = validateAiEngineeringConfig({ version: 1 });
    expect(old.ok && old.value.milestones).toEqual([]);
  });

  it.each([
    ["an unknown frequency", { skills: [{ ...makeSkill(), frequency: "HOURLY" }] }],
    ["a milestone with a bad date", { milestones: [milestone({ date: "soon" })] }],
    ["a milestone of an unknown project", { milestones: [milestone({ projectId: "nope" })] }],
    ["a repeated milestone id", { milestones: [milestone(), milestone()] }],
    ["a negative context window", { models: [{ ...makeModel(), contextWindow: -1 }] }],
    [
      "cached tokens with a currency unit",
      {
        models: [makeModel()],
        tokenUsage: [makeTokenMetric({ kind: "CACHED_INPUT_TOKENS", unit: "USD" })],
      },
    ],
  ])("rejects %s", (_name, overrides) => {
    expect(validateAiEngineeringConfig(makeRawAiConfig(overrides)).ok).toBe(false);
  });
});

describe("cache hit", () => {
  const stats = computeAiEngineeringStats(configOf());

  it("is cached input over input, for the same model and period", () => {
    const [hit] = computeCacheHits(stats.tokenUsage);
    expect(hit).toMatchObject({ inputTokens: 1000, cachedTokens: 600, percent: 60 });
  });

  it("needs both measurements and a real denominator", () => {
    const only = computeAiEngineeringStats(
      configOf({
        tokenUsage: [
          usage({ id: "u1", modelId: "m-big", kind: "CACHED_INPUT_TOKENS", value: 5, period: JAN }),
        ],
      }),
    );
    expect(computeCacheHits(only.tokenUsage)).toEqual([]);
    const zero = computeAiEngineeringStats(
      configOf({
        tokenUsage: [
          usage({ id: "u1", modelId: "m-big", kind: "INPUT_TOKENS", value: 0, period: JAN }),
          usage({ id: "u2", modelId: "m-big", kind: "CACHED_INPUT_TOKENS", value: 0, period: JAN }),
        ],
      }),
    );
    expect(computeCacheHits(zero.tokenUsage)).toEqual([]);
  });

  it("never pairs different periods or different models", () => {
    const mixed = computeAiEngineeringStats(
      configOf({
        tokenUsage: [
          usage({ id: "u1", modelId: "m-big", kind: "INPUT_TOKENS", value: 1000, period: JAN }),
          usage({
            id: "u2",
            modelId: "m-big",
            kind: "CACHED_INPUT_TOKENS",
            value: 500,
            period: FEB,
          }),
          usage({
            id: "u3",
            modelId: "m-small",
            kind: "CACHED_INPUT_TOKENS",
            value: 500,
            period: JAN,
          }),
        ],
      }),
    );
    expect(computeCacheHits(mixed.tokenUsage)).toEqual([]);
  });

  it("shows the rate in the strip and the panel", () => {
    const svg = render();
    expect(svg).toContain(">Cache Hit<");
    expect(svg).toContain(">60%<");
    expect(svg).toContain("CACHE HIT · CACHED INPUT ÷ INPUT, SAME MODEL AND PERIOD");
  });

  it("is left out of the strip when the pairs cover different periods", () => {
    const config = configOf({
      tokenUsage: [
        usage({ id: "a1", modelId: "m-big", kind: "INPUT_TOKENS", value: 100, period: JAN }),
        usage({ id: "a2", modelId: "m-big", kind: "CACHED_INPUT_TOKENS", value: 50, period: JAN }),
        usage({ id: "b1", modelId: "m-big", kind: "INPUT_TOKENS", value: 100, period: FEB }),
        usage({ id: "b2", modelId: "m-big", kind: "CACHED_INPUT_TOKENS", value: 10, period: FEB }),
      ],
    });
    expect(render(config)).not.toContain(">Cache Hit<");
  });
});

describe("model shares", () => {
  it("split the reported total tokens of one shared period", () => {
    const { shares, period } = computeModelShares(computeAiEngineeringStats(configOf()).tokenUsage);
    expect(period).toEqual(JAN);
    expect(shares.map((share) => [share.model.name, share.percent])).toEqual([
      ["Big", 75],
      ["Small", 25],
    ]);
  });

  it("do not exist when the totals cover different periods", () => {
    const config = configOf({
      tokenUsage: [
        usage({ id: "u1", modelId: "m-big", kind: "TOTAL_TOKENS", value: 10, period: JAN }),
        usage({ id: "u2", modelId: "m-small", kind: "TOTAL_TOKENS", value: 10, period: FEB }),
      ],
    });
    expect(computeModelShares(computeAiEngineeringStats(config).tokenUsage).shares).toEqual([]);
    expect(render(config)).not.toContain("% of tokens");
    expect(render(config)).not.toContain(">Top Model<");
  });

  it("show on the models and in the strip, with the period named", () => {
    const svg = render();
    expect(svg).toContain(">75% of tokens<");
    expect(svg).toContain(">Top Model<");
    expect(svg).toContain("SHARE OF REPORTED TOTAL TOKENS · 2026-01-01 TO 2026-01-31");
  });
});

describe("milestones", () => {
  it("are drawn as declared, dated entries without levels or badges", () => {
    const svg = render();
    expect(svg).toContain(">AI ENGINEERING MILESTONES<");
    expect(svg).toContain(">First agent in production<");
    expect(svg).toContain(">2026-02-10<");
    expect(svg).not.toMatch(/gold|silver|diamond|bronze/i);
  });

  it("can be switched off, and are absent without data", () => {
    expect(render(configOf({}, { showMilestones: false }))).not.toContain("MILESTONES<");
    expect(render(configOf({ milestones: [] }))).not.toContain("MILESTONES<");
  });

  it("keep their own source tag", () => {
    expect(render(configOf({ milestones: [milestone({ provenance: "ESTIMATED" })] }))).toContain(
      ">Estimated<",
    );
  });

  it("never show a private milestone, or one of a private project", () => {
    const config = configOf({
      projects: [makeAiProject({ id: "p-private", name: "Hidden", visibility: "PRIVATE" })],
      milestones: [
        milestone({ id: "m1", title: "Visible one" }),
        milestone({ id: "m2", title: "ZZ-PRIVATE-A", visibility: "PRIVATE" }),
        milestone({ id: "m3", title: "ZZ-PRIVATE-B", projectId: "p-private" }),
      ],
    });
    expect(selectPublicAiData(config).milestones.map((m) => m.id)).toEqual(["m1"]);
    expect(render(config)).not.toContain("ZZ-PRIVATE");
  });

  it("are listed newest first and capped with a count of the rest", () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      milestone({
        id: `m${String(i)}`,
        title: `Step ${String(i)}`,
        date: `2026-01-0${String(i + 1)}`,
      }),
    );
    const svg = render(configOf({ milestones: many }));
    expect(svg.indexOf("Step 6")).toBeLessThan(svg.indexOf("Step 5"));
    expect(svg).toContain("+4 more");
  });
});

describe("panel tags, chips and skill frequency", () => {
  it("name the source in the header and leave the rows plain when it is uniform", () => {
    const svg = render();
    expect(svg).toContain(">Declared<");
    // One tag per panel with declared data, not one badge per row.
    expect(svg.match(/>Declared</g)?.length).toBeLessThanOrEqual(6);
  });

  it("say Mixed when sources differ, and keep each row's own source", () => {
    const config = configOf({
      tools: [
        makeTool({ id: "a", name: "Seen", provenance: "OBSERVED" }),
        makeTool({ id: "b", name: "Said", provenance: "DECLARED" }),
      ],
    });
    const svg = render(config);
    expect(svg).toContain(">Mixed<");
    expect(svg).toContain(">Observed<");
    expect(svg).toContain(">Declared<");
  });

  it("show the AI stack in the strip, from the tools only", () => {
    const svg = render();
    expect(svg).toContain(">AI Stack<");
    expect(svg).toContain(">Alpha · Beta<");
  });

  it("show how often a skill is used, as declared", () => {
    expect(render()).toMatch(/>Practicing · Daily</);
  });

  it("show a model's capability and context window", () => {
    expect(render()).toContain("Agentic · 200k ctx");
  });
});

describe("compatibility", () => {
  it("keeps drawing without any new data, as before", () => {
    const svg = render(makeAiConfig({ tools: [makeTool()], settings: { dashboard: true } }));
    expect(svg).not.toContain("MILESTONES");
    expect(svg).not.toContain(">Cache Hit<");
    expect(svg).not.toContain(">Top Model<");
  });

  it.each(THEMES)("stays inside its bounds in the %s theme", (theme) => {
    assertInside(render(configOf({}, { theme })));
  });

  it("is deterministic", () => {
    expect(render()).toBe(render());
  });

  it("claims no score, productivity or AI share of code", () => {
    const visible = [...render().matchAll(/>([^<]+)</g)].map((match) => match[1]).join(" ");
    expect(visible).not.toMatch(/\b(score|productivity|efficiency score|ai-generated code)\b/i);
  });
});

describe("level meter", () => {
  const tokens = tokensFor({});
  const fragment = levelMeter(tokens, {
    label: "Agents",
    level: 3,
    steps: 5,
    valueText: "Practicing",
  })(300);
  const steps = parseBoxes(fragment.body, tokens.metrics).filter((box) => box.kind === "rect");

  it("draws separate steps, filled up to the level", () => {
    expect(steps).toHaveLength(5);
    expect(steps.filter((box) => box.fill === tokens.visual.tones.primary)).toHaveLength(3);
    expect(steps.filter((box) => box.fill === tokens.palette.track)).toHaveLength(2);
  });

  it("clamps a level outside the scale and stays inside its width", () => {
    const high = levelMeter(tokens, { label: "x", level: 99, steps: 5, valueText: "y" })(300);
    const low = levelMeter(tokens, { label: "x", level: -2, steps: 5, valueText: "y" })(300);
    expect(
      parseBoxes(high.body, tokens.metrics).filter((b) => b.fill === tokens.visual.tones.primary),
    ).toHaveLength(5);
    expect(
      parseBoxes(low.body, tokens.metrics).filter((b) => b.fill === tokens.visual.tones.primary),
    ).toHaveLength(0);
    expect(outOfBounds(parseBoxes(high.body, tokens.metrics), 300, high.height)).toEqual([]);
  });
});
