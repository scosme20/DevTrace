import { displayFlags } from "../core/appearance.js";
import type { DataSource, LifecycleStage } from "../core/models.js";
import type {
  ProjectStatus,
  StartupProfile,
  StartupProject,
  StartupSettings,
} from "../core/models.js";
import {
  caption,
  compactMetric,
  dashboardSection,
  donutChart,
  entryList,
  grid,
  horizontalBarChart,
  metricCard,
  packPanels,
  panel,
  pipeline,
  stack,
  type BadgeSpec,
  type Builder,
  type EntryItem,
  type PanelSlot,
} from "../components/index.js";
import {
  IN_PROGRESS_STAGES,
  buildStartupDashboardModel,
  type MetricKey,
  type StartupDashboardModel,
} from "../indicators/startup/dashboard.js";
import type { StartupStats } from "../indicators/startup/stats.js";
import { composeCard, label, pluralize, renderEmptyState } from "./card.js";
import { requireDashboardTokens, type DesignTokens, type Tone } from "./design-tokens.js";
import { formatGitHubLine } from "./github.js";

// The Startup & SaaS Dashboard: a grid of independent panels built from the
// shared SVG components, in the same visual language as the AI dashboard. A
// panel with no data, or switched off, is not drawn and the rest are repacked.
//
// Lifecycle stage (where a project is in its life) and operational status
// (whether it is being worked on) are different questions and have separate
// panels. Nothing here is a business metric: the data has no revenue,
// customers or growth figures, so none is shown or inferred.

const TITLE = "Startup & SaaS Dashboard";
const MAX_METRIC_COLUMNS = 5;
const MIN_METRIC_WIDTH = 120;

export interface StartupDashboardOptions {
  readonly profile: StartupProfile;
  readonly settings: StartupSettings;
  readonly generatorVersion: string;
}

const METRIC_LABELS: Readonly<Record<MetricKey, string>> = {
  total: "Total Projects",
  active: "Active Projects",
  launched: "Launched Projects",
  inDevelopment: "In Development",
  paused: "Paused Projects",
};

const METRIC_TONES: Readonly<Record<MetricKey, Tone>> = {
  total: "primary",
  active: "success",
  launched: "primary",
  inDevelopment: "primary",
  paused: "muted",
};

const STATUS_TONES: Readonly<Record<ProjectStatus, Tone>> = {
  ACTIVE: "success",
  PAUSED: "warning",
  INACTIVE: "muted",
};

// How the data was obtained. An estimate is never drawn like an observation.
const SOURCE_TONES: Readonly<Record<DataSource, Tone>> = {
  OBSERVED: "success",
  DECLARED: "muted",
  ESTIMATED: "warning",
};

/** `label` would write "Mvp"; the acronym stays upper case. */
function stageLabel(stage: LifecycleStage): string {
  return stage === "MVP" ? "MVP" : label(stage);
}

function linkKinds(project: StartupProject, hasGitHubData: boolean): string {
  // Only the kind of link is shown, never the URL.
  return [
    project.repositoryUrl === undefined && !hasGitHubData ? undefined : "repo",
    project.websiteUrl === undefined ? undefined : "site",
  ]
    .filter((kind) => kind !== undefined)
    .join(" · ");
}

function metricsStrip(model: StartupDashboardModel, tokens: DesignTokens): Builder | undefined {
  if (model.metrics.length === 0) return undefined;
  const cards = model.metrics.map((metric): Builder =>
    metricCard(tokens, {
      label: METRIC_LABELS[metric.key],
      value: metric.value,
      tone: METRIC_TONES[metric.key],
    }),
  );
  const fitsInOneLine = Math.floor(
    (tokens.box.contentWidth + tokens.visual.gap) / (MIN_METRIC_WIDTH + tokens.visual.gap),
  );
  const columns = Math.max(1, Math.min(cards.length, MAX_METRIC_COLUMNS, fitsInOneLine));
  // With more tiles than columns, balance the lines instead of leaving one orphan.
  return grid(
    {
      columns: Math.ceil(cards.length / Math.ceil(cards.length / columns)),
      gap: tokens.visual.gap,
    },
    cards,
  );
}

function portfolioPanel(
  model: StartupDashboardModel,
  stats: StartupStats,
  settings: StartupSettings,
  showDescriptions: boolean,
  tokens: DesignTokens,
): Builder | undefined {
  const { portfolio } = model;
  if (portfolio === undefined) return undefined;
  const entries: EntryItem[] = portfolio.items.map((project) => {
    const repository = stats.github[project.id];
    const links = settings.showLinks ? linkKinds(project, repository !== undefined) : "";
    const detail = showDescriptions
      ? project.description
      : repository === undefined
        ? undefined
        : formatGitHubLine(repository);
    // The status is the dot and the word on the right; the stage is a badge.
    const badges: BadgeSpec[] = [
      { label: stageLabel(project.lifecycleStage), tone: "primary" },
      { label: label(project.dataSource), tone: SOURCE_TONES[project.dataSource] },
    ];
    return {
      title: project.name,
      tone: STATUS_TONES[project.status],
      trailing: label(project.status),
      subtitle: [project.category, links].filter((part) => part !== "").join(" · "),
      ...(detail === undefined ? {} : { detail }),
      badges,
    };
  });
  return panel(tokens, {
    title: "Project portfolio",
    content: entryList(tokens, entries, { hidden: portfolio.hidden }),
  });
}

function lifecyclePanel(model: StartupDashboardModel, tokens: DesignTokens): Builder | undefined {
  const { lifecycle } = model;
  if (lifecycle === undefined || lifecycle.length === 0) return undefined;
  return panel(tokens, {
    title: "Lifecycle stage",
    content: horizontalBarChart(
      tokens,
      lifecycle.map((entry) => ({ label: stageLabel(entry.stage), value: entry.count })),
    ),
  });
}

