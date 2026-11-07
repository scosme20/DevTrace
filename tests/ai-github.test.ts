import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateAiEngineeringStats } from "../src/generators/ai-engineering.js";
import { computeAiEngineeringStats } from "../src/indicators/ai-engineering/stats.js";
import { linkGitHubRepositories } from "../src/indicators/github-link.js";
import { renderAiEngineeringStats } from "../src/templates/ai-engineering-stats.js";
import {
  makeActivity,
  makeAiConfig,
  makeAiProject,
  makeModel,
  makeRawAiConfig,
  makeSkill,
  makeTokenMetric,
  makeTool,
} from "./ai-fixtures.js";
import { makeRepository, makeSnapshot } from "./github-fixtures.js";

const LINE = "GitHub · 12 stars · 3 forks · TypeScript · release v1.2.0 (2026-10-01)";

function render(overrides: Record<string, unknown>, snapshot = makeSnapshot()) {
  const config = makeAiConfig(overrides);
  const links = linkGitHubRepositories(config.projects, snapshot);
  const stats = computeAiEngineeringStats(config, links.byProjectId);
  const svg = renderAiEngineeringStats(stats, {
    profile: config.profile,
    settings: config.settings,
    generatorVersion: "0.0.0-test",
  });
  return { svg, stats, links, config };
}

const linkedProject = (overrides: Record<string, unknown> = {}) =>
  makeAiProject({
    id: "doc-assistant",
    name: "Doc Assistant",
    githubRepository: "octo/app",
    ...overrides,
  });

const everythingElse = {
  tools: [makeTool()],
  models: [makeModel()],
  skills: [makeSkill()],
  activities: [makeActivity()],
  tokenUsage: [makeTokenMetric()],
  settings: { showActivity: true, showTokenUsage: true },
};

describe("AI engineering GitHub integration", () => {
  it("shows observed repository data under the project, after the declared techniques", () => {
    const { svg } = render({ projects: [linkedProject({ techniques: ["RAG"] })] });
    expect(svg).toContain(">RAG<");
    expect(svg).toContain(`>${LINE}<`);
    expect(svg.indexOf(">RAG<")).toBeLessThan(svg.indexOf(LINE));
  });

  it("shows only the observed line when no techniques are declared", () => {
    expect(render({ projects: [linkedProject({ techniques: [] })] }).svg).toContain(LINE);
  });

  it("keeps declared project fields exactly as written", () => {
    const { stats, config } = render({ projects: [linkedProject({ status: "PAUSED" })] });
    expect(stats.projects[0]).toEqual(config.projects[0]);
    expect(stats.projects[0]).toMatchObject({ status: "PAUSED", provenance: "DECLARED" });
    expect(stats.projectsByStatus).toEqual([{ key: "PAUSED", count: 1 }]);
  });

  it("marks the data as OBSERVED without touching the declared provenance", () => {
    const { stats } = render({ projects: [linkedProject({ provenance: "ESTIMATED" })] });
    expect(stats.github["doc-assistant"]?.provenance).toBe("OBSERVED");
    expect(stats.projects[0]?.provenance).toBe("ESTIMATED");
  });

  it("never infers tools, models, skills, activity or token usage from a repository", () => {
    const withRepo = render({ projects: [linkedProject()] }).stats;
    expect(withRepo).toMatchObject({
      totalTools: 0,
      totalModels: 0,
      totalSkills: 0,
      totalProviders: 0,
      toolsByCategory: [],
      skillsByCategory: [],
      activities: [],
      tokenUsage: [],
    });
  });

  it("leaves declared tools, models, skills, activity and token usage untouched", () => {
    const withRepo = render({ ...everythingElse, projects: [linkedProject()] }).stats;
    const withoutRepo = render(
      { ...everythingElse, projects: [makeAiProject()] },
      makeSnapshot([]),
    ).stats;
    for (const key of ["tools", "models", "skills", "activities", "tokenUsage"] as const) {
      expect(withRepo[key]).toEqual(withoutRepo[key]);
    }
  });

  it("does not add AI-related claims to the card", () => {
    const { svg } = render({ projects: [linkedProject()] });
    expect(svg).not.toMatch(
      /copilot|chatgpt|claude|cursor|windsurf|tokens? used|ai-written|percent/i,
    );
  });

  it("shows a repository indicator for a linked project without a declared URL", () => {
    expect(render({ projects: [linkedProject()] }).svg).toContain(">repo<");
    expect(render({ projects: [makeAiProject()] }, makeSnapshot([])).svg).not.toContain(">repo<");
  });

  it("renders exactly the same SVG when no snapshot is available", () => {
    const projects = [makeAiProject()];
    const config = makeAiConfig({ projects });
    const plain = renderAiEngineeringStats(computeAiEngineeringStats(config), {
      profile: config.profile,
      settings: config.settings,
      generatorVersion: "0.0.0-test",
    });
    expect(render({ projects }).svg).toBe(plain);
  });

  it("makes the card taller to fit the observed line", () => {
    const height = (svg: string) => Number(/height="(\d+)" viewBox/.exec(svg)?.[1]);
    const withData = render({ projects: [linkedProject()] }).svg;
    const withoutData = render({ projects: [linkedProject()] }, makeSnapshot([])).svg;
    expect(height(withData)).toBeGreaterThan(height(withoutData));
  });

  it("escapes text that came from GitHub", () => {
    const snapshot = makeSnapshot([makeRepository({ language: "<i>x</i>" })]);
    const { svg } = render({ projects: [linkedProject()] }, snapshot);
    expect(svg).not.toContain("<i>");
    expect(svg).toContain("&lt;i&gt;x&lt;/i&gt;");
  });

  it("warns about a link without data or a conflicting URL, and keeps the declared value", () => {
    const missing = render({ projects: [linkedProject({ githubRepository: "octo/missing" })] });
    expect(missing.links.warnings).toHaveLength(1);
    const conflict = render({
      projects: [linkedProject({ repositoryUrl: "https://github.com/a/b" })],
    });
    expect(conflict.links.warnings[0]).toContain("The declared value is kept.");
    expect(conflict.config.projects[0]?.repositoryUrl).toBe("https://github.com/a/b");
  });
});

