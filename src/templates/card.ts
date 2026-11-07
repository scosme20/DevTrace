import type { DisplayFlags } from "../core/appearance.js";
import { element, svgDocument, text } from "../shared/svg.js";
import { fit, measure, type DesignTokens } from "./design-tokens.js";

// Layout shared by every DevTrace indicator card, so all indicators look like
// one product. Sections are drawn from y = 0 and stacked by `composeCard`, so
// each one can change height without touching the others. All distances, sizes
// and colors come from the design tokens.

export interface Section {
  readonly body: string;
  readonly height: number;
}

export interface SummaryTile {
  readonly value: number;
  readonly name: string;
}

export function label(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function pluralize(count: number, singular: string): string {
  return `${String(count)} ${count === 1 ? singular : `${singular}s`}`;
}

const HEADING_BASELINE = 10;
const TILE_PADDING = 16;
const INLINE_TILE_PADDING = 12;

export function sectionHeading(content: string, tokens: DesignTokens): string {
  const { palette, font, box } = tokens;
  return text(content.toUpperCase(), {
    x: box.padding,
    y: HEADING_BASELINE,
    fill: palette.mutedText,
    size: font.small,
    weight: font.emphasis,
  });
}

function renderHeader(title: string, displayName: string, tokens: DesignTokens): Section {
  const { palette, font, box, layout } = tokens;
  const rightEdge = box.width - box.padding;
  const mark = element("rect", {
    x: box.padding,
    y: 0,
    width: layout.markSize,
    height: layout.markSize,
    rx: box.markRadius,
    fill: palette.primary,
  });
  const markEnd = box.padding + layout.markSize + 10;

  if (layout.headerStyle === "inline") {
    // One line: the logo, the title and the profile label.
    const baseline = Math.round(layout.markSize / 2 + font.title * 0.35);
    const name = fit(tokens, displayName, Math.round(box.contentWidth * 0.3), font.label);
    const nameWidth = name === "" ? 0 : measure(tokens, name, font.label);
    const heading = fit(tokens, title, rightEdge - nameWidth - 16 - markEnd, font.title, true);
    const body =
      mark +
      text(heading, {
        x: markEnd,
        y: baseline,
        fill: palette.text,
        size: font.title,
        weight: font.strong,
      }) +
      (name === ""
        ? ""
        : text(name, {
            x: rightEdge,
            y: baseline,
            fill: palette.mutedText,
            size: font.label,
            anchor: "end",
          }));
    return { body, height: layout.headerHeight };
  }

  const brandBaseline = Math.round(layout.markSize * 0.78);
  const brandWidth = measure(tokens, "DevTrace", font.brand, true);
  const name = fit(
    tokens,
    displayName,
    box.contentWidth - layout.markSize - 10 - brandWidth - 16,
    font.label,
  );
  const body =
    mark +
    text("DevTrace", {
      x: markEnd,
      y: brandBaseline,
      fill: palette.text,
      size: font.brand,
      weight: font.emphasis,
    }) +
    (name === ""
      ? ""
      : text(name, {
          x: rightEdge,
          y: brandBaseline,
          fill: palette.mutedText,
          size: font.label,
          anchor: "end",
        })) +
    text(fit(tokens, title, box.contentWidth, font.title, true), {
      x: box.padding,
      y: layout.headerHeight - 8,
      fill: palette.text,
      size: font.title,
      weight: font.strong,
    });
  return { body, height: layout.headerHeight };
}

/** The largest number of columns that divides the tiles evenly and keeps each one wide enough. */
function tileColumns(count: number, tokens: DesignTokens): number {
  const { box, layout } = tokens;
  for (let columns = count; columns > 1; columns -= 1) {
    if (count % columns !== 0) continue;
    const width = (box.contentWidth - (columns - 1) * box.tileGap) / columns;
    if (width >= layout.minTileWidth) return columns;
  }
  return 1;
}

export function renderSummary(tiles: readonly SummaryTile[], tokens: DesignTokens): Section {
  const { palette, font, box, layout } = tokens;
  const columns = tileColumns(tiles.length, tokens);
  const rows = Math.ceil(tiles.length / columns);
  const tileWidth = (box.contentWidth - (columns - 1) * box.tileGap) / columns;

  const body = tiles
    .map((tile, index) => {
      const x = box.padding + (index % columns) * (tileWidth + box.tileGap);
      const y = Math.floor(index / columns) * (layout.tileHeight + box.tileGap);
      const frame = element("rect", {
        x,
        y: y + 0.5,
        width: tileWidth,
        height: layout.tileHeight - 1,
        rx: box.tileRadius,
        fill: palette.surface,
        stroke: palette.border,
      });
      const value = String(tile.value);

      if (layout.summaryStyle === "inline") {
        const baseline = Math.round(layout.tileHeight / 2 + font.number * 0.35);
        const numberWidth = measure(tokens, value, font.number, true);
        const labelX = x + INLINE_TILE_PADDING + numberWidth + 8;
        const name = fit(
          tokens,
          tile.name,
          x + tileWidth - INLINE_TILE_PADDING - labelX,
          font.label,
        );
        return (
          frame +
          text(value, {
            x: x + INLINE_TILE_PADDING,
            y: y + baseline,
            fill: palette.text,
            size: font.number,
            weight: font.strong,
          }) +
          (name === ""
            ? ""
            : text(name, { x: labelX, y: y + baseline, fill: palette.mutedText, size: font.label }))
        );
      }

      return (
        frame +
        text(value, {
          x: x + TILE_PADDING,
          y: y + Math.round(layout.tileHeight * 0.526),
          fill: palette.text,
          size: font.number,
          weight: font.strong,
        }) +
        text(fit(tokens, tile.name, tileWidth - 2 * TILE_PADDING, font.label), {
          x: x + TILE_PADDING,
          y: y + layout.tileHeight - 16,
          fill: palette.mutedText,
          size: font.label,
        })
      );
    })
    .join("");
  return { body, height: rows * layout.tileHeight + (rows - 1) * box.tileGap };
}

export function renderEmptyState(message: string, tokens: DesignTokens): Section {
  const { palette, font, layout, box } = tokens;
  return {
    body: text(fit(tokens, message, box.contentWidth, font.body), {
      x: box.padding,
      y: Math.round(layout.rowHeight * 0.58),
      fill: palette.mutedText,
      size: font.body,
    }),
    height: layout.rowHeight,
  };
}

function renderFooter(generatorVersion: string, tokens: DesignTokens): Section {
  const { palette, font, box, layout } = tokens;
  const body =
    element("line", {
      x1: box.padding,
      y1: 0.5,
      x2: box.width - box.padding,
      y2: 0.5,
      stroke: palette.border,
    }) +
    text(`Generated by DevTrace v${generatorVersion}`, {
      x: box.padding,
      y: layout.footerBaseline,
      fill: palette.mutedText,
      size: font.small,
    });
  return { body, height: layout.footerHeight };
}

export interface CardOptions {
  readonly title: string;
  readonly description: string;
  readonly displayName: string;
  readonly generatorVersion: string;
  readonly tokens: DesignTokens;
  readonly display: DisplayFlags;
  readonly summary: readonly SummaryTile[];
  /** Sections between the summary and the footer. */
  readonly sections: readonly Section[];
}

export function composeCard(options: CardOptions): string {
  const { tokens, display } = options;
  const { palette, box } = tokens;

  const all: Section[] = [
    ...(display.title ? [renderHeader(options.title, options.displayName, tokens)] : []),
    ...(display.summary ? [renderSummary(options.summary, tokens)] : []),
    ...options.sections,
    ...(display.footer ? [renderFooter(options.generatorVersion, tokens)] : []),
  ];
  // A card whose every part is switched off would have no height at all.
  if (all.length === 0) all.push(renderEmptyState("Nothing to display.", tokens));

  let y = box.padding;
  const stacked = all.map((section) => {
    const group = element("g", { transform: `translate(0 ${String(y)})` }, section.body);
    y += section.height + box.sectionGap;
    return group;
  });
  const height = y - box.sectionGap + box.padding;

  const frame = element("rect", {
    x: 0.5,
    y: 0.5,
    width: box.width - 1,
    height: height - 1,
    rx: box.cardRadius,
    fill: palette.background,
    stroke: palette.border,
  });

  return svgDocument(
    {
      width: box.width,
      height,
      fontFamily: tokens.font.family,
      title: options.title,
      description: options.description,
    },
    frame + stacked.join(""),
  );
}
