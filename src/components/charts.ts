import { element, text } from "../shared/svg.js";
import { fit, measure, type DesignTokens, type Tone } from "../templates/design-tokens.js";
import { ratio, round, safeAmount, type Builder } from "./fragment.js";
import { emptyState, legend, segmentColor, type Segment } from "./metrics.js";

// Chart components. Scales are linear and start at zero, so bars are always
// comparable. Zero and negative values are drawn as nothing, never as a sliver.

export interface BarDatum {
  readonly label: string;
  readonly value: number;
  readonly tone?: Tone;
}

function barColor(tokens: DesignTokens, datum: BarDatum): string {
  return tokens.visual.tones[datum.tone ?? tokens.visual.barTone];
}

/** One row per bar: label, bar scaled to the largest value, and the value. */
export function horizontalBarChart(tokens: DesignTokens, data: readonly BarDatum[]): Builder {
  const { palette, font, layout, box } = tokens;
  return (width) => {
    if (data.length === 0) return emptyState(tokens, width);
    const max = Math.max(...data.map((datum) => safeAmount(datum.value)));
    const labelWidth = Math.round(width * 0.3);
    const valueWidth =
      Math.max(
        ...data.map((datum) =>
          measure(tokens, String(Math.round(safeAmount(datum.value))), font.label),
        ),
      ) + 8;
    const trackX = labelWidth + 8;
    const trackWidth = Math.max(0, width - trackX - valueWidth);

    const body = data
      .map((datum, index) => {
        const y = (index + 1) * layout.barRowHeight - 6;
        const fraction = ratio(datum.value, max);
        return (
          text(fit(tokens, datum.label, labelWidth, font.body), {
            x: 0,
            y,
            fill: palette.secondaryText,
            size: font.body,
          }) +
          element("rect", {
            x: trackX,
            y: y - layout.barHeight - 1,
            width: trackWidth,
            height: layout.barHeight,
            rx: box.barRadius,
            fill: palette.track,
          }) +
          (fraction === 0
            ? ""
            : element("rect", {
                x: trackX,
                y: y - layout.barHeight - 1,
                width: round(Math.max(layout.barHeight, fraction * trackWidth)),
                height: layout.barHeight,
                rx: box.barRadius,
                fill: barColor(tokens, datum),
              })) +
          text(String(Math.round(safeAmount(datum.value))), {
            x: width,
            y,
            fill: palette.mutedText,
            size: font.label,
            anchor: "end",
          })
        );
      })
      .join("");
    return { body, width, height: data.length * layout.barRowHeight };
  };
}

const MIN_COLUMN = 18;

/** Columns on a common baseline. Labels and values are dropped when a column is too narrow. */
export function verticalBarChart(
  tokens: DesignTokens,
  data: readonly BarDatum[],
  height: number,
): Builder {
  const { palette, font, box, visual } = tokens;
  return (width) => {
    if (data.length === 0) return emptyState(tokens, width);
    const max = Math.max(...data.map((datum) => safeAmount(datum.value)));
    const slot = width / data.length;
    const showLabels = slot >= MIN_COLUMN;
    const labelRow = showLabels ? font.small + 6 : 0;
    const valueRow = showLabels ? font.small + 4 : 0;
    const plotHeight = Math.max(1, height - labelRow - valueRow);
    const baseline = valueRow + plotHeight;
    const columnWidth = Math.max(2, slot - Math.min(8, slot / 3));

    const columns = data
      .map((datum, index) => {
        const fraction = ratio(datum.value, max);
        const barHeight = fraction === 0 ? 0 : Math.max(2, fraction * plotHeight);
        const x = index * slot + (slot - columnWidth) / 2;
        const center = index * slot + slot / 2;
        return (
          (barHeight === 0
            ? ""
            : element("rect", {
                x: round(x),
                y: round(baseline - barHeight),
                width: round(columnWidth),
                height: round(barHeight),
                rx: Math.min(box.barRadius, columnWidth / 2),
                fill: barColor(tokens, datum),
              })) +
          (showLabels
            ? text(String(Math.round(safeAmount(datum.value))), {
                x: round(center),
                y: round(baseline - barHeight - 4),
                fill: palette.mutedText,
                size: font.small,
                anchor: "middle",
              }) +
              text(fit(tokens, datum.label, slot - 2, font.small), {
                x: round(center),
                y: baseline + font.small + 2,
                fill: palette.mutedText,
                size: font.small,
                anchor: "middle",
              })
            : "")
        );
      })
      .join("");
    const axis = element("line", {
      x1: 0,
      y1: baseline + 0.5,
      x2: width,
      y2: baseline + 0.5,
      stroke: palette.border,
      "stroke-width": visual.strokeWidth,
    });
    return { body: axis + columns, width, height: baseline + labelRow };
  };
}

