import { describe, expect, it } from "vitest";
import { LAYOUTS } from "../src/core/appearance.js";
import { THEMES } from "../src/core/models.js";
import { NO_PAINT, contrastRatio, isHexColor } from "../src/shared/color.js";
import {
  MIN_CONTENT_WIDTH,
  contrastWarnings,
  fit,
  measure,
  resolveDesignTokens,
} from "../src/templates/design-tokens.js";
import { PALETTES, THEME_DEFINITIONS, statusColor } from "../src/templates/themes.js";
import { tokensFor } from "./appearance-fixtures.js";

const PALETTE_KEYS = Object.keys(PALETTES.DARK) as (keyof typeof PALETTES.DARK)[];
const OPAQUE_THEMES = THEMES.filter((theme) => theme !== "TRANSPARENT");

describe("themes", () => {
  it("defines every theme with every token", () => {
    for (const theme of THEMES) {
      expect(Object.keys(PALETTES[theme]).sort()).toEqual([...PALETTE_KEYS].sort());
    }
  });

  it("uses only hexadecimal colors or no paint", () => {
    for (const theme of THEMES) {
      for (const [name, value] of Object.entries(PALETTES[theme]) as [string, string][]) {
        expect(isHexColor(value) || value === NO_PAINT, `${theme}.${name} = ${value}`).toBe(true);
      }
    }
  });

  it("keeps DARK and LIGHT exactly as they were in earlier versions", () => {
    expect(PALETTES.DARK).toMatchObject({
      background: "#0d1117",
      surface: "#161b22",
      primary: "#58a6ff",
    });
    expect(PALETTES.LIGHT).toMatchObject({
      background: "#ffffff",
      surface: "#f6f8fa",
      primary: "#0969da",
    });
  });

  it("makes themes clearly different from each other, not variations of one", () => {
    for (let i = 0; i < THEMES.length; i += 1) {
      for (let j = i + 1; j < THEMES.length; j += 1) {
        const a = PALETTES[THEMES[i] ?? "DARK"];
        const b = PALETTES[THEMES[j] ?? "DARK"];
        const different = PALETTE_KEYS.filter((key) => a[key] !== b[key]);
        expect(different.length, `${THEMES[i] ?? ""} vs ${THEMES[j] ?? ""}`).toBeGreaterThanOrEqual(
          6,
        );
      }
    }
  });

  it("gives MINIMAL and TRANSPARENT their own shape, not only their own colors", () => {
    expect(THEME_DEFINITIONS.MINIMAL.radius).toBeLessThan(THEME_DEFINITIONS.DARK.radius);
    expect(PALETTES.MINIMAL.surface).toBe(NO_PAINT);
    expect(PALETTES.TRANSPARENT.background).toBe(NO_PAINT);
    expect(PALETTES.TRANSPARENT.surface).toBe(NO_PAINT);
  });

  describe.each(OPAQUE_THEMES)("contrast of the %s theme", (theme) => {
    const palette = PALETTES[theme];
    const grounds = [palette.background, palette.surface].filter((color) => color !== NO_PAINT);

    it.each(["text", "secondaryText", "mutedText"] as const)(
      "%s reaches WCAG AA (4.5:1)",
      (key) => {
        for (const ground of grounds) {
          expect(contrastRatio(palette[key], ground)).toBeGreaterThanOrEqual(4.5);
        }
      },
    );

    it.each(["primary", "success", "warning", "error"] as const)("%s reaches 3:1", (key) => {
      for (const ground of grounds) {
        expect(contrastRatio(palette[key], ground)).toBeGreaterThanOrEqual(3);
      }
    });

    it("keeps the empty part of a bar distinguishable from the filled part", () => {
      expect(contrastRatio(palette.track, palette.primary)).toBeGreaterThan(1.5);
    });
  });

  describe("contrast of the TRANSPARENT theme", () => {
    // It cannot know what is behind it, so it is checked on a white README and on
    // GitHub's dark one. One color cannot reach 4.5:1 on both: 4.3:1 is the best.
    const palette = PALETTES.TRANSPARENT;
    const BACKGROUNDS = ["#ffffff", "#0d1117"];

    it.each(["text", "secondaryText", "mutedText"] as const)(
      "%s stays readable on light and dark pages",
      (key) => {
        for (const background of BACKGROUNDS) {
          expect(contrastRatio(palette[key], background)).toBeGreaterThanOrEqual(4.3);
        }
      },
    );

    it.each(["primary", "success", "warning", "error", "border"] as const)(
      "%s reaches 3:1 on both",
      (key) => {
        for (const background of BACKGROUNDS) {
          expect(contrastRatio(palette[key], background)).toBeGreaterThanOrEqual(3);
        }
      },
    );
  });
});

