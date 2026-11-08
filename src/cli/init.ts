import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DevTraceError } from "../core/result.js";
import { AI_ENGINEERING_CONFIG_FILE } from "../generators/ai-engineering.js";
import { STARTUP_CONFIG_FILE } from "../generators/startup.js";
import { DEVELOPER_ACTIVITY_CONFIG_FILE } from "../generators/developer-activity.js";
import { GITHUB_CONFIG_FILE } from "../generators/github.js";
import { DEVTRACE_VERSION } from "../core/version.js";
import type { Theme } from "../core/models.js";

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

/** Answers that fill the starter files. Every one is optional. */
export interface InitOptions {
  /** Shown on the indicators. */
  readonly name?: string | undefined;
  /** A GitHub username: also creates data/github.json and data/developer-activity.json. */
  readonly github?: string | undefined;
  readonly theme?: Theme | undefined;
  /** Also write a workflow that runs the DevTrace action every day. */
  readonly workflow?: boolean | undefined;
}

const WORKFLOW_FILE = ".github/workflows/update-indicators.yml";

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function workflowTemplate(): string {
  return `name: Update indicators

on:
  workflow_dispatch:
  schedule:
    - cron: "23 4 * * *"

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: scosme20/DevTrace@v${DEVTRACE_VERSION}
`;
}

/** The starter files, filled with the answers that were given. */
export function initFiles(
  options: InitOptions = {},
): readonly { readonly file: string; readonly content: string }[] {
  const settings = { ...(options.theme === undefined ? {} : { theme: options.theme }) };
  const startup = {
    ...STARTUP_TEMPLATE,
    profile: { displayName: options.name ?? STARTUP_TEMPLATE.profile.displayName },
    settings: { ...STARTUP_TEMPLATE.settings, ...settings },
  };
  const ai = {
    ...AI_ENGINEERING_TEMPLATE,
    profile: { displayName: options.name ?? AI_ENGINEERING_TEMPLATE.profile.displayName },
    settings: { ...AI_ENGINEERING_TEMPLATE.settings, ...settings },
  };
  return [
    { file: STARTUP_CONFIG_FILE, content: json(startup) },
    { file: AI_ENGINEERING_CONFIG_FILE, content: json(ai) },
    ...(options.github === undefined
      ? []
      : [
          { file: GITHUB_CONFIG_FILE, content: json({ version: 1, username: options.github }) },
          {
            file: DEVELOPER_ACTIVITY_CONFIG_FILE,
            content: json({
              version: 1,
              profile: { displayName: options.name ?? "Developer Activity" },
              settings,
            }),
          },
        ]),
    ...(options.workflow === true ? [{ file: WORKFLOW_FILE, content: workflowTemplate() }] : []),
  ];
}

export const INIT_FILES = initFiles();

export interface InitResult {
  readonly created: readonly string[];
  readonly skipped: readonly string[];
}

/** Creates the starter files that do not exist yet. An existing file is never touched. */
export async function initProject(rootDir: string, options: InitOptions = {}): Promise<InitResult> {
  const created: string[] = [];
  const skipped: string[] = [];
  for (const { file, content } of initFiles(options)) {
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