const MAX_DONUT = 120;
const MIN_DONUT = 56;

/** A ring split into slices, with the total in the middle and a legend beside or below it. */
export function donutChart(tokens: DesignTokens, slices: readonly Segment[]): Builder {
  const { palette, font, visual } = tokens;
  return (width) => {
    const positive = slices.filter((slice) => safeAmount(slice.value) > 0);
    const total = positive.reduce((sum, slice) => sum + slice.value, 0);
    const beside = width >= 280;
    const diameter = Math.min(
      MAX_DONUT,
      Math.max(MIN_DONUT, beside ? Math.round(width * 0.38) : width),
    );
    const stroke = Math.max(8, Math.round(diameter * 0.16));
    const radius = (diameter - stroke) / 2;
    const center = diameter / 2;
    const circumference = 2 * Math.PI * radius;

    let offset = 0;
    const arcs = positive.map((slice) => {
      const length = (slice.value / total) * circumference;
      const arc = element("circle", {
        cx: center,
        cy: center,
        r: round(radius),
        fill: "none",
        stroke: segmentColor(tokens, slice, slices.indexOf(slice)),
        "stroke-width": stroke,
        "stroke-dasharray": `${String(round(length))} ${String(round(circumference - length))}`,
        "stroke-dashoffset": round(-offset),
        transform: `rotate(-90 ${String(center)} ${String(center)})`,
      });
      offset += length;
      return arc;
    });
    const ring =
      element("circle", {
        cx: center,
        cy: center,
        r: round(radius),
        fill: "none",
        stroke: palette.track,
        "stroke-width": stroke,
      }) + arcs.join("");
    const totalLabel = text(String(Math.round(total)), {
      x: center,
      y: center + Math.round(font.number * 0.35),
      fill: palette.text,
      size: font.number,
      weight: font.strong,
      anchor: "middle",
    });

    const key = legend(
      tokens,
      slices.map((slice, index) => ({
        text: `${slice.label} ${String(Math.round(safeAmount(slice.value)))}`,
        color: segmentColor(tokens, slice, index),
      })),
      beside ? width - diameter - visual.gap : width,
    );
    const keyX = beside ? diameter + visual.gap : 0;
    const keyY = beside
      ? Math.max(0, Math.round((diameter - key.height) / 2))
      : diameter + visual.gap;
    const body =
      ring +
      totalLabel +
      element("g", { transform: `translate(${String(keyX)} ${String(keyY)})` }, key.body);
    const height = beside ? Math.max(diameter, key.height) : diameter + visual.gap + key.height;
    return { body, width, height };
  };
}

const MAX_CELL = 14;
const MIN_CELL = 3;
const HEAT_GAP = 2;

export interface HeatmapOptions {
  /** Cells per column; 7 for one column per week. */
  readonly rows?: number;
  /** Draw the "Less ... More" scale under the grid. */
  readonly legend?: boolean;
  /** One label per row, drawn on the left (empty strings skip a row). */
  readonly rowLabels?: readonly string[];
}

/**
 * Values in column-major order: the first `rows` values are the first column.
 * Each value maps to one of four intensity levels relative to the largest value;
 * zero is always the empty level. A `null` value means "no data" (for example a
 * day that has not happened yet): it is drawn as an outlined cell, never as zero.
 */
