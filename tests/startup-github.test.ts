import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateStartupStats } from "../src/generators/startup.js";
import { linkGitHubRepositories } from "../src/indicators/github-link.js";
import { computeStartupStats } from "../src/indicators/startup/stats.js";
import { renderStartupStats } from "../src/templates/startup-stats.js";
import { makeConfig, makeProject, makeRawConfig } from "./fixtures.js";
import { makeRepository, makeSnapshot } from "./github-fixtures.js";

const LINE = "GitHub · 12 stars · 3 forks · TypeScript · release v1.2.0 (2026-10-01)";

function render(
  projects: Record<string, unknown>[],
  snapshot = makeSnapshot(),
  settings: Record<string, unknown> = {},
) {
  const config = makeConfig(projects, { settings });
  const links = linkGitHubRepositories(config.projects, snapshot);
  const stats = computeStartupStats(config.projects, links.byProjectId);
  const svg = renderStartupStats(stats, {
    profile: config.profile,
    settings: config.settings,
    generatorVersion: "0.0.0-test",
  });
  return { svg, stats, links, config };
}

const linked = (overrides: Record<string, unknown> = {}) =>
  makeProject({ id: "my-app", name: "My App", githubRepository: "octo/app", ...overrides });

describe("manual data precedence", () => {
  it("keeps every declared field exactly as written", () => {
    const declared = linked({
      name: "Declared Name",
      description: "Declared description.",
      category: "Declared category",
      lifecycleStage: "PROTOTYPE",
      status: "PAUSED",
      repositoryUrl: "https://github.com/octo/app",
    });
    const { stats, config } = render([declared]);
    expect(stats.projectList[0]).toEqual(config.projects[0]);
    expect(stats.projectList[0]).toMatchObject({
      name: "Declared Name",
      description: "Declared description.",
      lifecycleStage: "PROTOTYPE",
      status: "PAUSED",
      dataSource: "DECLARED",
    });
  });

  it("does not use GitHub to decide status, lifecycle stage or any total", () => {
    const projects = [linked({ lifecycleStage: "IDEA", status: "PAUSED" })];
    const withGitHub = render(projects).stats;
    const without = computeStartupStats(makeConfig(projects).projects);
    expect(withGitHub.totalProjects).toBe(without.totalProjects);
    expect(withGitHub.activeProjects).toBe(0);
    expect(withGitHub.launchedProjects).toBe(0);
    expect(withGitHub.projectsByLifecycleStage).toEqual(without.projectsByLifecycleStage);
    // The repository has a recent release, yet the declared stage and status win.
    expect(render(projects).svg).toContain(">Idea<");
    expect(render(projects).svg).toContain(">Paused<");
  });

  it("shows GitHub values next to the declared ones instead of replacing them", () => {
    const { svg } = render([linked()]);
    expect(svg).toContain(">My App<");
    expect(svg).toContain(`>${LINE}<`);
  });

  it("does not show GitHub data for a project that does not link a repository", () => {
    const { svg, stats } = render([makeProject({ id: "plain", name: "Plain" })]);
    expect(stats.github).toEqual({});
    expect(svg).not.toContain("GitHub ·");
  });

  it("renders exactly the same SVG when no snapshot is available", () => {
    const projects = [makeProject()];
    const config = makeConfig(projects);
    const plain = renderStartupStats(computeStartupStats(config.projects), {
      profile: config.profile,
      settings: config.settings,
      generatorVersion: "0.0.0-test",
    });
    expect(render(projects).svg).toBe(plain);
  });

  it("keeps a declared repository link indicator and adds one for linked projects", () => {
    expect(render([linked()]).svg).toContain(">repo<");
    const manual = makeProject({ repositoryUrl: "https://example.com/repo" });
    expect(render([manual], makeSnapshot([])).svg).toContain(">repo<");
    expect(render([makeProject()], makeSnapshot([])).svg).not.toContain(">repo<");
  });

  it("hides the repository indicator when links are disabled but keeps the observed line", () => {
    const { svg } = render([linked()], makeSnapshot(), { showLinks: false });
    expect(svg).not.toContain(">repo<");
    expect(svg).toContain(LINE);
  });
});

describe("data provenance", () => {
  it("marks repository data as OBSERVED and leaves the declared provenance alone", () => {
    const { stats } = render([linked({ dataSource: "ESTIMATED" })]);
    expect(stats.github["my-app"]?.provenance).toBe("OBSERVED");
    expect(stats.projectList[0]?.dataSource).toBe("ESTIMATED");
  });

  it("labels every observed line with its source", () => {
    expect(render([linked()]).svg).toMatch(/>GitHub · /);
  });

  it("does not invent commercial metrics for a linked repository", () => {
    const { svg } = render([linked()]);
    expect(svg).not.toMatch(/revenue|mrr|arr\b|customers|users|sales|conversion/i);
  });
});

