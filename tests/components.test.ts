import { describe, expect, it } from "vitest";
import { displayFlags } from "../src/core/appearance.js";
import { THEMES } from "../src/core/models.js";
import {
  activityHeatmap,
  badge,
  compactMetric,
  dashboardSection,
  distributionBar,
  divider,
  donutChart,
  grid,
  horizontalBarChart,
  metricCard,
  panel,
  progressBar,
  rankingList,
  row,
  splitWidth,
  stack,
  statusIndicator,
  timeline,
  verticalBarChart,
  type Builder,
  type Fragment,
} from "../src/components/index.js";
import { NO_PAINT, isHexColor } from "../src/shared/color.js";
import { composeCard } from "../src/templates/card.js";
import { computeStartupStats } from "../src/indicators/startup/stats.js";
import { parseBoxes, outOfBounds, type Box } from "./component-geometry.js";
import { tokensFor } from "./appearance-fixtures.js";
import { makeConfig, makeProject } from "./fixtures.js";

const tokens = tokensFor({});
const WIDTH = 400;
const boxesOf = (fragment: Fragment) => parseBoxes(fragment.body, tokens.metrics);
const textsOf = (fragment: Fragment) =>
  boxesOf(fragment)
    .filter((box) => box.kind === "text")
    .map((box) => box.content);

function overlap(a: Box, b: Box): boolean {
  return a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.y0 < b.y1 - 0.01 && b.y0 < a.y1 - 0.01;
}

describe("splitWidth", () => {
  it.each([
    [400, [1, 1, 1], 12],
    [401, [1, 1, 1], 12],
    [499, [2, 1], 10],
    [17, [1, 1, 1, 1], 3],
  ])("adds up exactly for %i px and weights %j", (total, weights, gap) => {
    const widths = splitWidth(total, weights, gap);
    const sum = widths.reduce((a, b) => a + b, 0) + gap * (weights.length - 1);
    expect(sum).toBe(total);
    expect(widths.every(Number.isInteger)).toBe(true);
  });

  it("returns nothing for no columns and rejects all-zero weights", () => {
    expect(splitWidth(100, [], 8)).toEqual([]);
    expect(() => splitWidth(100, [0, 0], 8)).toThrow(/weights/);
  });
});

describe("layout", () => {
  const card = (label: string): Builder => metricCard(tokens, { label, value: 1 });

  it.each([1, 2, 3])("places %i columns side by side without overlap", (columns) => {
    const fragment = grid(
      { columns, gap: 12 },
      Array.from({ length: columns }, (_, i) => card(`Metric ${String(i)}`)),
    )(WIDTH);
    expect(fragment.width).toBe(WIDTH);
    const frames = boxesOf(fragment).filter(
      (box) => box.kind === "rect" && box.fill === tokens.palette.surface,
    );
    expect(frames.length).toBe(columns);
    for (let i = 0; i < frames.length; i += 1) {
      for (let j = i + 1; j < frames.length; j += 1) {
        expect(overlap(frames[i] as Box, frames[j] as Box)).toBe(false);
      }
    }
    expect(outOfBounds(boxesOf(fragment), fragment.width, fragment.height)).toEqual([]);
  });

  it("wraps into lines and keeps the column width on a short last line", () => {
    const fragment = grid({ columns: 2, gap: 12 }, [card("a"), card("b"), card("c")])(WIDTH);
    const frames = boxesOf(fragment).filter(
      (box) => box.kind === "rect" && box.fill === tokens.palette.surface,
    );
    expect(frames).toHaveLength(3);
    const widthOf = (box: Box | undefined) => (box?.x1 ?? 0) - (box?.x0 ?? 0);
    expect(widthOf(frames[2])).toBe(widthOf(frames[0]));
    expect(fragment.height).toBe(2 * tokens.layout.tileHeight + 12);
  });

  it("supports a full-width section above a grid", () => {
    const fragment = stack({ gap: 12 }, [
      divider(tokens),
      grid({ columns: 2, gap: 12 }, [card("a"), card("b")]),
    ])(WIDTH);
    expect(fragment.height).toBe(1 + 12 + tokens.layout.tileHeight);
  });

  it("gives weighted columns different widths", () => {
    const fragment = row({ gap: 10, weights: [2, 1] }, [card("wide"), card("narrow")])(WIDTH);
    const [wide, narrow] = boxesOf(fragment).filter(
      (box) => box.kind === "rect" && box.fill === tokens.palette.surface,
    );
    expect((wide?.x1 ?? 0) - (wide?.x0 ?? 0)).toBeGreaterThan(
      ((narrow?.x1 ?? 0) - (narrow?.x0 ?? 0)) * 1.8,
    );
  });

  it("stretches panels in a row to the same height", () => {
    const short = panel(tokens, {
      title: "Short",
      content: progressBar(tokens, { label: "a", value: 1, max: 2 }),
    });
    const tall = panel(tokens, {
      title: "Tall",
      content: rankingList(tokens, [
        { label: "one", value: 3 },
        { label: "two", value: 2 },
        { label: "three", value: 1 },
      ]),
    });
    const fragment = row({ gap: 12 }, [short, tall])(WIDTH);
    const frames = boxesOf(fragment).filter(
      (box) => box.kind === "rect" && box.fill === tokens.palette.surface,
    );
    expect(frames).toHaveLength(2);
    expect(frames[0]?.y1).toBe(frames[1]?.y1);
    expect(frames[0]?.y1).toBeLessThanOrEqual(fragment.height);
  });

  it("renders an empty section as nothing instead of failing", () => {
    expect(grid({ columns: 2, gap: 12 }, [])(WIDTH)).toMatchObject({ height: 0, body: "" });
    expect(stack({ gap: 12 }, [])(WIDTH)).toMatchObject({ height: 0 });
  });

  it("refuses a component wider than its cell", () => {
    const tooWide: Builder = () => ({ body: "", width: 999, height: 10 });
    expect(() => row({ gap: 0 }, [tooWide])(WIDTH)).toThrow(/cell/);
  });
});

