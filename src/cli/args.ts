import { LAYOUTS, type Layout } from "../core/appearance.js";
import { THEMES, type Theme } from "../core/models.js";
import { UsageError } from "./errors.js";
import { closestMatch } from "./suggestions.js";

export const GENERATE_TARGETS = ["startup", "ai", "all"] as const;
export const VALIDATE_TARGETS = ["startup", "ai", "github", "all"] as const;
export const COMMAND_NAMES = ["init", "validate", "generate", "sync", "help"] as const;

export type GenerateTarget = (typeof GENERATE_TARGETS)[number];
export type ValidateTarget = (typeof VALIDATE_TARGETS)[number];
export type CommandName = (typeof COMMAND_NAMES)[number];

export type Invocation =
  | { readonly kind: "help"; readonly topic?: CommandName | undefined }
  | { readonly kind: "version" }
  | {
      readonly kind: "generate";
      readonly target: GenerateTarget;
      readonly theme?: Theme | undefined;
      readonly layout?: Layout | undefined;
      /** A file name inside `public/indicators`. */
      readonly output?: string | undefined;
    }
  | { readonly kind: "sync"; readonly force: boolean }
  | { readonly kind: "validate"; readonly target: ValidateTarget }
  | { readonly kind: "init" };

export interface ParsedArgs {
  readonly invocation: Invocation;
  readonly verbose: boolean;
}

// Names used before 0.6.0. They keep working, and are not advertised.
const LEGACY_ALIASES = { startup: "generate startup", ai: "generate ai", github: "sync" } as const;

const OPTIONS_BY_COMMAND: Readonly<Record<CommandName, readonly string[]>> = {
  init: [],
  validate: [],
  generate: ["--theme", "--layout", "--output"],
  sync: ["--force"],
  help: [],
};

const VALUE_OPTIONS = ["--theme", "--layout", "--output"];
const FLAG_OPTIONS = ["--force"];
const INDICATORS_PREFIX = "public/indicators/";

/**
 * Accepts a file name or a path inside `public/indicators`. Anything that
 * points elsewhere is refused; the name itself is checked again when the file
 * is written.
 */
export function parseOutputName(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  const name = normalized.startsWith(INDICATORS_PREFIX)
    ? normalized.slice(INDICATORS_PREFIX.length)
    : normalized;
  if (name.includes("/") || name === "") {
    throw new UsageError(
      `Invalid --output: "${value}". Use a file name, or a path inside ${INDICATORS_PREFIX}.`,
    );
  }
  return name;
}

function choice<T extends string>(option: string, value: string, allowed: readonly T[]): T {
  const upper = value.toUpperCase();
  const match = allowed.find((candidate) => candidate === upper);
  if (match === undefined) {
    throw new UsageError(
      `Invalid ${option} value: "${value}". Expected one of: ${allowed.join(", ")}.`,
    );
  }
  return match;
}

function target<T extends string>(
  command: string,
  value: string | undefined,
  allowed: readonly T[],
): T {
  if (value === undefined) return "all" as T;
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new UsageError(
      `Invalid target "${value}" for "${command}". Expected one of: ${allowed.join(", ")}.`,
    );
  }
  return match;
}

interface Tokens {
  readonly positionals: string[];
  readonly options: Map<string, string | true>;
  readonly help: boolean;
  readonly version: boolean;
  readonly verbose: boolean;
}

