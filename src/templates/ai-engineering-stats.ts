import { displayFlags } from "../core/appearance.js";
import type { AiEngineeringSettings, TokenUsageMetric } from "../core/ai-engineering-models.js";
import type { StartupProfile } from "../core/models.js";
import type { AiEngineeringStats } from "../indicators/ai-engineering/stats.js";
import { text } from "../shared/svg.js";
import {
  ACTIVITY_LABELS,
  INVOLVEMENT_LABELS,
  PROFICIENCY_LABELS,
  SKILL_CATEGORY_LABELS,
  TECHNIQUE_LABELS,
  TOKEN_KIND_LABELS,
  TOOL_CATEGORY_LABELS,
} from "./ai-engineering-labels.js";
import {
  composeCard,
  label,
  pluralize,
  renderEmptyState,
  sectionHeading,
  type Section,
} from "./card.js";
import { fit, requireDesignTokens, type DesignTokens } from "./design-tokens.js";
import { formatGitHubLine } from "./github.js";
import { renderRows, type Row } from "./rows.js";
import { statusColor } from "./themes.js";

// Where the middle column starts, as a fraction of the content width.
const MIDDLE_COLUMN = 220 / 504;

export interface AiEngineeringCardOptions {
  readonly profile: StartupProfile;
  readonly settings: AiEngineeringSettings;
  readonly generatorVersion: string;
}

function renderListSection(title: string, rows: readonly Row[], tokens: DesignTokens): Section {
  const { layout } = tokens;
  const { body, y } = renderRows(rows, layout.listStart, layout.rowHeight, tokens);
  return { body: sectionHeading(title, tokens) + body, height: y - layout.listTrim };
}

function renderSkills(
  stats: AiEngineeringStats,
  showDescriptions: boolean,
  tokens: DesignTokens,
): Section {
  const { palette, font, box, layout } = tokens;
  let y = layout.listStart;
  const parts: string[] = [];
  for (const { key: category } of stats.skillsByCategory) {
    parts.push(
      text(fit(tokens, SKILL_CATEGORY_LABELS[category], box.contentWidth, font.label, true), {
        x: box.padding,
        y,
        fill: palette.primary,
        size: font.label,
        weight: font.emphasis,
      }),
    );
    const rows: Row[] = stats.skills
      .filter((skill) => skill.category === category)
      .map((skill) => ({
        left: skill.name,
        right: PROFICIENCY_LABELS[skill.proficiencyLevel],
        ...(showDescriptions && skill.description !== undefined
          ? { details: [skill.description] }
          : {}),
      }));
    const rendered = renderRows(rows, y + layout.rowHeight - 2, layout.rowHeight, tokens);
    parts.push(rendered.body);
    y = rendered.y + 6;
  }
  return {
    // Levels are the user's own statements, not measurements or certifications.
    body: sectionHeading("Skills · declared levels", tokens) + parts.join(""),
    height: y - (layout.listTrim + 6),
  };
}

function linkIndicators(
  project: AiEngineeringStats["projects"][number],
  hasGitHubData: boolean,
): string {
  // Only the kind of link is shown, never the URL itself. A project linked to a
  // GitHub repository has a repository even if no URL was declared.
  const kinds = [
    project.repositoryUrl === undefined && !hasGitHubData ? undefined : "repo",
    project.websiteUrl === undefined ? undefined : "site",
  ];
  return kinds.filter((kind) => kind !== undefined).join(" · ");
}

function formatMetricValue(metric: TokenUsageMetric): string {
  if (metric.kind === "ESTIMATED_COST") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: metric.unit }).format(
      metric.value,
    );
  }
  return `${new Intl.NumberFormat("en-US").format(metric.value)} tokens`;
}

