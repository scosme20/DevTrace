import { estimateTextWidth, type FontMetrics } from "../src/shared/text-fit.js";

// A small reader for the SVG that DevTrace writes, used to check that nothing
// is cut off, runs past the card or overlaps a neighbor.

export interface TextItem {
  readonly content: string;
  readonly x: number;
  /** Baseline, in card coordinates. */
  readonly y: number;
  readonly size: number;
  readonly anchor: string;
  readonly x0: number;
  readonly x1: number;
}

export interface Shape {
  readonly kind: string;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

export interface Card {
  readonly width: number;
  readonly height: number;
  readonly viewBox: string;
  readonly texts: readonly TextItem[];
  readonly shapes: readonly Shape[];
  /** Vertical extent of each stacked section. */
  readonly sections: readonly { readonly top: number; readonly bottom: number }[];
}

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    result[match[1] ?? ""] = match[2] ?? "";
  }
  return result;
}

function unescapeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

const num = (value: string | undefined): number => Number(value ?? "0");

export function parseCard(svg: string, metrics: FontMetrics): Card {
  const root = /<svg [^>]*width="(\d+)" height="(\d+)" viewBox="([^"]+)"/.exec(svg);
  if (root === null) throw new Error("Not a DevTrace SVG.");
  const texts: TextItem[] = [];
  const shapes: Shape[] = [];
  const sections: { top: number; bottom: number }[] = [];

  // The frame is the first rect, before any group.
  const frame = /<rect ([^>]*)\/>/.exec(svg.slice(0, svg.indexOf("<g ")));
  if (frame !== null) {
    const a = attributes(frame[1] ?? "");
    shapes.push({
      kind: "frame",
      x0: num(a["x"]),
      x1: num(a["x"]) + num(a["width"]),
      y0: num(a["y"]),
      y1: num(a["y"]) + num(a["height"]),
    });
  }

  for (const group of svg.matchAll(/<g transform="translate\(0 (-?[\d.]+)\)">(.*?)<\/g>/gs)) {
    const offset = num(group[1]);
    const body = group[2] ?? "";
    let top = Infinity;
    let bottom = -Infinity;
    const grow = (y0: number, y1: number) => {
      top = Math.min(top, y0);
      bottom = Math.max(bottom, y1);
    };

    for (const match of body.matchAll(/<text ([^>]*)>(.*?)<\/text>/gs)) {
      const a = attributes(match[1] ?? "");
      const content = unescapeXml(match[2] ?? "");
      const size = num(a["font-size"]);
      const bold = num(a["font-weight"]) >= 600;
      const width = estimateTextWidth(content, size, metrics, bold);
      const x = num(a["x"]);
      const anchor = a["text-anchor"] ?? "start";
      const x0 = anchor === "end" ? x - width : x;
      const y = offset + num(a["y"]);
      texts.push({ content, x, y, size, anchor, x0, x1: x0 + width });
      // Letters reach about 0.8 em above the baseline and 0.25 em below it.
      grow(y - size * 0.8, y + size * 0.25);
    }
    for (const match of body.matchAll(/<rect ([^>]*)\/>/g)) {
      const a = attributes(match[1] ?? "");
      const y0 = offset + num(a["y"]);
      shapes.push({
        kind: "rect",
        x0: num(a["x"]),
        x1: num(a["x"]) + num(a["width"]),
        y0,
        y1: y0 + num(a["height"]),
      });
      grow(y0, y0 + num(a["height"]));
    }
    for (const match of body.matchAll(/<circle ([^>]*)\/>/g)) {
      const a = attributes(match[1] ?? "");
      const cy = offset + num(a["cy"]);
      shapes.push({
        kind: "circle",
        x0: num(a["cx"]) - num(a["r"]),
        x1: num(a["cx"]) + num(a["r"]),
        y0: cy - num(a["r"]),
        y1: cy + num(a["r"]),
      });
      grow(cy - num(a["r"]), cy + num(a["r"]));
    }
    for (const match of body.matchAll(/<line ([^>]*)\/>/g)) {
      const a = attributes(match[1] ?? "");
      const y = offset + num(a["y1"]);
      shapes.push({ kind: "line", x0: num(a["x1"]), x1: num(a["x2"]), y0: y, y1: y });
      grow(y, y);
    }
    sections.push({ top, bottom });
  }

  return {
    width: num(root[1]),
    height: num(root[2]),
    viewBox: root[3] ?? "",
    texts,
    shapes,
    sections,
  };
}

/** Everything that would be wrong with the layout of a card, as readable messages. */
export function layoutProblems(card: Card, padding: number): string[] {
  const problems: string[] = [];
  const left = padding - 0.5;
  const right = card.width - padding + 0.5;

  for (const text of card.texts) {
    if (text.x0 < left)
      problems.push(
        `"${text.content}" starts at ${text.x0.toFixed(1)}, before the padding (${String(padding)}).`,
      );
    if (text.x1 > right)
      problems.push(
        `"${text.content}" ends at ${text.x1.toFixed(1)}, past the padding edge (${right.toFixed(1)}).`,
      );
  }
  for (const shape of card.shapes) {
    if (shape.kind === "frame") continue;
    if (shape.x0 < left || shape.x1 > right)
      problems.push(
        `A ${shape.kind} spans ${String(shape.x0)}-${String(shape.x1)}, outside ${String(left)}-${String(right)}.`,
      );
    if (shape.y0 < 0 || shape.y1 > card.height)
      problems.push(
        `A ${shape.kind} spans y ${String(shape.y0)}-${String(shape.y1)}, outside the card (${String(card.height)}).`,
      );
  }

  // Texts on the same line must not overlap horizontally.
  const lines = new Map<number, TextItem[]>();
  for (const text of card.texts)
    lines.set(Math.round(text.y), [...(lines.get(Math.round(text.y)) ?? []), text]);
  for (const items of lines.values()) {
    const ordered = [...items].sort((a, b) => a.x0 - b.x0);
    ordered.forEach((item, index) => {
      const next = ordered[index + 1];
      if (next !== undefined && item.x1 > next.x0 + 0.5) {
        problems.push(
          `"${item.content}" (to ${item.x1.toFixed(1)}) overlaps "${next.content}" (from ${next.x0.toFixed(1)}).`,
        );
      }
    });
  }

  // Sections must not run into each other, and the last one must end inside the card.
  card.sections.forEach((section, index) => {
    const next = card.sections[index + 1];
    if (next !== undefined && section.bottom > next.top + 0.5) {
      problems.push(
        `Section ${String(index)} ends at ${section.bottom.toFixed(1)} but the next starts at ${next.top.toFixed(1)}.`,
      );
    }
    if (section.top < 0 || section.bottom > card.height)
      problems.push(`Section ${String(index)} is outside the card.`);
  });
  return problems;
}