describe("statusColor", () => {
  it("maps each operational status to a semantic color", () => {
    const palette = PALETTES.DARK;
    expect(statusColor(palette, "ACTIVE")).toBe(palette.success);
    expect(statusColor(palette, "PAUSED")).toBe(palette.warning);
    expect(statusColor(palette, "INACTIVE")).toBe(palette.mutedText);
  });
});

describe("resolveDesignTokens", () => {
  describe("defaults", () => {
    it("reproduces the geometry of every earlier version", () => {
      const tokens = tokensFor({});
      expect(tokens.box).toEqual({
        width: 560,
        padding: 28,
        contentWidth: 504,
        sectionGap: 24,
        tileGap: 12,
        cardRadius: 10,
        tileRadius: 8,
        barRadius: 4,
        markRadius: 4,
      });
      expect(tokens.font).toMatchObject({
        title: 20,
        body: 13,
        label: 12,
        small: 11,
        number: 28,
        brand: 14,
        emphasis: 600,
        strong: 700,
      });
      expect(tokens.font.family).toBe("-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif");
      expect(tokens.layout).toMatchObject({
        name: "DEFAULT",
        headerStyle: "stacked",
        summaryStyle: "tiles",
        rowHeight: 24,
      });
    });

    it("uses the theme's palette untouched", () => {
      for (const theme of THEMES) {
        expect(tokensFor({ theme }).palette).toEqual(PALETTES[theme]);
      }
    });
  });

  describe("layouts", () => {
    it("differ in organization, not only in size", () => {
      const compact = tokensFor({ layout: "COMPACT" }).layout;
      const standard = tokensFor({ layout: "DEFAULT" }).layout;
      const expanded = tokensFor({ layout: "EXPANDED" }).layout;
      expect(compact.headerStyle).toBe("inline");
      expect(compact.summaryStyle).toBe("inline");
      expect(standard.headerStyle).toBe("stacked");
      expect(expanded.headerStyle).toBe("stacked");
      expect(standard.summaryStyle).toBe("tiles");
    });

    it("gets denser from EXPANDED to COMPACT", () => {
      const [compact, standard, expanded] = (["COMPACT", "DEFAULT", "EXPANDED"] as const).map(
        (layout) => tokensFor({ layout }),
      );
      expect(compact?.box.width).toBeLessThan(standard?.box.width ?? 0);
      expect(standard?.box.width).toBeLessThan(expanded?.box.width ?? 0);
      expect(compact?.layout.rowHeight).toBeLessThan(standard?.layout.rowHeight ?? 0);
      expect(standard?.layout.rowHeight).toBeLessThan(expanded?.layout.rowHeight ?? 0);
      expect(compact?.font.title).toBeLessThan(standard?.font.title ?? 0);
      expect(standard?.font.title).toBeLessThan(expanded?.font.title ?? 0);
      expect(compact?.box.sectionGap).toBeLessThan(expanded?.box.sectionGap ?? 0);
    });

    it("never changes the colors", () => {
      for (const layout of LAYOUTS) {
        expect(tokensFor({ theme: "MIDNIGHT", layout }).palette).toEqual(PALETTES.MIDNIGHT);
      }
    });
  });

  describe("precedence: theme, then layout, then explicit settings", () => {
    it("lets the layout set the size and the theme set the corner radius", () => {
      const tokens = tokensFor({ theme: "MINIMAL", layout: "EXPANDED" });
      expect(tokens.box.width).toBe(640);
      expect(tokens.box.cardRadius).toBe(4);
    });

    it("lets explicit dimensions win over the layout and the theme", () => {
      const tokens = tokensFor({
        theme: "MINIMAL",
        layout: "COMPACT",
        dimensions: { width: 700, radius: 0 },
      });
      expect(tokens.box.width).toBe(700);
      expect(tokens.box.cardRadius).toBe(0);
      // Not mentioned, so the layout still decides.
      expect(tokens.box.padding).toBe(20);
      expect(tokens.box.sectionGap).toBe(16);
    });

    it("lets explicit typography win over the layout", () => {
      const tokens = tokensFor({ layout: "COMPACT", typography: { titleSize: 30, labelSize: 14 } });
      expect(tokens.font.title).toBe(30);
      expect(tokens.font.label).toBe(14);
      expect(tokens.font.body).toBe(12);
    });

    it("lets explicit colors win over the theme, one color at a time", () => {
      const tokens = tokensFor({ theme: "MIDNIGHT", colors: { primary: "#FF00AA" } });
      expect(tokens.palette).toEqual({ ...PALETTES.MIDNIGHT, primary: "#ff00aa" });
    });

    it("lets a custom background replace a transparent theme", () => {
      expect(
        tokensFor({ theme: "TRANSPARENT", colors: { background: "#112233" } }).palette.background,
      ).toBe("#112233");
    });

    it("lets a transparent background replace an opaque theme", () => {
      const { palette } = tokensFor({ theme: "DARK", colors: { background: "transparent" } });
      expect(palette.background).toBe(NO_PAINT);
      expect(palette.surface).toBe(PALETTES.DARK.surface);
    });

    it("normalizes color values", () => {
      expect(tokensFor({ colors: { text: "#ABC" } }).palette.text).toBe("#aabbcc");
    });
  });

  describe("derived values", () => {
    it("derives the other sizes from the three configured ones", () => {
      const { font } = tokensFor({ typography: { titleSize: 30, bodySize: 15, labelSize: 14 } });
      expect(font.small).toBe(13);
      expect(font.number).toBe(42);
      expect(font.brand).toBe(16);
    });

    it("makes titles and numbers one step bolder than names", () => {
      expect(tokensFor({ typography: { fontWeight: 400 } }).font).toMatchObject({
        emphasis: 400,
        strong: 500,
      });
      expect(tokensFor({ typography: { fontWeight: 500 } }).font).toMatchObject({
        emphasis: 500,
        strong: 600,
      });
      expect(tokensFor({ typography: { fontWeight: 700 } }).font).toMatchObject({
        emphasis: 700,
        strong: 800,
      });
    });

    it("derives tile gap and corner radii from spacing and radius", () => {
      const { box } = tokensFor({ dimensions: { spacing: 20, radius: 20 } });
      expect(box.tileGap).toBe(10);
      expect(box.tileRadius).toBe(16);
      expect(box.markRadius).toBe(4);
    });

    it("squares every corner when the radius is zero", () => {
      const { box } = tokensFor({ dimensions: { radius: 0 } });
      expect([box.cardRadius, box.tileRadius, box.barRadius, box.markRadius]).toEqual([0, 0, 0, 0]);
    });
  });

  describe("the empty part of a bar", () => {
    it("keeps the theme's own value when no surface color is changed", () => {
      expect(
        tokensFor({ theme: "LIGHT", colors: { primary: "#ff0000", text: "#000" } }).palette.track,
      ).toBe(PALETTES.LIGHT.track);
    });

    it("is derived between the surface and the border when either is changed", () => {
      const a = tokensFor({ colors: { surface: "#000000", border: "#ffffff" } }).palette.track;
      expect(a).toBe("#808080");
      const b = tokensFor({ colors: { background: "#000000" } }).palette;
      expect(b.track).not.toBe(PALETTES.DARK.track);
    });

    it("falls back to the background when the surface has no paint", () => {
      const { palette } = tokensFor({
        theme: "MINIMAL",
        colors: { background: "#000000", border: "#ffffff" },
      });
      expect(palette.track).toBe("#808080");
    });

    it("falls back to the border when nothing behind it has paint", () => {
      const { palette } = tokensFor({ theme: "TRANSPARENT", colors: { border: "#123456" } });
      expect(palette.track).toBe("#123456");
    });
  });

  describe("fonts", () => {
    it("uses only named system stacks, never a remote resource", () => {
      for (const fontFamily of ["SYSTEM", "SANS_SERIF", "SERIF", "MONOSPACE"]) {
        const { family } = tokensFor({ typography: { fontFamily } }).font;
        expect(family).not.toMatch(/url|http|@import|;/i);
        expect(family).toMatch(/(sans-serif|serif|monospace)$/);
      }
    });

    it("measures a monospace font by character count", () => {
      const mono = tokensFor({ typography: { fontFamily: "MONOSPACE" } });
      expect(measure(mono, "iiii", 12)).toBe(measure(mono, "wwww", 12));
      const proportional = tokensFor({});
      expect(measure(proportional, "iiii", 12)).toBeLessThan(measure(proportional, "wwww", 12));
    });

    it("fits text to the configured font", () => {
      const text = "The quick brown fox jumps over the lazy dog";
      expect(fit(tokensFor({}), text, 120, 12).length).toBeGreaterThan(
        fit(tokensFor({ typography: { fontFamily: "MONOSPACE" } }), text, 120, 12).length,
      );
    });
  });

  describe("dimensions that leave no room", () => {
    it("explains the problem", () => {
      const result = resolveDesignTokens({
        theme: "DARK",
        dimensions: { width: 360, padding: 48 },
      });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.errors[0]).toContain("Dimensions leave only 264px of content");
      expect(!result.ok && result.errors[0]).toContain("increase the width or reduce the padding");
    });

    it("accepts the narrowest valid combination", () => {
      const result = resolveDesignTokens({
        theme: "DARK",
        dimensions: { width: 360, padding: 40 },
      });
      expect(result.ok && result.value.box.contentWidth).toBe(MIN_CONTENT_WIDTH);
    });

    it("takes the layout's own padding into account", () => {
      const expanded = resolveDesignTokens({
        theme: "DARK",
        layout: "EXPANDED",
        dimensions: { width: 360 },
      });
      const compact = resolveDesignTokens({
        theme: "DARK",
        layout: "COMPACT",
        dimensions: { width: 360 },
      });
      // EXPANDED pads by 32 and COMPACT by 20, so the same width leaves different room.
      expect(expanded.ok && expanded.value.box.contentWidth).toBe(296);
      expect(compact.ok && compact.value.box.contentWidth).toBe(320);
    });
  });
});

