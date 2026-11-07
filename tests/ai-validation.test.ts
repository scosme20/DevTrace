import { describe, expect, it } from "vitest";
import { validateAiEngineeringConfig } from "../src/core/ai-engineering-validation.js";
import {
  makeActivity,
  makeAiProject,
  makeModel,
  makeRawAiConfig,
  makeSkill,
  makeTokenMetric,
  makeTool,
} from "./ai-fixtures.js";

function errorsFor(overrides: Record<string, unknown>): string {
  const result = validateAiEngineeringConfig(makeRawAiConfig(overrides));
  return result.ok ? "" : result.errors.join("\n");
}

describe("validateAiEngineeringConfig", () => {
  it("accepts a minimal configuration with only a version", () => {
    const result = validateAiEngineeringConfig({ version: 1 });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.tools).toEqual([]);
  });

  it("accepts a complete valid configuration", () => {
    const result = validateAiEngineeringConfig(
      makeRawAiConfig({
        tools: [makeTool()],
        models: [makeModel()],
        skills: [makeSkill()],
        projects: [makeAiProject({ tools: ["claude-code"] })],
        activities: [makeActivity({ projectId: "doc-assistant" })],
        tokenUsage: [makeTokenMetric()],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("applies defaults, keeping activity, token usage and cost hidden", () => {
    const result = validateAiEngineeringConfig({ version: 1 });
    expect(result.ok && result.value.settings).toEqual({
      theme: "DARK",
      showTools: true,
      showModels: true,
      showSkills: true,
      showProjects: true,
      showActivity: false,
      showTokenUsage: false,
      showCost: false,
      showLinks: true,
    });
    expect(result.ok && result.value.profile.displayName).toBe("AI Engineering Profile");
  });

  it("rejects a missing or unsupported version", () => {
    expect(validateAiEngineeringConfig({}).ok).toBe(false);
    expect(errorsFor({ version: 2 })).toContain("Unsupported configuration version");
  });

  it("rejects invalid settings without correcting them", () => {
    expect(errorsFor({ settings: { theme: "NEON" } })).toContain("Invalid theme: NEON.");
    expect(errorsFor({ settings: { showCost: "no" } })).toContain("settings.showCost");
  });

  it("rejects unknown fields", () => {
    expect(errorsFor({ tools: [makeTool({ cost: 10 })] })).toContain("tools[0]");
    expect(errorsFor({ unexpected: true })).not.toBe("");
  });

  it("reports missing required fields", () => {
    expect(errorsFor({ tools: [makeTool({ provider: undefined })] })).toContain(
      "tools[0].provider",
    );
    expect(errorsFor({ models: [makeModel({ modelFamily: undefined })] })).toContain(
      "models[0].modelFamily",
    );
  });

  it("requires visibility and provenance on every entity", () => {
    expect(errorsFor({ tools: [makeTool({ visibility: undefined })] })).toContain(
      "tools[0].visibility",
    );
    expect(errorsFor({ skills: [makeSkill({ provenance: undefined })] })).toContain(
      "skills[0].provenance",
    );
  });

  it("rejects an invalid tool category", () => {
    expect(errorsFor({ tools: [makeTool({ category: "CHATBOT" })] })).toContain(
      "tools[0].category: Invalid tool category: CHATBOT.",
    );
  });

  it("rejects an invalid proficiency level", () => {
    expect(errorsFor({ skills: [makeSkill({ proficiencyLevel: "GURU" })] })).toContain(
      "Invalid proficiency level: GURU.",
    );
    expect(errorsFor({ tools: [makeTool({ experienceLevel: "EXPERT" })] })).toContain(
      "tools[0].experienceLevel",
    );
  });

  it("rejects an invalid provenance", () => {
    expect(errorsFor({ models: [makeModel({ provenance: "VERIFIED" })] })).toContain(
      "Invalid provenance: VERIFIED.",
    );
  });

  it("rejects invalid skill category, technique, activity type and involvement", () => {
    expect(errorsFor({ skills: [makeSkill({ category: "MAGIC" })] })).toContain(
      "Invalid skill category",
    );
    expect(errorsFor({ projects: [makeAiProject({ techniques: ["TELEPATHY"] })] })).toContain(
      "Invalid technique: TELEPATHY.",
    );
    expect(errorsFor({ activities: [makeActivity({ activityType: "NAPPING" })] })).toContain(
      "Invalid activity type",
    );
    expect(errorsFor({ activities: [makeActivity({ involvement: "AI_DID_IT" })] })).toContain(
      "Invalid AI involvement",
    );
  });

  it("rejects duplicate IDs within each collection", () => {
    expect(errorsFor({ tools: [makeTool(), makeTool()] })).toContain(
      "tools[1].id: Duplicate tool ID detected: claude-code.",
    );
    expect(errorsFor({ models: [makeModel(), makeModel()] })).toContain(
      "Duplicate model ID detected: sonnet.",
    );
    expect(errorsFor({ skills: [makeSkill(), makeSkill()] })).toContain("Duplicate skill ID");
    expect(errorsFor({ projects: [makeAiProject(), makeAiProject()] })).toContain(
      "Duplicate project ID",
    );
  });

  it("allows the same ID in different collections", () => {
    const result = validateAiEngineeringConfig(
      makeRawAiConfig({
        tools: [makeTool({ id: "shared" })],
        models: [makeModel({ id: "shared" })],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects malformed and non-http URLs on projects", () => {
    expect(errorsFor({ projects: [makeAiProject({ repositoryUrl: "nope" })] })).toContain(
      "projects[0].repositoryUrl",
    );
    expect(
      errorsFor({ projects: [makeAiProject({ websiteUrl: "javascript:alert(1)" })] }),
    ).toContain("projects[0].websiteUrl");
  });

  it("rejects references to unknown tools, projects and models", () => {
    expect(errorsFor({ projects: [makeAiProject({ tools: ["ghost"] })] })).toContain(
      "projects[0].tools[0]: Unknown tool ID referenced: ghost.",
    );
    expect(errorsFor({ activities: [makeActivity({ projectId: "ghost" })] })).toContain(
      "Unknown project ID referenced: ghost.",
    );
    expect(errorsFor({ tokenUsage: [makeTokenMetric({ modelId: "ghost" })] })).toContain(
      "Unknown model ID referenced: ghost.",
    );
  });

  it("rejects invalid activity dates", () => {
    expect(errorsFor({ activities: [makeActivity({ date: "yesterday" })] })).toContain(
      "activities[0].date",
    );
  });
});

describe("token usage validation", () => {
  const withModel = (metric: Record<string, unknown>) =>
    errorsFor({ models: [makeModel()], tokenUsage: [metric] });

  it("accepts token metrics and cost metrics with a currency unit", () => {
    expect(withModel(makeTokenMetric())).toBe("");
    expect(withModel(makeTokenMetric({ kind: "ESTIMATED_COST", value: 12.5, unit: "USD" }))).toBe(
      "",
    );
  });

  it("rejects negative, non-finite and non-numeric values", () => {
    expect(withModel(makeTokenMetric({ value: -1 }))).toContain("must not be negative");
    expect(withModel(makeTokenMetric({ value: "lots" }))).toContain("tokenUsage[0].value");
    expect(
      withModel(makeTokenMetric({ kind: "ESTIMATED_COST", value: -0.01, unit: "USD" })),
    ).toContain("tokenUsage[0].value");
  });

  it("rejects fractional token counts", () => {
    expect(withModel(makeTokenMetric({ value: 10.5 }))).toContain("whole numbers");
  });

  it("rejects invalid cost values and units", () => {
    expect(
      withModel(makeTokenMetric({ kind: "ESTIMATED_COST", value: 5, unit: "dollars" })),
    ).toContain("Invalid cost unit");
    expect(withModel(makeTokenMetric({ unit: "USD" }))).toContain("must use TOKENS");
  });

  it("requires a measurement period", () => {
    expect(withModel(makeTokenMetric({ period: undefined }))).toContain("tokenUsage[0].period");
  });

  it("rejects a malformed or reversed measurement period", () => {
    expect(
      withModel(makeTokenMetric({ period: { start: "2026-02-01", end: "2026-01-01" } })),
    ).toContain("ends before it starts");
    expect(withModel(makeTokenMetric({ period: { start: "x", end: "2026-01-01" } }))).toContain(
      "tokenUsage[0].period.start",
    );
  });

  it("requires a source for OBSERVED metrics", () => {
    expect(withModel(makeTokenMetric({ provenance: "OBSERVED" }))).toContain(
      "OBSERVED metrics must name a source.",
    );
    expect(
      withModel(makeTokenMetric({ provenance: "OBSERVED", source: "Provider usage export" })),
    ).toBe("");
  });
});
