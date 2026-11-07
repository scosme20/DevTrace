import { computeAiEngineeringStats } from "../src/indicators/ai-engineering/stats.js";
import { computeStartupStats } from "../src/indicators/startup/stats.js";
import { renderAiEngineeringStats } from "../src/templates/ai-engineering-stats.js";
import { requireDesignTokens, type DesignTokens } from "../src/templates/design-tokens.js";
import { renderStartupStats } from "../src/templates/startup-stats.js";
import {
  makeActivity,
  makeAiConfig,
  makeAiProject,
  makeModel,
  makeSkill,
  makeTokenMetric,
  makeTool,
} from "./ai-fixtures.js";
import { makeConfig, makeProject } from "./fixtures.js";
import { renderAiScenario, renderStartupScenario } from "./golden-scenarios.js";

export { renderAiScenario, renderStartupScenario };

// The longest values the configuration allows (names are limited to 60 characters).
export const LONG = "An Extremely Long Name That Keeps Going And Going Forever";

export function renderStartupStress(settings: Record<string, unknown>): string {
  const config = makeConfig(
    [
      makeProject({
        id: "a",
        name: LONG,
        description: `${LONG} ${LONG}`,
        lifecycleStage: "DEVELOPMENT",
        repositoryUrl: "https://example.com/r",
        websiteUrl: "https://example.com",
        githubRepository: "octo/app",
      }),
      makeProject({ id: "b", name: "Short", lifecycleStage: "MAINTENANCE", status: "INACTIVE" }),
    ],
    { profile: { displayName: "A Very Long Profile Display Name Here" }, settings },
  );
  return renderStartupStats(computeStartupStats(config.projects), {
    profile: config.profile,
    settings: config.settings,
    generatorVersion: "0.0.0-test",
  });
}

export function renderAiStress(settings: Record<string, unknown>): string {
  const config = makeAiConfig({
    profile: { displayName: "A Very Long Profile Display Name Here" },
    settings: { showActivity: true, showTokenUsage: true, showCost: true, ...settings },
    tools: [
      makeTool({
        id: "t",
        name: LONG,
        provider: "An Equally Long Provider Name Inc",
        category: "AGENT_FRAMEWORK",
      }),
    ],
    models: [makeModel({ id: "m", name: LONG, provider: LONG, modelFamily: LONG })],
    skills: [makeSkill({ id: "s", name: LONG, description: `${LONG} ${LONG}` })],
    projects: [
      makeAiProject({
        id: "p",
        name: LONG,
        description: `${LONG} ${LONG}`,
        techniques: [
          "RAG",
          "AI_AGENTS",
          "FUNCTION_CALLING",
          "TOOL_USE",
          "LLM_INTEGRATION",
          "VECTOR_SEARCH",
          "PROMPT_ENGINEERING",
        ],
        repositoryUrl: "https://example.com/r",
        websiteUrl: "https://example.com",
      }),
    ],
    activities: [
      makeActivity({
        id: "a",
        activityType: "DOCUMENTATION_GENERATION",
        description: `${LONG} ${LONG}`,
      }),
    ],
    tokenUsage: [makeTokenMetric({ id: "u", modelId: "m", source: LONG })],
  });
  return renderAiEngineeringStats(computeAiEngineeringStats(config), {
    profile: config.profile,
    settings: config.settings,
    generatorVersion: "0.0.0-test",
  });
}

export function tokensFor(settings: Record<string, unknown>): DesignTokens {
  return requireDesignTokens({ theme: "DARK", ...settings } as never);
}
