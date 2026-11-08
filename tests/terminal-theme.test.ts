import { describe, expect, it } from "vitest";
import { levelMeter, metricCard, panel, progressBar } from "../src/components/index.js";
import { THEMES } from "../src/core/models.js";
import { contrastRatio } from "../src/shared/color.js";
import { PALETTES } from "../src/templates/themes.js";
import { tokensFor } from "./appearance-fixtures.js";
import { outOfBounds, parseBoxes } from "./component-geometry.js";

// TERMINAL is a look, not only a palette: accent titles, a pill with a dot,
// green bars and mono numbers. The other themes must stay exactly as they were.

const terminal = tokensFor({ theme: "TERMINAL" });
const dark = tokensFor({ theme: "DARK" });

const titled = (tokens: typeof terminal, title: string) =>
  panel(tokens, {
    title,
    tag: { label: "Observed", tone: "success" },
    content: progressBar(tokens, { label: "Item", value: 3, max: 4 }),
  })(380);

describe("the TERMINAL theme", () => {
  it("is a valid theme with its own look", () => {
    expect(THEMES).toContain("TERMINAL");
    expect(terminal.visual.look).toBe("TERMINAL");
    expect(dark.visual.look).toBe("STANDARD");
  });

  it("reaches WCAG AA for every text color on its black background", () => {
    const palette = PALETTES.TERMINAL;
    for (const key of ["text", "secondaryText", "mutedText"] as const) {
      expect(contrastRatio(palette[key], palette.background)).toBeGreaterThanOrEqual(4.5);
    }
    for (const key of ["primary", "success", "warning", "error"] as const) {
      expect(contrastRatio(palette[key], palette.background)).toBeGreaterThanOrEqual(3);
    }
  });

  it("draws the title in the accent color, in title case, with the rest as a quiet line", () => {
    const { body } = titled(terminal, "AI engineering skills · declared levels");
    expect(body).toContain(`fill="${terminal.palette.primary}"`);
    expect(body).toContain(">AI Engineering Skills<");
    expect(body).toContain(">Declared levels<");
    expect(body).not.toContain("AI ENGINEERING SKILLS");
  });

  it("draws the source as a pill with a dot, in capitals", () => {
    const { body } = titled(terminal, "AI tools");
    expect(body).toContain(">OBSERVED<");
    expect(body).toContain(`<circle cx="13" cy="11" r="3.5" fill="${terminal.palette.success}"`);
  });

  it("keeps the panel and its tag inside its box", () => {
    const fragment = titled(
      terminal,
      "A rather long title for a narrow panel · and a long subtitle too",
    );
    const boxes = parseBoxes(fragment.body, terminal.metrics);
    expect(outOfBounds(boxes, fragment.width, fragment.height)).toEqual([]);
  });

  it("fills bars with the green tone by default, and honors an explicit tone", () => {
    const green = terminal.visual.tones.success;
    expect(progressBar(terminal, { label: "x", value: 1, max: 2 })(200).body).toContain(
      `fill="${green}"`,
    );
    expect(
      levelMeter(terminal, { label: "x", level: 2, steps: 5, valueText: "y" })(200).body,
    ).toContain(`fill="${green}"`);
    expect(
      progressBar(terminal, { label: "x", value: 1, max: 2, tone: "warning" })(200).body,
    ).toContain(`fill="${terminal.visual.tones.warning}"`);
  });

  it("writes numbers in a mono face", () => {
    const card = metricCard(terminal, { label: "Tools", value: 5 })(180).body;
    expect(card).toMatch(/font-family="[^"]*(Consolas|monospace)[^"]*"[^>]*>5</);
    expect(progressBar(terminal, { label: "x", value: 1, max: 2 })(200).body).toContain(
      "monospace",
    );
  });
});

describe("the other themes are unchanged", () => {
  it("keep the quiet capitals title, the outlined badge and primary bars", () => {
    const { body } = titled(dark, "AI engineering skills · declared levels");
    expect(body).toContain(">AI ENGINEERING SKILLS · DECLARED LEVELS<");
    expect(body).toContain(">Observed<");
    expect(body).not.toContain("<circle");
    expect(progressBar(dark, { label: "x", value: 1, max: 2 })(200).body).toContain(
      `fill="${dark.visual.tones.primary}"`,
    );
  });

  it("write numbers in the same face as the text", () => {
    expect(metricCard(dark, { label: "Tools", value: 5 })(180).body).not.toContain("monospace");
    expect(dark.visual.numberFamily).toBeUndefined();
  });
});
