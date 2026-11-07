import { describe, expect, it } from "vitest";
import {
  computeAiEngineeringStats,
  selectPublicAiData,
} from "../src/indicators/ai-engineering/stats.js";
import { renderAiEngineeringStats } from "../src/templates/ai-engineering-stats.js";
import {
  makeActivity,
  makeAiConfig,
  makeAiProject,
  makeModel,
  makeSkill,
  makeTokenMetric,
  makeTool,
} from "./ai-fixtures.js";

const ALL_SECTIONS = {
  showActivity: true,
  showTokenUsage: true,
  showCost: true,
};

function buildEntities(): Record<string, unknown> {
  return {
    settings: ALL_SECTIONS,
    tools: [
      makeTool({ id: "open-tool", name: "OpenTool", provider: "OpenProvider" }),
      makeTool({
        id: "secret-tool",
        name: "SecretToolName",
        provider: "SecretToolProvider",
        visibility: "PRIVATE",
      }),
    ],
    models: [
      makeModel({ id: "open-model", name: "OpenModel", provider: "OpenProvider" }),
      makeModel({
        id: "secret-model",
        name: "SecretModelName",
        provider: "SecretModelProvider",
        modelFamily: "SecretFamily",
        visibility: "PRIVATE",
      }),
    ],
    skills: [
      makeSkill({ id: "open-skill", name: "OpenSkill" }),
      makeSkill({
        id: "secret-skill",
        name: "SecretSkillName",
        category: "AI_AGENTS",
        visibility: "PRIVATE",
      }),
    ],
    projects: [
      makeAiProject({ id: "open-project", name: "OpenProject", tools: ["open-tool"] }),
      makeAiProject({
        id: "secret-project",
        name: "SecretProjectName",
        description: "SecretProjectDescription",
        status: "PAUSED",
        techniques: ["VECTOR_SEARCH"],
        tools: ["secret-tool", "open-tool"],
        repositoryUrl: "https://github.com/example/secret-repository",
        websiteUrl: "https://secret-website.example.com",
        visibility: "PRIVATE",
      }),
    ],
    activities: [
      makeActivity({ id: "open-activity", description: "OpenActivityText" }),
      makeActivity({
        id: "secret-activity",
        description: "SecretActivityText",
        visibility: "PRIVATE",
      }),
      makeActivity({
        id: "linked-activity",
        description: "ActivityOfSecretProject",
        projectId: "secret-project",
      }),
    ],
    tokenUsage: [
      makeTokenMetric({ id: "open-usage", modelId: "open-model", value: 111111 }),
      makeTokenMetric({
        id: "secret-usage",
        modelId: "open-model",
        value: 222222,
        visibility: "PRIVATE",
      }),
      makeTokenMetric({ id: "secret-model-usage", modelId: "secret-model", value: 333333 }),
    ],
  };
}

const SECRETS = [
  "SecretToolName",
  "SecretToolProvider",
  "SecretModelName",
  "SecretModelProvider",
  "SecretFamily",
  "SecretSkillName",
  "SecretProjectName",
  "SecretProjectDescription",
  "secret-repository",
  "secret-website",
  "SecretActivityText",
  "ActivityOfSecretProject",
  "222,222",
  "333,333",
];

function render(overrides: Record<string, unknown>): string {
  const config = makeAiConfig(overrides);
  return renderAiEngineeringStats(computeAiEngineeringStats(config), {
    profile: config.profile,
    settings: config.settings,
    generatorVersion: "0.0.0-test",
  });
}

