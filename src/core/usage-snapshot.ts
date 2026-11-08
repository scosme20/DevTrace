import { z } from "zod";
import type { Result } from "./result.js";
import { isoDate, requiredText, validateWith } from "./schema-primitives.js";

// Token usage read from the assistants' local logs by `devtrace import usage`.
// It holds model names and token totals for one period, and nothing else: no
// text, paths, project names or session identifiers.

export interface UsageModel {
  readonly name: string;
  readonly provider: string;
  readonly modelFamily: string;
  /** Which logs the numbers come from. */
  readonly sources: readonly string[];
  /** All prompt tokens, including the cached ones. */
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
}

/** Input and output tokens of one day, all models together. */
export interface UsageDay {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly tokens: number;
}

export interface UsageSnapshot {
  readonly version: 1;
  readonly kind: "LOCAL_USAGE";
  readonly period: { readonly start: string; readonly end: string };
  readonly sources: readonly { readonly label: string; readonly files: number }[];
  readonly models: readonly UsageModel[];
  /** Tokens per day, oldest first. Absent in files made before this was recorded. */
  readonly days?: readonly UsageDay[] | undefined;
  /** Input plus output tokens of every model, per week. Absent in snapshots made before 0.8. */
  readonly weekly?: readonly UsageWeek[] | undefined;
}

export interface UsageWeek {
  /** The Monday that starts the week, `YYYY-MM-DD`. */
  readonly weekStart: string;
  readonly tokens: number;
}

const tokens = z.number().int().nonnegative();

const modelSchema = z
  .strictObject({
    name: requiredText("name").max(60),
    provider: requiredText("provider").max(60),
    modelFamily: requiredText("modelFamily").max(60),
    sources: z.array(requiredText("source").max(60)).min(1).max(4),
    inputTokens: tokens,
    cachedInputTokens: tokens,
    outputTokens: tokens,
  })
  .refine((model) => model.cachedInputTokens <= model.inputTokens, {
    message: "Cached input tokens cannot exceed input tokens.",
  });

const snapshotSchema = z
  .strictObject({
    version: z.literal(1, { error: "Unsupported usage snapshot version. Expected 1." }),
    kind: z.literal("LOCAL_USAGE"),
    period: z.strictObject({ start: isoDate, end: isoDate }),
    sources: z
      .array(z.strictObject({ label: requiredText("label").max(60), files: tokens }))
      .max(4),
    models: z.array(modelSchema).max(200),
    days: z
      .array(z.strictObject({ date: isoDate, tokens }))
      .max(800)
      .optional(),
    weekly: z
      .array(z.strictObject({ weekStart: isoDate, tokens }))
      .max(60)
      .optional(),
  })
  .refine((snapshot) => snapshot.period.end >= snapshot.period.start, {
    message: "The period ends before it starts.",
    path: ["period"],
  });

export function validateUsageSnapshot(input: unknown): Result<UsageSnapshot> {
  return validateWith(snapshotSchema, input);
}
