import type {
  AiEngineeringConfig,
  AiModel,
  TokenMetricKind,
  TokenUsageMetric,
} from "../../core/ai-engineering-models.js";
import type { UsageModel, UsageSnapshot } from "../../core/usage-snapshot.js";

// Adds what `devtrace import usage` observed to the configuration, before any
// statistic is computed. The numbers come from the user's own logs, so they are
// OBSERVED and name their source. Nothing is added unless the user turned on
// `settings.usageSnapshot`, and the token panel still needs `showTokenUsage`.

/** A model name as an id: lowercase letters and digits joined by hyphens. */
export function modelId(name: string): string {
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id === "" ? "model" : id;
}

interface Measurement {
  readonly kind: TokenMetricKind;
  readonly value: (model: UsageModel) => number;
}

// Totals come first, so the panel lists the largest users before the details.
const MEASUREMENTS: readonly Measurement[] = [
  { kind: "TOTAL_TOKENS", value: (model) => model.inputTokens + model.outputTokens },
  { kind: "INPUT_TOKENS", value: (model) => model.inputTokens },
  { kind: "CACHED_INPUT_TOKENS", value: (model) => model.cachedInputTokens },
  { kind: "OUTPUT_TOKENS", value: (model) => model.outputTokens },
];

export function mergeUsageSnapshot(
  config: AiEngineeringConfig,
  snapshot: UsageSnapshot,
): AiEngineeringConfig {
  const knownModels = new Set(config.models.map((model) => model.id));
  const usedIds = new Set(config.tokenUsage.map((metric) => metric.id));

  const added: AiModel[] = [];
  for (const usage of snapshot.models) {
    const id = modelId(usage.name);
    if (knownModels.has(id)) continue;
    knownModels.add(id);
    added.push({
      id,
      name: usage.name,
      provider: usage.provider,
      modelFamily: usage.modelFamily,
      visibility: "PUBLIC",
      provenance: "OBSERVED",
    });
  }

  const metrics: TokenUsageMetric[] = [];
  for (const measurement of MEASUREMENTS) {
    for (const usage of snapshot.models) {
      // A cache hit needs an input to divide by: without one there is nothing to report.
      if (measurement.kind === "CACHED_INPUT_TOKENS" && usage.inputTokens === 0) continue;
      const base = `usage-${modelId(usage.name)}-${measurement.kind.toLowerCase().replaceAll("_", "-")}`;
      let id = base;
      for (let attempt = 2; usedIds.has(id); attempt += 1) id = `${base}-${String(attempt)}`;
      usedIds.add(id);
      metrics.push({
        id,
        modelId: modelId(usage.name),
        kind: measurement.kind,
        value: measurement.value(usage),
        unit: "TOKENS",
        period: snapshot.period,
        source: usage.sources.join(" + "),
        visibility: "PUBLIC",
        provenance: "OBSERVED",
      });
    }
  }

  return {
    ...config,
    models: [...config.models, ...added],
    // Observed numbers first: they are what the owner turned the option on for.
    tokenUsage: [...metrics, ...config.tokenUsage],
  };
}
