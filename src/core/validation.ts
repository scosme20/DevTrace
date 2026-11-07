import { z } from "zod";
import { appearanceShape } from "./appearance.js";
import {
  DATA_SOURCES,
  LIFECYCLE_STAGES,
  PROJECT_STATUSES,
  VISIBILITIES,
  type StartupConfig,
} from "./models.js";
import type { Result } from "./result.js";
import {
  enumField,
  githubRepoFullName,
  httpUrl,
  isoDate,
  kebabCaseId,
  requiredText,
  validateWith,
} from "./schema-primitives.js";

const projectSchema = z
  .strictObject({
    id: kebabCaseId,
    name: requiredText("name"),
    description: requiredText("description"),
    category: requiredText("category"),
    lifecycleStage: enumField("lifecycle stage", LIFECYCLE_STAGES),
    status: enumField("operational status", PROJECT_STATUSES),
    visibility: enumField("visibility", VISIBILITIES),
    dataSource: enumField("data source", DATA_SOURCES),
    repositoryUrl: httpUrl.optional(),
    websiteUrl: httpUrl.optional(),
    githubRepository: githubRepoFullName.optional(),
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .superRefine((project, ctx) => {
    if (Date.parse(project.updatedAt) < Date.parse(project.createdAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt is before createdAt.",
      });
    }
    if (project.lifecycleStage === "ARCHIVED" && project.status === "ACTIVE") {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "An ARCHIVED project cannot have the ACTIVE status.",
      });
    }
  });

// Omitted profile and settings fall back to defaults; present-but-invalid
// values are still rejected, never corrected.
const profileSchema = z.strictObject({
  displayName: requiredText("displayName").max(40).default("Developer Portfolio"),
});

const settingsSchema = z.strictObject({
  ...appearanceShape,
  showProjectList: z.boolean().default(true),
  showLifecycleDistribution: z.boolean().default(true),
  showLinks: z.boolean().default(true),
});

const configSchema = z
  .strictObject({
    version: z.literal(1, { error: "Unsupported configuration version. Expected 1." }),
    profile: profileSchema.prefault({}),
    settings: settingsSchema.prefault({}),
    projects: z.array(projectSchema),
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>();
    config.projects.forEach((project, index) => {
      if (seen.has(project.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["projects", index, "id"],
          message: `Duplicate project ID detected: ${project.id}.`,
        });
      }
      seen.add(project.id);
    });
  });

export function validateStartupConfig(input: unknown): Result<StartupConfig> {
  return validateWith(configSchema, input);
}
