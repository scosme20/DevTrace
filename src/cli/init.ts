import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DevTraceError } from "../core/result.js";
import { AI_ENGINEERING_CONFIG_FILE } from "../generators/ai-engineering.js";
import { STARTUP_CONFIG_FILE } from "../generators/startup.js";

// The starter files are valid, hold no projects and invent no data. They show
// the settings that exist so they are easy to find; every one is optional.

const STARTUP_TEMPLATE = {
  version: 1,
  profile: { displayName: "Developer Portfolio" },
  settings: {
    theme: "DARK",
    showProjectList: true,
    showLifecycleDistribution: true,
    showLinks: true,
  },
  projects: [],
};

const AI_ENGINEERING_TEMPLATE = {
  version: 1,
  profile: { displayName: "AI Engineering Profile" },
  settings: {
    theme: "DARK",
    showTools: true,
    showModels: true,
    showSkills: true,
    showProjects: true,
    showActivity: false,
    showTokenUsage: false,
    showCost: false,
    showLinks: true,
  },
  tools: [],
  models: [],
  skills: [],
  projects: [],
  activities: [],
  tokenUsage: [],
};

export const INIT_FILES: readonly { readonly file: string; readonly content: string }[] = [
  { file: STARTUP_CONFIG_FILE, content: `${JSON.stringify(STARTUP_TEMPLATE, null, 2)}\n` },
  {
    file: AI_ENGINEERING_CONFIG_FILE,
    content: `${JSON.stringify(AI_ENGINEERING_TEMPLATE, null, 2)}\n`,
  },
];

export interface InitResult {
  readonly created: readonly string[];
  readonly skipped: readonly string[];
}

/** Creates the starter files that do not exist yet. An existing file is never touched. */
export async function initProject(rootDir: string): Promise<InitResult> {
  const created: string[] = [];
  const skipped: string[] = [];
  for (const { file, content } of INIT_FILES) {
    const target = path.join(rootDir, file);
    try {
      await mkdir(path.dirname(target), { recursive: true });
      // "wx" fails if the file exists, so this cannot overwrite anything.
      await writeFile(target, content, { encoding: "utf8", flag: "wx" });
      created.push(file);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        skipped.push(file);
      } else {
        throw new DevTraceError(`Cannot create ${file}.`, { cause: error });
      }
    }
  }
  return { created, skipped };
}