describe("observed line formatting", () => {
  it("uses singular words for one star and one fork", () => {
    const snapshot = makeSnapshot([
      makeRepository({ stars: 1, forks: 1, latestRelease: undefined }),
    ]);
    expect(render([linked()], snapshot).svg).toContain(">GitHub · 1 star · 1 fork · TypeScript<");
  });

  it("groups thousands so large counts stay readable", () => {
    const snapshot = makeSnapshot([
      makeRepository({ stars: 3909, forks: 1234567, latestRelease: undefined }),
    ]);
    expect(render([linked()], snapshot).svg).toContain(
      ">GitHub · 3,909 stars · 1,234,567 forks · TypeScript<",
    );
  });

  it("shows only what was collected", () => {
    const snapshot = makeSnapshot([
      makeRepository({ stars: undefined, forks: undefined, latestRelease: undefined }),
    ]);
    expect(render([linked()], snapshot).svg).toContain(">GitHub · TypeScript<");
  });

  it("shows zero counts as facts", () => {
    const snapshot = makeSnapshot([
      makeRepository({ stars: 0, forks: 0, language: undefined, latestRelease: undefined }),
    ]);
    expect(render([linked()], snapshot).svg).toContain(">GitHub · 0 stars · 0 forks<");
  });

  it("escapes text that came from GitHub", () => {
    const snapshot = makeSnapshot([
      makeRepository({
        language: "<b>evil</b>",
        latestRelease: { tagName: '"><script>', publishedAt: "2026-10-01T10:00:00Z" },
      }),
    ]);
    const { svg } = render([linked()], snapshot);
    expect(svg).not.toMatch(/<b>|<script/);
    expect(svg).toContain("&lt;b&gt;evil&lt;/b&gt;");
  });

  it("never renders the repository description or URL", () => {
    const snapshot = makeSnapshot([makeRepository({ description: "UniqueGitHubDescription" })]);
    const { svg } = render([linked()], snapshot);
    expect(svg).not.toContain("UniqueGitHubDescription");
    expect(svg).not.toContain("github.com/octo/app");
  });

  it("makes the card taller to fit the observed line", () => {
    const height = (svg: string) => Number(/height="(\d+)" viewBox/.exec(svg)?.[1]);
    expect(height(render([linked()]).svg)).toBeGreaterThan(
      height(render([linked()], makeSnapshot([])).svg),
    );
  });

  it("matches the linked repository ignoring case", () => {
    expect(render([linked({ githubRepository: "OCTO/App" })]).svg).toContain(LINE);
  });
});

describe("linkGitHubRepositories", () => {
  const publicProject = (overrides: Record<string, unknown> = {}) =>
    makeConfig([linked(overrides)]).projects;

  it("links by project ID", () => {
    expect(
      linkGitHubRepositories(publicProject(), makeSnapshot()).byProjectId["my-app"]?.fullName,
    ).toBe("octo/app");
  });

  it("warns when a linked repository has no data", () => {
    const { warnings, byProjectId } = linkGitHubRepositories(
      publicProject({ githubRepository: "octo/missing" }),
      makeSnapshot(),
    );
    expect(byProjectId).toEqual({});
    expect(warnings).toEqual([
      'Project "my-app" links GitHub repository "octo/missing" but no data is available for it. Run "pnpm sync:github".',
    ]);
  });

  it("warns when there is no snapshot at all", () => {
    expect(linkGitHubRepositories(publicProject(), undefined).warnings).toHaveLength(1);
  });

  it("warns about a conflicting repositoryUrl and keeps the declared value", () => {
    const projects = publicProject({ repositoryUrl: "https://github.com/someone/else" });
    const { warnings } = linkGitHubRepositories(projects, makeSnapshot());
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("The declared value is kept.");
    expect(projects[0]?.repositoryUrl).toBe("https://github.com/someone/else");
  });

  it.each([
    "https://github.com/octo/app",
    "https://GitHub.com/Octo/App/",
    "https://github.com/octo/app.git",
  ])("does not warn when repositoryUrl %s points at the same repository", (repositoryUrl) => {
    expect(
      linkGitHubRepositories(publicProject({ repositoryUrl }), makeSnapshot()).warnings,
    ).toEqual([]);
  });

  it("ignores private projects completely, so their IDs never reach a log", () => {
    const projects = makeConfig([
      linked({ id: "secret-project", visibility: "PRIVATE", githubRepository: "octo/missing" }),
      linked({ id: "secret-two", visibility: "PRIVATE", repositoryUrl: "https://github.com/x/y" }),
    ]).projects;
    const { warnings, byProjectId } = linkGitHubRepositories(projects, makeSnapshot());
    expect(warnings).toEqual([]);
    expect(byProjectId).toEqual({});
  });
});

