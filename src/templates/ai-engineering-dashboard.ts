import {
  PROFICIENCY_LEVELS,
  type AiEngineeringSettings,
  type Provenance,
  type TokenUsageMetric,
} from "../core/ai-engineering-models.js";
import { displayFlags } from "../core/appearance.js";
import type { ProjectStatus, StartupProfile } from "../core/models.js";
import {
  badgeRow,
  caption,
  distributionBar,
  entryList,
  grid,
  horizontalBarChart,
  panel,
  progressBar,
  stack,
  type BadgeSpec,
  type Builder,
  type EntryItem,
  type MetricCardData,
} from "../components/index.js";
import {
  buildAiDashboardModel,
  type AiDashboardModel,
  type DashboardMetric,
  type MetricKey,
} from "../indicators/ai-engineering/dashboard.js";
import type { AiEngineeringStats } from "../indicators/ai-engineering/stats.js";
import {
  ACTIVITY_LABELS,
  INVOLVEMENT_LABELS,
  PROFICIENCY_LABELS,
  SKILL_CATEGORY_LABELS,
  TECHNIQUE_LABELS,
  TOKEN_KIND_LABELS,
  TOOL_CATEGORY_LABELS,
  USAGE_TYPE_LABELS,
} from "./ai-engineering-labels.js";
import { composeDashboard } from "./dashboard.js";
import { label, pluralize } from "./card.js";
import { requireDashboardTokens, type DesignTokens, type Tone } from "./design-tokens.js";
import { formatGitHubLine } from "./github.js";

// The AI Engineering Dashboard: a grid of independent panels built from the
// shared SVG components. A panel whose data is missing or switched off is not
// drawn, and the remaining panels are packed so no gap is left behind.

const TITLE = "AI Engineering Dashboard";
const MIN_TWO_COLUMN_SKILLS = 520;

export interface AiEngineeringDashboardOptions {
  readonly profile: StartupProfile;
  readonly settings: AiEngineeringSettings;
  readonly generatorVersion: string;
}

const METRIC_LABELS: Readonly<Record<MetricKey, string>> = {
  tools: "AI Tools",
  providers: "Providers",
  models: "AI Models",
  skills: "AI Skills",
  projects: "AI Projects",
  activities: "AI Activities",
};

// The headline numbers are the things the owner built or chose; providers and
// activity records are context, so they are drawn in a quieter tone.
const METRIC_TONES: Readonly<Record<MetricKey, Tone>> = {
  tools: "primary",
  providers: "muted",
  models: "primary",
  skills: "success",
  projects: "primary",
  activities: "muted",
};

// How the data was obtained. An estimate is never drawn like an observation.
const PROVENANCE_TONES: Readonly<Record<Provenance, Tone>> = {
  OBSERVED: "success",
  DECLARED: "muted",
  ESTIMATED: "warning",
};

const STATUS_TONES: Readonly<Record<ProjectStatus, Tone>> = {
  ACTIVE: "success",
  PAUSED: "warning",
  INACTIVE: "muted",
};

// The three kinds of involvement stay visually distinct.
const INVOLVEMENT_TONES = {
  AI_ASSISTED: "primary",
  AI_GENERATED: "warning",
  AI_RELATED_ENGINEERING: "success",
} as const satisfies Record<string, Tone>;

function provenanceBadge(provenance: Provenance): BadgeSpec {
  return { label: label(provenance), tone: PROVENANCE_TONES[provenance] };
}

function formatMetricValue(metric: TokenUsageMetric): string {
  if (metric.kind === "ESTIMATED_COST") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: metric.unit }).format(
      metric.value,
    );
  }
  return `${new Intl.NumberFormat("en-US").format(metric.value)} tokens`;
}

function metricCards(metrics: readonly DashboardMetric[]): MetricCardData[] {
  return metrics.map((metric) => ({
    label: METRIC_LABELS[metric.key],
    value: metric.value,
    tone: METRIC_TONES[metric.key],
  }));
}

function providersBlock(model: AiDashboardModel, tokens: DesignTokens): Builder {
  return stack({ gap: 6 }, [
    caption(tokens, "Providers"),
    badgeRow(
      tokens,
      model.providers.map((name) => ({ label: name })),
      { maxLines: 2 },
    ),
  ]);
}

