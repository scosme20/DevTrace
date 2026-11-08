import { describe, expect, it } from "vitest";
import {
  FONT_FAMILIES,
  FONT_WEIGHTS,
  LAYOUTS,
  applyAppearanceOverrides,
  displayFlags,
} from "../src/core/appearance.js";
import { validateAiEngineeringConfig } from "../src/core/ai-engineering-validation.js";
import { THEMES } from "../src/core/models.js";
import { validateStartupConfig } from "../src/core/validation.js";

// The same appearance settings are accepted by both indicators, so every rule
// is checked against each of them.
const INDICATORS = [
  {
    name: "startup",
    validate: (settings: unknown) => validateStartupConfig({ version: 1, projects: [], settings }),
  },
  {
    name: "AI engineering",
    validate: (settings: unknown) => validateAiEngineeringConfig({ version: 1, settings }),
  },
] as const;

describe.each(INDICATORS)("appearance settings of the $name configuration", ({ validate }) => {
  const errors = (settings: unknown): string => {
    const result = validate(settings);
    return result.ok ? "" : result.errors.join("\n");
  };
  const accepted = (settings: unknown) => validate(settings).ok;

  describe("themes", () => {
    it.each(THEMES)("accepts the %s theme", (theme) => {
      expect(accepted({ theme })).toBe(true);
    });

    it("rejects an unknown theme and lists the valid ones", () => {
      expect(errors({ theme: "NEON" })).toContain(
        "Invalid theme: NEON. Expected one of DARK, LIGHT, MIDNIGHT, MINIMAL, TRANSPARENT, TERMINAL.",
      );
    });

    it("is case sensitive in the file", () => {
      expect(errors({ theme: "dark" })).toContain("Invalid theme: dark.");
    });
  });

  describe("layouts", () => {
    it.each(LAYOUTS)("accepts the %s layout", (layout) => {
      expect(accepted({ layout })).toBe(true);
    });

    it("rejects an unknown layout", () => {
      expect(errors({ layout: "HUGE" })).toContain("Invalid layout: HUGE.");
    });
  });

  describe("custom colors", () => {
    it("accepts every color key with #RGB and #RRGGBB values", () => {
      expect(
        accepted({
          colors: {
            background: "#0D1117",
            surface: "#161b22",
            border: "#fff",
            text: "#F0F6FC",
            secondaryText: "#c9d1d9",
            mutedText: "#8b949e",
            primary: "#58a6ff",
            success: "#3fb950",
            warning: "#d29922",
            error: "#f85149",
          },
        }),
      ).toBe(true);
    });

    it('accepts "transparent" for the background and the surface only', () => {
      expect(accepted({ colors: { background: "transparent", surface: "transparent" } })).toBe(
        true,
      );
      expect(errors({ colors: { text: "transparent" } })).toContain("colors.text");
      expect(errors({ colors: { border: "transparent" } })).toContain("colors.border");
      expect(errors({ colors: { primary: "transparent" } })).toContain("colors.primary");
    });

    it.each([
      "red",
      "rgb(1,2,3)",
      "#12",
      "#12345",
      "#gggggg",
      "0d1117",
      "url(#evil)",
      'red" onload="alert(1)',
      "#fff; fill: red",
      "<script>",
      "",
    ])("rejects the invalid color %j", (value) => {
      expect(errors({ colors: { primary: value } })).toContain(
        "colors.primary: Invalid color: expected #RGB or #RRGGBB.",
      );
      expect(errors({ colors: { background: value } })).toContain(
        "colors.background: Invalid color",
      );
    });

    it("rejects values that are not strings", () => {
      expect(errors({ colors: { primary: 123 } })).toContain("colors.primary");
      expect(errors({ colors: { primary: null } })).toContain("colors.primary");
    });

    it("rejects unknown color names, including the internal track", () => {
      expect(errors({ colors: { track: "#000" } })).toContain("colors");
      expect(errors({ colors: { accent: "#000" } })).toContain("colors");
    });
  });

  describe("typography", () => {
    it.each(FONT_FAMILIES)("accepts the %s font family", (fontFamily) => {
      expect(accepted({ typography: { fontFamily } })).toBe(true);
    });

    it.each([
      "Comic Sans MS",
      "Arial, sans-serif",
      "url(https://fonts.example/x)",
      "system",
      "'Evil'; }",
    ])("rejects the font family %j: only the named safe stacks are allowed", (fontFamily) => {
      expect(errors({ typography: { fontFamily } })).toContain("Invalid font family");
    });

    it("accepts sizes at the limits and rejects sizes outside them", () => {
      expect(accepted({ typography: { titleSize: 14, bodySize: 10, labelSize: 9 } })).toBe(true);
      expect(accepted({ typography: { titleSize: 32, bodySize: 18, labelSize: 16 } })).toBe(true);
      expect(errors({ typography: { titleSize: 13 } })).toContain(
        "Invalid titleSize: must be at least 14.",
      );
      expect(errors({ typography: { titleSize: 33 } })).toContain(
        "Invalid titleSize: must be at most 32.",
      );
      expect(errors({ typography: { bodySize: 9 } })).toContain("bodySize: must be at least 10");
      expect(errors({ typography: { bodySize: 19 } })).toContain("bodySize: must be at most 18");
      expect(errors({ typography: { labelSize: 8 } })).toContain("labelSize: must be at least 9");
      expect(errors({ typography: { labelSize: 17 } })).toContain("labelSize: must be at most 16");
    });

    it("rejects sizes that are not whole numbers", () => {
      expect(errors({ typography: { titleSize: 20.5 } })).toContain("expected a whole number");
      expect(errors({ typography: { titleSize: "20" } })).toContain("expected a number");
    });

    it.each(FONT_WEIGHTS)("accepts the font weight %i", (fontWeight) => {
      expect(accepted({ typography: { fontWeight } })).toBe(true);
    });

    it.each([300, 800, 650, "600", "bold", null])("rejects the font weight %j", (fontWeight) => {
      expect(errors({ typography: { fontWeight } })).toContain("typography.fontWeight");
    });

    it("rejects unknown typography fields", () => {
      expect(errors({ typography: { lineHeight: 2 } })).toContain("typography");
    });
  });

  describe("dimensions", () => {
    it("accepts values at the limits", () => {
      expect(accepted({ dimensions: { width: 360, padding: 12, spacing: 8, radius: 0 } })).toBe(
        true,
      );
      expect(accepted({ dimensions: { width: 960, padding: 48, spacing: 48, radius: 24 } })).toBe(
        true,
      );
    });

    it.each([
      ["width", 359, "must be at least 360"],
      ["width", 961, "must be at most 960"],
      ["padding", 11, "must be at least 12"],
      ["padding", 49, "must be at most 48"],
      ["spacing", 7, "must be at least 8"],
      ["spacing", 49, "must be at most 48"],
      ["radius", -1, "must be at least 0"],
      ["radius", 25, "must be at most 24"],
    ])("rejects %s = %i", (field, value, message) => {
      expect(errors({ dimensions: { [field]: value } })).toContain(
        `dimensions.${field}: Invalid ${field}: ${message}`,
      );
    });

    it("rejects fractional and non-numeric values", () => {
      expect(errors({ dimensions: { width: 560.5 } })).toContain("expected a whole number");
      expect(errors({ dimensions: { width: "560" } })).toContain("expected a number");
    });

    it("does not accept a height: it is always computed from the content", () => {
      expect(errors({ dimensions: { height: 400 } })).toContain("dimensions");
    });
  });

  describe("display options", () => {
    it("accepts the four display switches", () => {
      expect(
        accepted({
          showTitle: false,
          showSummary: false,
          showDescriptions: true,
          showFooter: false,
        }),
      ).toBe(true);
    });

    it("rejects values that are not booleans", () => {
      for (const field of ["showTitle", "showSummary", "showDescriptions", "showFooter"]) {
        expect(errors({ [field]: "yes" })).toContain(`settings.${field}`);
      }
    });
  });

  it("rejects unknown settings instead of ignoring them", () => {
    expect(errors({ colour: "#fff" })).not.toBe("");
    expect(errors({ appearance: {} })).not.toBe("");
  });

  it("accepts a complete appearance configuration", () => {
    expect(
      accepted({
        theme: "MIDNIGHT",
        layout: "EXPANDED",
        colors: { primary: "#ff00aa", background: "transparent" },
        typography: {
          fontFamily: "SERIF",
          titleSize: 24,
          bodySize: 14,
          labelSize: 12,
          fontWeight: 500,
        },
        dimensions: { width: 700, padding: 24, spacing: 20, radius: 6 },
        showTitle: true,
        showSummary: true,
        showDescriptions: true,
        showFooter: false,
      }),
    ).toBe(true);
  });

  it("keeps the parsed appearance exactly as written", () => {
    const result = validate({ theme: "MINIMAL", layout: "COMPACT", dimensions: { width: 480 } });
    expect(result.ok && result.value.settings).toMatchObject({
      theme: "MINIMAL",
      layout: "COMPACT",
      dimensions: { width: 480 },
    });
  });
});

