import { describe, expect, it } from "vitest";
import { computeStartupStats, selectPublicProjects } from "../src/indicators/startup/stats.js";
import { renderStartupStats } from "../src/templates/startup-stats.js";
import { makeConfig, makeProject } from "./fixtures.js";

const privateProject = makeProject({
  id: "secret-app",
  name: "TopSecretName",
  description: "TopSecretDescription",
  category: "TopSecretCategory",
  lifecycleStage: "GROWING",
  status: "ACTIVE",
  visibility: "PRIVATE",
  repositoryUrl: "https://github.com/example/secret-repo",
  websiteUrl: "https://secret.example.com",
});

const publicProject = makeProject({ id: "open-app", name: "OpenApp" });

function renderAll(settings: Record<string, unknown> = {}): string {
  const config = makeConfig([publicProject, privateProject], { settings });
  return renderStartupStats(computeStartupStats(config.projects), {
    profile: config.profile,
    settings: config.settings,
    generatorVersion: "0.0.0-test",
  });
}

describe("privacy", () => {
  it("includes public projects", () => {
    const projects = makeConfig([publicProject, privateProject]).projects;
    expect(selectPublicProjects(projects).map((project) => project.id)).toEqual(["open-app"]);
  });

  it("excludes private projects from every statistic", () => {
    const stats = computeStartupStats(makeConfig([publicProject, privateProject]).projects);
    expect(stats.totalProjects).toBe(1);
    expect(stats.activeProjects).toBe(1);
    expect(stats.launchedProjects).toBe(0);
    expect(stats.projectsByLifecycleStage).toEqual([{ stage: "MVP", count: 1 }]);
    expect(stats.projectList.map((project) => project.id)).toEqual(["open-app"]);
  });

  it("does not change statistics when private projects are added", () => {
    const withPrivate = computeStartupStats(makeConfig([publicProject, privateProject]).projects);
    const withoutPrivate = computeStartupStats(makeConfig([publicProject]).projects);
    expect(withPrivate).toEqual(withoutPrivate);
  });

  it("treats a portfolio with only private projects as empty", () => {
    const stats = computeStartupStats(makeConfig([privateProject]).projects);
    expect(stats.totalProjects).toBe(0);
    expect(stats.projectList).toEqual([]);
  });

  it.each([
    ["default settings", {}],
    ["light theme", { theme: "LIGHT" }],
    ["links hidden", { showLinks: false }],
    ["list hidden", { showProjectList: false }],
  ])("never renders private data (%s)", (_name, settings) => {
    const svg = renderAll(settings);
    for (const secret of [
      "TopSecretName",
      "TopSecretDescription",
      "TopSecretCategory",
      "secret-app",
      "secret-repo",
      "secret.example.com",
    ]) {
      expect(svg).not.toContain(secret);
    }
  });

  it("never renders URLs of public projects either", () => {
    const config = makeConfig([
      makeProject({ repositoryUrl: "https://github.com/example/public-repo" }),
    ]);
    const svg = renderStartupStats(computeStartupStats(config.projects), {
      profile: config.profile,
      settings: config.settings,
      generatorVersion: "0.0.0-test",
    });
    expect(svg).not.toContain("public-repo");
    expect(svg).toContain("repo");
  });
});