describe("AI engineering privacy with GitHub data", () => {
  it("never renders observed data of a private project", () => {
    const snapshot = makeSnapshot([makeRepository({ stars: 4242 })]);
    const { svg, stats, links } = render(
      { projects: [linkedProject({ name: "SecretAiProject", visibility: "PRIVATE" })] },
      snapshot,
    );
    expect(stats.github).toEqual({});
    expect(links.warnings).toEqual([]);
    expect(svg).not.toContain("4242");
    expect(svg).not.toContain("SecretAiProject");
  });

  it("does not warn about private projects, so their IDs stay out of logs", () => {
    const config = makeAiConfig({
      projects: [
        linkedProject({ id: "secret-ai", visibility: "PRIVATE", githubRepository: "octo/missing" }),
      ],
    });
    expect(linkGitHubRepositories(config.projects, makeSnapshot()).warnings).toEqual([]);
  });
});

describe("generateAiEngineeringStats with a snapshot", () => {
  let root: string;
  const svgPath = () => path.join(root, "public", "indicators", "ai-engineering-stats.svg");

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "devtrace-ag-"));
    await mkdir(path.join(root, "data"), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const writeConfig = (projects: unknown[]) =>
    writeFile(
      path.join(root, "data", "ai-engineering.json"),
      JSON.stringify(makeRawAiConfig({ projects })),
      "utf8",
    );
  const writeSnapshot = (content: unknown) =>
    writeFile(path.join(root, "data", "github-snapshot.json"), JSON.stringify(content), "utf8");

  it("reads the snapshot from disk and never needs the network", async () => {
    await writeConfig([linkedProject()]);
    await writeSnapshot(makeSnapshot());
    expect(await readFile(await generateAiEngineeringStats(root), "utf8")).toContain(LINE);
  });

  it("works without a snapshot, warning about linked projects", async () => {
    await writeConfig([linkedProject()]);
    const warnings: string[] = [];
    const svg = await readFile(
      await generateAiEngineeringStats(root, { warn: (m) => warnings.push(m) }),
      "utf8",
    );
    expect(svg).not.toContain("GitHub ·");
    expect(warnings[0]).toContain("pnpm sync:github");
  });

  it("does not replace the existing SVG when the snapshot is invalid", async () => {
    await writeConfig([linkedProject()]);
    await mkdir(path.dirname(svgPath()), { recursive: true });
    await writeFile(svgPath(), "<svg>previous</svg>", "utf8");
    await writeSnapshot({ nope: true });
    await expect(generateAiEngineeringStats(root)).rejects.toThrow(
      "Failed to generate AI engineering statistics indicator.",
    );
    expect(await readFile(svgPath(), "utf8")).toBe("<svg>previous</svg>");
  });
});
