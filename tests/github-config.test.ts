import { describe, expect, it } from "vitest";
import { validateGitHubConfig, validateGitHubSnapshot } from "../src/core/github-validation.js";
import { makeRepository, makeSnapshot } from "./github-fixtures.js";

function configErrors(input: unknown): string {
  const result = validateGitHubConfig(input);
  return result.ok ? "" : result.errors.join("\n");
}

function snapshotErrors(input: unknown): string {
  const result = validateGitHubSnapshot(input);
  return result.ok ? "" : result.errors.join("\n");
}

describe("validateGitHubConfig", () => {
  it("accepts a minimal configuration and applies defaults", () => {
    const result = validateGitHubConfig({ version: 1, username: "octo" });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({
      version: 1,
      username: "octo",
      repositories: { include: [], exclude: [], includeForks: false, includeArchived: false },
      collect: { description: true, language: true, stars: true, forks: true, releases: true },
      onUnavailable: "SKIP",
      cacheTtlMinutes: 60,
    });
  });

  it("accepts a complete configuration", () => {
    expect(
      validateGitHubConfig({
        version: 1,
        username: "octo-cat",
        repositories: {
          include: ["app", "other-org/tool"],
          exclude: ["scratch"],
          includeForks: true,
          includeArchived: true,
        },
        collect: { stars: false, releases: false },
        onUnavailable: "FAIL",
        cacheTtlMinutes: 0,
      }).ok,
    ).toBe(true);
  });

  it("requires a version and a username", () => {
    expect(configErrors({ username: "octo" })).toContain("version");
    expect(configErrors({ version: 2, username: "octo" })).toContain(
      "Unsupported configuration version",
    );
    expect(configErrors({ version: 1 })).toContain("username");
  });

  it.each([
    "",
    "-leading",
    "trailing-",
    "double--hyphen",
    "has space",
    "a".repeat(40),
    "under_score",
  ])("rejects the invalid username %j", (username) => {
    expect(configErrors({ version: 1, username })).toContain("Invalid GitHub username.");
  });

  it("rejects malformed repository entries", () => {
    expect(
      configErrors({ version: 1, username: "octo", repositories: { include: ["a/b/c"] } }),
    ).toContain("repositories.include[0]");
    expect(
      configErrors({ version: 1, username: "octo", repositories: { exclude: ["bad name"] } }),
    ).toContain("repositories.exclude[0]");
  });

  it("rejects an invalid unavailable-repository behavior", () => {
    expect(configErrors({ version: 1, username: "octo", onUnavailable: "IGNORE" })).toContain(
      "Invalid unavailable repository behavior: IGNORE.",
    );
  });

  it("rejects an invalid cache TTL", () => {
    for (const cacheTtlMinutes of [-1, 1441, 1.5, "60"]) {
      expect(configErrors({ version: 1, username: "octo", cacheTtlMinutes })).toContain(
        "cacheTtlMinutes",
      );
    }
  });

  it("never accepts credentials in the configuration file", () => {
    expect(configErrors({ version: 1, username: "octo", token: "ghp_example" })).not.toBe("");
    expect(configErrors({ version: 1, username: "octo", auth: { token: "x" } })).not.toBe("");
  });

  it("rejects unknown fields and non-boolean flags", () => {
    expect(configErrors({ version: 1, username: "octo", extra: true })).not.toBe("");
    expect(configErrors({ version: 1, username: "octo", collect: { stars: "yes" } })).toContain(
      "collect.stars",
    );
  });
});

describe("validateGitHubSnapshot", () => {
  it("accepts a valid snapshot", () => {
    expect(validateGitHubSnapshot(makeSnapshot()).ok).toBe(true);
  });

  it("accepts an empty snapshot", () => {
    expect(validateGitHubSnapshot(makeSnapshot([])).ok).toBe(true);
  });

  it("only accepts OBSERVED data, so estimates cannot be passed off as observed", () => {
    const snapshot = makeSnapshot([{ ...makeRepository(), provenance: "ESTIMATED" } as never]);
    expect(snapshotErrors(snapshot)).toContain("Snapshot data must be OBSERVED.");
    const declared = makeSnapshot([{ ...makeRepository(), provenance: "DECLARED" } as never]);
    expect(snapshotErrors(declared)).toContain("OBSERVED");
  });

  it("rejects duplicate repositories, ignoring case", () => {
    const snapshot = makeSnapshot([
      makeRepository(),
      makeRepository({ fullName: "OCTO/App", url: "https://github.com/OCTO/App" }),
    ]);
    expect(snapshotErrors(snapshot)).toContain("Duplicate repository detected: OCTO/App.");
  });

  it("rejects repository URLs that are not on github.com", () => {
    expect(
      snapshotErrors(makeSnapshot([makeRepository({ url: "https://evil.example/octo/app" })])),
    ).toContain("Expected https://github.com/owner/name.");
  });

  it("rejects negative counts and invalid dates", () => {
    expect(snapshotErrors(makeSnapshot([makeRepository({ stars: -1 })]))).toContain("stars");
    expect(snapshotErrors(makeSnapshot([makeRepository({ createdAt: "yesterday" })]))).toContain(
      "createdAt",
    );
    expect(snapshotErrors(makeSnapshot([], { fetchedAt: "not a date" }))).toContain("fetchedAt");
  });

  it("rejects an unsupported version and an unexpected source", () => {
    expect(snapshotErrors({ ...makeSnapshot(), version: 2 })).toContain(
      "Unsupported snapshot version",
    );
    expect(snapshotErrors({ ...makeSnapshot(), source: "somewhere else" })).toContain("source");
  });

  it("rejects unknown fields", () => {
    expect(snapshotErrors({ ...makeSnapshot(), private: true })).not.toBe("");
  });
});
