import { type AppearanceSettings, type FontFamily, type Layout } from "../core/appearance.js";
import { DevTraceError, type Result } from "../core/result.js";
import { NO_PAINT, contrastRatio, mixColors, normalizeColor } from "../shared/color.js";
import { fitText, estimateTextWidth, type FontMetrics } from "../shared/text-fit.js";
import { THEME_DEFINITIONS, type Palette } from "./themes.js";

// Design tokens: every visual number and color a card uses, resolved once from
// the settings. Renderers read tokens and never contain a literal color, font
// size or distance, so a new look never needs a change to a renderer.
//
// Precedence, from lowest to highest:
//   1. the theme (colors, corner radius)
//   2. the layout (width, padding, spacing, type sizes, geometry)
//   3. explicit `colors`, `typography` and `dimensions` in the configuration
// A command line `--theme` or `--layout` replaces the setting before this runs.

export const MIN_CONTENT_WIDTH = 280;

const FONT_STACKS: Readonly<Record<FontFamily, string>> = {
  SYSTEM: "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  SANS_SERIF: "Helvetica, Arial, sans-serif",
  SERIF: "Georgia, 'Times New Roman', serif",
  MONOSPACE: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
};

const FONT_METRICS: Readonly<Record<FontFamily, FontMetrics>> = {
  SYSTEM: { monospace: false, scale: 1 },
  SANS_SERIF: { monospace: false, scale: 1 },
  SERIF: { monospace: false, scale: 1.06 },
  MONOSPACE: { monospace: true, scale: 1 },
};

export interface LayoutTokens {
  readonly name: Layout;
  /** `stacked`: brand line, then a large title. `inline`: logo and title on one line. */
  readonly headerStyle: "stacked" | "inline";
  /** `tiles`: number above its label. `inline`: number and label side by side. */
  readonly summaryStyle: "tiles" | "inline";
  readonly markSize: number;
  readonly headerHeight: number;
  readonly tileHeight: number;
  /** Narrowest a summary tile may get before the tiles wrap into rows. */
  readonly minTileWidth: number;
  /** Baseline of the first row of a list, measured from the top of its section. */
  readonly listStart: number;
  /** Space removed from the bottom of a list section. */
  readonly listTrim: number;
  readonly rowHeight: number;
  readonly projectRowHeight: number;
  readonly barRowHeight: number;
  readonly barHeight: number;
  readonly detailLineHeight: number;
  readonly footerHeight: number;
  readonly footerBaseline: number;
}

export interface FontTokens {
  readonly family: string;
  readonly title: number;
  readonly body: number;
  readonly label: number;
  /** Section headings, detail lines and the footer. */
  readonly small: number;
  /** The big numbers of the summary. */
  readonly number: number;
  readonly brand: number;
  /** Weight of names and headings. */
  readonly emphasis: number;
  /** Weight of the title and the big numbers. */
  readonly strong: number;
}

export interface BoxTokens {
  readonly width: number;
  readonly padding: number;
  readonly contentWidth: number;
  readonly sectionGap: number;
  readonly tileGap: number;
  readonly cardRadius: number;
  readonly tileRadius: number;
  readonly barRadius: number;
  readonly markRadius: number;
}

export interface DesignTokens {
  readonly palette: Palette;
  readonly font: FontTokens;
  readonly box: BoxTokens;
  readonly layout: LayoutTokens;
  readonly metrics: FontMetrics;
}

interface LayoutPreset {
  readonly width: number;
  readonly padding: number;
  readonly spacing: number;
  readonly title: number;
  readonly body: number;
  readonly label: number;
  readonly geometry: Omit<LayoutTokens, "name">;
}

// DEFAULT reproduces the geometry of every earlier version exactly.
const LAYOUT_PRESETS: Readonly<Record<Layout, LayoutPreset>> = {
  // Dense: one-line header and summary, tighter rows, smaller type.
  COMPACT: {
    width: 480,
    padding: 20,
    spacing: 16,
    title: 16,
    body: 12,
    label: 11,
    geometry: {
      headerStyle: "inline",
      summaryStyle: "inline",
      markSize: 16,
      headerHeight: 24,
      tileHeight: 44,
      minTileWidth: 116,
      listStart: 32,
      listTrim: 12,
      rowHeight: 20,
      projectRowHeight: 22,
      barRowHeight: 20,
      barHeight: 6,
      detailLineHeight: 14,
      footerHeight: 26,
      footerBaseline: 18,
    },
  },
  DEFAULT: {
    width: 560,
    padding: 28,
    spacing: 24,
    title: 20,
    body: 13,
    label: 12,
    geometry: {
      headerStyle: "stacked",
      summaryStyle: "tiles",
      markSize: 18,
      headerHeight: 56,
      tileHeight: 76,
      minTileWidth: 100,
      listStart: 38,
      listTrim: 14,
      rowHeight: 24,
      projectRowHeight: 28,
      barRowHeight: 24,
      barHeight: 8,
      detailLineHeight: 16,
      footerHeight: 32,
      footerBaseline: 24,
    },
  },
  // Roomy: larger type, taller tiles and more air between rows.
  EXPANDED: {
    width: 640,
    padding: 32,
    spacing: 32,
    title: 24,
    body: 14,
    label: 13,
    geometry: {
      headerStyle: "stacked",
      summaryStyle: "tiles",
      markSize: 20,
      headerHeight: 64,
      tileHeight: 92,
      minTileWidth: 120,
      listStart: 44,
      listTrim: 16,
      rowHeight: 28,
      projectRowHeight: 34,
      barRowHeight: 28,
      barHeight: 10,
      detailLineHeight: 18,
      footerHeight: 38,
      footerBaseline: 28,
    },
  },
};