describe("privacy", () => {
  it("never renders observed data of a private project", () => {
    const snapshot = makeSnapshot([
      makeRepository({
        fullName: "octo/hidden",
        url: "https://github.com/octo/hidden",
        stars: 777,
      }),
    ]);
    const projects = [
      linked({
        id: "secret",
        name: "SecretName",
        visibility: "PRIVATE",
        githubRepository: "octo/hidden",
      }),
      makeProject({ id: "open", name: "OpenName" }),
    ];
    const { svg, stats } = render(projects, snapshot);
    expect(stats.github).toEqual({});
    expect(svg).not.toContain("777");
    expect(svg).not.toContain("SecretName");
  });

  it("restricts observed data to projects that are listed", () => {
    const config = makeConfig([linked({ visibility: "PRIVATE" })]);
    const stats = computeStartupStats(config.projects, { "my-app": makeRepository() });
    expect(stats.github).toEqual({});
  });
});

describe("generateStartupStats with a snapshot", () => {
  let root: string;
  const svgPath = () => path.join(root, "public", "indicators", "startup-stats.svg");

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "devtrace-sg-"));
    await mkdir(path.join(root, "data"), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const writeStartup = (projects: unknown[]) =>
    writeFile(
      path.join(root, "data", "startup.json"),
      JSON.stringify(makeRawConfig(projects)),
      "utf8",
    );
  const writeSnapshot = (content: unknown) =>
    writeFile(path.join(root, "data", "github-snapshot.json"), JSON.stringify(content), "utf8");

  it("reads the snapshot from disk and never needs the network", async () => {
    await writeStartup([linked()]);
    await writeSnapshot(makeSnapshot());
    const svg = await readFile(await generateStartupStats(root), "utf8");
    expect(svg).toContain(LINE);
  });

  it("is deterministic for the same snapshot", async () => {
    await writeStartup([linked()]);
    await writeSnapshot(makeSnapshot());
    const first = await readFile(await generateStartupStats(root), "utf8");
    expect(await readFile(await generateStartupStats(root), "utf8")).toBe(first);
  });

  it("works without a snapshot, warning about linked projects", async () => {
    await writeStartup([linked()]);
    const warnings: string[] = [];
    const svg = await readFile(
      await generateStartupStats(root, { warn: (m) => warnings.push(m) }),
      "utf8",
    );
    expect(svg).not.toContain("GitHub ·");
    expect(svg).toContain(">My App<");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("pnpm sync:github");
  });

  it("works without a snapshot and without links, with no warnings", async () => {
    await writeStartup([makeProject()]);
    const warnings: string[] = [];
    await generateStartupStats(root, { warn: (m) => warnings.push(m) });
    expect(warnings).toEqual([]);
  });

  it("does not replace the existing SVG when the snapshot is invalid", async () => {
    await writeStartup([linked()]);
    await mkdir(path.dirname(svgPath()), { recursive: true });
    await writeFile(svgPath(), "<svg>previous</svg>", "utf8");
    await writeSnapshot({ version: 1, repositories: "broken" });
    await expect(generateStartupStats(root)).rejects.toThrow(
      "Failed to generate startup statistics indicator.",
    );
    expect(await readFile(svgPath(), "utf8")).toBe("<svg>previous</svg>");
  });

  it("does not claim non-observed data: a snapshot with other provenance is rejected", async () => {
    await writeStartup([linked()]);
    await writeSnapshot(makeSnapshot([{ ...makeRepository(), provenance: "ESTIMATED" } as never]));
    await expect(generateStartupStats(root)).rejects.toThrow();
    await expect(readFile(svgPath())).rejects.toThrow();
  });

  it("passes the warnings of a conflicting repositoryUrl to the caller", async () => {
    await writeStartup([linked({ repositoryUrl: "https://github.com/someone/else" })]);
    await writeSnapshot(makeSnapshot());
    const warnings: string[] = [];
    await generateStartupStats(root, { warn: (m) => warnings.push(m) });
    expect(warnings[0]).toContain("differs from GitHub repository octo/app");
  });
});