describe("metric components", () => {
  it("draws a metric card with its value, label and caption inside the card", () => {
    const fragment = metricCard(tokens, { label: "Active projects", value: 7, caption: "now" })(
      180,
    );
    expect(textsOf(fragment)).toEqual(["7", "now", "Active projects"]);
    expect(outOfBounds(boxesOf(fragment), 180, fragment.height)).toEqual([]);
  });

  it("shortens a long label instead of overflowing a narrow card", () => {
    const fragment = metricCard(tokens, { label: "x".repeat(120), value: "123456" })(140);
    expect(outOfBounds(boxesOf(fragment), 140, fragment.height)).toEqual([]);
    expect(textsOf(fragment).join("")).toContain("…");
  });

  it("aligns a compact metric to both edges", () => {
    const fragment = compactMetric(tokens, { label: "Tokens", value: "1.2M" })(WIDTH);
    const [label, value] = boxesOf(fragment);
    expect(label?.x0).toBe(0);
    expect(value?.x1).toBeCloseTo(WIDTH, 5);
  });

  describe("progressBar", () => {
    const fills = (fragment: Fragment) => boxesOf(fragment).filter((box) => box.kind === "rect");

    it("fills in proportion to the value and shows the percentage", () => {
      const fragment = progressBar(tokens, { label: "Done", value: 1, max: 4 })(200);
      const [track, fill] = fills(fragment);
      expect((fill?.x1 ?? 0) - (fill?.x0 ?? 0)).toBeCloseTo(
        ((track?.x1 ?? 0) - (track?.x0 ?? 0)) / 4,
        1,
      );
      expect(textsOf(fragment)).toContain("25%");
    });

    it.each([
      ["zero", 0, 10],
      ["negative", -5, 10],
      ["NaN", Number.NaN, 10],
      ["a zero maximum", 5, 0],
    ])("draws only the track for %s", (_name, value, max) => {
      expect(fills(progressBar(tokens, { label: "x", value, max })(200))).toHaveLength(1);
    });

    it("never draws past the track for a value above the maximum", () => {
      const fragment = progressBar(tokens, { label: "x", value: 50, max: 10 })(200);
      expect(outOfBounds(boxesOf(fragment), 200, fragment.height)).toEqual([]);
      expect(textsOf(fragment)).toContain("100%");
    });
  });

  describe("distributionBar", () => {
    it("splits the bar in proportion and lists every label in the legend", () => {
      const fragment = distributionBar(tokens, [
        { label: "Idea", value: 1 },
        { label: "MVP", value: 3 },
        { label: "Empty", value: 0 },
      ])(300);
      const segments = boxesOf(fragment).filter(
        (box) => box.kind === "rect" && box.fill !== tokens.palette.track,
      );
      expect(segments).toHaveLength(2);
      expect(textsOf(fragment)).toEqual(["Idea 1", "MVP 3", "Empty 0"]);
      expect(outOfBounds(boxesOf(fragment), 300, fragment.height)).toEqual([]);
    });

    it("shows a message when there is nothing to distribute", () => {
      expect(textsOf(distributionBar(tokens, [{ label: "a", value: 0 }])(300))).toEqual([
        "No data",
      ]);
      expect(textsOf(distributionBar(tokens, [])(300))).toEqual(["No data"]);
    });

    it("wraps a long legend onto several lines inside the width", () => {
      const many = Array.from({ length: 8 }, (_, i) => ({
        label: `Category ${String(i)}`,
        value: 1,
      }));
      const fragment = distributionBar(tokens, many)(240);
      expect(outOfBounds(boxesOf(fragment), 240, fragment.height)).toEqual([]);
      const ys = new Set(
        boxesOf(fragment)
          .filter((box) => box.kind === "text")
          .map((box) => box.y0),
      );
      expect(ys.size).toBeGreaterThan(1);
    });
  });

  describe("rankingList", () => {
    const items = [
      { label: "Claude", value: 90 },
      { label: "GPT", value: 45 },
      { label: "Gemini", value: 0 },
    ];

    it("numbers the items in the order given and scales bars to the largest value", () => {
      const fragment = rankingList(tokens, items)(300);
      expect(textsOf(fragment)).toEqual([
        "1",
        "Claude",
        "90",
        "2",
        "GPT",
        "45",
        "3",
        "Gemini",
        "0",
      ]);
      expect(outOfBounds(boxesOf(fragment), 300, fragment.height)).toEqual([]);
    });

    it("honors the limit and handles an empty list", () => {
      expect(textsOf(rankingList(tokens, items, { limit: 1 })(300))).toEqual(["1", "Claude", "90"]);
      expect(textsOf(rankingList(tokens, [])(300))).toEqual(["No data"]);
    });
  });

  it("sizes a status indicator and a badge to their text", () => {
    const status = statusIndicator(tokens, { label: "Active", tone: "success" });
    const pill = badge(tokens, { label: "v0.6.0" });
    for (const item of [status, pill]) {
      expect(outOfBounds(boxesOf(item), item.width, item.height)).toEqual([]);
    }
  });
});

