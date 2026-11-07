import type { GitHubRepository } from "../../core/github-models.js";
import {
  LIFECYCLE_STAGES,
  PROJECT_STATUSES,
  type LifecycleStage,
  type ProjectStatus,
  type StartupProject,
  type StartupSettings,
} from "../../core/models.js";
import type { LifecycleCount, StartupStats } from "./stats.js";

// What the Startup & SaaS Dashboard shows, decided from the public statistics
// and the display settings. It holds no visual detail. A section with nothing
// to show is undefined, so the renderer can leave it out.
//
// Everything starts from StartupStats, which was built after the privacy
// filter. Lifecycle stage and operational status are two separate dimensions
// and are never combined into one number.

export const DEFAULT_PROJECT_LIMIT = 6;
const HIGHLIGHT_LIMIT = 3;
const GITHUB_LIST_LIMIT = 4;

/** Stages that count as "in progress" and "launched" for highlights and the pipeline. */
export const IN_PROGRESS_STAGES: readonly LifecycleStage[] = ["MVP", "DEVELOPMENT"];
export const LAUNCHED_STAGES: readonly LifecycleStage[] = ["LAUNCHED", "GROWING"];

export type MetricKey = "total" | "active" | "launched" | "inDevelopment" | "paused";

export interface DashboardMetric {
  readonly key: MetricKey;
  readonly value: number;
}

export interface StatusShare {
  readonly status: ProjectStatus;
  readonly count: number;
  /** Whole percent of the public projects. */
  readonly percent: number;
}

export interface LinkedRepository {
  readonly project: StartupProject;
  readonly repository: GitHubRepository;
}

export interface StartupDashboardModel {
  readonly metrics: readonly DashboardMetric[];
  readonly portfolio?: {
    readonly items: readonly StartupProject[];
    readonly hidden: number;
  };
  readonly lifecycle?: readonly LifecycleCount[];
  readonly status?: readonly StatusShare[];
  /** Every stage in lifecycle order, including empty ones: where the projects are now. */
  readonly pipeline?: readonly LifecycleCount[];
  readonly highlights?: {
    readonly launched: readonly StartupProject[];
    readonly inProgress: readonly StartupProject[];
  };
  readonly github?: {
    readonly total: number;
    readonly listed: readonly LinkedRepository[];
    readonly hidden: number;
    readonly withRelease: number;
    /** The latest pushedAt among the linked repositories, if any was observed. */
    readonly lastPush: string | undefined;
  };
}

/** Most recently updated first; the id keeps the order stable when dates are equal. */
function byRecency(a: StartupProject, b: StartupProject): number {
  return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
}

function pick(
  projects: readonly StartupProject[],
  stages: readonly LifecycleStage[],
): StartupProject[] {
  return projects
    .filter((project) => stages.includes(project.lifecycleStage))
    .sort(byRecency)
    .slice(0, HIGHLIGHT_LIMIT);
}

export function buildStartupDashboardModel(
  stats: StartupStats,
  settings: StartupSettings,
): StartupDashboardModel {
  const projects = stats.projectList;
  if (projects.length === 0) return { metrics: [] };

  const countWhere = (test: (project: StartupProject) => boolean): number =>
    projects.filter(test).length;
  const inDevelopment = countWhere((project) => project.lifecycleStage === "DEVELOPMENT");
  const paused = countWhere((project) => project.status === "PAUSED");

  const metrics: DashboardMetric[] = [
    { key: "total", value: stats.totalProjects },
    ...(stats.activeProjects > 0 ? [{ key: "active" as const, value: stats.activeProjects }] : []),
    ...(stats.launchedProjects > 0
      ? [{ key: "launched" as const, value: stats.launchedProjects }]
      : []),
    ...(inDevelopment > 0 ? [{ key: "inDevelopment" as const, value: inDevelopment }] : []),
    ...(paused > 0 ? [{ key: "paused" as const, value: paused }] : []),
  ];

  const limit = settings.projectListLimit ?? DEFAULT_PROJECT_LIMIT;
  const launched = pick(projects, LAUNCHED_STAGES);
  const inProgress = pick(projects, IN_PROGRESS_STAGES);

  const linked: LinkedRepository[] = projects.flatMap((project) => {
    const repository = stats.github[project.id];
    return repository === undefined ? [] : [{ project, repository }];
  });
  const pushes = linked.flatMap(({ repository }) =>
    repository.pushedAt === undefined ? [] : [repository.pushedAt],
  );

  return {
    metrics,
    ...(settings.showProjectList
      ? {
          portfolio: {
            items: projects.slice(0, limit),
            hidden: Math.max(0, projects.length - limit),
          },
        }
      : {}),
    ...(settings.showLifecycleDistribution ? { lifecycle: stats.projectsByLifecycleStage } : {}),
    ...(settings.showOperationalStatus !== false
      ? {
          status: PROJECT_STATUSES.map((status) => {
            const count = countWhere((project) => project.status === status);
            return { status, count, percent: Math.round((count / projects.length) * 100) };
          }).filter((entry) => entry.count > 0),
        }
      : {}),
    ...(settings.showPipeline !== false
      ? {
          pipeline: LIFECYCLE_STAGES.map((stage) => ({
            stage,
            count: countWhere((project) => project.lifecycleStage === stage),
          })),
        }
      : {}),
    ...(settings.showHighlights !== false && (launched.length > 0 || inProgress.length > 0)
      ? { highlights: { launched, inProgress } }
      : {}),
    ...(settings.showGitHubInsights !== false && linked.length > 0
      ? {
          github: {
            total: linked.length,
            listed: linked.slice(0, GITHUB_LIST_LIMIT),
            hidden: Math.max(0, linked.length - GITHUB_LIST_LIMIT),
            withRelease: linked.filter(({ repository }) => repository.latestRelease !== undefined)
              .length,
            lastPush: pushes.sort().at(-1),
          },
        }
      : {}),
  };
}
