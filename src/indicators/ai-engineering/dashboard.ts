import type {
  ActivityType,
  AiActivity,
  AiEngineeringSettings,
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
  tools: 5,
  models: 5,
  skillsPerCategory: 3,
  projects: 3,
  recentActivities: 3,
  tokenRows: 4,
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

export interface AiDashboardModel {
  readonly metrics: readonly DashboardMetric[];
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
  readonly tokenUsage?: { readonly items: readonly PublicTokenMetric[]; readonly hidden: number };
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

  return {
    metrics,
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
    ...(tokensShown ? { tokenUsage: take(stats.tokenUsage, DASHBOARD_LIMITS.tokenRows) } : {}),
  };
}
