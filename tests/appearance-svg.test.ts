import { describe, expect, it } from "vitest";
import { LAYOUTS } from "../src/core/appearance.js";
import { THEMES } from "../src/core/models.js";
import { PALETTES } from "../src/templates/themes.js";
import {
  renderAiScenario,
  renderAiStress,
  renderStartupScenario,
  renderStartupStress,
  tokensFor,
} from "./appearance-fixtures.js";
import { layoutProblems, parseCard } from "./svg-geometry.js";

type Settings = Record<string, unknown>;

const INDICATORS = [
  {
    name: "startup",
    title: "Startup & SaaS Statistics",
    scenario: renderStartupScenario,
    stress: renderStartupStress,
    // Words that come from the data and must survive any appearance.
    data: ["Alpha", "Beta", "Gamma", "Delta"],
    summary: ["Total Projects", "Active Projects", "Launched Projects"],
    description: "A sample project.",
    hideLists: { showProjectList: false, showLifecycleDistribution: false },
  },
  {
    name: "AI engineering",
    title: "AI Engineering Statistics",
    scenario: renderAiScenario,
    stress: renderAiStress,
    data: ["Assistant", "Model One", "Prompting", "Doc Bot"],
    summary: ["AI Tools", "AI Models", "AI Skills", "AI Projects"],
    description: "Answers questions about documentation.",
    hideLists: {
      showTools: false,
      showModels: false,
      showSkills: false,
      showProjects: false,
      showActivity: false,
      showTokenUsage: false,
    },
  },
] as const;

