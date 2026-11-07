import type { GitHubRepository } from "../../core/github-models.js";
import {
  SKILL_CATEGORIES,
  TOOL_CATEGORIES,
  type AiActivity,
  type AiEngineeringConfig,
  type AiModel,
  type AiProject,
  type AiSkill,
  type AiTool,
  type SkillCategory,
  type TokenUsageMetric,
  type ToolCategory,
} from "../../core/ai-engineering-models.js";
import { PROJECT_STATUSES, type ProjectStatus } from "../../core/models.js";
import { restrictToProjects } from "../github-link.js";

export interface CountEntry<K extends string> {
  readonly key: K;
  readonly count: number;
}

export interface PublicTokenMetric {
  readonly metric: TokenUsageMetric;
  readonly model: AiModel;
}

/** Entities that may appear in a published SVG. Nothing else is ever aggregated. */
export interface PublicAiData {
  readonly tools: readonly AiTool[];
  readonly models: readonly AiModel[];
  readonly skills: readonly AiSkill[];
  readonly projects: readonly AiProject[];
  readonly activities: readonly AiActivity[];
  readonly tokenUsage: readonly PublicTokenMetric[];
}

export interface AiEngineeringStats extends PublicAiData {
  readonly totalTools: number;
  /** Distinct providers across public tools and public models, sorted by name. */
  readonly providers: readonly string[];
  readonly totalProviders: number;
  readonly totalModels: number;
  readonly totalSkills: number;
  readonly totalProjects: number;
  readonly toolsByCategory: readonly CountEntry<ToolCategory>[];
  readonly skillsByCategory: readonly CountEntry<SkillCategory>[];
  readonly projectsByStatus: readonly CountEntry<ProjectStatus>[];
  /**
   * Observed GitHub data by project ID, for listed projects only. It is shown
   * next to declared values and is never used to compute the numbers above.
   */
  readonly github: Readonly<Record<string, GitHubRepository>>;
}

/**
 * The privacy boundary. It runs before any aggregation, and it also drops
 * entities that would reveal a private one through a reference:
 * - an activity linked to a private project,
 * - a token metric of a private model,
 * - cost metrics unless `showCost` is enabled.
 */
export function selectPublicAiData(config: AiEngineeringConfig): PublicAiData {
  const publicProjects = config.projects.filter((project) => project.visibility === "PUBLIC");
  const publicProjectIds = new Set(publicProjects.map((project) => project.id));
  const publicModels = config.models.filter((model) => model.visibility === "PUBLIC");
  const publicModelsById = new Map(publicModels.map((model) => [model.id, model]));

  const tokenUsage: PublicTokenMetric[] = [];
  for (const metric of config.tokenUsage) {
    const model = publicModelsById.get(metric.modelId);
    const costAllowed = metric.kind !== "ESTIMATED_COST" || config.settings.showCost;
    if (metric.visibility === "PUBLIC" && model !== undefined && costAllowed) {
      tokenUsage.push({ metric, model });
    }
  }

  return {
    tools: config.tools.filter((tool) => tool.visibility === "PUBLIC"),
    models: publicModels,
    skills: config.skills.filter((skill) => skill.visibility === "PUBLIC"),
    projects: publicProjects,
    activities: config.activities
      .filter(
        (activity) =>
          activity.visibility === "PUBLIC" &&
          (activity.projectId === undefined || publicProjectIds.has(activity.projectId)),
      )
      // Newest first; id keeps the order stable when dates are equal.
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
    tokenUsage,
  };
}

function countBy<T, K extends string>(
  order: readonly K[],
  items: readonly T[],
  keyOf: (item: T) => K,
): CountEntry<K>[] {
  return order
    .map((key) => ({ key, count: items.filter((item) => keyOf(item) === key).length }))
    .filter((entry) => entry.count > 0);
}

function collectProviders(tools: readonly AiTool[], models: readonly AiModel[]): string[] {
  // Case-insensitive so "OpenAI" and "openai" are one provider; the first spelling wins.
  const byKey = new Map<string, string>();
  for (const { provider } of [...tools, ...models]) {
    const key = provider.trim().toLowerCase();
    if (!byKey.has(key)) byKey.set(key, provider.trim());
  }
  return [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, name]) => name);
}

/** Only metrics supported by the data are computed; there are no scores or rankings. */
export function computeAiEngineeringStats(
  config: AiEngineeringConfig,
  github: Readonly<Record<string, GitHubRepository>> = {},
): AiEngineeringStats {
  const data = selectPublicAiData(config);
  const providers = collectProviders(data.tools, data.models);
  return {
    ...data,
    providers,
    totalTools: data.tools.length,
    totalProviders: providers.length,
    totalModels: data.models.length,
    totalSkills: data.skills.length,
    totalProjects: data.projects.length,
    toolsByCategory: countBy(TOOL_CATEGORIES, data.tools, (tool) => tool.category),
    skillsByCategory: countBy(SKILL_CATEGORIES, data.skills, (skill) => skill.category),
    projectsByStatus: countBy(PROJECT_STATUSES, data.projects, (project) => project.status),
    github: restrictToProjects(github, data.projects),
  };
}
