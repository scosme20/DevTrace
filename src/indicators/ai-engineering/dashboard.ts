import type {
  ActivityType,
  AiActivity,
  AiEngineeringSettings,
  AiMilestone,
  AiInvolvement,
  AiModel,
  AiProject,
  AiSkill,
  AiTool,
  SkillCategory,
  ToolCategory,
} from "../../core/ai-engineering-models.js";
import {
  ACTIVITY_TYPES,
  AI_INVOLVEMENTS,
  SKILL_CATEGORIES,
} from "../../core/ai-engineering-models.js";
import type { GitHubRepository } from "../../core/github-models.js";
import type { FoundInRepositories } from "./github-signals.js";
import type { AiEngineeringStats, CountEntry, PublicTokenMetric } from "./stats.js";

// What the AI Engineering Dashboard shows, decided from the public statistics
// and the display settings. It holds no visual detail: no label text, color or
// size. A section that has nothing to show is `undefined`, so the renderer can
// leave it out and close the gap instead of drawing an empty box.
//
// Everything here starts from `AiEngineeringStats`, which was built after the
// privacy filter. Nothing is read from the raw configuration.

/** How many entries each list shows. The rest is reported as a count. */
export const DASHBOARD_LIMITS = {
  tools: 4,
  models: 4,
  skillsPerCategory: 3,
  projects: 3,
  recentActivities: 2,
  tokenRows: 3,
  milestones: 5,
  stackTools: 3,
  foundRepositories: 4,
} as const;

export type MetricKey = "tools" | "providers" | "models" | "skills" | "projects" | "activities";

export interface DashboardMetric {
  readonly key: MetricKey;
  readonly value: number;
}

export interface DashboardProject {
  readonly project: AiProject;
  /** Public tools only: a private tool is never named, even by a public project. */
  readonly tools: readonly AiTool[];
  readonly repository: GitHubRepository | undefined;
}

export interface SkillGroup {
  readonly category: SkillCategory;
  readonly skills: readonly AiSkill[];
  readonly hidden: number;
}

/** Cached input over input for one model and period. Only when both were reported. */
export interface CacheHit {
  readonly model: AiModel;
  readonly period: { readonly start: string; readonly end: string };
  readonly inputTokens: number;
  readonly cachedTokens: number;
  /** Whole percent, from 0 to 100. */
  readonly percent: number;
}

/** A model's part of the total tokens reported for one shared period. */
export interface ModelShare {
  readonly model: AiModel;
  readonly tokens: number;
  readonly percent: number;
}

export interface AiDashboardModel {
  readonly metrics: readonly DashboardMetric[];
  /** The names of the first tools, for the strip at the top. */
  readonly stack: readonly string[];
  /** The model with the largest share of the reported tokens, when shares exist. */
  readonly topModel?: ModelShare;
  /** Cache hit as one number, when every reported pair covers the same period. */
  readonly cacheHit?: { readonly percent: number };
  readonly providers: readonly string[];
  readonly tools?: {
    readonly byCategory: readonly CountEntry<ToolCategory>[];
    readonly items: readonly AiTool[];
    readonly hidden: number;
  };
  readonly models?: { readonly items: readonly AiModel[]; readonly hidden: number };
  readonly skills?: { readonly groups: readonly SkillGroup[] };
  readonly projects?: {
    readonly items: readonly DashboardProject[];
    readonly hidden: number;
  };
  readonly activity?: {
    readonly total: number;
    readonly byInvolvement: readonly CountEntry<AiInvolvement>[];
    readonly byType: readonly CountEntry<ActivityType>[];
    readonly recent: readonly AiActivity[];
  };
  readonly tokenUsage?: {
    readonly items: readonly PublicTokenMetric[];
    readonly hidden: number;
    readonly cacheHits: readonly CacheHit[];
    readonly period?: { readonly start: string; readonly end: string };
    readonly shares: readonly ModelShare[];
  };
  readonly milestones?: { readonly items: readonly AiMilestone[]; readonly hidden: number };
  /** What the GitHub snapshot shows about AI in the repositories. Only with `githubSignals`. */
  readonly found?: {
    readonly repositories: FoundInRepositories["repositories"];
    readonly hidden: number;
    readonly coauthored: FoundInRepositories["coauthored"];
    readonly tools: readonly string[];
  };
}

