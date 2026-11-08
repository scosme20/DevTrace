import { parseArgs } from "./args.js";
import {
  runGenerate,
  runImportUsage,
  runHelp,
  runInit,
  runSync,
  runValidate,
  runVersion,
} from "./commands.js";
import { EXIT, UsageError, formatError } from "./errors.js";
import type { CliIo } from "./io.js";

/**
 * Runs the command line and returns the exit code. It never throws: every
 * failure is turned into a message and a code, so callers only need to exit.
 */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  let verbose = argv.includes("--verbose");
  try {
    const parsed = parseArgs(argv);
    verbose = parsed.verbose;
    const { invocation } = parsed;
    switch (invocation.kind) {
      case "help":
        return runHelp(invocation, io);
      case "version":
        return runVersion(io);
      case "init":
        return await runInit(io);
      case "validate":
        return await runValidate(invocation.target, io);
      case "sync":
        return await runSync(invocation.force, io);
      case "generate":
        return await runGenerate(invocation, io, verbose);
      case "import":
        return await runImportUsage(invocation, io);
    }
  } catch (error) {
    io.err(formatError(error, { verbose, rootDir: io.rootDir }));
    if (error instanceof UsageError) {
      io.err('Run "devtrace --help" for usage.');
      return EXIT.USAGE;
    }
    return EXIT.FAILURE;
  }
}
