import { access } from "node:fs/promises";
import path from "node:path";
import {
  DEVELOPER_ACTIVITY_CONFIG_FILE,
  generateDeveloperActivity,
} from "../generators/developer-activity.js";
import { generateAiEngineeringStats } from "../generators/ai-engineering.js";
import { syncGitHubSnapshot } from "../generators/github.js";
import { generateStartupStats, type GenerateOptions } from "../generators/startup.js";
import { formatReport } from "../validate/report.js";
import { validateProject, type ValidationTarget } from "../validate/index.js";
import type { GenerateTarget, Invocation, ValidateTarget } from "./args.js";
import { EXIT, formatError } from "./errors.js";
import { helpFor } from "./help.js";
import type { CliIo } from "./io.js";
import { initProject } from "./init.js";
import { DEVTRACE_VERSION } from "../core/version.js";
import { importUsage } from "../generators/usage.js";
import { importGit } from "../generators/git.js";
import { buildSnippet, indicatorFiles } from "./snippet.js";
import { UsageError } from "./errors.js";
import type { UsageSource } from "../usage/parsers.js";

type GenerateInvocation = Extract<Invocation, { kind: "generate" }>;

const GENERATORS = {
  startup: {
    start: "Generating startup statistics indicator...",
    done: "Startup statistics indicator written to",
    run: (rootDir: string, options: GenerateOptions) => generateStartupStats(rootDir, options),
  },
  ai: {
    start: "Generating AI engineering statistics indicator...",
    done: "AI engineering statistics indicator written to",
    run: (rootDir: string, options: GenerateOptions) =>
      generateAiEngineeringStats(rootDir, options),
  },
  activity: {
    start: "Generating developer activity indicator...",
    done: "Developer activity indicator written to",
    run: (rootDir: string, options: GenerateOptions) => generateDeveloperActivity(rootDir, options),
  },
} as const;

const relative = (io: CliIo, text: string): string => text.replaceAll(io.rootDir + path.sep, "");

export function runHelp(invocation: Extract<Invocation, { kind: "help" }>, io: CliIo): number {
  io.out(helpFor(invocation.topic));
  return EXIT.OK;
}

export function runVersion(io: CliIo): number {
  io.out(DEVTRACE_VERSION);
  return EXIT.OK;
}

/** The developer activity indicator is optional: "all" includes it only when it is configured. */
async function activityConfigured(rootDir: string): Promise<boolean> {
  try {
    await access(path.join(rootDir, DEVELOPER_ACTIVITY_CONFIG_FILE));
    return true;
  } catch {
    return false;
  }
}

export async function runGenerate(
  invocation: GenerateInvocation,
  io: CliIo,
  verbose: boolean,
): Promise<number> {
  const targets: readonly (keyof typeof GENERATORS)[] =
    invocation.target === "all"
      ? [
          "startup",
          "ai",
          ...((await activityConfigured(io.rootDir)) ? (["activity"] as const) : []),
        ]
      : [invocation.target];
  let failures = 0;
  for (const target of targets) {
    const generator = GENERATORS[target];
    io.out(generator.start);
    try {
      const file = await generator.run(io.rootDir, {
        warn: (message) => {
          io.err(`Warning: ${message}`);
        },
        theme: invocation.theme,
        layout: invocation.layout,
        outputFile: invocation.output,
      });
      io.out(`${generator.done} ${relative(io, file)}`);
    } catch (error) {
      // Keep going: one indicator failing does not stop the other from being written.
      failures += 1;
      io.err(formatError(error, { verbose, rootDir: io.rootDir }));
    }
  }
  return failures === 0 ? EXIT.OK : EXIT.FAILURE;
}

export async function runSync(force: boolean, io: CliIo): Promise<number> {
  io.out("Syncing GitHub data...");
  const message = await syncGitHubSnapshot(io.rootDir, {
    force,
    env: io.env,
    warn: (warning) => {
      io.err(`Warning: ${warning}`);
    },
  });
  io.out(relative(io, message));
  return EXIT.OK;
}

const VALIDATE_TARGETS: Readonly<Record<ValidateTarget, readonly ValidationTarget[]>> = {
  startup: ["startup"],
  ai: ["ai"],
  activity: ["activity"],
  github: ["github"],
  all: ["startup", "ai", "activity", "github"],
};

export async function runValidate(target: ValidateTarget, io: CliIo): Promise<number> {
  const report = await validateProject(io.rootDir, VALIDATE_TARGETS[target]);
  io.out("Validating the configuration (nothing is written).");
  io.out("");
  for (const line of formatReport(report)) io.out(line);
  return report.errors === 0 ? EXIT.OK : EXIT.FAILURE;
}

export async function runInit(
  invocation: Extract<Invocation, { kind: "init" }>,
  io: CliIo,
): Promise<number> {
  const { created, skipped } = await initProject(io.rootDir, invocation);
  for (const file of created) io.out(`Created ${file}`);
  for (const file of skipped) io.out(`Skipped ${file} (already exists, left as it is)`);
  if (created.length > 0) {
    io.out('Next: edit the files, run "devtrace validate", then "devtrace generate".');
  } else {
    io.out("Nothing to do: every starter file already exists.");
  }
  return EXIT.OK;
}

export type { GenerateTarget };

const USAGE_SOURCE_CHOICES: Readonly<Record<string, readonly UsageSource[]>> = {
  CLAUDE: ["CLAUDE_CODE"],
  CODEX: ["CODEX"],
  ALL: ["CLAUDE_CODE", "CODEX"],
};

export async function runImportUsage(
  invocation: Extract<Invocation, { kind: "import" }>,
  io: CliIo,
): Promise<number> {
  io.out("Reading local usage logs (nothing leaves this machine)...");
  const lines = await importUsage(io.rootDir, {
    sources: USAGE_SOURCE_CHOICES[invocation.source] ?? [],
    days: invocation.days,
    since: invocation.since,
    until: invocation.until,
    env: io.env,
    warn: (message) => {
      io.err(`Warning: ${message}`);
    },
  });
  for (const line of lines) io.out(line);
  return EXIT.OK;
}

export async function runImportGit(
  invocation: Extract<Invocation, { kind: "importGit" }>,
  io: CliIo,
): Promise<number> {
  io.out("Reading the local repository (nothing leaves this machine)...");
  const lines = await importGit(io.rootDir, {
    repositoryPath: path.resolve(io.rootDir, invocation.repositoryPath),
    label: invocation.label,
    author: invocation.author,
  });
  for (const line of lines) io.out(line);
  return EXIT.OK;
}

/** Prints the Markdown that shows the generated SVGs. It writes nothing. */
export async function runSnippet(
  invocation: Extract<Invocation, { kind: "snippet" }>,
  io: CliIo,
): Promise<number> {
  const repository = invocation.repository ?? io.env["GITHUB_REPOSITORY"];
  if (repository === undefined || repository === "") {
    throw new UsageError(
      "Missing --repo.",
      "Use --repo owner/name, the repository that holds the generated SVGs.",
    );
  }
  const lines = buildSnippet({
    repository,
    branch: invocation.branch,
    pair: invocation.pair,
    files: await indicatorFiles(io.rootDir),
  });
  for (const line of lines) io.out(line);
  return EXIT.OK;
}