const samePeriod = (
  a: { readonly start: string; readonly end: string },
  b: { readonly start: string; readonly end: string },
): boolean => a.start === b.start && a.end === b.end;

/**
 * Cache hit per model and period. A rate needs a real denominator, so a pair
 * counts only when the same model reported both the input and the cached input
 * for the same period, and the input is not zero.
 */
export function computeCacheHits(metrics: readonly PublicTokenMetric[]): CacheHit[] {
  const hits: CacheHit[] = [];
  for (const input of metrics.filter(({ metric }) => metric.kind === "INPUT_TOKENS")) {
    const cached = metrics.find(
      ({ metric, model }) =>
        metric.kind === "CACHED_INPUT_TOKENS" &&
        model.id === input.model.id &&
        samePeriod(metric.period, input.metric.period),
    );
    if (cached === undefined || input.metric.value === 0) continue;
    hits.push({
      model: input.model,
      period: input.metric.period,
      inputTokens: input.metric.value,
      cachedTokens: cached.metric.value,
      percent: Math.min(100, Math.round((cached.metric.value / input.metric.value) * 100)),
    });
  }
  return hits;
}

/**
 * Shares of the reported total tokens. Different periods are never mixed: shares
 * exist only when every total was reported for the same period.
 */
export function computeModelShares(metrics: readonly PublicTokenMetric[]): {
  period: { start: string; end: string } | undefined;
  shares: ModelShare[];
} {
  const totals = metrics.filter(({ metric }) => metric.kind === "TOTAL_TOKENS");
  const first = totals[0];
  if (first === undefined) return { period: undefined, shares: [] };
  if (!totals.every(({ metric }) => samePeriod(metric.period, first.metric.period))) {
    return { period: undefined, shares: [] };
  }
  const all = totals.reduce((sum, { metric }) => sum + metric.value, 0);
  if (all === 0) return { period: undefined, shares: [] };
  const shares = totals
    .map(({ metric, model }) => ({
      model,
      tokens: metric.value,
      percent: Math.round((metric.value / all) * 100),
    }))
    .sort((a, b) => b.tokens - a.tokens || a.model.name.localeCompare(b.model.name));
  return { period: first.metric.period, shares };
}

