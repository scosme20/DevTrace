import { z } from "zod";
import { UNAVAILABLE_BEHAVIORS, type GitHubConfig, type GitHubSnapshot } from "./github-models.js";
import type { Result } from "./result.js";
import {
  enumField,
  githubRepoFullName,
  githubUsername,
  isoDate,
  requiredText,
  validateWith,
} from "./schema-primitives.js";

// A repository entry is either `name` (owned by `username`) or `owner/name`.
const repositoryEntry = z
  .string()
  .regex(
    /^[A-Za-z0-9._-]{1,100}(\/[A-Za-z0-9._-]{1,100})?$/,
    "Invalid repository. Expected name or owner/name.",
  );

const configSchema = z.strictObject({
  version: z.literal(1, { error: "Unsupported configuration version. Expected 1." }),
  username: githubUsername,
  repositories: z
    .strictObject({
      include: z.array(repositoryEntry).default([]),
      exclude: z.array(repositoryEntry).default([]),
      includeForks: z.boolean().default(false),
      includeArchived: z.boolean().default(false),
    })
    .prefault({}),
  collect: z
    .strictObject({
      description: z.boolean().default(true),
      language: z.boolean().default(true),
      stars: z.boolean().default(true),
      forks: z.boolean().default(true),
      releases: z.boolean().default(true),
    })
    .prefault({}),
  onUnavailable: enumField("unavailable repository behavior", UNAVAILABLE_BEHAVIORS).default(
    "SKIP",
  ),
  cacheTtlMinutes: z
    .number("Invalid cacheTtlMinutes: expected a number.")
    .int("Invalid cacheTtlMinutes: expected a whole number.")
    .min(0, "Invalid cacheTtlMinutes: must not be negative.")
    .max(1440, "Invalid cacheTtlMinutes: must be at most 1440 (24 hours).")
    .default(60),
});

export function validateGitHubConfig(input: unknown): Result<GitHubConfig> {
  return validateWith(configSchema, input);
}

const releaseSchema = z.strictObject({
  tagName: requiredText("tagName").max(100),
  name: requiredText("name").max(100).optional(),
  publishedAt: isoDate,
});

const repositorySchema = z.strictObject({
  fullName: githubRepoFullName,
  name: requiredText("name").max(100),
  url: z.string().refine((value) => value.startsWith("https://github.com/"), {
    message: "Invalid repository URL. Expected https://github.com/owner/name.",
  }),
  description: requiredText("description").max(200).optional(),
  language: requiredText("language").max(50).optional(),
  stars: z.number().int().nonnegative().optional(),
  forks: z.number().int().nonnegative().optional(),
  archived: z.boolean(),
  fork: z.boolean(),
  createdAt: isoDate,
  pushedAt: isoDate.optional(),
  latestRelease: releaseSchema.optional(),
  // A snapshot can only claim observed data; anything else is rejected.
  provenance: z.literal("OBSERVED", { error: "Snapshot data must be OBSERVED." }),
});

const snapshotSchema = z
  .strictObject({
    version: z.literal(1, { error: "Unsupported snapshot version. Expected 1." }),
    source: z.literal("GitHub REST API"),
    username: githubUsername,
    fetchedAt: isoDate,
    repositories: z.array(repositorySchema),
  })
  .superRefine((snapshot, ctx) => {
    const seen = new Set<string>();
    snapshot.repositories.forEach((repository, index) => {
      const key = repository.fullName.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["repositories", index, "fullName"],
          message: `Duplicate repository detected: ${repository.fullName}.`,
        });
      }
      seen.add(key);
    });
  });

export function validateGitHubSnapshot(input: unknown): Result<GitHubSnapshot> {
  return validateWith(snapshotSchema, input);
}
