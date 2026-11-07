import type { AppearanceSettings } from "./appearance.js";
import type { DataSource, ProjectStatus, StartupProfile, Visibility } from "./models.js";

// Visibility, provenance (the M2 `DataSource` concept), status and theme are
// shared with the Startup indicator. Everything else is specific to AI
// engineering, so the two project models are intentionally separate: a startup
// project has a lifecycle and dates, an AI project has techniques and tools.

/** OBSERVED, DECLARED or ESTIMATED. Same meaning as the startup `dataSource`. */
export type Provenance = DataSource;

export const TOOL_CATEGORIES = [
  "AI_ASSISTANT",
  "IDE_ASSISTANT",
  "API_PROVIDER",
  "AGENT_FRAMEWORK",
  "DEVELOPMENT_TOOL",
  "MODEL_PLATFORM",
] as const;

export const USAGE_TYPES = ["PERSONAL", "PROFESSIONAL", "OPEN_SOURCE", "ACADEMIC"] as const;

// Levels are self-declared statements, never certifications or measurements.
export const PROFICIENCY_LEVELS = [
  "EXPLORING",
  "LEARNING",
  "PRACTICING",
  "PROFICIENT",
  "ADVANCED",
] as const;

export const SKILL_CATEGORIES = [
  "LLM_ENGINEERING",
  "AI_AGENTS",
  "RETRIEVAL_KNOWLEDGE",
  "AI_SYSTEM_DESIGN",
] as const;

export const AI_TECHNIQUES = [
  "RAG",
  "AI_AGENTS",
  "FUNCTION_CALLING",
  "TOOL_USE",
  "LLM_INTEGRATION",
  "VECTOR_SEARCH",
  "PROMPT_ENGINEERING",
] as const;

export const ACTIVITY_TYPES = [
  "AI_ASSISTED_CODING",
  "AI_ASSISTED_REFACTORING",
  "TEST_GENERATION",
  "DOCUMENTATION_GENERATION",
  "CODE_REVIEW_ASSISTANCE",
  "RAG_IMPLEMENTATION",
  "AGENT_DEVELOPMENT",
  "LLM_INTEGRATION",
] as const;

// Who did the work. An AI-related project does not imply AI-generated work.
export const AI_INVOLVEMENTS = ["AI_ASSISTED", "AI_GENERATED", "AI_RELATED_ENGINEERING"] as const;

export const TOKEN_METRIC_KINDS = [
  "INPUT_TOKENS",
  "OUTPUT_TOKENS",
  "TOTAL_TOKENS",
  "ESTIMATED_COST",
] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number];
export type UsageType = (typeof USAGE_TYPES)[number];
export type ProficiencyLevel = (typeof PROFICIENCY_LEVELS)[number];
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];
export type AiTechnique = (typeof AI_TECHNIQUES)[number];
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type AiInvolvement = (typeof AI_INVOLVEMENTS)[number];
export type TokenMetricKind = (typeof TOKEN_METRIC_KINDS)[number];

/** A product or tool (for example "Claude Code"). Its provider is a separate attribute. */
export interface AiTool {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly category: ToolCategory;
  readonly usageType?: UsageType | undefined;
  readonly experienceLevel?: ProficiencyLevel | undefined;
  readonly visibility: Visibility;
  readonly provenance: Provenance;
}

/** A specific model (for example "GPT-5") that belongs to a model family ("GPT"). */
export interface AiModel {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly modelFamily: string;
  readonly usageContext?: string | undefined;
  readonly visibility: Visibility;
  readonly provenance: Provenance;
}

export interface AiSkill {
  readonly id: string;
  readonly name: string;
  readonly category: SkillCategory;
  readonly proficiencyLevel: ProficiencyLevel;
  readonly description?: string | undefined;
  readonly visibility: Visibility;
  readonly provenance: Provenance;
}

export interface AiProject {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly status: ProjectStatus;
  readonly techniques: readonly AiTechnique[];
  /** IDs of entries in `tools`. */
  readonly tools: readonly string[];
  readonly repositoryUrl?: string | undefined;
  readonly websiteUrl?: string | undefined;
  /** `owner/name`. Links the project to observed GitHub data; it never overrides other fields. */
  readonly githubRepository?: string | undefined;
  readonly visibility: Visibility;
  readonly provenance: Provenance;
}

export interface AiActivity {
  readonly id: string;
  readonly activityType: ActivityType;
  readonly involvement: AiInvolvement;
  readonly description: string;
  /** ID of an entry in `projects`. */
  readonly projectId?: string | undefined;
  readonly date: string;
  readonly visibility: Visibility;
  readonly provenance: Provenance;
}

export interface MeasurementPeriod {
  readonly start: string;
  readonly end: string;
}

/**
 * A single reported measurement. Values are never computed by DevTrace: they
 * come from the user or from a named source.
 */
export interface TokenUsageMetric {
  readonly id: string;
  /** ID of an entry in `models`. */
  readonly modelId: string;
  readonly kind: TokenMetricKind;
  readonly value: number;
  /** "TOKENS" for token kinds, an ISO 4217 currency code for ESTIMATED_COST. */
  readonly unit: string;
  readonly period: MeasurementPeriod;
  readonly source?: string | undefined;
  readonly visibility: Visibility;
  readonly provenance: Provenance;
}

export interface AiEngineeringSettings extends AppearanceSettings {
  readonly showTools: boolean;
  readonly showModels: boolean;
  readonly showSkills: boolean;
  readonly showProjects: boolean;
  readonly showActivity: boolean;
  readonly showTokenUsage: boolean;
  /** Costs are financial data: hidden unless explicitly enabled. */
  readonly showCost: boolean;
  readonly showLinks: boolean;
  /** Draw the multi-panel dashboard instead of the single-column card. Default `false`. */
  readonly dashboard?: boolean | undefined;
}

export interface AiEngineeringConfig {
  readonly version: 1;
  readonly profile: StartupProfile;
  readonly settings: AiEngineeringSettings;
  readonly tools: readonly AiTool[];
  readonly models: readonly AiModel[];
  readonly skills: readonly AiSkill[];
  readonly projects: readonly AiProject[];
  readonly activities: readonly AiActivity[];
  readonly tokenUsage: readonly TokenUsageMetric[];
}
