import type { AppearanceSettings } from "./appearance.js";

export const LIFECYCLE_STAGES = [
  "IDEA",
  "RESEARCH",
  "PROTOTYPE",
  "MVP",
  "DEVELOPMENT",
  "LAUNCHED",
  "GROWING",
  "MAINTENANCE",
  "ARCHIVED",
] as const;

// Operational status is independent from the lifecycle stage: a product in
// DEVELOPMENT can be ACTIVE or PAUSED.
export const PROJECT_STATUSES = ["ACTIVE", "PAUSED", "INACTIVE"] as const;

export const VISIBILITIES = ["PUBLIC", "PRIVATE"] as const;

// OBSERVED: collected from a verifiable source. DECLARED: stated by the user.
// ESTIMATED: inferred from incomplete data and never to be shown as a fact.
export const DATA_SOURCES = ["OBSERVED", "DECLARED", "ESTIMATED"] as const;

// Predefined looks. How they are customized is described in `appearance.ts`.
export const THEMES = ["DARK", "LIGHT", "MIDNIGHT", "MINIMAL", "TRANSPARENT"] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type DataSource = (typeof DATA_SOURCES)[number];
export type Theme = (typeof THEMES)[number];

export interface StartupProject {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly lifecycleStage: LifecycleStage;
  readonly status: ProjectStatus;
  readonly visibility: Visibility;
  readonly dataSource: DataSource;
  readonly repositoryUrl?: string | undefined;
  readonly websiteUrl?: string | undefined;
  /** `owner/name`. Links the project to observed GitHub data; it never overrides other fields. */
  readonly githubRepository?: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StartupProfile {
  readonly displayName: string;
}

export interface StartupSettings extends AppearanceSettings {
  readonly showProjectList: boolean;
  readonly showLifecycleDistribution: boolean;
  readonly showLinks: boolean;
  /** Draw the multi-panel dashboard instead of the single-column card. Default `false`. */
  readonly dashboard?: boolean | undefined;
  /** Dashboard only. Each panel below is shown unless set to `false`. */
  readonly showOperationalStatus?: boolean | undefined;
  readonly showPipeline?: boolean | undefined;
  readonly showHighlights?: boolean | undefined;
  readonly showGitHubInsights?: boolean | undefined;
  /** Dashboard only: most projects listed in the portfolio panel. Default 6. */
  readonly projectListLimit?: number | undefined;
}

export interface StartupConfig {
  readonly version: 1;
  readonly profile: StartupProfile;
  readonly settings: StartupSettings;
  readonly projects: readonly StartupProject[];
}
