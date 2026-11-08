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
  chipStrip,
  distributionBar,
  entryList,
  grid,
  horizontalBarChart,
  levelMeter,
  panel,
  progressBar,
  stack,
  type BadgeSpec,
  type Builder,
  type Chip,
  type EntryItem,
  type LabelData,
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
  FREQUENCY_LABELS,
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

/** Where the data of a panel comes from: one word when every record agrees, "Mixed" when not. */
function sourceTag(items: readonly { readonly provenance: Provenance }[]): LabelData | undefined {
  const [first] = items;
  if (first === undefined) return undefined;
  return items.every((item) => item.provenance === first.provenance)
    ? { label: label(first.provenance), tone: PROVENANCE_TONES[first.provenance] }
    : { label: "Mixed", tone: "muted" };
}

/** With a uniform source the panel tag says it all; rows repeat it only when sources differ. */
function isUniform(items: readonly { readonly provenance: Provenance }[]): boolean {
  return items.every((item) => item.provenance === items[0]?.provenance);
}

function formatContext(tokens: number): string {
  return tokens >= 1_000_000
    ? `${String(tokens / 1_000_000)}M ctx`
    : `${String(Math.round(tokens / 1000))}k ctx`;
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
      ...(isUniform(tools.items) ? [] : [provenanceBadge(tool.provenance)]),
    ],
    ...(tool.usageType === undefined ? {} : { trailing: USAGE_TYPE_LABELS[tool.usageType] }),
  }));
  return panel(tokens, {
    title: "AI tools & providers",
    ...tagOption(sourceTag(tools.items)),
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
  const shareById = new Map(
    (model.tokenUsage?.shares ?? []).map((share) => [share.model.id, share.percent]),
  );
  const entries: EntryItem[] = models.items.map((item) => {
    const share = shareById.get(item.id);
    // A share that rounds to zero is still not zero: say so instead of "0%".
    const trailing =
      share === undefined ? item.usageContext : `${share === 0 ? "<1" : String(share)}% of tokens`;
    return {
      title: item.name,
      subtitle: [
        item.provider,
        item.modelFamily,
        item.capability,
        item.contextWindow === undefined ? undefined : formatContext(item.contextWindow),
      ]
        .filter((part) => part !== undefined)
        .join(" · "),
      ...(isUniform(models.items) ? {} : { badges: [provenanceBadge(item.provenance)] }),
      ...(trailing === undefined ? {} : { trailing }),
    };
  });
  return panel(tokens, {
    title: "AI foundation models",
    ...tagOption(sourceTag(models.items)),
    content: stack({ gap: tokens.visual.gap }, [
      ...(showProviders && model.providers.length > 0 ? [providersBlock(model, tokens)] : []),
      ...(shareById.size === 0 || model.tokenUsage?.period === undefined
        ? []
        : [
            caption(
              tokens,
              `Share of reported total tokens · ${model.tokenUsage.period.start.slice(0, 10)} to ${model.tokenUsage.period.end.slice(0, 10)}`,
            ),
          ]),
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
        // Separate steps: a declared level on a five-step scale, not a measurement.
        levelMeter(tokens, {
          label: skill.name,
          level: PROFICIENCY_LEVELS.indexOf(skill.proficiencyLevel) + 1,
          steps: levels,
          valueText:
            skill.frequency === undefined
              ? PROFICIENCY_LABELS[skill.proficiencyLevel]
              : `${PROFICIENCY_LABELS[skill.proficiencyLevel]} · ${FREQUENCY_LABELS[skill.frequency]}`,
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
      ...tagOption(sourceTag(skills.groups.flatMap((group) => group.skills))),
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
      subtitle: [
        project.category,
        links,
        isUniform(projects.items.map((entry) => entry.project)) ? "" : label(project.provenance),
      ]
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
    ...tagOption(sourceTag(projects.items.map((entry) => entry.project))),
    content: entryList(tokens, entries, { hidden: projects.hidden }),
  });
}

function activityPanel(
  model: AiDashboardModel,
  tokens: DesignTokens,
  showDescriptions: boolean,
): Builder | undefined {
  const { activity } = model;
  if (activity === undefined) return undefined;
  return panel(tokens, {
    title: "AI contributions · declared records",
    ...tagOption(sourceTag(activity.recent)),
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
            subtitle: [
              INVOLVEMENT_LABELS[record.involvement],
              isUniform(activity.recent) ? "" : label(record.provenance),
            ]
              .filter((part) => part !== "")
              .join(" · "),
            ...(showDescriptions ? { detail: record.description } : {}),
          })),
          { hidden: Math.max(0, activity.total - activity.recent.length) },
        ),
      ]),
    ]),
  });
}

function milestonesPanel(model: AiDashboardModel, tokens: DesignTokens): Builder | undefined {
  const { milestones } = model;
  if (milestones === undefined) return undefined;
  const entries: EntryItem[] = milestones.items.map((milestone) => ({
    title: milestone.title,
    tone: "primary",
    trailing: milestone.date.slice(0, 10),
    ...(milestone.description === undefined ? {} : { subtitle: milestone.description }),
  }));
  return panel(tokens, {
    title: "AI engineering milestones",
    ...tagOption(sourceTag(milestones.items)),
    content: entryList(tokens, entries, { hidden: milestones.hidden }),
  });
}

