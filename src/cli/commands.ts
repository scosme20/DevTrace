import path from "node:path";
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

export async function runGenerate(
  invocation: GenerateInvocation,
  io: CliIo,
  verbose: boolean,
): Promise<number> {
  const targets: readonly (keyof typeof GENERATORS)[] =
    invocation.target === "all" ? ["startup", "ai"] : [invocation.target];
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
  github: ["github"],
  all: ["startup", "ai", "github"],
};

export async function runValidate(target: ValidateTarget, io: CliIo): Promise<number> {
  const report = await validateProject(io.rootDir, VALIDATE_TARGETS[target]);
  io.out("Validating the configuration (nothing is written).");
  io.out("");
  for (const line of formatReport(report)) io.out(line);
  return report.errors === 0 ? EXIT.OK : EXIT.FAILURE;
}

export async function runInit(io: CliIo): Promise<number> {
  const { created, skipped } = await initProject(io.rootDir);
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
