// Readers for the usage logs that coding assistants keep on the user's own
// machine. They look only at the model, the time and the token counts of each
// entry. Message text, file paths, project names and session identifiers are
// never read into a record, so nothing but numbers can leave a log.

export type UsageSource = "CLAUDE_CODE" | "CODEX";

export const SOURCE_LABELS: Readonly<Record<UsageSource, string>> = {
  CLAUDE_CODE: "Claude Code local logs",
  CODEX: "Codex local logs",
};

export interface UsageRecord {
  readonly source: UsageSource;
  readonly model: string;
  /** ISO timestamp of the entry. */
  readonly timestamp: string;
  /** All prompt tokens, including the cached ones. */
  readonly input: number;
  /** The part of `input` that was read from a cache. */
  readonly cached: number;
  readonly output: number;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function parseLine(line: string): Record<string, unknown> | undefined {
  if (line.trim() === "") return undefined;
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    // A line that is not JSON (for example a truncated last line) is skipped.
    return undefined;
  }
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

export interface KeyedRecord {
  /** Identifies one model response, so a response written twice is counted once. */
  readonly key: string;
  readonly record: UsageRecord;
}

/**
 * Claude Code writes one line per content block of a response, so the same
 * response (same message id and request id) appears several times. The caller
 * keeps one record per key: the one with the most output tokens, which is the
 * final one. Responses without usage and the synthetic placeholder model are
 * ignored.
 *
 * Prompt tokens are the sum of the three input counters, because Claude reports
 * the part that was read from the cache and the part written to it separately.
 */
export function parseClaudeLog(text: string): KeyedRecord[] {
  const records: KeyedRecord[] = [];
  for (const line of text.split("\n")) {
    const entry = parseLine(line);
    if (entry === undefined || entry["type"] !== "assistant") continue;
    const message = entry["message"];
    const usage = field(message, "usage");
    const model = field(message, "model");
    const timestamp = entry["timestamp"];
    if (typeof model !== "string" || model === "" || model.startsWith("<")) continue;
    if (typeof timestamp !== "string" || usage === undefined) continue;

    const cached = count(field(usage, "cache_read_input_tokens"));
    const input =
      count(field(usage, "input_tokens")) +
      count(field(usage, "cache_creation_input_tokens")) +
      cached;
    const output = count(field(usage, "output_tokens"));
    if (input === 0 && output === 0) continue;

    const id = field(message, "id");
    const requestId = entry["requestId"];
    const uuid = entry["uuid"];
    const key =
      typeof id === "string" && typeof requestId === "string"
        ? `${id}:${requestId}`
        : typeof id === "string"
          ? id
          : typeof uuid === "string"
            ? uuid
            : undefined;
    if (key === undefined) continue;
    records.push({
      key,
      record: { source: "CLAUDE_CODE", model, timestamp, input, cached, output },
    });
  }
  return records;
}

interface Totals {
  readonly input: number;
  readonly cached: number;
  readonly output: number;
}

/**
 * Codex reports a running total for the session after each model call. The
 * usage of one call is the difference between two totals, and it belongs to the
 * model that was active for that turn. A total that goes down means the counter
 * was reset, so it is taken as the start of a new count.
 */
export function parseCodexLog(text: string): UsageRecord[] {
  const records: UsageRecord[] = [];
  let model: string | undefined;
  let previous: Totals = { input: 0, cached: 0, output: 0 };

  for (const line of text.split("\n")) {
    const entry = parseLine(line);
    if (entry === undefined) continue;
    const payload = entry["payload"];
    if (entry["type"] === "turn_context") {
      const turnModel = field(payload, "model");
      if (typeof turnModel === "string" && turnModel !== "") model = turnModel;
      continue;
    }
    if (entry["type"] !== "event_msg" || field(payload, "type") !== "token_count") continue;
    const total = field(field(payload, "info"), "total_token_usage");
    const timestamp = entry["timestamp"];
    if (total === undefined || typeof timestamp !== "string") continue;

    const current: Totals = {
      input: count(field(total, "input_tokens")),
      cached: count(field(total, "cached_input_tokens")),
      output: count(field(total, "output_tokens")),
    };
    const reset =
      current.input < previous.input ||
      current.cached < previous.cached ||
      current.output < previous.output;
    const base = reset ? { input: 0, cached: 0, output: 0 } : previous;
    const delta: Totals = {
      input: current.input - base.input,
      cached: current.cached - base.cached,
      output: current.output - base.output,
    };
    previous = current;
    if (model === undefined || (delta.input === 0 && delta.output === 0)) continue;
    records.push({
      source: "CODEX",
      model,
      timestamp,
      input: delta.input,
      cached: Math.min(delta.cached, delta.input),
      output: delta.output,
    });
  }
  return records;
}
