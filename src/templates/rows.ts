import { element, text } from "../shared/svg.js";
import { fit, measure, type DesignTokens } from "./design-tokens.js";

// Rows shared by every list in every card. Each piece of text is fitted to the
// space between its neighbors, so a long name is shortened instead of running
// over the next column or past the edge of the card.

/** A column of text. `col` is its left edge as a fraction of the content width. */
export interface Cell {
  readonly col: number;
  readonly text: string;
  readonly fill?: string;
}

export interface Row {
  readonly left: string;
  readonly cells?: readonly Cell[];
  /** Right-aligned text at the end of the row. */
  readonly right?: string;
  /** Draw `right` in the smaller type size. */
  readonly rightSmall?: boolean;
  readonly dotColor?: string;
  /** Muted lines under the row, one per entry. */
  readonly details?: readonly string[];
}

const DOT_OFFSET = 18;
const GAP_AFTER_LEFT = 12;
const GAP_BETWEEN_CELLS = 10;
const GAP_BEFORE_RIGHT = 12;
// How much of the row the right-aligned text may take.
const RIGHT_SHARE = 0.34;

export function columnX(tokens: DesignTokens, fraction: number): number {
  return Math.round(tokens.box.padding + fraction * tokens.box.contentWidth);
}

export function renderRows(
  rows: readonly Row[],
  startY: number,
  rowHeight: number,
  tokens: DesignTokens,
): { body: string; y: number } {
  const { palette, font, box, layout } = tokens;
  const rightEdge = box.width - box.padding;
  const parts: string[] = [];
  let y = startY;

  for (const row of rows) {
    const leftX = row.dotColor === undefined ? box.padding : box.padding + DOT_OFFSET;
    if (row.dotColor !== undefined) {
      parts.push(element("circle", { cx: box.padding + 4, cy: y - 4, r: 4, fill: row.dotColor }));
    }

    const rightSize = row.rightSmall === true ? font.small : font.label;
    const right =
      row.right === undefined
        ? undefined
        : fit(tokens, row.right, Math.round(box.contentWidth * RIGHT_SHARE), rightSize);
    const rightStart =
      right === undefined || right === ""
        ? rightEdge
        : rightEdge - measure(tokens, right, rightSize) - GAP_BEFORE_RIGHT;

    const cells = row.cells ?? [];
    const cellXs = cells.map((cell) => columnX(tokens, cell.col));
    const leftBudget = (cellXs[0] ?? rightStart) - leftX - GAP_AFTER_LEFT;
    const left = fit(tokens, row.left, leftBudget, font.body, true);
    if (left !== "") {
      parts.push(
        text(left, { x: leftX, y, fill: palette.text, size: font.body, weight: font.emphasis }),
      );
    }

    cells.forEach((cell, index) => {
      const x = cellXs[index] ?? 0;
      const budget = (cellXs[index + 1] ?? rightStart) - x - GAP_BETWEEN_CELLS;
      const shown = fit(tokens, cell.text, budget, font.label);
      if (shown !== "") {
        parts.push(
          text(shown, { x, y, fill: cell.fill ?? palette.secondaryText, size: font.label }),
        );
      }
    });

    if (right !== undefined && right !== "") {
      parts.push(
        text(right, { x: rightEdge, y, fill: palette.mutedText, size: rightSize, anchor: "end" }),
      );
    }

    const details = row.details ?? [];
    details.forEach((detail, index) => {
      const shown = fit(tokens, detail, rightEdge - leftX, font.small);
      if (shown !== "") {
        parts.push(
          text(shown, {
            x: leftX,
            y: y + layout.detailLineHeight * (index + 1),
            fill: palette.mutedText,
            size: font.small,
          }),
        );
      }
    });

    y += rowHeight + layout.detailLineHeight * details.length;
  }
  return { body: parts.join(""), y };
}
