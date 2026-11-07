// SVG has no text layout, so the width of a string is not known when the file is
// written. These helpers estimate it with per-character widths that lean wide,
// so text is shortened a little early instead of running into its neighbor or
// past the edge of the card.

export interface FontMetrics {
  /** Every character is the same width (monospace fonts). */
  readonly monospace: boolean;
  /** Corrects the proportional table for fonts that are wider or narrower. */
  readonly scale: number;
}

const NARROW = new Set(Array.from("iIl.,:;'|!"));
const MEDIUM_NARROW = new Set(Array.from("ftr()[]-/\\ "));
const WIDE = new Set(Array.from("mwMW@%"));
const MIDDLE_DOT = "·";
const ELLIPSIS = "…";

function emWidth(char: string): number {
  if (char === " ") return 0.28;
  if (char === MIDDLE_DOT) return 0.3;
  if (char === ELLIPSIS) return 1;
  if (NARROW.has(char)) return 0.28;
  if (MEDIUM_NARROW.has(char)) return 0.36;
  if (WIDE.has(char)) return 0.88;
  if (/[A-Z]/.test(char)) return 0.66;
  if (/[0-9]/.test(char)) return 0.56;
  // Non-ASCII text (for example CJK) can be a full em wide.
  if (char.charCodeAt(0) > 127) return 1;
  return 0.52;
}

export function estimateTextWidth(
  content: string,
  size: number,
  metrics: FontMetrics,
  bold = false,
): number {
  const chars = Array.from(content);
  const ems = metrics.monospace
    ? chars.length * 0.62
    : chars.reduce((total, char) => total + emWidth(char), 0) * metrics.scale;
  return ems * size * (bold ? 1.07 : 1);
}

/** Returns `content`, shortened with an ellipsis if it would not fit `maxWidth`. */
export function fitText(
  content: string,
  maxWidth: number,
  size: number,
  metrics: FontMetrics,
  bold = false,
): string {
  if (estimateTextWidth(content, size, metrics, bold) <= maxWidth) return content;
  const chars = Array.from(content);
  for (let length = chars.length - 1; length > 0; length -= 1) {
    const candidate = `${chars.slice(0, length).join("").trimEnd()}${ELLIPSIS}`;
    if (estimateTextWidth(candidate, size, metrics, bold) <= maxWidth) return candidate;
  }
  return estimateTextWidth(ELLIPSIS, size, metrics, bold) <= maxWidth ? ELLIPSIS : "";
}
