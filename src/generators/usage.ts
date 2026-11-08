import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DevTraceError } from "../core/result.js";
import { aggregateUsage, type UsagePeriod } from "../usage/aggregate.js";
import { collectUsage, defaultUsageFolders, type UsageFolders } from "../usage/collect.js";
import type { UsageSource } from "../usage/parsers.js";

export const USAGE_SNAPSHOT_FILE = "data/usage-snapshot.json";
export const DEFAULT_USAGE_DAYS = 30;

export interface ImportUsageOptions {
  readonly sources: readonly UsageSource[];
  /** `YYYY-MM-DD`. Defaults to `days` before `until`. */
  readonly since?: string | undefined;
  /** `YYYY-MM-DD`. Defaults to today (UTC). */
  readonly until?: string | undefined;
  readonly days?: number | undefined;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly now?: () => Date;
  /** Overrides the folders that are read. Used by tests. */
  readonly folders?: UsageFolders;
  readonly warn?: (message: string) => void;
}

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function resolvePeriod(options: ImportUsageOptions): UsagePeriod {
  const now = options.now ?? (() => new Date());
  const end = options.until ?? now().toISOString().slice(0, 10);
  const start = options.since ?? addDays(end, -((options.days ?? DEFAULT_USAGE_DAYS) - 1));
  if (start > end) {
    throw new DevTraceError(`The period ends before it starts: ${start} to ${end}.`, {
      hint: "Use --since with a date that is not after --until.",
    });
  }
  return { start, end };
}

/**
 * Reads the local logs of the chosen assistants and writes the token totals of
 * one period to `data/usage-snapshot.json`. It reads files and writes that one
 * file: it uses no network.
 */
export async function importUsage(rootDir: string, options: ImportUsageOptions): Promise<string[]> {
  const period = resolvePeriod(options);
  const folders = options.folders ?? defaultUsageFolders(options.env ?? process.env);

  const { records, files } = await collectUsage(folders, options.sources);
  if (files.CLAUDE_CODE + files.CODEX === 0) {
    throw new DevTraceError("No usage logs were found.", {
      hint: `Looked in ${folders.claude} and ${folders.codex}. Set CLAUDE_CONFIG_DIR or CODEX_HOME if the tools keep their data elsewhere.`,
    });
  }
  const snapshot = aggregateUsage(records, period, files);
  if (snapshot.models.length === 0) {
    options.warn?.(`The logs hold no usage between ${period.start} and ${period.end}.`);
  }

  const target = path.join(rootDir, USAGE_SNAPSHOT_FILE);
  try {
    await mkdir(path.dirname(target), { recursive: true });
    // Written next to its destination and renamed, so a crash cannot leave half a file.
    await writeFile(`${target}.tmp`, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    await rename(`${target}.tmp`, target);
  } catch (cause) {
    throw new DevTraceError(`Cannot write ${USAGE_SNAPSHOT_FILE}.`, { cause });
  }

  const format = (value: number): string => value.toLocaleString("en-US");
  return [
    `Usage from ${period.start} to ${period.end} written to ${USAGE_SNAPSHOT_FILE}.`,
    ...snapshot.sources.map(
      (source) => `  ${source.label}: ${String(source.files)} log file(s) read`,
    ),
    ...snapshot.models.map(
      (model) =>
        `  ${model.name}: ${format(model.inputTokens + model.outputTokens)} tokens (input ${format(model.inputTokens)}, cached ${format(model.cachedInputTokens)}, output ${format(model.outputTokens)})`,
    ),
    "Next: set settings.usageSnapshot and settings.showTokenUsage to true in data/ai-engineering.json.",
  ];
}