function buildSections(
  stats: AiEngineeringStats,
  settings: AiEngineeringSettings,
  showDescriptions: boolean,
  tokens: DesignTokens,
): Section[] {
  const { palette } = tokens;
  const sections: Section[] = [];

  if ((settings.showTools || settings.showModels) && stats.providers.length > 0) {
    sections.push(
      renderListSection(
        `Providers · ${String(stats.totalProviders)}`,
        [{ left: stats.providers.join(" · ") }],
        tokens,
      ),
    );
  }
  if (settings.showTools && stats.tools.length > 0) {
    sections.push(
      renderListSection(
        "Tools",
        stats.tools.map((tool) => ({
          left: tool.name,
          cells: [{ col: MIDDLE_COLUMN, text: TOOL_CATEGORY_LABELS[tool.category] }],
          right: tool.provider,
        })),
        tokens,
      ),
    );
  }
  if (settings.showModels && stats.models.length > 0) {
    sections.push(
      renderListSection(
        "Models",
        stats.models.map((model) => ({
          left: model.name,
          cells: [{ col: MIDDLE_COLUMN, text: model.modelFamily }],
          right: model.provider,
        })),
        tokens,
      ),
    );
  }
  if (settings.showSkills && stats.skills.length > 0) {
    sections.push(renderSkills(stats, showDescriptions, tokens));
  }
  if (settings.showProjects && stats.projects.length > 0) {
    sections.push(
      renderListSection(
        "Projects",
        stats.projects.map((project) => {
          const repository = stats.github[project.id];
          const links = settings.showLinks ? linkIndicators(project, repository !== undefined) : "";
          const techniques = project.techniques.map((name) => TECHNIQUE_LABELS[name]).join(" · ");
          const color = statusColor(palette, project.status);
          const details = [
            ...(showDescriptions ? [project.description] : []),
            ...(techniques === "" ? [] : [techniques]),
            ...(repository === undefined ? [] : [formatGitHubLine(repository)]),
          ];
          return {
            left: project.name,
            cells: [{ col: MIDDLE_COLUMN, text: label(project.status), fill: color }],
            dotColor: color,
            ...(links === "" ? {} : { right: links }),
            ...(details.length === 0 ? {} : { details }),
          };
        }),
        tokens,
      ),
    );
  }
  if (settings.showActivity && stats.activities.length > 0) {
    sections.push(
      renderListSection(
        "Activity · declared records",
        stats.activities.map((activity) => ({
          left: ACTIVITY_LABELS[activity.activityType],
          cells: [{ col: MIDDLE_COLUMN, text: INVOLVEMENT_LABELS[activity.involvement] }],
          right: `${activity.date.slice(0, 10)} · ${label(activity.provenance)}`,
          details: [activity.description],
        })),
        tokens,
      ),
    );
  }
  if (settings.showTokenUsage && stats.tokenUsage.length > 0) {
    sections.push(
      renderListSection(
        "Token usage · reported values",
        stats.tokenUsage.map(({ metric, model }) => ({
          left: model.name,
          cells: [{ col: MIDDLE_COLUMN, text: TOKEN_KIND_LABELS[metric.kind] }],
          right: formatMetricValue(metric),
          details: [
            [
              model.provider,
              `${metric.period.start.slice(0, 10)} to ${metric.period.end.slice(0, 10)}`,
              label(metric.provenance),
              metric.source,
            ]
              .filter((part) => part !== undefined)
              .join(" · "),
          ],
        })),
        tokens,
      ),
    );
  }
  return sections;
}

export function renderAiEngineeringStats(
  stats: AiEngineeringStats,
  options: AiEngineeringCardOptions,
): string {
  const { profile, settings, generatorVersion } = options;
  const tokens = requireDesignTokens(settings);
  const display = displayFlags(settings);

  const sections = buildSections(stats, settings, display.descriptions, tokens);
  if (sections.length === 0) {
    sections.push(renderEmptyState("No AI engineering data to display.", tokens));
  }

  return composeCard({
    title: "AI Engineering Statistics",
    description: `${profile.displayName}: ${pluralize(stats.totalTools, "tool")}, ${pluralize(stats.totalModels, "model")}, ${pluralize(stats.totalSkills, "skill")}, ${pluralize(stats.totalProjects, "project")} (public data only).`,
    displayName: profile.displayName,
    generatorVersion,
    tokens,
    display,
    summary: [
      { value: stats.totalTools, name: "AI Tools" },
      { value: stats.totalModels, name: "AI Models" },
      { value: stats.totalSkills, name: "AI Skills" },
      { value: stats.totalProjects, name: "AI Projects" },
    ],
    sections,
  });
}
