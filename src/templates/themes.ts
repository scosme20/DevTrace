import type { ProjectStatus, Theme } from "../core/models.js";
import { NO_PAINT } from "../shared/color.js";

/**
 * Every color a card uses. `none` means "no paint": the element keeps its
 * outline but shows whatever is behind the image.
 */
export interface Palette {
  readonly background: string;
  /** Fill of the summary tiles. */
  readonly surface: string;
  readonly border: string;
  /** The empty part of a bar. Derived when the user changes the surface colors. */
  readonly track: string;
  /** Titles, names and numbers. */
  readonly text: string;
  readonly secondaryText: string;
  readonly mutedText: string;
  /** The accent color. */
  readonly primary: string;
  readonly success: string;
  readonly warning: string;
  readonly error: string;
}

export interface ThemeDefinition {
  readonly palette: Palette;
  /** Corner radius of the card. Tiles and marks derive from it. */
  readonly radius: number;
}

/**
 * Contrast of each text color on the theme background is at least 4.5:1 (WCAG
 * AA) for every theme but TRANSPARENT, which cannot know its background. A
 * tests keeps this true.
 */
export const THEME_DEFINITIONS: Readonly<Record<Theme, ThemeDefinition>> = {
  // GitHub's dark look. Unchanged since 0.2.0.
  DARK: {
    radius: 10,
    palette: {
      background: "#0d1117",
      surface: "#161b22",
      border: "#30363d",
      track: "#21262d",
      text: "#f0f6fc",
      secondaryText: "#c9d1d9",
      mutedText: "#8b949e",
      primary: "#58a6ff",
      success: "#3fb950",
      warning: "#d29922",
      error: "#f85149",
    },
  },
  // GitHub's light look. Unchanged since 0.2.0.
  LIGHT: {
    radius: 10,
    palette: {
      background: "#ffffff",
      surface: "#f6f8fa",
      border: "#d0d7de",
      track: "#eaeef2",
      text: "#1f2328",
      secondaryText: "#3d444d",
      mutedText: "#59636e",
      primary: "#0969da",
      success: "#1a7f37",
      warning: "#9a6700",
      error: "#cf222e",
    },
  },
  // A deep navy with a periwinkle accent, for readers who want more color than DARK.
  MIDNIGHT: {
    radius: 12,
    palette: {
      background: "#0b1020",
      surface: "#131a33",
      border: "#263057",
      track: "#1c2547",
      text: "#eef1ff",
      secondaryText: "#c3caea",
      mutedText: "#8d97c4",
      primary: "#8ea2ff",
      success: "#5ee0a0",
      warning: "#f2c35b",
      error: "#ff7a90",
    },
  },
  // Black on white, square corners and outlined tiles: no filled areas at all.
  MINIMAL: {
    radius: 4,
    palette: {
      background: "#ffffff",
      surface: NO_PAINT,
      border: "#d4d4d4",
      track: "#ececec",
      text: "#111111",
      secondaryText: "#404040",
      mutedText: "#6b6b6b",
      primary: "#111111",
      success: "#2e7d32",
      warning: "#8a6100",
      error: "#b42318",
    },
  },
  // No background at all. One color cannot be read at 4.5:1 on both a white and
  // a dark README, so the text is the mid gray with the best worst case: 4.35:1
  // on white and on GitHub's dark background. Accents are at least 3:1 on both.
  TRANSPARENT: {
    radius: 10,
    palette: {
      background: NO_PAINT,
      surface: NO_PAINT,
      border: "#8a8a8a",
      track: "#a3a3a3",
      text: "#797979",
      secondaryText: "#797979",
      mutedText: "#797979",
      primary: "#3b82f6",
      success: "#2ea043",
      warning: "#bf8700",
      error: "#e5534b",
    },
  },
};

export const PALETTES: Readonly<Record<Theme, Palette>> = {
  DARK: THEME_DEFINITIONS.DARK.palette,
  LIGHT: THEME_DEFINITIONS.LIGHT.palette,
  MIDNIGHT: THEME_DEFINITIONS.MIDNIGHT.palette,
  MINIMAL: THEME_DEFINITIONS.MINIMAL.palette,
  TRANSPARENT: THEME_DEFINITIONS.TRANSPARENT.palette,
};

export function statusColor(palette: Palette, status: ProjectStatus): string {
  const colors: Record<ProjectStatus, string> = {
    ACTIVE: palette.success,
    PAUSED: palette.warning,
    INACTIVE: palette.mutedText,
  };
  return colors[status];
}
