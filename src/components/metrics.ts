import { element, text } from "../shared/svg.js";
import { fit, measure, type DesignTokens, type Tone } from "../templates/design-tokens.js";
import { ratio, round, safeAmount, type Builder, type Fragment } from "./fragment.js";

// Metric components. They receive finished numbers and labels: counting,
// ranking and percentages are decided by the statistics code, never here.

const EMPTY_TEXT = "No data";

function emptyState(tokens: DesignTokens, width: number, message = EMPTY_TEXT): Fragment {
  const { palette, font, layout } = tokens;
  return {
    body: text(fit(tokens, message, width, font.body), {
      x: 0,
      y: Math.round(layout.rowHeight * 0.58),
      fill: palette.mutedText,
      size: font.body,
    }),
    width,
    height: layout.rowHeight,
  };
}

export { emptyState };

export interface MetricCardData {
  readonly label: string;
  readonly value: string | number;
  /** A short note on the right of the value, for example "last 30 days". */
  readonly caption?: string;
  readonly tone?: Tone;
}

/** A tile with a big value, a label and a thin accent on its left edge. */
export function metricCard(tokens: DesignTokens, data: MetricCardData): Builder {
  const { palette, font, box, layout, visual } = tokens;
  return (width) => {
    const inner = 16;
    const value = String(data.value);
    const frame = element("rect", {
      x: 0.5,
      y: 0.5,
      width: width - 1,
      height: layout.tileHeight - 1,
      rx: box.tileRadius,
      fill: palette.surface,
      stroke: palette.border,
      "stroke-width": visual.strokeWidth,
    });
    const accent = element("rect", {
      x: 0,
      y: Math.round(box.tileRadius / 2) + 4,
      width: 3,
      height: layout.tileHeight - 2 * (Math.round(box.tileRadius / 2) + 4),
      rx: 1.5,
      fill: visual.tones[data.tone ?? "primary"],
    });
    const valueWidth = measure(tokens, value, font.number, true);
    const caption =
      data.caption === undefined
        ? ""
        : text(
            fit(tokens, data.caption, Math.max(0, width - 2 * inner - valueWidth - 8), font.small),
            {
              x: width - inner,
              y: Math.round(layout.tileHeight * 0.526),
              fill: palette.mutedText,
              size: font.small,
              anchor: "end",
            },
          );
    const body =
      frame +
      accent +
      text(fit(tokens, value, width - 2 * inner, font.number, true), {
        x: inner,
        y: Math.round(layout.tileHeight * 0.526),
        fill: palette.text,
        size: font.number,
        weight: font.strong,
      }) +
      caption +
      text(fit(tokens, data.label, width - 2 * inner, font.label), {
        x: inner,
        y: layout.tileHeight - 16,
        fill: palette.mutedText,
        size: font.label,
      });
    return { body, width, height: layout.tileHeight };
  };
}

export interface CompactMetricData {
  readonly label: string;
  readonly value: string | number;
}

/** One line: the label on the left, the value on the right. */
export function compactMetric(tokens: DesignTokens, data: CompactMetricData): Builder {
  const { palette, font, layout } = tokens;
  return (width) => {
    const baseline = Math.round(layout.rowHeight * 0.7);
    const value = fit(tokens, String(data.value), Math.round(width * 0.4), font.body, true);
    const valueWidth = measure(tokens, value, font.body, true);
    const body =
      text(fit(tokens, data.label, Math.max(0, width - valueWidth - 12), font.label), {
        x: 0,
        y: baseline,
        fill: palette.secondaryText,
        size: font.label,
      }) +
      text(value, {
        x: width,
        y: baseline,
        fill: palette.text,
        size: font.body,
        weight: font.emphasis,
        anchor: "end",
      });
    return { body, width, height: layout.rowHeight };
  };
}

export interface ProgressBarData {
  readonly label: string;
  readonly value: number;
  /** The value that fills the bar completely. */
  readonly max: number;
  /** Text on the right. Defaults to the percentage, which makes this a percentage indicator. */
  readonly valueText?: string;
  readonly tone?: Tone;
}

export function percentText(value: number, max: number): string {
  return `${String(Math.round(ratio(value, max) * 100))}%`;
}

