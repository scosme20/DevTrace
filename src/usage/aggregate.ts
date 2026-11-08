import type { UsageModel, UsageSnapshot } from "../core/usage-snapshot.js";
import { SOURCE_LABELS, type UsageRecord, type UsageSource } from "./parsers.js";

export interface UsagePeriod {
  /** `YYYY-MM-DD`, inclusive. */
  readonly start: string;
  readonly end: string;
}

const OPENAI_MODEL = /^(gpt|o\d|codex|chatgpt)/i;

/** The company that publishes a model, from its name; the source is the fallback. */
function providerOf(model: string, source: UsageSource): { provider: string; family: string } {
  if (/^claude/i.test(model)) return { provider: "Anthropic", family: "Claude" };
  if (OPENAI_MODEL.test(model)) return { provider: "OpenAI", family: "GPT" };
  const provider = source === "CLAUDE_CODE" ? "Anthropic" : "OpenAI";
  return { provider, family: provider };
}

/**
 * Sums the records inside the period, one entry per model. Entries are ordered
 * by total tokens, then by name, so the same logs always give the same snapshot.
 */
export function aggregateUsage(
  records: readonly UsageRecord[],
  period: UsagePeriod,
  files: Readonly<Record<UsageSource, number>>,
): UsageSnapshot {
  const byModel = new Map<
    string,
    { input: number; cached: number; output: number; sources: Set<UsageSource> }
  >();
  const byDay = new Map<string, number>();
  for (const record of records) {
    const day = record.timestamp.slice(0, 10);
    if (day < period.start || day > period.end) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + record.input + record.output);
    const total = byModel.get(record.model) ?? {
      input: 0,
      cached: 0,
      output: 0,
      sources: new Set<UsageSource>(),
    };
    total.input += record.input;
    total.cached += record.cached;
    total.output += record.output;
    total.sources.add(record.source);
    byModel.set(record.model, total);
  }

  const models: UsageModel[] = [...byModel]
    .map(([name, total]) => {
      const [firstSource = "CLAUDE_CODE"] = [...total.sources].sort();
      const { provider, family } = providerOf(name, firstSource);
      return {
        name,
        provider,
        modelFamily: family,
        sources: [...total.sources].sort().map((source) => SOURCE_LABELS[source]),
        inputTokens: total.input,
        cachedInputTokens: Math.min(total.cached, total.input),
        outputTokens: total.output,
      };
    })
    .sort(
      (a, b) =>
        b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens) ||
        a.name.localeCompare(b.name),
    );

  return {
    version: 1,
    kind: "LOCAL_USAGE",
    period: { start: period.start, end: period.end },
    sources: (Object.keys(files) as UsageSource[])
      .filter((source) => files[source] > 0)
      .map((source) => ({ label: SOURCE_LABELS[source], files: files[source] })),
    models,
    days: [...byDay]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, tokens]) => ({ date, tokens })),
  };
}
