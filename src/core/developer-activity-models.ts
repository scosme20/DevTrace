import type { AppearanceSettings } from "./appearance.js";

// The Developer Activity indicator has no data of its own: everything it shows
// comes from the GitHub snapshot (`devtrace sync`). Its configuration only says
// how to present that data, so it holds no profile information beyond a label.

export const DEFAULT_REPOSITORY_LIMIT = 6;
export const DEFAULT_RELEASE_LIMIT = 5;

/** What the heatmap colors mean. */
export type HeatmapMode = "COMMITS" | "TOKEN_EFFICIENCY";
export const HEATMAP_MODES = ["COMMITS", "TOKEN_EFFICIENCY"] as const;

export interface DeveloperActivitySettings extends AppearanceSettings {
  readonly showHeatmap: boolean;
  /** COMMITS (default) counts commits; TOKEN_EFFICIENCY colors days by tokens per commit. */
  readonly heatmapMode: HeatmapMode;
  readonly showCommitActivity: boolean;
  readonly showRepositories: boolean;
  readonly showLanguages: boolean;
  readonly showReleases: boolean;
  /** Repositories imported from local clones (`devtrace import git`). */
  readonly showLocalGit: boolean;
  /** Pull requests in other people's public repositories (`collect.contributions`). */
  readonly showContributions: boolean;
  /** Most repositories listed in the repository panel. */
  readonly repositoryLimit: number;
  /** Most releases listed in the releases panel. */
  readonly releaseLimit: number;
}

export interface DeveloperActivityConfig {
  readonly version: 1;
  readonly profile: { readonly displayName: string };
  readonly settings: DeveloperActivitySettings;
}
