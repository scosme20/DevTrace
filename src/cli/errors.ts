import path from "node:path";
import { DevTraceError } from "../core/result.js";
import { suggestFix } from "./suggestions.js";

export const EXIT = {
  /** The command did what was asked. */
  OK: 0,
  /** The command ran but failed: invalid configuration, a generation or a sync error. */
  FAILURE: 1,
  /** The command line itself is wrong: unknown command, option or value. */
  USAGE: 2,
} as const;

/** A mistake in how the command was typed. Reported with exit code 2. */
export class UsageError extends DevTraceError {
  constructor(message: string, hint?: string) {
    super(message, { hint });
    this.name = "UsageError";
  }
}

export interface FormatOptions {
  /** Show every cause and the stack trace of the underlying error. */
  readonly verbose: boolean;
  /** Paths below this directory are shown relative to it. */
  readonly rootDir: string;
}

function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  while (current !== undefined && chain.length < 10) {
    chain.push(current);
    current = current instanceof Error ? current.cause : undefined;
  }
  return chain;
}

/** Hints for the bullet lines of a validation error, shown under the line they explain. */
function withLineHints(message: string): string[] {
  return message.split("\n").flatMap((line) => {
    const bullet = /^(\s*- )(.*)$/.exec(line);
    const hint = bullet === null ? undefined : suggestFix(bullet[2] ?? "");
    return hint === undefined
      ? [line]
      : [line, `${" ".repeat((bullet?.[1] ?? "").length)}Hint: ${hint}`];
  });
}

/**
 * Turns an error into the text printed to the user. By default it shows what
 * went wrong and what to do about it, without internals; `verbose` adds the
 * whole chain of causes and the stack trace.
 */
export function formatError(error: unknown, options: FormatOptions): string {
  const relative = (text: string): string => text.replaceAll(options.rootDir + path.sep, "");
  const chain = causeChain(error);
  const lines: string[] = [];

  if (!(error instanceof DevTraceError)) {
    lines.push(`Unexpected error: ${relative(messageOf(error))}`);
    lines.push(
      "Hint: this looks like a bug in DevTrace. Run again with --verbose and include the output in a bug report.",
    );
  } else {
    const top = withLineHints(relative(error.message));
    lines.push(`Error: ${top[0] ?? ""}`, ...top.slice(1));
    // The most specific DevTrace error explains the problem; the ones above it
    // only say which operation failed.
    const specific = chain
      .filter((item): item is DevTraceError => item instanceof DevTraceError)
      .at(-1);
    if (specific !== undefined && specific !== error) {
      lines.push(...withLineHints(relative(specific.message)).map((line) => `  ${line}`));
    }
    const hint = [...chain]
      .reverse()
      .find(
        (item): item is DevTraceError => item instanceof DevTraceError && item.hint !== undefined,
      )?.hint;
    if (hint !== undefined) lines.push(`Hint: ${hint}`);
  }

  if (options.verbose) {
    for (const cause of chain.slice(1)) lines.push(`Caused by: ${relative(messageOf(cause))}`);
    const root = chain.at(-1);
    if (root instanceof Error && root.stack !== undefined) lines.push("", relative(root.stack));
  } else if (chain.length > 1) {
    lines.push("Run again with --verbose for the full details.");
  }
  return lines.join("\n");
}
