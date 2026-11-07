import { element, text } from "../shared/svg.js";
import { fit, measure, type DesignTokens, type Tone } from "../templates/design-tokens.js";
import { place, round, type Builder, type Fragment } from "./fragment.js";
import { badge, emptyState } from "./metrics.js";

// Lists of named things (tools, models, projects). One component serves them
// all: what an entry means is decided by the caller, never here.

const BADGE_GAP = 6;

export interface BadgeSpec {
  readonly label: string;
  readonly tone?: Tone;
}

const DOT_OFFSET = 14;

/**
 * Badges that flow left to right and wrap onto at most `maxLines` lines. When
 * they do not all fit, the last visible place shows "+N" for the hidden ones.
 */
export function badgeRow(
  tokens: DesignTokens,
  labels: readonly BadgeSpec[],
  options: { readonly maxLines?: number } = {},
): Builder {
  const maxLines = Math.max(1, options.maxLines ?? 1);
  return (width) => {
    const lineHeight = tokens.font.small + 8 + 4;
    const attempt = (keep: number): { body: string; lines: number } | undefined => {
      const items = labels.slice(0, keep).map((spec) => badge(tokens, spec, width));
      if (keep < labels.length) {
        items.push(badge(tokens, { label: `+${String(labels.length - keep)}` }, width));
      }
      let x = 0;
      let line = 0;
      const parts: string[] = [];
      for (const item of items) {
        if (x > 0 && x + item.width > width) {
          x = 0;
          line += 1;
        }
        if (line >= maxLines || item.width > width) return undefined;
        parts.push(place(item, x, line * lineHeight));
        x += item.width + BADGE_GAP;
      }
      return { body: parts.join(""), lines: line + 1 };
    };
    for (let keep = labels.length; keep >= 0; keep -= 1) {
      const laid = attempt(keep);
      if (laid !== undefined) {
        const height = labels.length === 0 ? 0 : laid.lines * lineHeight - 4;
        return { body: laid.body, width, height };
      }
    }
    return { body: "", width, height: 0 };
  };
}

export interface EntryItem {
  readonly title: string;
  /** A muted line under the title. */
  readonly subtitle?: string;
  /** A second, optional muted line (for example a description). */
  readonly detail?: string;
  /** A small badge row under the text. */
  readonly badges?: readonly BadgeSpec[];
  /** Text on the right of the title line. */
  readonly trailing?: string;
  /** A colored dot before the title, for a status. */
  readonly tone?: Tone;
}

export interface EntryListOptions {
  /** Entries that were left out by the caller; shown as "+N more". */
  readonly hidden?: number;
  readonly emptyMessage?: string;
}

/** Entries one under another, each with a title line, optional lines and badges. */
export function entryList(
  tokens: DesignTokens,
  items: readonly EntryItem[],
  options: EntryListOptions = {},
): Builder {
  const { palette, font, layout, visual } = tokens;
  const gap = Math.round(visual.gap * 0.75);
  return (width) => {
    if (items.length === 0) return emptyState(tokens, width, options.emptyMessage);
    let y = 0;
    const parts: string[] = [];

    items.forEach((item, index) => {
      if (index > 0) {
        parts.push(
          element("line", {
            x1: 0,
            y1: round(y - gap / 2) + 0.5,
            x2: width,
            y2: round(y - gap / 2) + 0.5,
            stroke: palette.border,
            "stroke-width": visual.strokeWidth,
          }),
        );
      }
      const offset = item.tone === undefined ? 0 : DOT_OFFSET;
      const baseline = y + Math.round(layout.rowHeight * 0.7);
      const trailing = fit(tokens, item.trailing ?? "", Math.round(width * 0.38), font.label);
      const trailingWidth = trailing === "" ? 0 : measure(tokens, trailing, font.label) + 12;

      if (item.tone !== undefined) {
        parts.push(
          element("circle", { cx: 4, cy: baseline - 4, r: 4, fill: visual.tones[item.tone] }),
        );
      }
      parts.push(
        text(fit(tokens, item.title, width - offset - trailingWidth, font.body, true), {
          x: offset,
          y: baseline,
          fill: palette.text,
          size: font.body,
          weight: font.emphasis,
        }),
        text(trailing, {
          x: width,
          y: baseline,
          fill: palette.mutedText,
          size: font.label,
          anchor: "end",
        }),
      );
      y += layout.rowHeight;

      for (const line of [item.subtitle, item.detail]) {
        if (line === undefined || line === "") continue;
        parts.push(
          text(fit(tokens, line, width - offset, font.small), {
            x: offset,
            y: y - 2 + layout.detailLineHeight - 4,
            fill: palette.mutedText,
            size: font.small,
          }),
        );
        y += layout.detailLineHeight;
      }
      if (item.badges !== undefined && item.badges.length > 0) {
        const row: Fragment = badgeRow(tokens, item.badges)(width - offset);
        parts.push(place(row, offset, y + 2));
        y += row.height + 4;
      }
      y += gap;
    });

    if ((options.hidden ?? 0) > 0) {
      parts.push(
        text(`+${String(options.hidden)} more`, {
          x: 0,
          y: y - gap + font.small + 2,
          fill: palette.mutedText,
          size: font.small,
        }),
      );
      return { body: parts.join(""), width, height: y - gap + font.small + 6 };
    }
    return { body: parts.join(""), width, height: y - gap };
  };
}
