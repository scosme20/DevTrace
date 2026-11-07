import { describe, expect, it } from "vitest";
import { computeStartupStats } from "../src/indicators/startup/stats.js";
import { makeConfig, makeProject } from "./fixtures.js";

function statsFor(...projects: Record<string, unknown>[]) {
  return computeStartupStats(makeConfig(projects).projects);
}

describe("computeStartupStats", () => {
  it("counts total public projects", () => {
    const stats = statsFor(makeProject({ id: "a" }), makeProject({ id: "b" }));
    expect(stats.totalProjects).toBe(2);
  });

  it("counts only ACTIVE projects as active, regardless of lifecycle stage", () => {
    const stats = statsFor(
      makeProject({ id: "a", lifecycleStage: "DEVELOPMENT", status: "ACTIVE" }),
      makeProject({ id: "b", lifecycleStage: "DEVELOPMENT", status: "PAUSED" }),
      makeProject({ id: "c", lifecycleStage: "LAUNCHED", status: "INACTIVE" }),
    );
    expect(stats.activeProjects).toBe(1);
  });

  it("counts LAUNCHED and GROWING projects as launched", () => {
    const stats = statsFor(
      makeProject({ id: "a", lifecycleStage: "LAUNCHED" }),
      makeProject({ id: "b", lifecycleStage: "GROWING" }),
      makeProject({ id: "c", lifecycleStage: "MAINTENANCE" }),
      makeProject({ id: "d", lifecycleStage: "MVP" }),
    );
    expect(stats.launchedProjects).toBe(2);
  });

  it("groups projects by lifecycle stage in lifecycle order", () => {
    const stats = statsFor(
      makeProject({ id: "a", lifecycleStage: "LAUNCHED" }),
      makeProject({ id: "b", lifecycleStage: "IDEA" }),
      makeProject({ id: "c", lifecycleStage: "LAUNCHED" }),
    );
    expect(stats.projectsByLifecycleStage).toEqual([
      { stage: "IDEA", count: 1 },
      { stage: "LAUNCHED", count: 2 },
    ]);
  });

  it("exposes the public project list in configuration order", () => {
    const stats = statsFor(
      makeProject({ id: "b", name: "B" }),
      makeProject({ id: "a", name: "A" }),
    );
    expect(stats.projectList.map((project) => project.name)).toEqual(["B", "A"]);
  });

  it("returns zeros for an empty portfolio", () => {
    expect(statsFor()).toEqual({
      totalProjects: 0,
      activeProjects: 0,
      launchedProjects: 0,
      projectsByLifecycleStage: [],
      projectList: [],
      github: {},
    });
  });

  it("is deterministic", () => {
    const projects = makeConfig([makeProject()]).projects;
    expect(computeStartupStats(projects)).toEqual(computeStartupStats(projects));
  });
});