export function activityHeatmap(
  tokens: DesignTokens,
  values: readonly (number | null)[],
  options: HeatmapOptions = {},
): Builder {
  const { palette, font, visual } = tokens;
  const rows = Math.max(1, Math.floor(options.rows ?? 7));
  return (width) => {
    if (values.length === 0) return emptyState(tokens, width);
    const columns = Math.ceil(values.length / rows);
    const labels = options.rowLabels ?? [];
    const offset =
      labels.length === 0
        ? 0
        : Math.ceil(Math.max(...labels.map((label) => measure(tokens, label, font.small)))) + 6;
    const fitted = Math.floor((width - offset - (columns - 1) * HEAT_GAP) / columns);
    const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, fitted));
    const usedWidth = offset + columns * cell + (columns - 1) * HEAT_GAP;
    const max = Math.max(0, ...values.map((value) => (value === null ? 0 : safeAmount(value))));
    const levels = visual.heat.length - 1;

    // Cells of one intensity share a group that carries the fill, which keeps a
    // year of days small. The order follows the first appearance of each fill.
    const byFill = new Map<string, string[]>();
    const outlined: string[] = [];
    values.forEach((value, index) => {
      const x = offset + Math.floor(index / rows) * (cell + HEAT_GAP);
      const y = (index % rows) * (cell + HEAT_GAP);
      const rx = Math.min(2, cell / 4);
      if (value === null) {
        outlined.push(
          element("rect", { x: x + 0.5, y: y + 0.5, width: cell - 1, height: cell - 1, rx }),
        );
        return;
      }
      const amount = safeAmount(value);
      const level = amount === 0 ? 0 : Math.max(1, Math.ceil((amount / max) * levels));
      const fill = visual.heat[level] ?? palette.track;
      byFill.set(fill, [
        ...(byFill.get(fill) ?? []),
        element("rect", { x, y, width: cell, height: cell, rx }),
      ]);
    });
    const cells =
      [...byFill].map(([fill, rects]) => element("g", { fill }, rects.join(""))).join("") +
      (outlined.length === 0
        ? ""
        : element("g", { fill: "none", stroke: palette.border }, outlined.join("")));
    const labelText = labels
      .map((label, row) =>
        text(label, {
          x: 0,
          y: row * (cell + HEAT_GAP) + Math.round(cell / 2 + font.small * 0.35),
          fill: palette.mutedText,
          size: font.small,
        }),
      )
      .join("");
    const gridHeight = rows * cell + (rows - 1) * HEAT_GAP;
    if (options.legend !== true) {
      return { body: labelText + cells, width: Math.min(width, usedWidth), height: gridHeight };
    }
    const lessWidth = measure(tokens, "Less", font.small) + 6;
    const swatches = visual.heat
      .map((color, level) =>
        element("rect", {
          x: round(lessWidth + level * (cell + HEAT_GAP)),
          y: gridHeight + 8,
          width: cell,
          height: cell,
          rx: Math.min(2, cell / 4),
          fill: color,
        }),
      )
      .join("");
    const moreX = lessWidth + visual.heat.length * (cell + HEAT_GAP) + 4;
    const scale =
      text("Less", {
        x: 0,
        y: gridHeight + 8 + Math.max(cell, font.small + 4) - 3,
        fill: palette.mutedText,
        size: font.small,
      }) +
      swatches +
      text("More", {
        x: round(moreX),
        y: gridHeight + 8 + Math.max(cell, font.small + 4) - 3,
        fill: palette.mutedText,
        size: font.small,
      });
    return {
      body: labelText + cells + scale,
      width: Math.min(width, Math.max(usedWidth, moreX + measure(tokens, "More", font.small))),
      height: gridHeight + 8 + Math.max(cell, font.small + 4),
    };
  };
}

export interface TimelineEvent {
  readonly label: string;
  /** Shown on the right, already formatted (for example "2026-03"). */
  readonly date?: string;
  readonly tone?: Tone;
}

/** Events in the order given, joined by a vertical line. */
export function timeline(tokens: DesignTokens, events: readonly TimelineEvent[]): Builder {
  const { palette, font, layout, visual } = tokens;
  return (width) => {
    if (events.length === 0) return emptyState(tokens, width);
    const rowHeight = layout.rowHeight + 4;
    const rail = 4;
    const labelX = 18;
    const last = (events.length - 1) * rowHeight + rowHeight / 2;
    const line =
      events.length > 1
        ? element("line", {
            x1: rail,
            y1: rowHeight / 2,
            x2: rail,
            y2: last,
            stroke: palette.border,
            "stroke-width": visual.strokeWidth,
          })
        : "";
    const items = events
      .map((event, index) => {
        const middle = index * rowHeight + rowHeight / 2;
        const date =
          event.date === undefined
            ? ""
            : fit(tokens, event.date, Math.round(width * 0.3), font.small);
        const dateWidth = date === "" ? 0 : measure(tokens, date, font.small) + 12;
        return (
          element("circle", {
            cx: rail,
            cy: middle,
            r: rail,
            fill: visual.tones[event.tone ?? "primary"],
          }) +
          text(fit(tokens, event.label, width - labelX - dateWidth, font.body), {
            x: labelX,
            y: round(middle + font.body * 0.35),
            fill: palette.text,
            size: font.body,
          }) +
          (date === ""
            ? ""
            : text(date, {
                x: width,
                y: round(middle + font.small * 0.35),
                fill: palette.mutedText,
                size: font.small,
                anchor: "end",
              }))
        );
      })
      .join("");
    return { body: line + items, width, height: events.length * rowHeight };
  };
}
