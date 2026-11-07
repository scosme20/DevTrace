import { describe, expect, it } from "vitest";
import { computeAiEngineeringStats } from "../src/indicators/ai-engineering/stats.js";
import {
  makeActivity,
  makeAiConfig,
  makeAiProject,
  makeModel,
  makeSkill,
  makeTokenMetric,
  makeTool,
} from "./ai-fixtures.js";

describe("computeAiEngineeringStats", () => {
  it("returns zeros and empty lists for an empty configuration", () => {
    const stats = computeAiEngineeringStats(makeAiConfig());
    expect(stats).toMatchObject({
      totalTools: 0,
      totalProviders: 0,
      totalModels: 0,
      totalSkills: 0,
      totalProjects: 0,
      toolsByCategory: [],
      skillsByCategory: [],
      projectsByStatus: [],
      providers: [],
      activities: [],
      tokenUsage: [],
    });
  });

  it("counts tools, models, skills and projects", () => {
    const stats = computeAiEngineeringStats(
      makeAiConfig({
        tools: [makeTool({ id: "a" }), makeTool({ id: "b" })],
        models: [makeModel()],
        skills: [makeSkill({ id: "s1" }), makeSkill({ id: "s2" }), makeSkill({ id: "s3" })],
        projects: [makeAiProject()],
      }),
    );
    expect(stats).toMatchObject({
      totalTools: 2,
      totalModels: 1,
      totalSkills: 3,
      totalProjects: 1,
    });
  });

  describe("providers", () => {
    it("counts distinct providers across tools and models", () => {
      const stats = computeAiEngineeringStats(
        makeAiConfig({
          tools: [
            makeTool({ id: "a", provider: "Anthropic" }),
            makeTool({ id: "b", provider: "OpenAI" }),
            makeTool({ id: "c", provider: "OpenAI" }),
          ],
          models: [
            makeModel({ id: "m1", provider: "Anthropic" }),
            makeModel({ id: "m2", provider: "Meta" }),
          ],
        }),
      );
      expect(stats.totalProviders).toBe(3);
      expect(stats.providers).toEqual(["Anthropic", "Meta", "OpenAI"]);
    });

    it("treats provider names case-insensitively and keeps the first spelling", () => {
      const stats = computeAiEngineeringStats(
        makeAiConfig({
          tools: [
            makeTool({ id: "a", provider: "OpenAI" }),
            makeTool({ id: "b", provider: " openai " }),
          ],
        }),
      );
      expect(stats.providers).toEqual(["OpenAI"]);
    });

    it("keeps providers, products and models as separate concepts", () => {
      const stats = computeAiEngineeringStats(
        makeAiConfig({
          tools: [makeTool({ name: "Claude Code", provider: "Anthropic" })],
          models: [
            makeModel({ name: "Claude Sonnet", provider: "Anthropic", modelFamily: "Claude" }),
          ],
        }),
      );
      expect(stats.tools[0]).toMatchObject({ name: "Claude Code", provider: "Anthropic" });
      expect(stats.models[0]).toMatchObject({
        name: "Claude Sonnet",
        modelFamily: "Claude",
        provider: "Anthropic",
      });
      expect(stats.totalProviders).toBe(1);
      expect(stats.totalTools + stats.totalModels).toBe(2);
    });
  });

  it("groups tools by category in catalog order", () => {
    const stats = computeAiEngineeringStats(
      makeAiConfig({
        tools: [
          makeTool({ id: "a", category: "MODEL_PLATFORM" }),
          makeTool({ id: "b", category: "AI_ASSISTANT" }),
          makeTool({ id: "c", category: "MODEL_PLATFORM" }),
        ],
      }),
    );
    expect(stats.toolsByCategory).toEqual([
      { key: "AI_ASSISTANT", count: 1 },
      { key: "MODEL_PLATFORM", count: 2 },
    ]);
  });

  it("groups skills by category and keeps declared proficiency levels as given", () => {
    const stats = computeAiEngineeringStats(
      makeAiConfig({
        skills: [
          makeSkill({ id: "a", category: "AI_AGENTS", proficiencyLevel: "LEARNING" }),
          makeSkill({ id: "b", category: "LLM_ENGINEERING", proficiencyLevel: "ADVANCED" }),
          makeSkill({ id: "c", category: "AI_AGENTS", proficiencyLevel: "EXPLORING" }),
        ],
      }),
    );
    expect(stats.skillsByCategory).toEqual([
      { key: "LLM_ENGINEERING", count: 1 },
      { key: "AI_AGENTS", count: 2 },
    ]);
    expect(stats.skills.map((skill) => skill.proficiencyLevel)).toEqual([
      "LEARNING",
      "ADVANCED",
      "EXPLORING",
    ]);
  });

  it("does not derive proficiency from the number of tools", () => {
    const stats = computeAiEngineeringStats(
      makeAiConfig({
        tools: Array.from({ length: 12 }, (_, index) => makeTool({ id: `tool-${String(index)}` })),
        skills: [makeSkill({ proficiencyLevel: "EXPLORING" })],
      }),
    );
    expect(stats.skills[0]?.proficiencyLevel).toBe("EXPLORING");
  });

  it("aggregates projects by status", () => {
    const stats = computeAiEngineeringStats(
      makeAiConfig({
        projects: [
          makeAiProject({ id: "a", status: "ACTIVE" }),
          makeAiProject({ id: "b", status: "PAUSED" }),
          makeAiProject({ id: "c", status: "ACTIVE" }),
        ],
      }),
    );
    expect(stats.projectsByStatus).toEqual([
      { key: "ACTIVE", count: 2 },
      { key: "PAUSED", count: 1 },
    ]);
  });

  it("exposes only supported metrics, with no scores or percentages", () => {
    const stats = computeAiEngineeringStats(
      makeAiConfig({ tools: [makeTool()], projects: [makeAiProject()] }),
    );
    const keys = Object.keys(stats).join(" ").toLowerCase();
    expect(keys).not.toMatch(/score|productivity|efficiency|percent|rank/);
  });

  describe("activity", () => {
    it("lists declared records without inventing counts", () => {
      const stats = computeAiEngineeringStats(
        makeAiConfig({
          activities: [
            makeActivity({ id: "old", date: "2026-01-01" }),
            makeActivity({ id: "new", date: "2026-03-01", provenance: "ESTIMATED" }),
          ],
        }),
      );
      expect(stats.activities.map((activity) => activity.id)).toEqual(["new", "old"]);
      expect(stats.activities[0]?.provenance).toBe("ESTIMATED");
      expect(Object.keys(stats)).not.toContain("totalActivities");
      expect(Object.keys(stats)).not.toContain("contributions");
    });

    it("does not turn an AI project into AI work", () => {
      const stats = computeAiEngineeringStats(makeAiConfig({ projects: [makeAiProject()] }));
      expect(stats.activities).toEqual([]);
    });

    it("keeps the AI involvement of each record", () => {
      const stats = computeAiEngineeringStats(
        makeAiConfig({
          activities: [
            makeActivity({ id: "a", involvement: "AI_GENERATED" }),
            makeActivity({ id: "b", involvement: "AI_RELATED_ENGINEERING" }),
          ],
        }),
      );
      expect(stats.activities.map((activity) => activity.involvement).sort()).toEqual([
        "AI_GENERATED",
        "AI_RELATED_ENGINEERING",
      ]);
    });

    it("orders records deterministically when dates are equal", () => {
      const config = makeAiConfig({
        activities: [makeActivity({ id: "b" }), makeActivity({ id: "a" })],
      });
      expect(computeAiEngineeringStats(config).activities.map((activity) => activity.id)).toEqual([
        "a",
        "b",
      ]);
    });
  });

  describe("token usage", () => {
    it("resolves the model of each public metric and keeps provenance", () => {
      const stats = computeAiEngineeringStats(
        makeAiConfig({
          models: [makeModel()],
          tokenUsage: [makeTokenMetric({ provenance: "ESTIMATED" })],
        }),
      );
      expect(stats.tokenUsage).toHaveLength(1);
      expect(stats.tokenUsage[0]?.model.name).toBe("Claude Sonnet");
      expect(stats.tokenUsage[0]?.metric.provenance).toBe("ESTIMATED");
    });

    it("never sums or derives values", () => {
      const stats = computeAiEngineeringStats(
        makeAiConfig({
          models: [makeModel()],
          tokenUsage: [
            makeTokenMetric({ id: "u1", kind: "INPUT_TOKENS", value: 100 }),
            makeTokenMetric({ id: "u2", kind: "OUTPUT_TOKENS", value: 50 }),
          ],
        }),
      );
      expect(stats.tokenUsage.map(({ metric }) => metric.value)).toEqual([100, 50]);
    });
  });
});
