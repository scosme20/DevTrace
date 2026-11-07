import { computeAiEngineeringStats } from "../src/indicators/ai-engineering/stats.js";
import { linkGitHubRepositories } from "../src/indicators/github-link.js";
import { computeStartupStats } from "../src/indicators/startup/stats.js";
import { renderAiEngineeringStats } from "../src/templates/ai-engineering-stats.js";
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
import { makeRepository, makeSnapshot } from "./github-fixtures.js";

// Rich, fully deterministic scenarios with short strings, so that no text is
// truncated. The golden SVG files in tests/golden were produced from these by
// the 0.4.0 renderers; the default appearance must keep reproducing them.

export const GOLDEN_VERSION = "0.0.0-test";

export function renderStartupScenario(settings: Record<string, unknown> = {}): string {
  const config = makeConfig(
    [
      makeProject({
        id: "alpha",
        name: "Alpha",
        lifecycleStage: "LAUNCHED",
        status: "ACTIVE",
        githubRepository: "octo/app",
        websiteUrl: "https://alpha.example.com",
      }),
      makeProject({ id: "beta", name: "Beta", lifecycleStage: "MVP", status: "PAUSED" }),
      makeProject({
        id: "gamma",
        name: "Gamma",
        lifecycleStage: "GROWING",
        status: "ACTIVE",
        repositoryUrl: "https://example.com/gamma",
      }),
      makeProject({ id: "delta", name: "Delta", lifecycleStage: "ARCHIVED", status: "INACTIVE" }),
    ],
    { settings },
  );
  const links = linkGitHubRepositories(config.projects, makeSnapshot([makeRepository()]));
  return renderStartupStats(computeStartupStats(config.projects, links.byProjectId), {
    profile: config.profile,
    settings: config.settings,
    generatorVersion: GOLDEN_VERSION,
  });
}

export function renderAiScenario(settings: Record<string, unknown> = {}): string {
  const config = makeAiConfig({
    settings: { showActivity: true, showTokenUsage: true, showCost: true, ...settings },
    tools: [
      makeTool({ id: "assistant", name: "Assistant", provider: "ExampleAI" }),
      makeTool({
        id: "plugin",
        name: "IDE Plugin",
        provider: "SampleCorp",
        category: "IDE_ASSISTANT",
      }),
    ],
    models: [
      makeModel({ id: "m1", name: "Model One", provider: "ExampleAI", modelFamily: "Demo" }),
      makeModel({ id: "m2", name: "Model Two", provider: "SampleCorp", modelFamily: "Sample" }),
    ],
    skills: [
      makeSkill({
        id: "s1",
        name: "Prompting",
        category: "LLM_ENGINEERING",
        proficiencyLevel: "PROFICIENT",
      }),
      makeSkill({ id: "s2", name: "Agents", category: "AI_AGENTS", proficiencyLevel: "LEARNING" }),
      makeSkill({
        id: "s3",
        name: "RAG",
        category: "RETRIEVAL_KNOWLEDGE",
        proficiencyLevel: "ADVANCED",
      }),
    ],
    projects: [
      makeAiProject({
        id: "p1",
        name: "Doc Bot",
        techniques: ["RAG", "TOOL_USE"],
        githubRepository: "octo/app",
        repositoryUrl: "https://github.com/octo/app",
        websiteUrl: "https://example.com",
      }),
      makeAiProject({ id: "p2", name: "Paused Bot", status: "PAUSED", techniques: [] }),
    ],
    activities: [
      makeActivity({
        id: "a1",
        activityType: "AI_ASSISTED_REFACTORING",
        description: "Refactored a module.",
        date: "2026-03-01",
      }),
      makeActivity({
        id: "a2",
        activityType: "TEST_GENERATION",
        involvement: "AI_GENERATED",
        description: "Drafted unit tests.",
        date: "2026-02-10",
        provenance: "ESTIMATED",
      }),
    ],
    tokenUsage: [
      makeTokenMetric({ id: "u1", modelId: "m1", source: "Usage export" }),
      makeTokenMetric({
        id: "u2",
        modelId: "m1",
        kind: "ESTIMATED_COST",
        value: 12.5,
        unit: "USD",
        provenance: "ESTIMATED",
      }),
    ],
  });
  const links = linkGitHubRepositories(config.projects, makeSnapshot([makeRepository()]));
  return renderAiEngineeringStats(computeAiEngineeringStats(config, links.byProjectId), {
    profile: config.profile,
    settings: config.settings,
    generatorVersion: GOLDEN_VERSION,
  });
}
