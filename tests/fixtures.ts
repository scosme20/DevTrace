import type { StartupConfig } from "../src/core/models.js";
import { validateStartupConfig } from "../src/core/validation.js";

export function makeProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "sample-app",
    name: "Sample App",
    description: "A sample project.",
    category: "SaaS",
    lifecycleStage: "MVP",
    status: "ACTIVE",
    visibility: "PUBLIC",
    dataSource: "DECLARED",
    createdAt: "2026-01-01",
    updatedAt: "2026-02-01",
    ...overrides,
  };
}

export function makeRawConfig(
  projects: unknown[] = [makeProject()],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { version: 1, projects, ...overrides };
}

/** Builds a validated config; throws with the validation errors if the input is invalid. */
export function makeConfig(
  projects: unknown[] = [makeProject()],
  overrides: Record<string, unknown> = {},
): StartupConfig {
  const result = validateStartupConfig(makeRawConfig(projects, overrides));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.value;
}
