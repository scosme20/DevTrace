import { readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  SOURCE_LABELS,
  parseClaudeLog,
  parseCodexLog,
  type UsageRecord,
  type UsageSource,
} from "./parsers.js";

// Finds and reads the local logs. Only files with the .jsonl extension inside
// the two known folders are read, and nothing is written.

export interface UsageFolders {
  /** `projects` folder of Claude Code. */
  readonly claude: string;
  /** `sessions` folder of Codex. */
  readonly codex: string;
}

/**
 * The folders the tools use. `CLAUDE_CONFIG_DIR` and `CODEX_HOME` are the
 * variables the tools themselves honor; without them the home directory is used.
 */
export function defaultUsageFolders(
  env: Readonly<Record<string, string | undefined>>,
  home: string = os.homedir(),
): UsageFolders {
  const claudeBase = env["CLAUDE_CONFIG_DIR"]?.trim();
  const codexBase = env["CODEX_HOME"]?.trim();
  return {
    claude: path.join(
      claudeBase === undefined || claudeBase === "" ? path.join(home, ".claude") : claudeBase,
      "projects",
    ),
    codex: path.join(
      codexBase === undefined || codexBase === "" ? path.join(home, ".codex") : codexBase,
      "sessions",
    ),
  };
}

async function logFiles(folder: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      // A tool that is not installed has no folder: that is not a problem.
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(entryPath);
    }
  }
  await walk(folder);
  return found.sort();
}

export interface CollectedUsage {
  readonly records: readonly UsageRecord[];
  /** How many log files each source contributed. */
  readonly files: Readonly<Record<UsageSource, number>>;
}

export async function collectUsage(
  folders: UsageFolders,
  sources: readonly UsageSource[],
): Promise<CollectedUsage> {
  const records: UsageRecord[] = [];
  const files: Record<UsageSource, number> = { CLAUDE_CODE: 0, CODEX: 0 };

  if (sources.includes("CLAUDE_CODE")) {
    const claudeFiles = await logFiles(folders.claude);
    files.CLAUDE_CODE = claudeFiles.length;
    // The same response can appear in several files (resumed sessions), so the
    // key is global. Of repeated lines, the one with the most output wins.
    const byKey = new Map<string, UsageRecord>();
    for (const file of claudeFiles) {
      for (const { key, record } of parseClaudeLog(await readFile(file, "utf8"))) {
        const known = byKey.get(key);
        if (known === undefined || record.output > known.output) byKey.set(key, record);
      }
    }
    records.push(...byKey.values());
  }

  if (sources.includes("CODEX")) {
    const codexFiles = await logFiles(folders.codex);
    files.CODEX = codexFiles.length;
    for (const file of codexFiles) records.push(...parseCodexLog(await readFile(file, "utf8")));
  }

  return { records, files };
}

export { SOURCE_LABELS };
