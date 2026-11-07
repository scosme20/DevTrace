import { displayFlags, type AppearanceSettings } from "../core/appearance.js";
import {
  caption,
  dashboardSection,
  grid,
  metricCard,
  packPanels,
  stack,
  type Builder,
  type MetricCardData,
  type PanelSlot,
} from "../components/index.js";
import { composeCard, renderEmptyState } from "./card.js";
import { requireDashboardTokens, type DesignTokens } from "./design-tokens.js";

// The frame every DevTrace dashboard shares: the card header and footer, an
// optional strip of metric cards, an optional one-line notice about the scope
// of the data, and a grid of panels. Each dashboard decides what its metrics
// and panels are; this decides how they are laid out, so the three dashboards
// cannot drift apart.

const MAX_METRIC_COLUMNS = 6;
const MIN_METRIC_WIDTH = 120;

export interface DashboardPanel {
  /** `undefined` means the panel has no data or is switched off: it is not drawn. */
  readonly build: Builder | undefined;
  /** 2 means the panel takes the whole row. */
  readonly span: 1 | 2;
}

export interface DashboardOptions {
  readonly title: string;
  /** What the image shows, for screen readers. */
  readonly description: string;
  readonly displayName: string;
  readonly generatorVersion: string;
  readonly settings: AppearanceSettings;
  readonly metrics: readonly MetricCardData[];
  /** One muted line under the metrics, for the scope of the data. */
  readonly notice?: string | undefined;
  readonly panels: readonly DashboardPanel[];
  /** Shown instead of the grid when there is nothing at all to draw. */
  readonly emptyMessage: string;
}

function metricsStrip(metrics: readonly MetricCardData[], tokens: DesignTokens): Builder {
  const fitsInOneLine = Math.floor(
    (tokens.box.contentWidth + tokens.visual.gap) / (MIN_METRIC_WIDTH + tokens.visual.gap),
  );
  const columns = Math.max(1, Math.min(metrics.length, MAX_METRIC_COLUMNS, fitsInOneLine));
  // With more tiles than columns, balance the lines instead of leaving one orphan.
  const balanced = Math.ceil(metrics.length / Math.ceil(metrics.length / columns));
  return grid(
    { columns: balanced, gap: tokens.visual.gap },
    metrics.map((metric) => metricCard(tokens, metric)),
  );
}

export function composeDashboard(options: DashboardOptions): string {
  const tokens = requireDashboardTokens(options.settings);
  const display = displayFlags(options.settings);

  const slots: PanelSlot[] = options.panels.flatMap((panel) =>
    panel.build === undefined ? [] : [{ build: panel.build, span: panel.span }],
  );
  const parts: Builder[] = [
    ...(display.summary && options.metrics.length > 0
      ? [metricsStrip(options.metrics, tokens)]
      : []),
    ...(options.notice === undefined || slots.length + options.metrics.length === 0
      ? []
      : [caption(tokens, options.notice)]),
    ...packPanels(slots, tokens.visual.gap),
  ];

  const sections =
    parts.length === 0
      ? [renderEmptyState(options.emptyMessage, tokens)]
      : [dashboardSection(stack({ gap: tokens.visual.gap }, parts), tokens)];

  return composeCard({
    title: options.title,
    description: options.description,
    displayName: options.displayName,
    generatorVersion: options.generatorVersion,
    tokens,
    // The metrics strip replaces the card's summary tiles.
    display: { ...display, summary: false },
    summary: [],
    sections,
  });
}
