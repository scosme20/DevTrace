import { element, text } from "../shared/svg.js";
import { fit, type DesignTokens } from "../templates/design-tokens.js";
import { round, safeAmount, type Builder } from "./fragment.js";
import { emptyState } from "./metrics.js";

export interface PipelineStep {
  readonly label: string;
  readonly count: number;
  /** Draw the step with the accent color. */
  readonly highlight?: boolean;
}

const NODE_RADIUS = 13;

/**
 * Steps in a fixed order, joined by a line, each with its count. It shows how
 * many items are in each step right now: it is a snapshot, not a history.
 */
export function pipeline(tokens: DesignTokens, steps: readonly PipelineStep[]): Builder {
  const { palette, font, visual } = tokens;
  return (width) => {
    if (steps.length === 0) return emptyState(tokens, width);
    const slot = width / steps.length;
    const centerY = NODE_RADIUS + 1;
    const parts = steps.map((step, index) => {
      const cx = index * slot + slot / 2;
      const count = safeAmount(step.count);
      const active = step.highlight === true && count > 0;
      const connector =
        index === steps.length - 1
          ? ""
          : element("line", {
              x1: round(cx + NODE_RADIUS + 2),
              y1: centerY,
              x2: round(cx + slot - NODE_RADIUS - 2),
              y2: centerY,
              stroke: palette.border,
              "stroke-width": visual.strokeWidth,
            });
      const ringColor = active
        ? visual.tones.primary
        : count > 0
          ? palette.secondaryText
          : palette.border;
      return (
        connector +
        element("circle", {
          cx: round(cx),
          cy: centerY,
          r: NODE_RADIUS,
          fill: "none",
          stroke: ringColor,
          "stroke-width": active ? 2 : visual.strokeWidth,
        }) +
        text(String(Math.round(count)), {
          x: round(cx),
          y: centerY + Math.round(font.body * 0.35),
          fill: count > 0 ? palette.text : palette.mutedText,
          size: font.body,
          weight: font.emphasis,
          anchor: "middle",
        }) +
        text(fit(tokens, step.label, slot - 4, font.small), {
          x: round(cx),
          y: 2 * NODE_RADIUS + font.small + 8,
          fill: active ? visual.tones.primary : palette.mutedText,
          size: font.small,
          anchor: "middle",
        })
      );
    });
    return { body: parts.join(""), width, height: 2 * NODE_RADIUS + font.small + 12 };
  };
}