function statusPanel(model: StartupDashboardModel, tokens: DesignTokens): Builder | undefined {
  const { status } = model;
  if (status === undefined || status.length === 0) return undefined;
  return panel(tokens, {
    title: "Operational status",
    content: stack({ gap: tokens.visual.gap }, [
      donutChart(
        tokens,
        status.map((entry) => ({
          label: label(entry.status),
          value: entry.count,
          tone: STATUS_TONES[entry.status],
        })),
      ),
      // Shares of the public projects; the denominator is never zero here.
      ...status.map((entry) =>
        compactMetric(tokens, {
          label: `${label(entry.status)} share`,
          value: `${String(entry.percent)}%`,
        }),
      ),
    ]),
  });
}

function pipelinePanel(model: StartupDashboardModel, tokens: DesignTokens): Builder | undefined {
  const { pipeline: stages } = model;
  if (stages === undefined) return undefined;
  return panel(tokens, {
    title: "Development pipeline",
    content: stack({ gap: 10 }, [
      caption(tokens, "Projects per stage today · a snapshot, not a history"),
      pipeline(
        tokens,
        stages.map((entry) => ({
          label: stageLabel(entry.stage),
          count: entry.count,
          highlight: IN_PROGRESS_STAGES.includes(entry.stage),
        })),
      ),
    ]),
  });
}

function highlightEntries(projects: readonly StartupProject[]): EntryItem[] {
  return projects.map((project) => ({
    title: project.name,
    tone: STATUS_TONES[project.status],
    trailing: stageLabel(project.lifecycleStage),
    subtitle: `${project.category} · updated ${project.updatedAt.slice(0, 10)}`,
  }));
}

function highlightsPanel(model: StartupDashboardModel, tokens: DesignTokens): Builder | undefined {
  const { highlights } = model;
  if (highlights === undefined) return undefined;
  const groups: [string, readonly StartupProject[]][] = [
    ["Launched & growing", highlights.launched],
    ["MVP & development", highlights.inProgress],
  ];
  return panel(tokens, {
    title: "Project highlights",
    content: stack(
      { gap: tokens.visual.gap },
      groups
        .filter(([, projects]) => projects.length > 0)
        .map(([name, projects]) =>
          stack({ gap: 6 }, [caption(tokens, name), entryList(tokens, highlightEntries(projects))]),
        ),
    ),
  });
}

function githubPanel(model: StartupDashboardModel, tokens: DesignTokens): Builder | undefined {
  const { github } = model;
  if (github === undefined) return undefined;
  const entries: EntryItem[] = github.listed.map(({ project, repository }) => ({
    title: project.name,
    subtitle: [repository.fullName, repository.language]
      .filter((part) => part !== undefined)
      .join(" · "),
    detail: formatGitHubLine(repository),
    ...(repository.pushedAt === undefined
      ? {}
      : { trailing: `pushed ${repository.pushedAt.slice(0, 10)}` }),
    badges: [{ label: "Observed", tone: "success" as const }],
  }));
  return panel(tokens, {
    // Observed on GitHub. It says nothing about revenue, customers or success.
    title: "GitHub development insights",
    content: stack({ gap: tokens.visual.gap }, [
      stack({ gap: 2 }, [
        compactMetric(tokens, { label: "Linked public repositories", value: github.total }),
        compactMetric(tokens, { label: "With a published release", value: github.withRelease }),
        ...(github.lastPush === undefined
          ? []
          : [
              compactMetric(tokens, {
                label: "Last observed push",
                value: github.lastPush.slice(0, 10),
              }),
            ]),
      ]),
      entryList(tokens, entries, { hidden: github.hidden }),
    ]),
  });
}

export function renderStartupDashboard(
  stats: StartupStats,
  options: StartupDashboardOptions,
): string {
  const { profile, settings, generatorVersion } = options;
  const tokens = requireDashboardTokens(settings);
  const display = displayFlags(settings);
  const model = buildStartupDashboardModel(stats, settings);

  const candidates: { build: Builder | undefined; span: 1 | 2 }[] = [
    { build: portfolioPanel(model, stats, settings, display.descriptions, tokens), span: 2 },
    { build: lifecyclePanel(model, tokens), span: 1 },
    { build: statusPanel(model, tokens), span: 1 },
    { build: pipelinePanel(model, tokens), span: 2 },
    { build: highlightsPanel(model, tokens), span: 1 },
    { build: githubPanel(model, tokens), span: 1 },
  ];
  const slots: PanelSlot[] = candidates.flatMap((slot) =>
    slot.build === undefined ? [] : [{ build: slot.build, span: slot.span }],
  );

  const strip = display.summary ? metricsStrip(model, tokens) : undefined;
  const parts = [...(strip === undefined ? [] : [strip]), ...packPanels(slots, tokens.visual.gap)];

  const sections =
    stats.totalProjects === 0
      ? [renderEmptyState("No public projects configured.", tokens)]
      : parts.length === 0
        ? [renderEmptyState("Nothing to display.", tokens)]
        : [dashboardSection(stack({ gap: tokens.visual.gap }, parts), tokens)];

  return composeCard({
    title: TITLE,
    description: `${profile.displayName}: ${pluralize(stats.totalProjects, "public project")}, ${String(stats.activeProjects)} active, ${String(stats.launchedProjects)} launched.`,
    displayName: profile.displayName,
    generatorVersion,
    tokens,
    // The metrics strip replaces the card's summary tiles.
    display: { ...display, summary: false },
    summary: [],
    sections,
  });
}