describe("AI engineering privacy", () => {
  it("selects only public entities", () => {
    const data = selectPublicAiData(makeAiConfig(buildEntities()));
    expect(data.tools.map((tool) => tool.id)).toEqual(["open-tool"]);
    expect(data.models.map((model) => model.id)).toEqual(["open-model"]);
    expect(data.skills.map((skill) => skill.id)).toEqual(["open-skill"]);
    expect(data.projects.map((project) => project.id)).toEqual(["open-project"]);
  });

  it("drops activities of private projects as well as private activities", () => {
    const data = selectPublicAiData(makeAiConfig(buildEntities()));
    expect(data.activities.map((activity) => activity.id)).toEqual(["open-activity"]);
  });

  it("drops token metrics that are private or belong to a private model", () => {
    const data = selectPublicAiData(makeAiConfig(buildEntities()));
    expect(data.tokenUsage.map(({ metric }) => metric.id)).toEqual(["open-usage"]);
  });

  it("does not let private entities change any total or grouping", () => {
    const withPrivate = computeAiEngineeringStats(makeAiConfig(buildEntities()));
    expect(withPrivate).toMatchObject({
      totalTools: 1,
      totalModels: 1,
      totalSkills: 1,
      totalProjects: 1,
      totalProviders: 1,
    });
    expect(withPrivate.providers).toEqual(["OpenProvider"]);
    expect(withPrivate.toolsByCategory).toEqual([{ key: "AI_ASSISTANT", count: 1 }]);
    expect(withPrivate.skillsByCategory).toEqual([{ key: "RETRIEVAL_KNOWLEDGE", count: 1 }]);
    expect(withPrivate.projectsByStatus).toEqual([{ key: "ACTIVE", count: 1 }]);
  });

  it("does not count the provider of a private tool or model", () => {
    const stats = computeAiEngineeringStats(
      makeAiConfig({
        tools: [makeTool({ provider: "Hidden", visibility: "PRIVATE" })],
        models: [makeModel({ provider: "AlsoHidden", visibility: "PRIVATE" })],
      }),
    );
    expect(stats.totalProviders).toBe(0);
  });

  it("never renders private data with every section enabled", () => {
    const svg = render(buildEntities());
    for (const secret of SECRETS) {
      expect(svg).not.toContain(secret);
    }
    expect(svg).toContain("OpenTool");
    expect(svg).toContain("OpenActivityText");
    expect(svg).toContain("111,111 tokens");
  });

  it.each([
    ["light theme", { theme: "LIGHT" }],
    ["links hidden", { showLinks: false }],
    ["projects hidden", { showProjects: false }],
  ])("never renders private data (%s)", (_name, settings) => {
    const svg = render({ ...buildEntities(), settings: { ...ALL_SECTIONS, ...settings } });
    for (const secret of SECRETS) {
      expect(svg).not.toContain(secret);
    }
  });

  it("never renders URLs, even for public projects", () => {
    const svg = render({
      projects: [
        makeAiProject({
          repositoryUrl: "https://github.com/example/public-repository",
          websiteUrl: "https://public-website.example.com",
        }),
      ],
    });
    expect(svg).not.toContain("public-repository");
    expect(svg).not.toContain("public-website");
    expect(svg).toContain("repo · site");
  });

  it("does not render public project descriptions", () => {
    const svg = render({
      projects: [makeAiProject({ description: "InternalDescriptionText" })],
    });
    expect(svg).not.toContain("InternalDescriptionText");
  });

  describe("cost", () => {
    const costOverrides = (settings: Record<string, unknown>) => ({
      settings,
      models: [makeModel()],
      tokenUsage: [
        makeTokenMetric({ id: "cost", kind: "ESTIMATED_COST", value: 424.2, unit: "USD" }),
        makeTokenMetric({ id: "tokens" }),
      ],
    });

    it("is excluded by default even when token usage is shown", () => {
      const config = makeAiConfig(costOverrides({ showTokenUsage: true }));
      const stats = computeAiEngineeringStats(config);
      expect(stats.tokenUsage.map(({ metric }) => metric.kind)).toEqual(["INPUT_TOKENS"]);
      expect(render(costOverrides({ showTokenUsage: true }))).not.toContain("$424.20");
    });

    it("is rendered only when showCost is enabled", () => {
      const svg = render(costOverrides({ showTokenUsage: true, showCost: true }));
      expect(svg).toContain("$424.20");
      expect(svg).toContain(">Estimated cost<");
    });

    it("is not rendered when token usage is hidden, even with showCost", () => {
      expect(render(costOverrides({ showTokenUsage: false, showCost: true }))).not.toContain(
        "$424.20",
      );
    });
  });
});
