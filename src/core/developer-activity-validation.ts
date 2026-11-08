import { z } from "zod";
import { appearanceShape } from "./appearance.js";
import {
  DEFAULT_RELEASE_LIMIT,
  DEFAULT_REPOSITORY_LIMIT,
  HEATMAP_MODES,
  type DeveloperActivityConfig,
} from "./developer-activity-models.js";
import type { Result } from "./result.js";
import { requiredText, validateWith } from "./schema-primitives.js";

// Omitted profile and settings fall back to defaults; present-but-invalid
// values are still rejected, never corrected.
const profileSchema = z.strictObject({
  displayName: requiredText("displayName").max(40).default("Developer Activity"),
});

const settingsSchema = z.strictObject({
  ...appearanceShape,
  showHeatmap: z.boolean().default(true),
  heatmapMode: z.enum(HEATMAP_MODES).default("COMMITS"),
  showCommitActivity: z.boolean().default(true),
  showRepositories: z.boolean().default(true),
  showLanguages: z.boolean().default(true),
  showReleases: z.boolean().default(true),
  showLocalGit: z.boolean().default(false),
  showContributions: z.boolean().default(false),
  repositoryLimit: z.number().int().min(1).max(20).default(DEFAULT_REPOSITORY_LIMIT),
  releaseLimit: z.number().int().min(1).max(20).default(DEFAULT_RELEASE_LIMIT),
});

const configSchema = z.strictObject({
  version: z.literal(1, { error: "Unsupported configuration version. Expected 1." }),
  profile: profileSchema.prefault({}),
  settings: settingsSchema.prefault({}),
});

export function validateDeveloperActivityConfig(input: unknown): Result<DeveloperActivityConfig> {
  return validateWith(configSchema, input);
}