type ColorOverrides = NonNullable<AppearanceSettings["colors"]>;

function resolvePalette(base: Palette, overrides: ColorOverrides): Palette {
  const pick = (override: string | undefined, fallback: string): string =>
    override === undefined ? fallback : normalizeColor(override);

  const background = pick(overrides.background, base.background);
  const surface = pick(overrides.surface, base.surface);
  const border = pick(overrides.border, base.border);

  // The track sits between the surface and the border. When the user changes
  // either of them (or the background), the theme's own track would no longer
  // match, so it is derived instead.
  const changesGround = [overrides.background, overrides.surface, overrides.border].some(
    (value) => value !== undefined,
  );
  const ground = [surface, background].find((color) => color !== NO_PAINT);
  const track = !changesGround
    ? base.track
    : ground === undefined
      ? border
      : mixColors(ground, border, 0.5);

  return {
    background,
    surface,
    border,
    track,
    text: pick(overrides.text, base.text),
    secondaryText: pick(overrides.secondaryText, base.secondaryText),
    mutedText: pick(overrides.mutedText, base.mutedText),
    primary: pick(overrides.primary, base.primary),
    success: pick(overrides.success, base.success),
    warning: pick(overrides.warning, base.warning),
    error: pick(overrides.error, base.error),
  };
}

/** Resolves the settings of a card into tokens, or explains why they cannot be used. */
export function resolveDesignTokens(settings: AppearanceSettings): Result<DesignTokens> {
  const theme = THEME_DEFINITIONS[settings.theme];
  const layoutName = settings.layout ?? "DEFAULT";
  const preset = LAYOUT_PRESETS[layoutName];
  const typography = settings.typography ?? {};
  const dimensions = settings.dimensions ?? {};

  const width = dimensions.width ?? preset.width;
  const padding = dimensions.padding ?? preset.padding;
  const contentWidth = width - 2 * padding;
  if (contentWidth < MIN_CONTENT_WIDTH) {
    return {
      ok: false,
      errors: [
        `Dimensions leave only ${String(contentWidth)}px of content (width ${String(width)} minus padding ${String(padding)} on each side). At least ${String(MIN_CONTENT_WIDTH)}px is needed: increase the width or reduce the padding.`,
      ],
    };
  }

  const spacing = dimensions.spacing ?? preset.spacing;
  const radius = dimensions.radius ?? theme.radius;
  const title = typography.titleSize ?? preset.title;
  const body = typography.bodySize ?? preset.body;
  const label = typography.labelSize ?? preset.label;
  const emphasis = typography.fontWeight ?? 600;
  const family = typography.fontFamily ?? "SYSTEM";

  return {
    ok: true,
    value: {
      palette: resolvePalette(theme.palette, settings.colors ?? {}),
      font: {
        family: FONT_STACKS[family],
        title,
        body,
        label,
        small: label - 1,
        number: Math.round(title * 1.4),
        brand: body + 1,
        emphasis,
        strong: emphasis >= 700 ? 800 : emphasis + 100,
      },
      box: {
        width,
        padding,
        contentWidth,
        sectionGap: spacing,
        tileGap: Math.round(spacing / 2),
        cardRadius: radius,
        tileRadius: Math.round(radius * 0.8),
        barRadius: radius === 0 ? 0 : Math.round(preset.geometry.barHeight / 2),
        markRadius: Math.min(4, radius),
      },
      layout: { name: layoutName, ...preset.geometry },
      metrics: FONT_METRICS[family],
    },
  };
}

/** Like `resolveDesignTokens`, for callers that have already validated the settings. */
export function requireDesignTokens(settings: AppearanceSettings): DesignTokens {
  const resolved = resolveDesignTokens(settings);
  if (!resolved.ok) {
    throw new DevTraceError(`Invalid appearance settings: ${resolved.errors.join(" ")}`);
  }
  return resolved.value;
}

/** Text width in pixels, as estimated for the configured font. */
export function measure(tokens: DesignTokens, content: string, size: number, bold = false): number {
  return estimateTextWidth(content, size, tokens.metrics, bold);
}

/** Shortens `content` so that it fits in `maxWidth` pixels. */
export function fit(
  tokens: DesignTokens,
  content: string,
  maxWidth: number,
  size: number,
  bold = false,
): string {
  return fitText(content, maxWidth, size, tokens.metrics, bold);
}

/**
 * Low-contrast color combinations, as messages. Only warns: the colors are
 * the user's choice. A transparent background cannot be checked.
 */
export function contrastWarnings(settings: AppearanceSettings): string[] {
  const resolved = resolveDesignTokens(settings);
  if (!resolved.ok) return [];
  const { palette } = resolved.value;
  const warnings: string[] = [];

  const grounds: [string, string][] = [
    ["background", palette.background],
    ["surface", palette.surface],
  ];
  const texts: [string, string, number][] = [
    ["text", palette.text, 4.5],
    ["secondaryText", palette.secondaryText, 4.5],
    ["mutedText", palette.mutedText, 4.5],
    ["primary", palette.primary, 3],
    ["success", palette.success, 3],
    ["warning", palette.warning, 3],
    ["error", palette.error, 3],
  ];
  for (const [groundName, ground] of grounds) {
    if (ground === NO_PAINT) continue;
    for (const [name, color, minimum] of texts) {
      const ratio = contrastRatio(color, ground);
      if (ratio < minimum) {
        warnings.push(
          `Low contrast: ${name} ${color} on ${groundName} ${ground} is ${ratio.toFixed(1)}:1 (${String(minimum)}:1 is recommended).`,
        );
      }
    }
  }
  return warnings;
}
