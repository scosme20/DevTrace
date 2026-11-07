import { z } from "zod";
import { appearanceShape } from "./appearance.js";
import {
  ACTIVITY_TYPES,
  AI_INVOLVEMENTS,
  AI_TECHNIQUES,
  PROFICIENCY_LEVELS,
  SKILL_CATEGORIES,
  TOKEN_METRIC_KINDS,
  TOOL_CATEGORIES,
  USAGE_TYPES,
  type AiEngineeringConfig,
} from "./ai-engineering-models.js";
import { DATA_SOURCES, PROJECT_STATUSES, VISIBILITIES } from "./models.js";
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

// Every entity carries its own visibility and provenance. Both are required so
// nothing becomes public, or looks verified, by omission.
const common = {
  id: kebabCaseId,
  visibility: enumField("visibility", VISIBILITIES),
  provenance: enumField("provenance", DATA_SOURCES),
};

const toolSchema = z.strictObject({
  ...common,
  name: requiredText("name").max(60),
  provider: requiredText("provider").max(60),
  category: enumField("tool category", TOOL_CATEGORIES),
  usageType: enumField("usage type", USAGE_TYPES).optional(),
  experienceLevel: enumField("experience level", PROFICIENCY_LEVELS).optional(),
});

const modelSchema = z.strictObject({
  ...common,
  name: requiredText("name").max(60),
  provider: requiredText("provider").max(60),
  modelFamily: requiredText("modelFamily").max(60),
  usageContext: requiredText("usageContext").max(80).optional(),
});

const skillSchema = z.strictObject({
  ...common,
  name: requiredText("name").max(60),
  category: enumField("skill category", SKILL_CATEGORIES),
  proficiencyLevel: enumField("proficiency level", PROFICIENCY_LEVELS),
  description: requiredText("description").max(200).optional(),
});

const projectSchema = z.strictObject({
  ...common,
  name: requiredText("name").max(60),
  description: requiredText("description").max(200),
  category: requiredText("category").max(60),
  status: enumField("project status", PROJECT_STATUSES),
  techniques: z.array(enumField("technique", AI_TECHNIQUES)).default([]),
  tools: z.array(kebabCaseId).default([]),
  repositoryUrl: httpUrl.optional(),
  websiteUrl: httpUrl.optional(),
  githubRepository: githubRepoFullName.optional(),
});

const activitySchema = z.strictObject({
  ...common,
  activityType: enumField("activity type", ACTIVITY_TYPES),
  involvement: enumField("AI involvement", AI_INVOLVEMENTS),
  description: requiredText("description").max(200),
  projectId: kebabCaseId.optional(),
  date: isoDate,
});

const periodSchema = z
  .strictObject({ start: isoDate, end: isoDate })
  .refine((period) => Date.parse(period.end) >= Date.parse(period.start), {
    message: "Measurement period ends before it starts.",
  });

const tokenUsageSchema = z
  .strictObject({
    ...common,
    modelId: kebabCaseId,
    kind: enumField("token metric kind", TOKEN_METRIC_KINDS),
    value: z
      .number("Invalid value: expected a number.")
      .nonnegative("Invalid value: must not be negative."),
    unit: requiredText("unit"),
    period: periodSchema,
    source: requiredText("source").max(120).optional(),
  })
  .superRefine((metric, ctx) => {
    if (metric.kind === "ESTIMATED_COST") {
      if (!/^[A-Z]{3}$/.test(metric.unit)) {
        ctx.addIssue({
          code: "custom",
          path: ["unit"],
          message: "Invalid cost unit: expected an ISO 4217 currency code such as USD.",
        });
      }
    } else {
      if (metric.unit !== "TOKENS") {
        ctx.addIssue({
          code: "custom",
          path: ["unit"],
          message: `Invalid unit: ${metric.kind} metrics must use TOKENS.`,
        });
      }
      if (!Number.isInteger(metric.value)) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "Invalid value: token counts must be whole numbers.",
        });
      }
    }
    if (metric.provenance === "OBSERVED" && metric.source === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["source"],
        message: "OBSERVED metrics must name a source.",
      });
    }
  });

// Omitted profile and settings fall back to defaults; present-but-invalid
// values are still rejected, never corrected.
const profileSchema = z.strictObject({
  displayName: requiredText("displayName").max(40).default("AI Engineering Profile"),
});

const settingsSchema = z.strictObject({
  ...appearanceShape,
  showTools: z.boolean().default(true),
  showModels: z.boolean().default(true),
  showSkills: z.boolean().default(true),
  showProjects: z.boolean().default(true),
  showActivity: z.boolean().default(false),
  showTokenUsage: z.boolean().default(false),
  showCost: z.boolean().default(false),
  showLinks: z.boolean().default(true),
  dashboard: z.boolean().optional(),
});

const configSchema = z
  .strictObject({
    version: z.literal(1, { error: "Unsupported configuration version. Expected 1." }),
    profile: profileSchema.prefault({}),
    settings: settingsSchema.prefault({}),
    tools: z.array(toolSchema).default([]),
    models: z.array(modelSchema).default([]),
    skills: z.array(skillSchema).default([]),
    projects: z.array(projectSchema).default([]),
    activities: z.array(activitySchema).default([]),
    tokenUsage: z.array(tokenUsageSchema).default([]),
  })
  .superRefine((config, ctx) => {
    const collections = [
      ["tools", "tool", config.tools],
      ["models", "model", config.models],
      ["skills", "skill", config.skills],
      ["projects", "project", config.projects],
      ["activities", "activity", config.activities],
      ["tokenUsage", "token usage", config.tokenUsage],
    ] as const;
    for (const [key, noun, items] of collections) {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (seen.has(item.id)) {
          ctx.addIssue({
            code: "custom",
            path: [key, index, "id"],
            message: `Duplicate ${noun} ID detected: ${item.id}.`,
          });
        }
        seen.add(item.id);
      });
    }

    const toolIds = new Set(config.tools.map((tool) => tool.id));
    config.projects.forEach((project, projectIndex) => {
      project.tools.forEach((toolId, toolIndex) => {
        if (!toolIds.has(toolId)) {
          ctx.addIssue({
            code: "custom",
            path: ["projects", projectIndex, "tools", toolIndex],
            message: `Unknown tool ID referenced: ${toolId}.`,
          });
        }
      });
    });

    const projectIds = new Set(config.projects.map((project) => project.id));
    config.activities.forEach((activity, index) => {
      if (activity.projectId !== undefined && !projectIds.has(activity.projectId)) {
        ctx.addIssue({
          code: "custom",
          path: ["activities", index, "projectId"],
          message: `Unknown project ID referenced: ${activity.projectId}.`,
        });
      }
    });

    const modelIds = new Set(config.models.map((model) => model.id));
    config.tokenUsage.forEach((metric, index) => {
      if (!modelIds.has(metric.modelId)) {
        ctx.addIssue({
          code: "custom",
          path: ["tokenUsage", index, "modelId"],
          message: `Unknown model ID referenced: ${metric.modelId}.`,
        });
      }
    });
  });

export function validateAiEngineeringConfig(input: unknown): Result<AiEngineeringConfig> {
  return validateWith(configSchema, input);
}
