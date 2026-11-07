import { readFile, stat } from "node:fs/promises";
import type { AiEngineeringConfig } from "./ai-engineering-models.js";
import { validateAiEngineeringConfig } from "./ai-engineering-validation.js";
import type { GitHubConfig, GitHubSnapshot } from "./github-models.js";
import { validateGitHubConfig, validateGitHubSnapshot } from "./github-validation.js";
import type { StartupConfig } from "./models.js";
import { DevTraceError, type Result } from "./result.js";
import { validateStartupConfig } from "./validation.js";

export type ConfigRead =
  | { readonly ok: true; readonly json: unknown }
  | {
      readonly ok: false;
      readonly reason: "missing" | "unreadable" | "invalid-json";
      readonly message: string;
      readonly cause: unknown;
    };

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Reads and parses a JSON file, describing what went wrong instead of throwing. */
export async function readConfigJson(filePath: string): Promise<ConfigRead> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (cause) {
    return isNotFound(cause)
      ? {
          ok: false,
          reason: "missing",
          message: `Configuration file not found: ${filePath}`,
          cause,
        }
      : {
          ok: false,
          reason: "unreadable",
          message: `Cannot read configuration file: ${filePath}`,
          cause,
        };
  }
  try {
    return { ok: true, json: JSON.parse(raw) as unknown };
  } catch (cause) {
    const detail = cause instanceof Error ? ` (${cause.message})` : "";
    return {
      ok: false,
      reason: "invalid-json",
      message: `Configuration file is not valid JSON: ${filePath}${detail}`,
      cause,
    };
  }
}

const READ_HINTS: Record<"missing" | "unreadable" | "invalid-json", string | undefined> = {
  missing:
    'Run "devtrace init" to create the configuration files, or copy one from the examples directory.',
  unreadable: "Check that the file is readable and is not a directory.",
  "invalid-json":
    "Look for a trailing comma, a comment, a missing quote or a missing bracket near the position above.",
};

async function readConfigFile<T>(
  filePath: string,
  validate: (input: unknown) => Result<T>,
  name: string,
): Promise<T> {
  const read = await readConfigJson(filePath);
  if (!read.ok) {
    throw new DevTraceError(read.message, { cause: read.cause, hint: READ_HINTS[read.reason] });
  }

  const result = validate(read.json);
  if (!result.ok) {
    const details = result.errors.map((error) => `  - ${error}`).join("\n");
    throw new DevTraceError(`Invalid ${name} configuration in ${filePath}:\n${details}`);
  }
  return result.value;
}

async function loadConfig<T>(
  filePath: string,
  validate: (input: unknown) => Result<T>,
  name: string,
): Promise<T> {
  try {
    return await readConfigFile(filePath, validate, name);
  } catch (cause) {
    throw new DevTraceError(`Failed to load ${name} configuration.`, { cause });
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw new DevTraceError(`Cannot access file: ${filePath}`, { cause: error });
  }
}

/** For optional files: a missing file is `undefined`, an invalid one is still an error. */
async function loadOptionalConfig<T>(
  filePath: string,
  validate: (input: unknown) => Result<T>,
  name: string,
): Promise<T | undefined> {
  return (await exists(filePath)) ? loadConfig(filePath, validate, name) : undefined;
}

export function loadStartupConfig(filePath: string): Promise<StartupConfig> {
  return loadConfig(filePath, validateStartupConfig, "startup");
}

export function loadAiEngineeringConfig(filePath: string): Promise<AiEngineeringConfig> {
  return loadConfig(filePath, validateAiEngineeringConfig, "AI engineering");
}

/** `undefined` means the GitHub integration is not configured. */
export function loadGitHubConfig(filePath: string): Promise<GitHubConfig | undefined> {
  return loadOptionalConfig(filePath, validateGitHubConfig, "GitHub");
}

/** `undefined` means no GitHub data has been synced yet. */
export function loadGitHubSnapshot(filePath: string): Promise<GitHubSnapshot | undefined> {
  return loadOptionalConfig(filePath, validateGitHubSnapshot, "GitHub snapshot");
}
