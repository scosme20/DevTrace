import type { GitHubRepository } from "../../core/github-models.js";
import { LIFECYCLE_STAGES, type LifecycleStage, type StartupProject } from "../../core/models.js";
import { restrictToProjects } from "../github-link.js";

export interface LifecycleCount {
  readonly stage: LifecycleStage;
  readonly count: number;
}

export interface StartupStats {
  /** Public projects only. */
  readonly totalProjects: number;
  /** Public projects whose operational status is ACTIVE. */
  readonly activeProjects: number;
  /** Public projects whose lifecycle stage is LAUNCHED or GROWING. */
  readonly launchedProjects: number;
  /** Stages with at least one public project, in lifecycle order. */
  readonly projectsByLifecycleStage: readonly LifecycleCount[];
  readonly projectList: readonly StartupProject[];
  /**
   * Observed GitHub data by project ID, for listed projects only. It is shown
   * next to declared values and is never used to compute the numbers above.
   */
  readonly github: Readonly<Record<string, GitHubRepository>>;
}

/**
 * The privacy boundary. It runs before any aggregation so private projects
 * cannot influence a number, a name or a link in a published SVG.
 */
export function selectPublicProjects(projects: readonly StartupProject[]): StartupProject[] {
  return projects.filter((project) => project.visibility === "PUBLIC");
}

export function computeStartupStats(
  projects: readonly StartupProject[],
  github: Readonly<Record<string, GitHubRepository>> = {},
): StartupStats {
  const projectList = selectPublicProjects(projects);
  return {
    totalProjects: projectList.length,
    activeProjects: projectList.filter((project) => project.status === "ACTIVE").length,
    launchedProjects: projectList.filter(
      (project) => project.lifecycleStage === "LAUNCHED" || project.lifecycleStage === "GROWING",
    ).length,
    projectsByLifecycleStage: LIFECYCLE_STAGES.map((stage) => ({
      stage,
      count: projectList.filter((project) => project.lifecycleStage === stage).length,
    })).filter((entry) => entry.count > 0),
    projectList,
    github: restrictToProjects(github, projectList),
  };
}