function toolsPanel(model: AiDashboardModel, tokens: DesignTokens): Builder | undefined {
  const { tools } = model;
  if (tools === undefined) return undefined;
  const entries: EntryItem[] = tools.items.map((tool) => ({
    title: tool.name,
    // The provider is the company, the tool is the product: they are shown apart.
    subtitle: `${tool.provider} · ${TOOL_CATEGORY_LABELS[tool.category]}`,
    badges: [
      ...(tool.experienceLevel === undefined
        ? []
        : [{ label: PROFICIENCY_LABELS[tool.experienceLevel], tone: "primary" as const }]),
      provenanceBadge(tool.provenance),
    ],
    ...(tool.usageType === undefined ? {} : { trailing: USAGE_TYPE_LABELS[tool.usageType] }),
  }));
  return panel(tokens, {
    title: "AI tools & providers",
    content: stack({ gap: tokens.visual.gap }, [
      ...(tools.byCategory.length > 1
        ? [
            stack({ gap: 6 }, [
              caption(tokens, "Tools by category"),
              distributionBar(
                tokens,
                tools.byCategory.map((entry) => ({
                  label: TOOL_CATEGORY_LABELS[entry.key],
                  value: entry.count,
                })),
              ),
            ]),
          ]
        : []),
      ...(model.providers.length > 0 ? [providersBlock(model, tokens)] : []),
      entryList(tokens, entries, { hidden: tools.hidden }),
    ]),
  });
}

function modelsPanel(
  model: AiDashboardModel,
  tokens: DesignTokens,
  showProviders: boolean,
): Builder | undefined {
  const { models } = model;
  if (models === undefined) return undefined;
  const entries: EntryItem[] = models.items.map((item) => ({
    title: item.name,
    subtitle: `${item.provider} · ${item.modelFamily}`,
    badges: [provenanceBadge(item.provenance)],
    ...(item.usageContext === undefined ? {} : { trailing: item.usageContext }),
  }));
  return panel(tokens, {
    title: "AI foundation models",
    content: stack({ gap: tokens.visual.gap }, [
      ...(showProviders && model.providers.length > 0 ? [providersBlock(model, tokens)] : []),
      entryList(tokens, entries, { hidden: models.hidden }),
    ]),
  });
}

function skillsPanel(model: AiDashboardModel, tokens: DesignTokens): Builder | undefined {
  const { skills } = model;
  if (skills === undefined) return undefined;
  const levels = PROFICIENCY_LEVELS.length;
  const groups = skills.groups.map((group): Builder =>
    stack({ gap: 8 }, [
      caption(tokens, SKILL_CATEGORY_LABELS[group.category], "primary"),
      ...group.skills.map((skill) =>
        // The bar shows a self-declared level on a five-step scale, not a measurement.
        progressBar(tokens, {
          label: skill.name,
          value: PROFICIENCY_LEVELS.indexOf(skill.proficiencyLevel) + 1,
          max: levels,
          valueText: PROFICIENCY_LABELS[skill.proficiencyLevel],
          tone: PROVENANCE_TONES[skill.provenance] === "warning" ? "warning" : "primary",
        }),
      ),
      ...(group.hidden > 0 ? [caption(tokens, `+${String(group.hidden)} more`)] : []),
    ]),
  );
  return (width) => {
    const inner = width - 2 * tokens.visual.panelPadding;
    const columns = inner >= MIN_TWO_COLUMN_SKILLS ? 2 : 1;
    return panel(tokens, {
      title: "AI engineering skills · declared levels",
      content: grid({ columns, gap: tokens.visual.gap * 2 }, groups),
    })(width);
  };
}

function linkKinds(
  project: { repositoryUrl?: string | undefined; websiteUrl?: string | undefined },
  hasGitHubData: boolean,
): string {
  // Only the kind of link is shown, never the URL.
  return [
    project.repositoryUrl === undefined && !hasGitHubData ? undefined : "repo",
    project.websiteUrl === undefined ? undefined : "site",
  ]
    .filter((kind) => kind !== undefined)
    .join(" · ");
}