describe("contrastWarnings", () => {
  it("stays quiet for every theme", () => {
    for (const theme of THEMES) {
      expect(contrastWarnings({ theme }), theme).toEqual([]);
    }
  });

  it("warns about text that is hard to read on the background", () => {
    const warnings = contrastWarnings({ theme: "DARK", colors: { text: "#10161d" } });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(
      /^Low contrast: text #10161d on background #0d1117 is 1\.\d:1 \(4\.5:1 is recommended\)\.$/,
    );
  });

  it("checks the surface of the tiles as well", () => {
    const warnings = contrastWarnings({ theme: "DARK", colors: { surface: "#c9d1d9" } });
    expect(warnings.some((warning) => warning.includes("on surface #c9d1d9"))).toBe(true);
  });

  it("asks for less contrast from accents than from text", () => {
    const warnings = contrastWarnings({ theme: "DARK", colors: { primary: "#222a33" } });
    expect(
      warnings.some((warning) => warning.includes("primary #222a33") && warning.includes("(3:1")),
    ).toBe(true);
  });

  it("does not judge a transparent background", () => {
    expect(
      contrastWarnings({
        theme: "DARK",
        colors: { background: "transparent", surface: "transparent", text: "#000000" },
      }),
    ).toEqual([]);
  });

  it("stays quiet when the settings cannot be resolved", () => {
    expect(contrastWarnings({ theme: "DARK", dimensions: { width: 360, padding: 48 } })).toEqual(
      [],
    );
  });
});
