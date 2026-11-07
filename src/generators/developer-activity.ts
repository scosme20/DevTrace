import path from "node:path";
import { applyAppearanceOverrides } from "../core/appearance.js";
import { loadDeveloperActivityConfig, loadGitHubSnapshot } from "../core/config.js";
import { writeIndicator } from "../core/output.js";
import { DevTraceError } from "../core/result.js";
import { DEVTRACE_VERSION } from "../core/version.js";
import { computeActivityStats } from "../indicators/developer-activity/stats.js";
import { renderDeveloperActivityDashboard } from "../templates/developer-activity-dashboard.js";
import { contrastWarnings } from "../templates/design-tokens.js";
import { GITHUB_SNAPSHOT_FILE, INDICATORS_DIR, type GenerateOptions } from "./startup.js";

export const DEVELOPER_ACTIVITY_CONFIG_FILE = "data/developer-activity.json";
export const DEVELOPER_ACTIVITY_INDICATOR_FILE = "developer-activity.svg";

/**
 * Coordinates load, compute, render and write; holds no rules itself. The data
 * comes from the GitHub snapshot only: generating never uses the network.
 */
export async function generateDeveloperActivity(
  rootDir: string,
  options: GenerateOptions = {},
): Promise<string> {
  try {
    const config = await loadDeveloperActivityConfig(
      path.join(rootDir, DEVELOPER_ACTIVITY_CONFIG_FILE),
    );
    if (config === undefined) {
      throw new DevTraceError(`${DEVELOPER_ACTIVITY_CONFIG_FILE} was not found.`, {
        hint: 'Create it with {"version": 1} (every setting is optional).',
      });
    }
    const snapshot = await loadGitHubSnapshot(path.join(rootDir, GITHUB_SNAPSHOT_FILE));
    if (snapshot === undefined) {
      options.warn?.('No GitHub data found. Run "devtrace sync" to collect it.');
    }

    const settings = applyAppearanceOverrides(config.settings, options);
    contrastWarnings(settings).forEach((warning) => options.warn?.(warning));

    const svg = renderDeveloperActivityDashboard(computeActivityStats(snapshot, settings), {
      profile: config.profile,
      settings,
      generatorVersion: DEVTRACE_VERSION,
    });
    return await writeIndicator(
      path.join(rootDir, INDICATORS_DIR),
      options.outputFile ?? DEVELOPER_ACTIVITY_INDICATOR_FILE,
      svg,
    );
  } catch (cause) {
    throw new DevTraceError("Failed to generate the developer activity indicator.", { cause });
  }
}