describe("chart components", () => {
  const bars = [
    { label: "Mon", value: 3 },
    { label: "Tue", value: 0 },
    { label: "Wed", value: 9 },
  ];

  it("keeps a horizontal bar chart inside its box and omits bars for zero values", () => {
    const fragment = horizontalBarChart(tokens, bars)(WIDTH);
    expect(outOfBounds(boxesOf(fragment), WIDTH, fragment.height)).toEqual([]);
    const fills = boxesOf(fragment).filter(
      (box) => box.kind === "rect" && box.fill === tokens.palette.primary,
    );
    expect(fills).toHaveLength(2);
  });

  it("draws columns of the right relative height in a vertical bar chart", () => {
    const fragment = verticalBarChart(tokens, bars, 120)(WIDTH);
    expect(fragment.height).toBeLessThanOrEqual(120);
    expect(outOfBounds(boxesOf(fragment), WIDTH, fragment.height)).toEqual([]);
    const columns = boxesOf(fragment).filter((box) => box.kind === "rect");
    expect(columns).toHaveLength(2);
    const [small, tall] = columns.map((box) => box.y1 - box.y0);
    expect((tall ?? 0) / (small ?? 1)).toBeCloseTo(3, 0);
  });

  it("drops labels but keeps the columns when there are too many for the width", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ label: String(i), value: i }));
    const fragment = verticalBarChart(tokens, many, 100)(300);
    expect(textsOf(fragment)).toEqual([]);
    expect(outOfBounds(boxesOf(fragment), 300, fragment.height)).toEqual([]);
  });

  it.each([
    ["horizontal", horizontalBarChart(tokens, [])],
    ["vertical", verticalBarChart(tokens, [], 100)],
  ])("shows a message for an empty %s chart", (_name, builder) => {
    expect(textsOf(builder(WIDTH))).toEqual(["No data"]);
  });

  describe("donutChart", () => {
    const slices = [
      { label: "Active", value: 3 },
      { label: "Paused", value: 1 },
    ];

    it.each([240, 400])("fits its legend and ring in %i px", (width) => {
      const fragment = donutChart(tokens, slices)(width);
      expect(outOfBounds(boxesOf(fragment), width, fragment.height)).toEqual([]);
      expect(textsOf(fragment)).toEqual(["4", "Active 3", "Paused 1"]);
    });

    it("splits the circumference in proportion to the values", () => {
      const fragment = donutChart(tokens, slices)(400);
      const lengths = [...fragment.body.matchAll(/stroke-dasharray="([\d.]+) ([\d.]+)"/g)].map(
        (match) => Number(match[1]) / (Number(match[1]) + Number(match[2])),
      );
      expect(lengths[0]).toBeCloseTo(0.75, 2);
      expect(lengths[1]).toBeCloseTo(0.25, 2);
    });

    it("draws an empty ring with a zero total when every value is zero", () => {
      const fragment = donutChart(tokens, [{ label: "a", value: 0 }])(400);
      expect(fragment.body).not.toContain("stroke-dasharray");
      expect(textsOf(fragment)[0]).toBe("0");
    });
  });

  describe("activityHeatmap", () => {
    it("maps zero to the empty level and the largest value to the top level", () => {
      const fragment = activityHeatmap(tokens, [0, 1, 4, 8], { rows: 2 })(200);
      const fills = boxesOf(fragment).map((box) => box.fill);
      expect(fills[0]).toBe(tokens.visual.heat[0]);
      expect(fills[3]).toBe(tokens.visual.heat[4]);
      expect(new Set(fills).size).toBe(4);
    });

    it("shrinks its cells to fit a narrow width and never exceeds it", () => {
      const weeks = Array.from({ length: 53 * 7 }, (_, i) => i % 5);
      const fragment = activityHeatmap(tokens, weeks, { legend: true })(300);
      expect(fragment.width).toBeLessThanOrEqual(300);
      expect(outOfBounds(boxesOf(fragment), 300, fragment.height)).toEqual([]);
    });

    it("handles all-zero and empty data", () => {
      const zero = activityHeatmap(tokens, [0, 0, 0])(200);
      expect(new Set(boxesOf(zero).map((box) => box.fill))).toEqual(
        new Set([tokens.visual.heat[0]]),
      );
      expect(textsOf(activityHeatmap(tokens, [])(200))).toEqual(["No data"]);
    });
  });

  it("lays out a timeline with the label and date of each event inside the width", () => {
    const fragment = timeline(tokens, [
      { label: "Started", date: "2026-01" },
      { label: "Launched ".repeat(12), date: "2026-06", tone: "success" },
    ])(260);
    expect(outOfBounds(boxesOf(fragment), 260, fragment.height)).toEqual([]);
    expect(textsOf(fragment)).toContain("2026-06");
    expect(textsOf(timeline(tokens, [])(260))).toEqual(["No data"]);
  });
});