const colorsIn = (svg: string): string[] =>
  [...svg.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map((match) => match[1] ?? "");

describe.each(INDICATORS)("$name card appearance", (indicator) => {
  const render = (settings: Settings = {}) => indicator.scenario(settings);
  const card = (svg: string, settings: Settings = {}) =>
    parseCard(svg, tokensFor(settings).metrics);

  describe("themes", () => {
    it.each(THEMES)("%s paints the card only with its own colors", (theme) => {
      const palette = PALETTES[theme];
      const allowed = new Set([...(Object.values(palette) as string[]), "none"]);
      for (const color of colorsIn(render({ theme }))) {
        expect(allowed.has(color), `${theme} used ${color}`).toBe(true);
      }
    });

    it.each(THEMES)("%s uses its background and primary text colors", (theme) => {
      const svg = render({ theme });
      const palette = PALETTES[theme];
      expect(svg).toContain(`fill="${palette.text}"`);
      expect(svg).toContain(
        `fill="${palette.background === "none" ? "none" : palette.background}"`,
      );
      expect(svg).toContain(`stroke="${palette.border}"`);
    });

    it("renders each theme differently", () => {
      const renders = new Set(THEMES.map((theme) => render({ theme })));
      expect(renders.size).toBe(THEMES.length);
    });

    it("has a really transparent background in TRANSPARENT", () => {
      const svg = render({ theme: "TRANSPARENT" });
      const frame = /<rect [^>]*\/>/.exec(svg)?.[0] ?? "";
      expect(frame).toContain('fill="none"');
      expect(frame).toContain("stroke=");
      // No shape is filled with a background or surface color anywhere.
      const filled = [...svg.matchAll(/<rect [^>]*fill="(#[0-9a-f]{6})"/g)].map(
        (match) => match[1],
      );
      expect(filled).not.toContain(PALETTES.DARK.background);
      expect(filled).not.toContain(PALETTES.LIGHT.background);
      expect(svg).not.toMatch(/fill="#fff(?:fff)?"/);
    });

    it("outlines the tiles instead of filling them in MINIMAL and TRANSPARENT", () => {
      for (const theme of ["MINIMAL", "TRANSPARENT"] as const) {
        const svg = render({ theme });
        const tiles = [
          ...svg.matchAll(/<rect [^>]*rx="\d+"[^>]*fill="none"[^>]*stroke="[^"]+"\/>/g),
        ];
        expect(tiles.length, theme).toBeGreaterThanOrEqual(3);
      }
    });

    it("rounds the corners differently in MINIMAL", () => {
      expect(render({ theme: "MINIMAL" })).toContain('rx="4"');
      expect(render({ theme: "DARK" })).toContain('rx="10"');
    });
  });

  describe("accessibility", () => {
    it.each(THEMES)("labels the %s image with a title and a description", (theme) => {
      const svg = render({ theme });
      expect(svg).toContain('role="img"');
      expect(svg).toContain('aria-labelledby="title desc"');
      expect(svg).toContain(`<title id="title">${indicator.title.replace("&", "&amp;")}</title>`);
      expect(svg).toMatch(/<desc id="desc">[^<]+<\/desc>/);
    });

    it("keeps the same title and description whatever the appearance", () => {
      const base = render();
      const meta = (svg: string) => [
        /<title[^>]*>.*?<\/title>/s.exec(svg)?.[0],
        /<desc[^>]*>.*?<\/desc>/s.exec(svg)?.[0],
      ];
      for (const settings of [
        { theme: "MIDNIGHT", layout: "COMPACT" },
        { showTitle: false, showSummary: false, showFooter: false },
        { typography: { fontFamily: "MONOSPACE" } },
      ]) {
        expect(meta(render(settings))).toEqual(meta(base));
      }
    });

    it("keeps the title even when the visible header is hidden", () => {
      const svg = render({ showTitle: false });
      expect(svg).toContain("<title");
      expect(svg).not.toContain(">DevTrace<");
    });
  });

  describe("layouts", () => {
    it.each([
      ["COMPACT", 480],
      ["DEFAULT", 560],
      ["EXPANDED", 640],
    ] as const)("%s is %i wide, with a coherent viewBox", (layout, width) => {
      const parsed = card(render({ layout }), { layout });
      expect(parsed.width).toBe(width);
      expect(parsed.viewBox).toBe(`0 0 ${String(width)} ${String(parsed.height)}`);
    });

    it("keeps the information whatever the layout", () => {
      for (const layout of LAYOUTS) {
        const svg = render({ layout });
        for (const word of [...indicator.data, ...indicator.summary]) {
          expect(svg, `${layout} lost ${word}`).toContain(`>${word}<`);
        }
      }
    });

    it("keeps the numbers the same whatever the layout", () => {
      const numbers = (svg: string) =>
        [...svg.matchAll(/font-size="\d+" font-weight="\d+">(\d+)<\/text>/g)].map((m) => m[1]);
      const reference = numbers(render({ layout: "DEFAULT" }));
      expect(reference.length).toBeGreaterThan(2);
      for (const layout of ["COMPACT", "EXPANDED"] as const) {
        expect(numbers(render({ layout }))).toEqual(reference);
      }
    });

    it("COMPACT puts the header and the summary on one line each", () => {
      const settings = { layout: "COMPACT" } as const;
      const tokens = tokensFor(settings);
      const compact = card(render(settings), settings);
      const stacked = card(render({ layout: "DEFAULT" }), { layout: "DEFAULT" });

      // No separate brand line: the title sits next to the logo.
      expect(compact.texts.some((text) => text.content === "DevTrace")).toBe(false);
      expect(stacked.texts.some((text) => text.content === "DevTrace")).toBe(true);

      // A summary number and its label share a baseline in COMPACT, and not in DEFAULT.
      const sameLine = (parsed: typeof compact, size: number) => {
        const number = parsed.texts.find(
          (text) => text.size === size && /^\d+$/.test(text.content),
        );
        const label = parsed.texts.find((text) => text.content === indicator.summary[0]);
        return number !== undefined && label !== undefined && Math.abs(number.y - label.y) < 1;
      };
      expect(sameLine(compact, tokens.font.number)).toBe(true);
      expect(sameLine(stacked, tokensFor({}).font.number)).toBe(false);
    });

    it("gets taller from COMPACT to DEFAULT to EXPANDED", () => {
      const [compact, standard, expanded] = LAYOUTS.map(
        (layout) => card(render({ layout }), { layout }).height,
      );
      expect(compact).toBeLessThan(standard ?? 0);
      expect(standard).toBeLessThan(expanded ?? 0);
    });

    it("wraps the summary tiles into rows when they would be too narrow", () => {
      const settings = { dimensions: { width: 360, padding: 40 } };
      const narrow = card(render(settings), settings);
      const numbers = narrow.texts.filter(
        (text) => /^\d+$/.test(text.content) && text.size === tokensFor(settings).font.number,
      );
      const rows = new Set(numbers.map((text) => Math.round(text.y)));
      // Four tiles wrap into a 2x2 grid; three cannot be split evenly, so they stack.
      expect(rows.size).toBe(indicator.summary.length === 4 ? 2 : 3);
    });
  });

  describe("dimensions", () => {
    it("sets the width and keeps width, height and viewBox consistent", () => {
      for (const width of [360, 480, 700, 960]) {
        const settings = { dimensions: { width, padding: 24 } };
        const parsed = card(render(settings), settings);
        expect(parsed.width).toBe(width);
        expect(parsed.viewBox).toBe(`0 0 ${String(width)} ${String(parsed.height)}`);
        expect(parsed.shapes.find((shape) => shape.kind === "frame")?.x1).toBe(width - 0.5);
        expect(parsed.shapes.find((shape) => shape.kind === "frame")?.y1).toBe(parsed.height - 0.5);
      }
    });

    it("moves the content with the padding", () => {
      const left = (padding: number) => {
        const settings = { dimensions: { padding } };
        return Math.min(...card(render(settings), settings).texts.map((text) => text.x0));
      };
      expect(left(40)).toBe(40);
      expect(left(16)).toBe(16);
    });

    it("sets the corner radius", () => {
      expect(render({ dimensions: { radius: 0 } })).toContain('rx="0"');
      expect(render({ dimensions: { radius: 20 } })).toContain('rx="20"');
    });

    it("sets the space between sections and so the height", () => {
      const height = (spacing: number) =>
        card(render({ dimensions: { spacing } }), { dimensions: { spacing } }).height;
      expect(height(40)).toBeGreaterThan(height(8));
    });

    it("computes the height from the content, never from a setting", () => {
      const parsed = card(render(), {});
      const bottom = Math.max(...parsed.sections.map((section) => section.bottom));
      expect(parsed.height).toBeGreaterThanOrEqual(bottom);
      expect(parsed.height - bottom).toBeLessThan(40);
    });

    it("fails with a clear message when the padding leaves no room", () => {
      expect(() => render({ dimensions: { width: 360, padding: 48 } })).toThrow(
        "Dimensions leave only 264px of content",
      );
    });
  });

  describe("typography", () => {
    it("sets the font stack of the whole image", () => {
      expect(render({ typography: { fontFamily: "MONOSPACE" } })).toContain(
        "&apos;SFMono-Regular&apos;",
      );
      expect(render({ typography: { fontFamily: "SERIF" } })).toContain("Georgia");
      expect(render({})).toContain("-apple-system");
    });

    it("sets the title, body and label sizes", () => {
      const settings = { typography: { titleSize: 30, bodySize: 16, labelSize: 14 } };
      const sizes = new Set(card(render(settings), settings).texts.map((text) => text.size));
      expect(sizes.has(30)).toBe(true);
      expect(sizes.has(16)).toBe(true);
      expect(sizes.has(14)).toBe(true);
      // The defaults are gone, and the type is not mixed.
      expect(sizes.has(20)).toBe(false);
      expect(sizes.has(12)).toBe(false);
      expect(sizes.has(28)).toBe(false);
    });

    it("sets the font weight of names, and one step more for the title", () => {
      const svg = render({ typography: { fontWeight: 400 } });
      expect(svg).toContain('font-weight="500"');
      expect(svg).not.toContain('font-weight="600"');
      expect(svg).not.toContain('font-weight="700"');
      expect(render({ typography: { fontWeight: 700 } })).toContain('font-weight="800"');
    });
  });

  describe("custom colors", () => {
    it("replaces only the colors given, over any theme", () => {
      for (const theme of THEMES) {
        const svg = render({ theme, colors: { primary: "#FF00AA" } });
        expect(svg, theme).toContain('fill="#ff00aa"');
        const shared = Object.entries(PALETTES[theme]).some(
          ([key, value]) => key !== "primary" && value === PALETTES[theme].primary,
        );
        if (!shared) expect(svg, theme).not.toContain(`fill="${PALETTES[theme].primary}"`);
        expect(svg, theme).toContain(`fill="${PALETTES[theme].text}"`);
      }
    });

    it("accepts every color of the palette at once", () => {
      const colors = {
        background: "#101820",
        surface: "#1b2733",
        border: "#334455",
        text: "#fafafa",
        secondaryText: "#dddddd",
        mutedText: "#bbbbbb",
        primary: "#ffcc00",
        success: "#00cc66",
        warning: "#ff9900",
        error: "#ff3355",
      };
      const allowed = new Set([...Object.values(colors), "none"]);
      const svg = render({ colors });
      for (const color of colorsIn(svg)) {
        // The empty part of a bar is derived from the surface and the border.
        expect(allowed.has(color) || /^#[0-9a-f]{6}$/.test(color), color).toBe(true);
      }
      expect(svg).toContain('fill="#101820"');
      expect(svg).toContain('fill="#ffcc00"');
    });

    it("can make an opaque theme transparent", () => {
      const frame = /<rect [^>]*\/>/.exec(
        render({ theme: "DARK", colors: { background: "transparent" } }),
      )?.[0];
      expect(frame).toContain('fill="none"');
    });

    it("never writes a color that is not a hexadecimal value or none", () => {
      const svg = render({ colors: { primary: "#abc", background: "transparent" } });
      for (const color of colorsIn(svg)) {
        expect(color).toMatch(/^(#[0-9a-f]{6}|none)$/);
      }
    });
  });

  describe("display options", () => {
    it("hides the header with showTitle", () => {
      const svg = render({ showTitle: false });
      expect(svg).not.toContain(">DevTrace<");
      const visible = [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((match) => match[1]);
      expect(visible).not.toContain(indicator.title.replace("&", "&amp;"));
      expect(visible).toContain(indicator.summary[0]);
    });

    it("hides the summary tiles with showSummary", () => {
      const svg = render({ showSummary: false });
      for (const name of indicator.summary) expect(svg).not.toContain(`>${name}<`);
      expect(svg).toContain(">DevTrace<");
    });

    it("hides the footer with showFooter", () => {
      expect(render({ showFooter: false })).not.toContain("Generated by DevTrace");
      expect(render({})).toContain("Generated by DevTrace");
    });

    it("shows descriptions only when asked", () => {
      expect(render({})).not.toContain(indicator.description);
      expect(render({ showDescriptions: true })).toContain(`>${indicator.description}<`);
    });

    it("shrinks the card when parts are hidden", () => {
      const full = card(render(), {}).height;
      const bare = card(
        render({ showTitle: false, showSummary: false, showFooter: false }),
        {},
      ).height;
      expect(bare).toBeLessThan(full);
    });

    it("still draws a valid card when everything is hidden", () => {
      const svg = render({
        showTitle: false,
        showSummary: false,
        showFooter: false,
        ...indicator.hideLists,
      });
      expect(svg).toMatch(/<\/svg>\n$/);
      expect(card(svg, {}).height).toBeGreaterThan(0);
      expect(svg).toMatch(
        /Nothing to display|No (public projects configured|AI engineering data to display)/,
      );
    });

    it("keeps working with the options that already existed", () => {
      expect(
        render(indicator.name === "startup" ? { showLinks: false } : { showLinks: false }),
      ).not.toContain(">repo<");
    });
  });

  describe("layout of the text", () => {
    const fonts = ["SYSTEM", "SERIF", "MONOSPACE"] as const;
    const sizes = [
      { dimensions: { width: 360, padding: 40 } },
      { dimensions: { width: 560 } },
      { dimensions: { width: 960 } },
    ] as const;

    it.each(LAYOUTS)(
      "keeps everything inside the card and apart, in %s, for every font and width",
      (layout) => {
        for (const fontFamily of fonts) {
          for (const size of sizes) {
            for (const content of [indicator.scenario, indicator.stress]) {
              const settings = {
                layout,
                typography: { fontFamily },
                showDescriptions: true,
                ...size,
              };
              const parsed = card(content(settings), settings);
              const padding =
                "padding" in size.dimensions
                  ? size.dimensions.padding
                  : tokensFor(settings).box.padding;
              expect(
                layoutProblems(parsed, padding),
                `${layout} ${fontFamily} ${JSON.stringify(size)}`,
              ).toEqual([]);
            }
          }
        }
      },
    );

    it("keeps long text inside the card at the largest type sizes", () => {
      const settings = {
        typography: { titleSize: 32, bodySize: 18, labelSize: 16, fontWeight: 700 },
        showDescriptions: true,
      };
      expect(layoutProblems(card(indicator.stress(settings), settings), 28)).toEqual([]);
    });

    it("keeps long text inside the card at the smallest type sizes and widest padding", () => {
      const settings = {
        typography: { titleSize: 14, bodySize: 10, labelSize: 9 },
        dimensions: { width: 360, padding: 40 },
        showDescriptions: true,
      };
      expect(layoutProblems(card(indicator.stress(settings), settings), 40)).toEqual([]);
    });

    it.each(THEMES)("keeps everything inside the card in the %s theme", (theme) => {
      const settings = { theme, showDescriptions: true };
      expect(layoutProblems(card(indicator.stress(settings), settings), 28)).toEqual([]);
    });

    it("shortens long text with an ellipsis instead of cutting it", () => {
      const svg = indicator.stress({});
      expect(svg).toContain("…");
      expect(svg).not.toMatch(/<text[^>]*>[^<]*\s…<\/text>/);
    });
  });

  describe("safety and determinism", () => {
    const matrix = THEMES.flatMap((theme) => LAYOUTS.map((layout) => ({ theme, layout })));

    it("contains no script, external resource or foreign content, in any theme and layout", () => {
      for (const settings of matrix) {
        const svg = render({ ...settings, showDescriptions: true });
        expect(svg).not.toMatch(
          /<script|javascript:|onload|onerror|href=|url\(|@import|<image|<foreignObject|<style/i,
        );
        // The only URL is the XML namespace.
        expect([...svg.matchAll(/https?:\/\/[^"\s<]+/g)].map((match) => match[0])).toEqual([
          "http://www.w3.org/2000/svg",
        ]);
      }
    });

    it("escapes the profile name and the data in every layout", () => {
      for (const layout of LAYOUTS) {
        const svg = indicator.stress({ layout });
        expect(svg).not.toMatch(/<(?!\/?(?:svg|title|desc|g|rect|circle|line|text)[ >/]|\?xml )/);
      }
    });

    it("renders the same input to exactly the same SVG", () => {
      for (const settings of matrix) {
        expect(render(settings)).toBe(render(settings));
        expect(indicator.stress(settings)).toBe(indicator.stress(settings));
      }
    });

    it("does not depend on the order of the keys in the settings", () => {
      const a = render({
        theme: "MIDNIGHT",
        layout: "COMPACT",
        dimensions: { width: 500, padding: 20 },
      });
      const b = render({
        dimensions: { padding: 20, width: 500 },
        layout: "COMPACT",
        theme: "MIDNIGHT",
      });
      expect(a).toBe(b);
    });

    it("writes only well-formed documents", () => {
      for (const settings of matrix) {
        const svg = render(settings);
        expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg ')).toBe(true);
        expect(svg.endsWith("</svg>\n")).toBe(true);
        expect(svg.match(/<g /g)?.length).toBe(svg.match(/<\/g>/g)?.length);
        expect(svg.match(/<text[ >]/g)?.length).toBe(svg.match(/<\/text>/g)?.length);
      }
    });
  });
});