describe("compatibility with earlier configurations", () => {
  it("does not add appearance fields to a configuration that has none", () => {
    for (const { validate } of INDICATORS) {
      const result = validate({ theme: "LIGHT" });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      for (const key of [
        "layout",
        "colors",
        "typography",
        "dimensions",
        "showTitle",
        "showSummary",
        "showDescriptions",
        "showFooter",
      ]) {
        expect(key in result.value.settings).toBe(false);
      }
    }
  });

  it("still defaults the theme to DARK", () => {
    for (const { validate } of INDICATORS) {
      const result = validate({});
      expect(result.ok && result.value.settings.theme).toBe("DARK");
    }
  });
});

describe("displayFlags", () => {
  it("shows everything but descriptions by default", () => {
    expect(displayFlags({ theme: "DARK" })).toEqual({
      title: true,
      summary: true,
      descriptions: false,
      footer: true,
    });
  });

  it("follows the switches that are set", () => {
    expect(
      displayFlags({
        theme: "DARK",
        showTitle: false,
        showSummary: false,
        showDescriptions: true,
        showFooter: false,
      }),
    ).toEqual({ title: false, summary: false, descriptions: true, footer: false });
  });
});

describe("applyAppearanceOverrides", () => {
  const settings = { theme: "DARK", layout: "DEFAULT", showLinks: true } as const;

  it("lets the command line replace the theme and the layout", () => {
    expect(applyAppearanceOverrides(settings, { theme: "MINIMAL", layout: "COMPACT" })).toEqual({
      theme: "MINIMAL",
      layout: "COMPACT",
      showLinks: true,
    });
  });

  it("changes only what is given and does not modify the original", () => {
    expect(applyAppearanceOverrides(settings, { layout: "EXPANDED" })).toEqual({
      theme: "DARK",
      layout: "EXPANDED",
      showLinks: true,
    });
    expect(settings.layout).toBe("DEFAULT");
  });

  it("returns the same values when nothing is given", () => {
    expect(applyAppearanceOverrides(settings, {})).toEqual(settings);
  });
});