describe("SVG safety", () => {
  const hostile = `<script>alert(1)</script> "&' onload=x`;

  it("escapes user text in every component and never emits markup from it", () => {
    const fragments: Fragment[] = [
      metricCard(tokens, { label: hostile, value: hostile, caption: hostile })(300),
      compactMetric(tokens, { label: hostile, value: hostile })(300),
      progressBar(tokens, { label: hostile, value: 1, max: 2, valueText: hostile })(300),
      distributionBar(tokens, [{ label: hostile, value: 1 }])(300),
      rankingList(tokens, [{ label: hostile, value: 1, valueText: hostile }])(300),
      horizontalBarChart(tokens, [{ label: hostile, value: 1 }])(300),
      verticalBarChart(tokens, [{ label: hostile, value: 1 }], 100)(300),
      donutChart(tokens, [{ label: hostile, value: 1 }])(300),
      timeline(tokens, [{ label: hostile, date: hostile }])(300),
      panel(tokens, { title: hostile, content: compactMetric(tokens, { label: "a", value: 1 }) })(
        300,
      ),
      statusIndicator(tokens, { label: hostile }),
      badge(tokens, { label: hostile }),
    ];
    for (const fragment of fragments) {
      expect(fragment.body).not.toMatch(/<script/i);
      // Text nodes are escaped data; only the markup itself must be free of active content.
      const markup = fragment.body.replace(/>[^<]*</g, "><");
      expect(markup).not.toMatch(/\son\w+=|javascript:|href=|<image|<foreignObject|url\(/i);
      expect(() => parseBoxes(fragment.body, tokens.metrics)).not.toThrow();
    }
  });

  it("uses no ids, so nothing can clash when a card is embedded twice", () => {
    const fragment = grid({ columns: 2, gap: 12 }, [
      panel(tokens, { title: "a", content: donutChart(tokens, [{ label: "x", value: 1 }]) }),
      panel(tokens, { title: "b", content: activityHeatmap(tokens, [1, 2, 3]) }),
    ])(WIDTH);
    expect(fragment.body).not.toMatch(/\sid="/);
  });
});

describe("design tokens for components", () => {
  it.each(THEMES)("defines only valid colors for %s", (theme) => {
    const { visual } = tokensFor({ theme });
    const colors = [
      ...Object.values(visual.tones),
      ...visual.series,
      ...visual.heat,
      visual.surfaceSecondary,
    ];
    for (const color of colors) expect(isHexColor(color) || color === NO_PAINT).toBe(true);
    expect(visual.heat).toHaveLength(5);
  });

  it("makes each heat level a distinct step in every opaque theme", () => {
    for (const theme of THEMES.filter((name) => name !== "TRANSPARENT")) {
      expect(new Set(tokensFor({ theme }).visual.heat).size).toBe(5);
    }
  });

  it("follows custom colors and spacing from the configuration", () => {
    const custom = tokensFor({
      colors: { primary: "#ff0000" },
      dimensions: { spacing: 40 },
    });
    expect(custom.visual.tones.primary).toBe("#ff0000");
    expect(custom.visual.heat[4]).toBe("#ff0000");
    expect(custom.visual.gap).toBe(20);
  });
});

describe("dashboard composition", () => {
  const config = makeConfig([
    makeProject({ id: "a", lifecycleStage: "MVP" }),
    makeProject({ id: "b", lifecycleStage: "LAUNCHED" }),
    makeProject({ id: "c", lifecycleStage: "MVP", status: "PAUSED" }),
  ]);
  const stats = computeStartupStats(config.projects);

  function dashboard(settings: Record<string, unknown>): string {
    const t = tokensFor(settings);
    const content = stack({ gap: t.visual.gap }, [
      grid({ columns: 3, gap: t.visual.gap }, [
        metricCard(t, { label: "Projects", value: stats.totalProjects }),
        metricCard(t, { label: "Active", value: stats.activeProjects, tone: "success" }),
        metricCard(t, { label: "Launched", value: stats.launchedProjects, tone: "warning" }),
      ]),
      row({ gap: t.visual.gap, weights: [3, 2] }, [
        panel(t, {
          title: "Lifecycle",
          content: horizontalBarChart(
            t,
            stats.projectsByLifecycleStage.map((entry) => ({
              label: entry.stage,
              value: entry.count,
            })),
          ),
        }),
        panel(t, {
          title: "Share",
          content: donutChart(
            t,
            stats.projectsByLifecycleStage.map((entry) => ({
              label: entry.stage,
              value: entry.count,
            })),
          ),
        }),
      ]),
    ]);
    return composeCard({
      title: "Component dashboard",
      description: "A dashboard built from the startup statistics.",
      displayName: "Tester",
      generatorVersion: "0.0.0-test",
      tokens: t,
      display: displayFlags({ theme: "DARK", ...settings } as never),
      summary: [],
      sections: [dashboardSection(content, t)],
    });
  }

  it.each(THEMES)("renders a valid, bounded card in the %s theme", (theme) => {
    const svg = dashboard({ theme, showSummary: false });
    const root = /<svg [^>]*width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    expect(root).not.toBeNull();
    const [, width, height, viewWidth, viewHeight] = root as RegExpExecArray;
    expect([viewWidth, viewHeight]).toEqual([width, height]);
    expect(svg).toContain("<title");
    expect(svg).toContain("<desc");
    const body = svg.slice(svg.indexOf("<title"), svg.lastIndexOf("</svg>"));
    expect(outOfBounds(parseBoxes(body, tokens.metrics), Number(width), Number(height))).toEqual(
      [],
    );
    expect(svg).not.toMatch(/<script|href=|<image|url\(/i);
  });

  it.each(["COMPACT", "DEFAULT", "EXPANDED"])("fits the %s layout width", (layout) => {
    const svg = dashboard({ layout, showSummary: false });
    const width = Number(/width="(\d+)"/.exec(svg)?.[1]);
    const t = tokensFor({ layout });
    expect(width).toBe(t.box.width);
  });

  it("is deterministic: the same input gives the same SVG", () => {
    expect(dashboard({ theme: "MIDNIGHT" })).toBe(dashboard({ theme: "MIDNIGHT" }));
  });
});