function tokenize(argv: readonly string[]): Tokens {
  const positionals: string[] = [];
  const options = new Map<string, string | true>();
  let help = false;
  let version = false;
  let verbose = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--version" || arg === "-v") version = true;
    else if (arg === "--verbose") verbose = true;
    else if (arg.startsWith("-") && arg !== "-") {
      const [name = "", inlineValue] = arg.split(/=(.*)/s, 2);
      if (FLAG_OPTIONS.includes(name)) {
        if (inlineValue !== undefined)
          throw new UsageError(`Option ${name} does not take a value.`);
        options.set(name, true);
      } else if (VALUE_OPTIONS.includes(name)) {
        let value = inlineValue;
        if (value === undefined) {
          value = argv[index + 1];
          index += 1;
        }
        if (value === undefined || value === "" || value.startsWith("-")) {
          throw new UsageError(`Option ${name} requires a value.`);
        }
        options.set(name, value);
      } else {
        throw new UsageError(
          `Unknown option: "${arg}".`,
          'Run "devtrace help <command>" to see the options of a command.',
        );
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, options, help, version, verbose };
}

function resolveCommand(word: string): { command: CommandName; implied: string[] } {
  if (Object.hasOwn(LEGACY_ALIASES, word)) {
    const [command = "help", ...implied] =
      LEGACY_ALIASES[word as keyof typeof LEGACY_ALIASES].split(" ");
    return { command: command as CommandName, implied };
  }
  if ((COMMAND_NAMES as readonly string[]).includes(word)) {
    return { command: word as CommandName, implied: [] };
  }
  const close = closestMatch(word, COMMAND_NAMES);
  throw new UsageError(
    `Unknown command: "${word}".`,
    close === undefined ? undefined : `Did you mean "${close}"?`,
  );
}

/** Parses the command line. Throws a `UsageError` for anything that is not valid. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const tokens = tokenize(argv);
  const { verbose } = tokens;
  const done = (invocation: Invocation): ParsedArgs => ({ invocation, verbose });

  if (tokens.version) return done({ kind: "version" });
  const [word, ...rest] = tokens.positionals;
  if (word === undefined) {
    if (tokens.options.size > 0) {
      throw new UsageError(
        "Missing command.",
        'Run "devtrace --help" to see the available commands.',
      );
    }
    return done({ kind: "help" });
  }

  const { command, implied } = resolveCommand(word);
  if (tokens.help) return done({ kind: "help", topic: command });

  for (const name of tokens.options.keys()) {
    const allowed = OPTIONS_BY_COMMAND[command];
    if (!allowed.includes(name)) {
      throw new UsageError(
        `Option ${name} does not apply to "${command}".`,
        allowed.length === 0
          ? `"${command}" takes no options.`
          : `"${command}" accepts: ${allowed.join(", ")}.`,
      );
    }
  }

  const positionals = [...implied, ...rest];
  const expectNoMore = (used: number): void => {
    const extra = positionals[used];
    if (extra !== undefined) {
      throw new UsageError(
        `Unexpected argument: "${extra}".`,
        `Run "devtrace help ${command}" for usage.`,
      );
    }
  };

  switch (command) {
    case "help": {
      const topic = positionals[0];
      expectNoMore(1);
      if (topic === undefined) return done({ kind: "help" });
      return done({ kind: "help", topic: resolveCommand(topic).command });
    }
    case "init":
      expectNoMore(0);
      return done({ kind: "init" });
    case "sync":
      expectNoMore(0);
      return done({ kind: "sync", force: tokens.options.has("--force") });
    case "validate": {
      const chosen = target("validate", positionals[0], VALIDATE_TARGETS);
      expectNoMore(1);
      return done({ kind: "validate", target: chosen });
    }
    case "generate": {
      const chosen = target("generate", positionals[0], GENERATE_TARGETS);
      expectNoMore(1);
      const output = tokens.options.get("--output");
      if (typeof output === "string" && chosen === "all") {
        throw new UsageError(
          '--output cannot be used with the target "all": it writes two files.',
          "Generate one indicator at a time to choose its file name.",
        );
      }
      const theme = tokens.options.get("--theme");
      const layout = tokens.options.get("--layout");
      return done({
        kind: "generate",
        target: chosen,
        theme: typeof theme === "string" ? choice("--theme", theme, THEMES) : undefined,
        layout: typeof layout === "string" ? choice("--layout", layout, LAYOUTS) : undefined,
        output: typeof output === "string" ? parseOutputName(output) : undefined,
      });
    }
  }
}