function projectsPanel(
  model: AiDashboardModel,
  settings: AiEngineeringSettings,
  showDescriptions: boolean,
  tokens: DesignTokens,
): Builder | undefined {
  const { projects } = model;
  if (projects === undefined) return undefined;
  const entries: EntryItem[] = projects.items.map(({ project, tools, repository }) => {
    const links = settings.showLinks ? linkKinds(project, repository !== undefined) : "";
    const detail = showDescriptions
      ? project.description
      : repository === undefined
        ? undefined
        : formatGitHubLine(repository);
    return {
      title: project.name,
      tone: STATUS_TONES[project.status],
      trailing: label(project.status),
      subtitle: [project.category, links, label(project.provenance)]
        .filter((part) => part !== "")
        .join(" · "),
      ...(detail === undefined ? {} : { detail }),
      badges: [
        ...project.techniques.map((name) => ({ label: TECHNIQUE_LABELS[name] })),
        ...tools.map((tool) => ({ label: tool.name, tone: "primary" as const })),
      ],
    };
  });
  return panel(tokens, {
    title: "AI projects",
    content: entryList(tokens, entries, { hidden: projects.hidden }),
  });
}

function activityPanel(model: AiDashboardModel, tokens: DesignTokens): Builder | undefined {
  const { activity } = model;
  if (activity === undefined) return undefined;
  return panel(tokens, {
    title: "AI engineering activity · declared records",
    content: stack({ gap: tokens.visual.gap }, [
      stack({ gap: 6 }, [
        caption(tokens, "By involvement"),
        distributionBar(
          tokens,
          activity.byInvolvement.map((entry) => ({
            label: INVOLVEMENT_LABELS[entry.key],
            value: entry.count,
            tone: INVOLVEMENT_TONES[entry.key],
          })),
        ),
      ]),
      // A single type says nothing a count does not, so the chart needs at least two.
      ...(activity.byType.length > 1
        ? [
            stack({ gap: 6 }, [
              caption(tokens, "By type"),
              horizontalBarChart(
                tokens,
                activity.byType.map((entry) => ({
                  label: ACTIVITY_LABELS[entry.key],
                  value: entry.count,
                })),
              ),
            ]),
          ]
        : []),
      stack({ gap: 6 }, [
        caption(tokens, "Most recent"),
        entryList(
          tokens,
          activity.recent.map((record) => ({
            title: ACTIVITY_LABELS[record.activityType],
            tone: INVOLVEMENT_TONES[record.involvement],
            trailing: record.date.slice(0, 10),
            subtitle: `${INVOLVEMENT_LABELS[record.involvement]} · ${label(record.provenance)}`,
            detail: record.description,
          })),
          { hidden: Math.max(0, activity.total - activity.recent.length) },
        ),
      ]),
    ]),
  });
}

function tokenPanel(model: AiDashboardModel, tokens: DesignTokens): Builder | undefined {
  const { tokenUsage } = model;
  if (tokenUsage === undefined) return undefined;
  const entries: EntryItem[] = tokenUsage.items.map(({ metric, model: usedModel }) => ({
    title: usedModel.name,
    trailing: formatMetricValue(metric),
    subtitle: `${TOKEN_KIND_LABELS[metric.kind]} · ${metric.period.start.slice(0, 10)} to ${metric.period.end.slice(0, 10)}`,
    detail: [usedModel.provider, label(metric.provenance), metric.source]
      .filter((part) => part !== undefined)
      .join(" · "),
  }));
  return panel(tokens, {
    // Each row is one reported measurement. DevTrace adds nothing up and estimates nothing.
    title: "Token usage · reported values",
    content: entryList(tokens, entries, { hidden: tokenUsage.hidden }),
  });
}

export function renderAiEngineeringDashboard(
  stats: AiEngineeringStats,
  options: AiEngineeringDashboardOptions,
): string {
  const { profile, settings, generatorVersion } = options;
  const tokens = requireDashboardTokens(settings);
  const display = displayFlags(settings);
  const model = buildAiDashboardModel(stats, settings);

  return composeDashboard({
    title: TITLE,
    description: `${profile.displayName}: ${pluralize(stats.totalTools, "tool")}, ${pluralize(stats.totalModels, "model")}, ${pluralize(stats.totalSkills, "skill")}, ${pluralize(stats.totalProjects, "project")} (public data only).`,
    displayName: profile.displayName,
    generatorVersion,
    settings,
    metrics: metricCards(model.metrics),
    panels: [
      { build: toolsPanel(model, tokens), span: 1 },
      // Providers are listed once: with the tools if they are shown, else with the models.
      { build: modelsPanel(model, tokens, model.tools === undefined), span: 1 },
      { build: skillsPanel(model, tokens), span: 2 },
      { build: projectsPanel(model, settings, display.descriptions, tokens), span: 1 },
      { build: activityPanel(model, tokens), span: 1 },
      { build: tokenPanel(model, tokens), span: 2 },
    ],
    emptyMessage: "No AI engineering data to display.",
  });
}
