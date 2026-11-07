import type {
  ActivityType,
  AiInvolvement,
  AiTechnique,
  ProficiencyLevel,
  SkillCategory,
  TokenMetricKind,
  ToolCategory,
  UsageType,
} from "../core/ai-engineering-models.js";

// Display text for enum values. Records are exhaustive, so adding an enum
// member without a label is a compile error.

export const TOOL_CATEGORY_LABELS: Readonly<Record<ToolCategory, string>> = {
  AI_ASSISTANT: "AI assistant",
  IDE_ASSISTANT: "IDE assistant",
  API_PROVIDER: "API provider",
  AGENT_FRAMEWORK: "Agent framework",
  DEVELOPMENT_TOOL: "Development tool",
  MODEL_PLATFORM: "Model platform",
};

export const SKILL_CATEGORY_LABELS: Readonly<Record<SkillCategory, string>> = {
  LLM_ENGINEERING: "LLM engineering",
  AI_AGENTS: "AI agents",
  RETRIEVAL_KNOWLEDGE: "Retrieval & knowledge",
  AI_SYSTEM_DESIGN: "AI system design",
};

export const PROFICIENCY_LABELS: Readonly<Record<ProficiencyLevel, string>> = {
  EXPLORING: "Exploring",
  LEARNING: "Learning",
  PRACTICING: "Practicing",
  PROFICIENT: "Proficient",
  ADVANCED: "Advanced",
};

export const TECHNIQUE_LABELS: Readonly<Record<AiTechnique, string>> = {
  RAG: "RAG",
  AI_AGENTS: "AI agents",
  FUNCTION_CALLING: "Function calling",
  TOOL_USE: "Tool use",
  LLM_INTEGRATION: "LLM integration",
  VECTOR_SEARCH: "Vector search",
  PROMPT_ENGINEERING: "Prompt engineering",
};

export const ACTIVITY_LABELS: Readonly<Record<ActivityType, string>> = {
  AI_ASSISTED_CODING: "AI-assisted coding",
  AI_ASSISTED_REFACTORING: "AI-assisted refactoring",
  TEST_GENERATION: "Test generation",
  DOCUMENTATION_GENERATION: "Documentation generation",
  CODE_REVIEW_ASSISTANCE: "Code review assistance",
  RAG_IMPLEMENTATION: "RAG implementation",
  AGENT_DEVELOPMENT: "Agent development",
  LLM_INTEGRATION: "LLM integration",
};

export const INVOLVEMENT_LABELS: Readonly<Record<AiInvolvement, string>> = {
  AI_ASSISTED: "AI-assisted",
  AI_GENERATED: "AI-generated",
  AI_RELATED_ENGINEERING: "AI-related",
};

export const TOKEN_KIND_LABELS: Readonly<Record<TokenMetricKind, string>> = {
  INPUT_TOKENS: "Input tokens",
  OUTPUT_TOKENS: "Output tokens",
  TOTAL_TOKENS: "Total tokens",
  ESTIMATED_COST: "Estimated cost",
};

export const USAGE_TYPE_LABELS: Readonly<Record<UsageType, string>> = {
  PERSONAL: "Personal",
  PROFESSIONAL: "Professional",
  OPEN_SOURCE: "Open source",
  ACADEMIC: "Academic",
};