/** A labeled bar. A value of zero draws an empty track, never a sliver. */
export function progressBar(tokens: DesignTokens, data: ProgressBarData): Builder {
  const { palette, font, layout, box, visual } = tokens;
  return (width) => {
    const shown = fit(
      tokens,
      data.valueText ?? percentText(data.value, data.max),
      Math.round(width * 0.4),
      font.label,
    );
    const shownWidth = measure(tokens, shown, font.label);
    const barY = font.body + 6;
    const fraction = ratio(data.value, data.max);
    const fill =
      fraction === 0
        ? ""
        : element("rect", {
            x: 0,
            y: barY,
            width: round(Math.max(layout.barHeight, fraction * width)),
            height: layout.barHeight,
            rx: box.barRadius,
            fill: visual.tones[data.tone ?? "primary"],
          });
    const body =
      text(fit(tokens, data.label, Math.max(0, width - shownWidth - 12), font.body), {
        x: 0,
        y: font.body,
        fill: palette.secondaryText,
        size: font.body,
      }) +
      text(shown, {
        x: width,
        y: font.body,
        fill: palette.mutedText,
        size: font.label,
        anchor: "end",
      }) +
      element("rect", {
        x: 0,
        y: barY,
        width,
        height: layout.barHeight,
        rx: box.barRadius,
        fill: palette.track,
      }) +
      fill;
    return { body, width, height: barY + layout.barHeight + 2 };
  };
}

export interface Segment {
  readonly label: string;
  readonly value: number;
  readonly tone?: Tone;
}

const SEGMENT_GAP = 2;
const LEGEND_DOT = 4;

/** Color of the segment at `index`: its tone, or the next categorical series color. */
export function segmentColor(tokens: DesignTokens, segment: Segment, index: number): string {
  const { visual } = tokens;
  if (segment.tone !== undefined) return visual.tones[segment.tone];
  return visual.series[index % visual.series.length] ?? tokens.palette.primary;
}

/** Legend entries flow left to right and wrap into lines that fit the width. */
export function legend(
  tokens: DesignTokens,
  entries: readonly { readonly text: string; readonly color: string }[],
  width: number,
): Fragment {
  const { palette, font, layout } = tokens;
  const lineHeight = layout.detailLineHeight + 2;
  let x = 0;
  let line = 0;
  const parts: string[] = [];
  for (const entry of entries) {
    const label = fit(tokens, entry.text, width - 2 * LEGEND_DOT - 6, font.small);
    const entryWidth = 2 * LEGEND_DOT + 6 + measure(tokens, label, font.small) + 14;
    if (x > 0 && x + entryWidth - 14 > width) {
      x = 0;
      line += 1;
    }
    const baseline = line * lineHeight + font.small;
    parts.push(
      element("circle", {
        cx: x + LEGEND_DOT,
        cy: baseline - LEGEND_DOT,
        r: LEGEND_DOT,
        fill: entry.color,
      }),
      text(label, {
        x: x + 2 * LEGEND_DOT + 6,
        y: baseline,
        fill: palette.secondaryText,
        size: font.small,
      }),
    );
    x += entryWidth;
  }
  return {
    body: parts.join(""),
    width,
    height: entries.length === 0 ? 0 : (line + 1) * lineHeight,
  };
}

/** One bar split into segments, with a legend that shows every label and value. */
export function distributionBar(tokens: DesignTokens, segments: readonly Segment[]): Builder {
  const { palette, layout, box } = tokens;
  return (width) => {
    const positive = segments.filter((segment) => safeAmount(segment.value) > 0);
    const total = positive.reduce((sum, segment) => sum + segment.value, 0);
    if (total === 0) return emptyState(tokens, width);

    const barHeight = layout.barHeight + 2;
    const usable = width - SEGMENT_GAP * (positive.length - 1);
    let x = 0;
    const bars = positive.map((segment) => {
      const index = segments.indexOf(segment);
      const segmentWidth = (segment.value / total) * usable;
      const bar = element("rect", {
        x: round(x),
        y: 0,
        width: round(segmentWidth),
        height: barHeight,
        rx: Math.min(box.barRadius, segmentWidth / 2),
        fill: segmentColor(tokens, segment, index),
      });
      x += segmentWidth + SEGMENT_GAP;
      return bar;
    });
    const key = legend(
      tokens,
      segments.map((segment, index) => ({
        text: `${segment.label} ${String(Math.round(safeAmount(segment.value)))}`,
        color: segmentColor(tokens, segment, index),
      })),
      width,
    );
    const track = element("rect", {
      x: 0,
      y: 0,
      width,
      height: barHeight,
      rx: box.barRadius,
      fill: palette.track,
    });
    return {
      body:
        track +
        bars.join("") +
        element("g", { transform: `translate(0 ${String(barHeight + 8)})` }, key.body),
      width,
      height: barHeight + 8 + key.height,
    };
  };
}

