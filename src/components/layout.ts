import { DevTraceError } from "../core/result.js";
import { element, text } from "../shared/svg.js";
import { fit, type DesignTokens } from "../templates/design-tokens.js";
import { place, round, type Builder, type Fragment } from "./fragment.js";
import { badge, type LabelData } from "./metrics.js";

// Layout is deterministic arithmetic: every item is given an integer width by
// `splitWidth`, builds itself for that width, and is placed in its own cell, so
// items can neither overlap nor run past the container.

/**
 * Splits `total` pixels into one integer width per weight, with `gap` pixels
 * between them. The widths and gaps always add up to `total` exactly.
 */
export function splitWidth(total: number, weights: readonly number[], gap: number): number[] {
  if (weights.length === 0) return [];
  const usable = Math.max(0, total - gap * (weights.length - 1));
  const weightSum = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (weightSum === 0) throw new DevTraceError("Column weights must not all be zero.");
  const widths = weights.map((weight) => Math.floor((usable * Math.max(0, weight)) / weightSum));
  let remainder = usable - widths.reduce((sum, width) => sum + width, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % widths.length) {
    if ((weights[index] ?? 0) <= 0) continue;
    widths[index] = (widths[index] ?? 0) + 1;
    remainder -= 1;
  }
  return widths;
}

function build(builder: Builder, width: number): Fragment {
  const fragment = builder(width);
  if (fragment.width > width) {
    throw new DevTraceError(
      `A component is ${String(fragment.width)}px wide but its cell is ${String(width)}px.`,
    );
  }
  return fragment;
}

export type VerticalAlign = "start" | "center" | "end";

export interface RowOptions {
  readonly gap: number;
  /** One weight per item; defaults to equal columns. */
  readonly weights?: readonly number[];
  readonly align?: VerticalAlign;
}

/** Items side by side. Items that can resize (panels) are stretched to the tallest one. */
export function row(options: RowOptions, builders: readonly Builder[]): Builder {
  return (width) => {
    const weights = options.weights ?? builders.map(() => 1);
    if (weights.length !== builders.length) {
      throw new DevTraceError("A row needs exactly one weight per item.");
    }
    const widths = splitWidth(width, weights, options.gap);
    const built = builders.map((builder, index) => build(builder, widths[index] ?? 0));
    const height = Math.max(0, ...built.map((item) => item.height));
    const align = options.align ?? "start";

    let x = 0;
    const parts = built.map((item, index) => {
      const finished = item.resize === undefined ? item : item.resize(height);
      const free = height - finished.height;
      const y = align === "center" ? free / 2 : align === "end" ? free : 0;
      const part = place(finished, x, y);
      x += (widths[index] ?? 0) + options.gap;
      return part;
    });
    return { body: parts.join(""), width, height };
  };
}

export interface GridOptions {
  readonly columns: number;
  readonly gap: number;
}

/** Items in reading order, `columns` per line; the last line may be shorter. */
export function grid(options: GridOptions, builders: readonly Builder[]): Builder {
  return (width) => {
    const columns = Math.max(1, Math.floor(options.columns));
    const lines: Builder[][] = [];
    for (let index = 0; index < builders.length; index += columns) {
      lines.push(builders.slice(index, index + columns));
    }
    // A short last line keeps the column width of the others. The smallest column
    // is used so that the widths never add up to more than the container.
    const weights = Array.from({ length: columns }, () => 1);
    const cellWidth = Math.min(...splitWidth(width, weights, options.gap));
    const rows = lines.map((line) =>
      row(
        { gap: options.gap },
        line,
      )(
        line.length === columns ? width : cellWidth * line.length + options.gap * (line.length - 1),
      ),
    );
    return stackFragments(rows, options.gap, width);
  };
}

export interface StackOptions {
  readonly gap: number;
}

function stackFragments(items: readonly Fragment[], gap: number, width: number): Fragment {
  let y = 0;
  const parts = items.map((item) => {
    const part = place(item, 0, y);
    y += item.height + gap;
    return part;
  });
  return { body: parts.join(""), width, height: items.length === 0 ? 0 : y - gap };
}

/** Items one above the other, each as wide as the stack. */
export function stack(options: StackOptions, builders: readonly Builder[]): Builder {
  return (width) =>
    stackFragments(
      builders.map((builder) => build(builder, width)),
      options.gap,
      width,
    );
}

export function divider(tokens: DesignTokens): Builder {
  return (width) => ({
    body: element("line", {
      x1: 0,
      y1: 0.5,
      x2: width,
      y2: 0.5,
      stroke: tokens.palette.border,
      "stroke-width": tokens.visual.strokeWidth,
    }),
    width,
    height: 1,
  });
}

export interface PanelOptions {
  readonly title?: string;
  /** Receives the inner width, after the padding is removed. */
  readonly content: Builder;
  /** Draw the frame. Without it the panel is a plain titled section. */
  readonly framed?: boolean;
  readonly minHeight?: number;
  /** A small badge on the right of the title, for where the data of the panel comes from. */
  readonly tag?: LabelData;
}

/** A titled container. As a section container it has no frame and no padding. */
export function panel(tokens: DesignTokens, options: PanelOptions): Builder {
  const { palette, font, box, visual } = tokens;
  const framed = options.framed ?? true;
  const padding = framed ? visual.panelPadding : 0;

  const render = (width: number, minHeight: number): Fragment => {
    const inner = Math.max(0, width - 2 * padding);
    const content = options.content(inner);
    const tag = options.tag === undefined ? undefined : badge(tokens, options.tag, inner / 2);
    const heading =
      options.title === undefined
        ? ""
        : text(
            fit(tokens, options.title.toUpperCase(), inner - (tag?.width ?? 0) - 8, font.small),
            {
              x: padding,
              y: padding + font.small,
              fill: palette.mutedText,
              size: font.small,
              weight: font.emphasis,
            },
          );
    const headingHeight = options.title === undefined ? 0 : visual.panelHeadingHeight;
    const height = Math.max(minHeight, 2 * padding + headingHeight + content.height);
    const frame = framed
      ? element("rect", {
          x: 0.5,
          y: 0.5,
          width: width - 1,
          height: height - 1,
          rx: box.tileRadius,
          fill: palette.surface,
          stroke: palette.border,
          "stroke-width": visual.strokeWidth,
        })
      : "";
    return {
      body:
        frame +
        heading +
        (tag === undefined ? "" : place(tag, width - padding - tag.width, padding - 4)) +
        place(content, padding, padding + headingHeight),
      width,
      height: round(height),
      resize: (taller) => render(width, taller),
    };
  };
  return (width) => render(width, options.minHeight ?? 0);
}

export interface PanelSlot {
  readonly build: Builder;
  /** 2 means the panel takes the whole row. */
  readonly span: 1 | 2;
}

/**
 * Packs panels into rows: two narrow panels share a row, a wide one takes a
 * row alone, and a narrow panel without a partner is widened to the full row,
 * so a missing panel never leaves an empty cell.
 */
export function packPanels(slots: readonly PanelSlot[], gap: number): Builder[] {
  const rows: Builder[] = [];
  let index = 0;
  while (index < slots.length) {
    const slot = slots[index];
    const next = slots[index + 1];
    if (slot === undefined) break;
    if (slot.span === 1 && next?.span === 1) {
      rows.push(row({ gap }, [slot.build, next.build]));
      index += 2;
    } else {
      rows.push(slot.build);
      index += 1;
    }
  }
  return rows;
}