function tokenPanel(model: AiDashboardModel, tokens: DesignTokens): Builder | undefined {
  const { tokenUsage } = model;
  if (tokenUsage === undefined) return undefined;
  const entries: EntryItem[] = tokenUsage.items.map(({ metric, model: usedModel }) => ({
    title: usedModel.name,
    trailing: formatMetricValue(metric),
    subtitle: `${TOKEN_KIND_LABELS[metric.kind]} · ${metric.period.start.slice(0, 10)} to ${metric.period.end.slice(0, 10)}`,
    detail: [
      usedModel.provider,
      isUniform(tokenUsage.items.map(({ metric: m }) => m)) ? undefined : label(metric.provenance),
      metric.source,
    ]
      .filter((part) => part !== undefined)
      .join(" · "),
  }));
  return panel(tokens, {
    // Each row is one reported measurement. Nothing is estimated: a cache hit rate is
    // shown only where the same model reported input and cached input for one period.
    title: "Token economics · reported values",
    ...tagOption(sourceTag(tokenUsage.items.map(({ metric }) => metric))),
    content: stack({ gap: tokens.visual.gap }, [
      ...(tokenUsage.cacheHits.length === 0
        ? []
        : [
            stack({ gap: 6 }, [
              caption(tokens, "Cache hit · cached input ÷ input, same model and period"),
              ...tokenUsage.cacheHits.map((hit) =>
                progressBar(tokens, {
                  label: `${hit.model.name} · ${hit.period.start.slice(0, 10)} to ${hit.period.end.slice(0, 10)}`,
                  value: hit.percent,
                  max: 100,
                  valueText: `${String(hit.percent)}%`,
                  tone: "success",
                }),
              ),
            ]),
          ]),
      entryList(tokens, entries, { hidden: tokenUsage.hidden }),
    ]),
  });
}

function foundPanel(model: AiDashboardModel, tokens: DesignTokens): Builder | undefined {
  const { found } = model;
  if (found === undefined || found.repositories.length === 0) return undefined;
  const entries: EntryItem[] = found.repositories.map((repository) => ({
    title: repository.name,
    tone: "success",
    ...(repository.coauthored === undefined
      ? {}
      : {
          trailing: `${String(repository.coauthored.matching)} of ${String(repository.coauthored.inspected)} commits`,
        }),
    badges: [
      ...repository.toolFiles.map((tool) => ({ label: tool, tone: "primary" as const })),
      ...repository.aiTopics.map((topic) => ({ label: topic })),
    ],
  }));
  return panel(tokens, {
    title: "AI in my repositories · found on GitHub",
    tag: { label: "Observed", tone: "success" },
    content: stack({ gap: tokens.visual.gap }, [
      caption(
        tokens,
        found.coauthored === undefined
          ? "Assistant files and AI topics · not a share of AI code"
          : "Co-authors declared in commits · not a share of AI code",
      ),
      entryList(tokens, entries, { hidden: found.hidden }),
    ]),
  });
}

function stackChips(model: AiDashboardModel): Chip[] {
  return [
    ...(model.stack.length === 0
      ? []
      : [{ label: "AI Stack", value: model.stack.join(" · "), tone: "success" as const }]),
    ...(model.topModel === undefined
      ? []
      : [
          {
            label: "Top Model",
            value: `${model.topModel.model.name} · ${String(model.topModel.percent)}%`,
            tone: "primary" as const,
          },
        ]),
    ...(model.found?.coauthored === undefined
      ? []
      : [
          {
            label: "AI Co-authored",
            value: `${String(model.found.coauthored.matching)} of ${String(model.found.coauthored.inspected)} recent commits`,
            tone: "primary" as const,
          },
        ]),
    ...(model.cacheHit === undefined
      ? []
      : [
          {
            label: "Cache Hit",
            value: `${String(model.cacheHit.percent)}%`,
            tone: "success" as const,
          },
        ]),
  ];
}

/** A panel option object that leaves the key out when there is no tag. */
function tagOption(tag: LabelData | undefined): { tag?: LabelData } {
  return tag === undefined ? {} : { tag };
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
    chips: stackChips(model).length === 0 ? undefined : chipStrip(tokens, stackChips(model)),
    panels: [
      { build: toolsPanel(model, tokens), span: 1 },
      // Providers are listed once: with the tools if they are shown, else with the models.
      { build: modelsPanel(model, tokens, model.tools === undefined), span: 1 },
      { build: skillsPanel(model, tokens), span: 2 },
      { build: projectsPanel(model, settings, display.descriptions, tokens), span: 1 },
      { build: activityPanel(model, tokens, display.descriptions), span: 1 },
      { build: foundPanel(model, tokens), span: 1 },
      { build: tokenPanel(model, tokens), span: 1 },
      { build: milestonesPanel(model, tokens), span: 1 },
    ],
    emptyMessage: "No AI engineering data to display.",
  });
}
