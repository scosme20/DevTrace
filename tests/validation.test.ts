import { describe, expect, it } from "vitest";
import { validateStartupConfig } from "../src/core/validation.js";
import { makeProject, makeRawConfig } from "./fixtures.js";

function errorsFor(input: unknown): readonly string[] {
  const result = validateStartupConfig(input);
  return result.ok ? [] : result.errors;
}

function projectErrors(...projects: unknown[]): readonly string[] {
  return errorsFor(makeRawConfig(projects));
}

describe("validateStartupConfig", () => {
  it("accepts a valid configuration", () => {
    expect(validateStartupConfig(makeRawConfig()).ok).toBe(true);
  });

  it("accepts an empty portfolio", () => {
    expect(validateStartupConfig(makeRawConfig([])).ok).toBe(true);
  });

  it("applies defaults when profile and settings are omitted", () => {
    const result = validateStartupConfig(makeRawConfig());
    expect(result.ok && result.value.settings).toEqual({
      theme: "DARK",
      showProjectList: true,
      showLifecycleDistribution: true,
      showLinks: true,
    });
    expect(result.ok && result.value.profile.displayName).toBe("Developer Portfolio");
  });

  it("accepts explicit settings", () => {
    const result = validateStartupConfig(
      makeRawConfig([], {
        profile: { displayName: "Jane Doe" },
        settings: { theme: "LIGHT", showLinks: false },
      }),
    );
    expect(result.ok && result.value.settings.theme).toBe("LIGHT");
    expect(result.ok && result.value.settings.showLinks).toBe(false);
    expect(result.ok && result.value.settings.showProjectList).toBe(true);
  });

  it("accepts optional URLs and full ISO datetimes", () => {
    const project = makeProject({
      repositoryUrl: "https://github.com/example/app",
      websiteUrl: "https://example.com",
      createdAt: "2026-01-01T10:00:00Z",
    });
    expect(projectErrors(project)).toEqual([]);
  });

  it("rejects a missing or unsupported version", () => {
    expect(errorsFor({ projects: [] }).join("\n")).toContain("version");
    expect(errorsFor({ version: 2, projects: [] }).join("\n")).toContain(
      "Unsupported configuration version",
    );
  });

  it("rejects an invalid theme without correcting it", () => {
    const errors = errorsFor(makeRawConfig([], { settings: { theme: "NEON" } }));
    expect(errors.join("\n")).toContain("Invalid theme: NEON.");
  });

  it("rejects non-boolean settings", () => {
    const errors = errorsFor(makeRawConfig([], { settings: { showLinks: "yes" } }));
    expect(errors.some((error) => error.startsWith("settings.showLinks"))).toBe(true);
  });

  it("reports missing required fields", () => {
    const errors = projectErrors(makeProject({ name: undefined }));
    expect(errors.join("\n")).toContain("projects[0].name");
  });

  it("rejects an invalid lifecycle stage", () => {
    const errors = projectErrors(makeProject({ lifecycleStage: "UNKNOWN" }));
    expect(errors.join("\n")).toContain(
      "projects[0].lifecycleStage: Invalid lifecycle stage: UNKNOWN.",
    );
  });

  it("rejects an invalid operational status", () => {
    const errors = projectErrors(makeProject({ status: "RUNNING" }));
    expect(errors.join("\n")).toContain("Invalid operational status: RUNNING.");
  });

  it("rejects an invalid visibility", () => {
    const errors = projectErrors(makeProject({ visibility: "SECRET" }));
    expect(errors.some((error) => error.startsWith("projects[0].visibility"))).toBe(true);
  });

  it("requires visibility so a project is never public by accident", () => {
    const errors = projectErrors(makeProject({ visibility: undefined }));
    expect(errors.some((error) => error.startsWith("projects[0].visibility"))).toBe(true);
  });

  it("rejects duplicate project ids", () => {
    const errors = projectErrors(
      makeProject({ id: "buildflow" }),
      makeProject({ id: "buildflow" }),
    );
    expect(errors).toContain("projects[1].id: Duplicate project ID detected: buildflow.");
  });

  it("rejects malformed and non-http URLs", () => {
    const errors = projectErrors(
      makeProject({ repositoryUrl: "not a url" }),
      makeProject({ id: "other", websiteUrl: "javascript:alert(1)" }),
    );
    expect(errors.some((error) => error.startsWith("projects[0].repositoryUrl"))).toBe(true);
    expect(errors.some((error) => error.startsWith("projects[1].websiteUrl"))).toBe(true);
  });

  it("rejects invalid dates", () => {
    const errors = projectErrors(makeProject({ createdAt: "2026-13-45" }));
    expect(errors.some((error) => error.startsWith("projects[0].createdAt"))).toBe(true);
  });

  it("rejects inconsistent data", () => {
    const backwards = projectErrors(
      makeProject({ createdAt: "2026-05-01", updatedAt: "2026-01-01" }),
    );
    const archived = projectErrors(makeProject({ lifecycleStage: "ARCHIVED", status: "ACTIVE" }));
    expect(backwards.join("\n")).toContain("updatedAt is before createdAt");
    expect(archived.join("\n")).toContain("ARCHIVED project cannot have the ACTIVE status");
  });

  it("rejects unknown fields instead of ignoring them", () => {
    expect(projectErrors(makeProject({ revenue: 1000 })).length).toBeGreaterThan(0);
    expect(errorsFor(makeRawConfig([], { extra: true })).length).toBeGreaterThan(0);
  });

  it("keeps lifecycle stage and operational status independent", () => {
    const projects = [
      makeProject({ lifecycleStage: "DEVELOPMENT", status: "ACTIVE" }),
      makeProject({ id: "paused-app", lifecycleStage: "DEVELOPMENT", status: "PAUSED" }),
    ];
    expect(projectErrors(...projects)).toEqual([]);
  });
});
