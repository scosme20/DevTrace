import type { AiEngineeringConfig } from "../src/core/ai-engineering-models.js";
import { validateAiEngineeringConfig } from "../src/core/ai-engineering-validation.js";

type Overrides = Record<string, unknown>;

export function makeTool(overrides: Overrides = {}): Overrides {
  return {
    id: "claude-code",
    name: "Claude Code",
    provider: "Anthropic",
    category: "AI_ASSISTANT",
    visibility: "PUBLIC",
    provenance: "DECLARED",
    ...overrides,
  };
}

export function makeModel(overrides: Overrides = {}): Overrides {
  return {
    id: "sonnet",
    name: "Claude Sonnet",
    provider: "Anthropic",
    modelFamily: "Claude",
    visibility: "PUBLIC",
    provenance: "DECLARED",
    ...overrides,
  };
}

export function makeSkill(overrides: Overrides = {}): Overrides {
  return {
    id: "rag",
    name: "Retrieval-Augmented Generation (RAG)",
    category: "RETRIEVAL_KNOWLEDGE",
    proficiencyLevel: "PRACTICING",
    visibility: "PUBLIC",
    provenance: "DECLARED",
    ...overrides,
  };
}

export function makeAiProject(overrides: Overrides = {}): Overrides {
  return {
    id: "doc-assistant",
    name: "Doc Assistant",
    description: "Answers questions about documentation.",
    category: "Developer Tools",
    status: "ACTIVE",
    techniques: ["RAG", "TOOL_USE"],
    tools: [],
    visibility: "PUBLIC",
    provenance: "DECLARED",
    ...overrides,
  };
}

export function makeActivity(overrides: Overrides = {}): Overrides {
  return {
    id: "activity-1",
    activityType: "TEST_GENERATION",
    involvement: "AI_ASSISTED",
    description: "Generated unit tests with review.",
    date: "2026-03-01",
    visibility: "PUBLIC",
    provenance: "DECLARED",
    ...overrides,
  };
}

export function makeTokenMetric(overrides: Overrides = {}): Overrides {
  return {
    id: "usage-1",
    modelId: "sonnet",
    kind: "INPUT_TOKENS",
    value: 1200000,
    unit: "TOKENS",
    period: { start: "2026-01-01", end: "2026-01-31" },
    visibility: "PUBLIC",
    provenance: "DECLARED",
    ...overrides,
  };
}

export function makeRawAiConfig(overrides: Overrides = {}): Overrides {
  return { version: 1, ...overrides };
}

/** Builds a validated config; throws with the validation errors if the input is invalid. */
export function makeAiConfig(overrides: Overrides = {}): AiEngineeringConfig {
  const result = validateAiEngineeringConfig(makeRawAiConfig(overrides));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.value;
}
