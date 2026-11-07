import path from "node:path";
import { applyAppearanceOverrides } from "../core/appearance.js";
import { loadAiEngineeringConfig, loadGitHubSnapshot } from "../core/config.js";
import { writeIndicator } from "../core/output.js";
import { DevTraceError } from "../core/result.js";
import { DEVTRACE_VERSION } from "../core/version.js";
import { computeAiEngineeringStats } from "../indicators/ai-engineering/stats.js";
import { linkGitHubRepositories } from "../indicators/github-link.js";
import { renderAiEngineeringStats } from "../templates/ai-engineering-stats.js";
import { contrastWarnings } from "../templates/design-tokens.js";
import { GITHUB_SNAPSHOT_FILE, INDICATORS_DIR, type GenerateOptions } from "./startup.js";

export const AI_ENGINEERING_CONFIG_FILE = "data/ai-engineering.json";
export const AI_ENGINEERING_INDICATOR_FILE = "ai-engineering-stats.svg";

/**
 * Coordinates load, compute, render and write; holds no business rules itself.
 * GitHub data comes from the snapshot file only: generating never uses the network.
 */
export async function generateAiEngineeringStats(
  rootDir: string,
  options: GenerateOptions = {},
): Promise<string> {
  try {
    const config = await loadAiEngineeringConfig(path.join(rootDir, AI_ENGINEERING_CONFIG_FILE));
    const snapshot = await loadGitHubSnapshot(path.join(rootDir, GITHUB_SNAPSHOT_FILE));
    const links = linkGitHubRepositories(config.projects, snapshot);
    links.warnings.forEach((warning) => options.warn?.(warning));

    const settings = applyAppearanceOverrides(config.settings, options);
    contrastWarnings(settings).forEach((warning) => options.warn?.(warning));

    const svg = renderAiEngineeringStats(computeAiEngineeringStats(config, links.byProjectId), {
      profile: config.profile,
      settings,
      generatorVersion: DEVTRACE_VERSION,
    });
    return await writeIndicator(
      path.join(rootDir, INDICATORS_DIR),
      options.outputFile ?? AI_ENGINEERING_INDICATOR_FILE,
      svg,
    );
  } catch (cause) {
    throw new DevTraceError("Failed to generate AI engineering statistics indicator.", { cause });
  }
}