export interface RankingItem {
  readonly label: string;
  readonly value: number;
  /** Text shown instead of the number, for example "12.4k tokens". */
  readonly valueText?: string;
}

export interface RankingOptions {
  /** Show at most this many items. */
  readonly limit?: number;
}

/** Items in the order given, each with its rank and a bar scaled to the largest value. */
export function rankingList(
  tokens: DesignTokens,
  items: readonly RankingItem[],
  options: RankingOptions = {},
): Builder {
  const { palette, font, layout, box } = tokens;
  return (width) => {
    const shown = items.slice(0, options.limit ?? items.length);
    if (shown.length === 0) return emptyState(tokens, width);
    const max = Math.max(...shown.map((item) => safeAmount(item.value)));
    const rowHeight = layout.rowHeight + layout.barHeight + 4;
    const rankWidth = measure(tokens, String(shown.length), font.label) + 10;

    const body = shown
      .map((item, index) => {
        const top = index * rowHeight;
        const baseline = top + Math.round(layout.rowHeight * 0.7);
        const valueText = fit(
          tokens,
          item.valueText ?? String(Math.round(safeAmount(item.value))),
          Math.round(width * 0.35),
          font.label,
        );
        const valueWidth = measure(tokens, valueText, font.label);
        const barY = top + layout.rowHeight;
        const fraction = ratio(item.value, max);
        return (
          text(String(index + 1), {
            x: 0,
            y: baseline,
            fill: palette.mutedText,
            size: font.label,
          }) +
          text(fit(tokens, item.label, width - rankWidth - valueWidth - 12, font.body, true), {
            x: rankWidth,
            y: baseline,
            fill: palette.text,
            size: font.body,
            weight: font.emphasis,
          }) +
          text(valueText, {
            x: width,
            y: baseline,
            fill: palette.mutedText,
            size: font.label,
            anchor: "end",
          }) +
          element("rect", {
            x: rankWidth,
            y: barY,
            width: width - rankWidth,
            height: layout.barHeight,
            rx: box.barRadius,
            fill: palette.track,
          }) +
          (fraction === 0
            ? ""
            : element("rect", {
                x: rankWidth,
                y: barY,
                width: round(Math.max(layout.barHeight, fraction * (width - rankWidth))),
                height: layout.barHeight,
                rx: box.barRadius,
                fill: segmentColor(tokens, { label: item.label, value: item.value }, 0),
              }))
        );
      })
      .join("");
    return { body, width, height: shown.length * rowHeight - 4 };
  };
}

export interface LabelData {
  readonly label: string;
  readonly tone?: Tone;
}

/** A dot and a label, for the state of something ("Active", "Paused"). */
export function statusIndicator(tokens: DesignTokens, data: LabelData): Fragment {
  const { palette, font, layout, visual } = tokens;
  const label = fit(tokens, data.label, 240, font.label);
  return {
    body:
      element("circle", {
        cx: 4,
        cy: Math.round(layout.rowHeight * 0.7) - 4,
        r: 4,
        fill: visual.tones[data.tone ?? "muted"],
      }) +
      text(label, {
        x: 16,
        y: Math.round(layout.rowHeight * 0.7),
        fill: palette.secondaryText,
        size: font.label,
      }),
    width: 16 + Math.ceil(measure(tokens, label, font.label)),
    height: layout.rowHeight,
  };
}

/** A small outlined pill with a label, for a category or a version. */
export function badge(tokens: DesignTokens, data: LabelData, maxWidth = 216): Fragment {
  const { font, visual } = tokens;
  const color = visual.tones[data.tone ?? "muted"];
  const label = fit(tokens, data.label, Math.max(0, maxWidth - 16), font.small);
  const width = Math.ceil(measure(tokens, label, font.small)) + 16;
  const height = font.small + 8;
  return {
    body:
      element("rect", {
        x: 0.5,
        y: 0.5,
        width: width - 1,
        height: height - 1,
        rx: height / 2,
        fill: "none",
        stroke: color,
        "stroke-width": visual.strokeWidth,
      }) + text(label, { x: 8, y: font.small + 2, fill: color, size: font.small }),
    width,
    height,
  };
}

/** A small muted line used to name a group of content inside a panel. */
export function caption(tokens: DesignTokens, content: string, tone: Tone = "muted"): Builder {
  const { font, visual } = tokens;
  return (width): Fragment => ({
    body: text(content.toUpperCase(), {
      x: 0,
      y: font.small,
      fill: visual.tones[tone],
      size: font.small,
      weight: font.emphasis,
    }),
    width,
    height: font.small + 4,
  });
}
