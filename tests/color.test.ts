import { describe, expect, it } from "vitest";
import {
  NO_PAINT,
  contrastRatio,
  isHexColor,
  mixColors,
  normalizeColor,
  relativeLuminance,
} from "../src/shared/color.js";
import { estimateTextWidth, fitText, type FontMetrics } from "../src/shared/text-fit.js";

describe("isHexColor", () => {
  it.each(["#fff", "#FFF", "#0d1117", "#0D1117", "#a1B2c3"])("accepts %s", (value) => {
    expect(isHexColor(value)).toBe(true);
  });

  it.each([
    "",
    "fff",
    "#ff",
    "#ffff",
    "#fffff",
    "#fffffff",
    "#ggg",
    "red",
    "transparent",
    "rgb(0,0,0)",
    "hsl(0 0% 0%)",
    "url(#x)",
    "#fff;",
    '#fff" onload="alert(1)',
    "#fff\n",
    " #fff",
    "#fff ",
  ])("rejects %j", (value) => {
    expect(isHexColor(value)).toBe(false);
  });
});

describe("normalizeColor", () => {
  it("expands short colors and lowercases", () => {
    expect(normalizeColor("#ABC")).toBe("#aabbcc");
    expect(normalizeColor("#0D1117")).toBe("#0d1117");
  });

  it("turns the transparent keyword into no paint", () => {
    expect(normalizeColor("transparent")).toBe(NO_PAINT);
  });
});

describe("mixColors", () => {
  it("returns the ends and the midpoint", () => {
    expect(mixColors("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixColors("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixColors("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("mixes each channel separately", () => {
    expect(mixColors("#ff0000", "#0000ff", 0.5)).toBe("#800080");
  });
});

describe("contrast", () => {
  it("is 21:1 for black on white and 1:1 for equal colors", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("does not depend on the order of the colors", () => {
    expect(contrastRatio("#0d1117", "#c9d1d9")).toBeCloseTo(
      contrastRatio("#c9d1d9", "#0d1117"),
      10,
    );
  });

  it("computes luminance between 0 and 1", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
  });

  it("matches the WCAG reference for a known pair", () => {
    // #767676 on white is the classic 4.54:1 example.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
});

describe("text measurement", () => {
  const proportional: FontMetrics = { monospace: false, scale: 1 };
  const monospace: FontMetrics = { monospace: true, scale: 1 };

  it("grows with the text and the font size", () => {
    expect(estimateTextWidth("abcd", 12, proportional)).toBeGreaterThan(
      estimateTextWidth("abc", 12, proportional),
    );
    expect(estimateTextWidth("abc", 24, proportional)).toBeCloseTo(
      2 * estimateTextWidth("abc", 12, proportional),
      8,
    );
  });

  it("makes bold text wider", () => {
    expect(estimateTextWidth("Hello", 12, proportional, true)).toBeGreaterThan(
      estimateTextWidth("Hello", 12, proportional, false),
    );
  });

  it("measures narrow and wide letters differently", () => {
    expect(estimateTextWidth("iiii", 12, proportional)).toBeLessThan(
      estimateTextWidth("wwww", 12, proportional),
    );
  });

  it("gives every character the same width in a monospace font", () => {
    expect(estimateTextWidth("iiii", 12, monospace)).toBe(estimateTextWidth("wwww", 12, monospace));
  });

  it("counts non-ASCII characters as a full em", () => {
    expect(estimateTextWidth("日本", 10, proportional)).toBeCloseTo(20, 8);
  });
});

describe("fitText", () => {
  const metrics: FontMetrics = { monospace: false, scale: 1 };

  it("returns text that already fits unchanged", () => {
    expect(fitText("Short", 500, 12, metrics)).toBe("Short");
  });

  it("shortens long text with an ellipsis so that it fits", () => {
    const fitted = fitText("A very long sentence that cannot possibly fit", 100, 12, metrics);
    expect(fitted.endsWith("…")).toBe(true);
    expect(fitted.length).toBeLessThan(40);
    expect(estimateTextWidth(fitted, 12, metrics)).toBeLessThanOrEqual(100);
  });

  it("never exceeds the budget, whatever the budget", () => {
    for (const budget of [10, 25, 50, 80, 140, 300]) {
      const fitted = fitText(
        "Representative text with Mixed CASE and 12345 digits",
        budget,
        13,
        metrics,
        true,
      );
      expect(estimateTextWidth(fitted, 13, metrics, true)).toBeLessThanOrEqual(budget);
    }
  });

  it("returns nothing when not even an ellipsis fits", () => {
    expect(fitText("Anything", 2, 12, metrics)).toBe("");
  });

  it("does not leave a space before the ellipsis", () => {
    expect(fitText("word word word word word", 60, 12, metrics)).not.toMatch(/\s…$/);
  });

  it("does not split an astral character", () => {
    const fitted = fitText("😀😀😀😀😀😀😀😀", 60, 12, metrics);
    expect(fitted).toMatch(/^(?:😀)*…?$/u);
  });
});