function take<T>(items: readonly T[], limit: number): { items: T[]; hidden: number } {
  return { items: items.slice(0, limit), hidden: Math.max(0, items.length - limit) };
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

export function buildAiDashboardModel(
  stats: AiEngineeringStats,
  settings: AiEngineeringSettings,
): AiDashboardModel {
  const toolsShown = settings.showTools && stats.tools.length > 0;
  const modelsShown = settings.showModels && stats.models.length > 0;
  const skillsShown = settings.showSkills && stats.skills.length > 0;
  const projectsShown = settings.showProjects && stats.projects.length > 0;
  const activityShown = settings.showActivity && stats.activities.length > 0;
  const tokensShown = settings.showTokenUsage && stats.tokenUsage.length > 0;

  // Providers come from tools and models together, so they count when either is shown.
  const providersShown = (settings.showTools || settings.showModels) && stats.providers.length > 0;

  const metrics: DashboardMetric[] = [
    ...(toolsShown ? [{ key: "tools" as const, value: stats.totalTools }] : []),
    ...(providersShown ? [{ key: "providers" as const, value: stats.totalProviders }] : []),
    ...(modelsShown ? [{ key: "models" as const, value: stats.totalModels }] : []),
    ...(skillsShown ? [{ key: "skills" as const, value: stats.totalSkills }] : []),
    ...(projectsShown ? [{ key: "projects" as const, value: stats.totalProjects }] : []),
    ...(activityShown ? [{ key: "activities" as const, value: stats.activities.length }] : []),
  ];

  const toolsById = new Map(stats.tools.map((tool) => [tool.id, tool]));
  const milestonesShown = settings.showMilestones !== false && stats.milestones.length > 0;
  // Shown when something was found, or at least when commits were looked at (the chip).
  const found =
    stats.found !== undefined &&
    (stats.found.repositories.length > 0 || stats.found.coauthored !== undefined)
      ? stats.found
      : undefined;
  const cacheHits = tokensShown ? computeCacheHits(stats.tokenUsage) : [];
  const { period: sharesPeriod, shares } = tokensShown
    ? computeModelShares(stats.tokenUsage)
    : { period: undefined, shares: [] };
  const [onlyHit] = cacheHits;
  const sameHitPeriod =
    onlyHit !== undefined && cacheHits.every((hit) => samePeriod(hit.period, onlyHit.period));
  const hitInput = cacheHits.reduce((sum, hit) => sum + hit.inputTokens, 0);
  const hitCached = cacheHits.reduce((sum, hit) => sum + hit.cachedTokens, 0);

  const [topShare] = shares;

  return {
    metrics,
    stack: toolsShown
      ? stats.tools.slice(0, DASHBOARD_LIMITS.stackTools).map((tool) => tool.name)
      : [],
    ...(topShare === undefined ? {} : { topModel: topShare }),
    ...(sameHitPeriod && hitInput > 0
      ? { cacheHit: { percent: Math.min(100, Math.round((hitCached / hitInput) * 100)) } }
      : {}),
    providers: providersShown ? stats.providers : [],
    ...(toolsShown
      ? {
          tools: {
            byCategory: stats.toolsByCategory,
            ...take(stats.tools, DASHBOARD_LIMITS.tools),
          },
        }
      : {}),
    ...(modelsShown ? { models: take(stats.models, DASHBOARD_LIMITS.models) } : {}),
    ...(skillsShown
      ? {
          skills: {
            groups: SKILL_CATEGORIES.map((category): SkillGroup => {
              const inCategory = stats.skills.filter((skill) => skill.category === category);
              const shown = take(inCategory, DASHBOARD_LIMITS.skillsPerCategory);
              return { category, skills: shown.items, hidden: shown.hidden };
            }).filter((group) => group.skills.length > 0),
          },
        }
      : {}),
    ...(projectsShown
      ? {
          projects: {
            ...take(
              stats.projects.map((project): DashboardProject => ({
                project,
                tools: project.tools.flatMap((id) => {
                  const tool = toolsById.get(id);
                  return tool === undefined ? [] : [tool];
                }),
                repository: stats.github[project.id],
              })),
              DASHBOARD_LIMITS.projects,
            ),
          },
        }
      : {}),
    ...(activityShown
      ? {
          activity: {
            total: stats.activities.length,
            byInvolvement: countBy(
              AI_INVOLVEMENTS,
              stats.activities,
              (activity) => activity.involvement,
            ),
            byType: countBy(ACTIVITY_TYPES, stats.activities, (activity) => activity.activityType),
            recent: stats.activities.slice(0, DASHBOARD_LIMITS.recentActivities),
          },
        }
      : {}),
    ...(tokensShown
      ? {
          tokenUsage: {
            ...take(stats.tokenUsage, DASHBOARD_LIMITS.tokenRows),
            cacheHits,
            ...(sharesPeriod === undefined ? {} : { period: sharesPeriod }),
            shares,
          },
        }
      : {}),
    ...(milestonesShown ? { milestones: take(stats.milestones, DASHBOARD_LIMITS.milestones) } : {}),
    ...(found === undefined
      ? {}
      : {
          found: {
            repositories: found.repositories.slice(0, DASHBOARD_LIMITS.foundRepositories),
            hidden: Math.max(0, found.repositories.length - DASHBOARD_LIMITS.foundRepositories),
            coauthored: found.coauthored,
            tools: found.tools,
          },
        }),
  };
}
