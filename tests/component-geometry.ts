import { estimateTextWidth, type FontMetrics } from "../src/shared/text-fit.js";

// Reads the SVG written by the components into absolute boxes, so tests can
// check that nothing leaves its container. It also checks that every tag is
// closed, which makes it a structural validity check as well.

export interface Box {
  readonly kind: "rect" | "circle" | "text" | "line";
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly content?: string;
  readonly fill?: string;
}

const num = (value: string | undefined): number => Number(value ?? "0");

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    result[match[1] ?? ""] = match[2] ?? "";
  }
  return result;
}

export function unescapeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

const NO_BOUNDS_ARC = 0;

export function parseBoxes(svg: string, metrics: FontMetrics): Box[] {
  const boxes: Box[] = [];
  const offsets: [number, number][] = [[0, 0]];
  const open: string[] = [];
  const tag = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>|([^<]+)/g;
  let pendingText: { attrs: Record<string, string>; ox: number; oy: number } | undefined;

  for (const match of svg.matchAll(tag)) {
    if (match[5] !== undefined) {
      if (pendingText !== undefined) {
        const { attrs, ox, oy } = pendingText;
        const content = unescapeXml(match[5]);
        const size = num(attrs["font-size"]);
        const width = estimateTextWidth(content, size, metrics, num(attrs["font-weight"]) >= 600);
        const x = ox + num(attrs["x"]);
        const x0 =
          attrs["text-anchor"] === "end"
            ? x - width
            : attrs["text-anchor"] === "middle"
              ? x - width / 2
              : x;
        const y = oy + num(attrs["y"]);
        boxes.push({
          kind: "text",
          x0,
          x1: x0 + width,
          y0: y - size * 0.8,
          y1: y + size * 0.25,
          content,
        });
        pendingText = undefined;
      }
      continue;
    }
    const closing = match[1] === "/";
    const name = match[2] ?? "";
    const attrs = attributes(match[3] ?? "");
    const selfClosing = match[4] === "/";
    const [ox, oy] = offsets.at(-1) ?? [0, 0];

    if (closing) {
      const expected = open.pop();
      if (expected !== name)
        throw new Error(`Unbalanced SVG: </${name}> closes <${expected ?? "nothing"}>.`);
      if (name === "g") offsets.pop();
      continue;
    }
    if (!selfClosing) open.push(name);

    if (name === "g") {
      const shift = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(attrs["transform"] ?? "");
      offsets.push([ox + num(shift?.[1]), oy + num(shift?.[2])]);
      if (selfClosing) offsets.pop();
    } else if (name === "rect") {
      boxes.push({
        kind: "rect",
        x0: ox + num(attrs["x"]),
        x1: ox + num(attrs["x"]) + num(attrs["width"]),
        y0: oy + num(attrs["y"]),
        y1: oy + num(attrs["y"]) + num(attrs["height"]),
        ...(attrs["fill"] === undefined ? {} : { fill: attrs["fill"] }),
      });
    } else if (name === "circle") {
      const r = num(attrs["r"]);
      // A ring drawn with a stroke reaches half the stroke width beyond its radius.
      const reach = r + (attrs["fill"] === "none" ? num(attrs["stroke-width"]) / 2 : NO_BOUNDS_ARC);
      boxes.push({
        kind: "circle",
        x0: ox + num(attrs["cx"]) - reach,
        x1: ox + num(attrs["cx"]) + reach,
        y0: oy + num(attrs["cy"]) - reach,
        y1: oy + num(attrs["cy"]) + reach,
      });
    } else if (name === "line") {
      boxes.push({
        kind: "line",
        x0: ox + num(attrs["x1"]),
        x1: ox + num(attrs["x2"]),
        y0: oy + num(attrs["y1"]),
        y1: oy + num(attrs["y2"]),
      });
    } else if (name === "text") {
      pendingText = { attrs, ox, oy };
    }
  }
  if (open.length > 0) throw new Error(`Unclosed SVG elements: ${open.join(", ")}.`);
  return boxes;
}

/** Boxes that reach outside `[0, width] x [0, height]`, with a small tolerance for rounding. */
export function outOfBounds(boxes: readonly Box[], width: number, height: number): Box[] {
  const slack = 0.51;
  return boxes.filter(
    (box) =>
      box.x0 < -slack || box.y0 < -slack || box.x1 > width + slack || box.y1 > height + slack,
  );
}
