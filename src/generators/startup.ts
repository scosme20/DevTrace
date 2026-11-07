import path from "node:path";
import { applyAppearanceOverrides, type Layout } from "../core/appearance.js";
import { loadGitHubSnapshot, loadStartupConfig } from "../core/config.js";
import { writeIndicator } from "../core/output.js";
import type { Theme } from "../core/models.js";
import { DevTraceError } from "../core/result.js";
import { DEVTRACE_VERSION } from "../core/version.js";
import { linkGitHubRepositories } from "../indicators/github-link.js";
import { computeStartupStats } from "../indicators/startup/stats.js";
import { contrastWarnings } from "../templates/design-tokens.js";
import { renderStartupDashboard } from "../templates/startup-dashboard.js";
import { renderStartupStats } from "../templates/startup-stats.js";

export const STARTUP_CONFIG_FILE = "data/startup.json";
export const STARTUP_INDICATOR_FILE = "startup-stats.svg";
export const INDICATORS_DIR = "public/indicators";
export const GITHUB_SNAPSHOT_FILE = "data/github-snapshot.json";

export interface GenerateOptions {
  /** Receives non-fatal problems, such as a project linked to a repository without data. */
  readonly warn?: (message: string) => void;
  /** Replaces `settings.theme` for this run (command line `--theme`). */
  readonly theme?: Theme | undefined;
  /** Replaces `settings.layout` for this run (command line `--layout`). */
  readonly layout?: Layout | undefined;
  /** File name inside the indicators directory. Defaults to `startup-stats.svg`. */
  readonly outputFile?: string | undefined;
}

/**
 * Coordinates load, compute, render and write; holds no business rules itself.
 * GitHub data comes from the snapshot file only: generating never uses the network.
 */
export async function generateStartupStats(
  rootDir: string,
  options: GenerateOptions = {},
): Promise<string> {
  try {
    const config = await loadStartupConfig(path.join(rootDir, STARTUP_CONFIG_FILE));
    const snapshot = await loadGitHubSnapshot(path.join(rootDir, GITHUB_SNAPSHOT_FILE));
    const links = linkGitHubRepositories(config.projects, snapshot);
    links.warnings.forEach((warning) => options.warn?.(warning));

    const settings = applyAppearanceOverrides(config.settings, options);
    contrastWarnings(settings).forEach((warning) => options.warn?.(warning));

    const stats = computeStartupStats(config.projects, links.byProjectId);
    const render = settings.dashboard === true ? renderStartupDashboard : renderStartupStats;
    const svg = render(stats, {
      profile: config.profile,
      settings,
      generatorVersion: DEVTRACE_VERSION,
    });
    return await writeIndicator(
      path.join(rootDir, INDICATORS_DIR),
      options.outputFile ?? STARTUP_INDICATOR_FILE,
      svg,
    );
  } catch (cause) {
    throw new DevTraceError("Failed to generate startup statistics indicator.", { cause });
  }
}
