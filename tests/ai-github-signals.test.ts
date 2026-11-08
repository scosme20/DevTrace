import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GitHubRepository } from "../src/core/github-models.js";
import { validateGitHubConfig, validateGitHubSnapshot } from "../src/core/github-validation.js";
import { generateAiEngineeringStats } from "../src/generators/ai-engineering.js";
import { GitHubApiError } from "../src/github/client.js";
import { aiTopics, coauthorAssistants, detectToolFiles } from "../src/github/ai-signals.js";
import { collectRepositories } from "../src/github/collect.js";
import {
  foundInRepositories,
  releaseMilestones,
} from "../src/indicators/ai-engineering/github-signals.js";
import { computeAiEngineeringStats } from "../src/indicators/ai-engineering/stats.js";
import { renderAiEngineeringDashboard } from "../src/templates/ai-engineering-dashboard.js";
import { makeAiConfig, makeRawAiConfig, makeTool } from "./ai-fixtures.js";
import {
  fakeClient,
  makeReleaseResponse,
  makeRepoResponse,
  makeRepository,
  makeSnapshot,
} from "./github-fixtures.js";

const SECRET = "ZZ-SECRET-COMMIT-TEXT";

const message = (...trailers: string[]) =>
  `Fix the thing\n\nA body that says ${SECRET}.\n\n${trailers.join("\n")}`;

// ----------------------------------------------------------- pure detection

describe("AI co-author trailers", () => {
  it("recognize the assistants by the name or address in a Co-authored-by line", () => {
    expect(coauthorAssistants("x\n\nCo-Authored-By: Claude Opus <noreply@anthropic.com>")).toEqual([
      "Claude",
    ]);
    expect(coauthorAssistants("Co-authored-by: Copilot <copilot@github.com>")).toEqual([
      "GitHub Copilot",
    ]);
    expect(coauthorAssistants("co-authored-by: Cursor Agent <cursoragent@cursor.com>")).toEqual([
      "Cursor",
    ]);
    expect(coauthorAssistants("Co-authored-by: codex <codex@openai.com>")).toEqual(["OpenAI"]);
    expect(coauthorAssistants("Co-authored-by: Gemini <gemini@google.com>")).toEqual(["Gemini"]);
  });

  it("report each assistant once, sorted, when a commit names several", () => {
    const text =
      "Co-authored-by: Claude <a@anthropic.com>\nCo-authored-by: Claude Code <b@anthropic.com>\nCo-authored-by: Copilot <c@github.com>";
    expect(coauthorAssistants(text)).toEqual(["Claude", "GitHub Copilot"]);
  });

  it("ignore the word in the body, a human co-author and an unrelated trailer", () => {
    expect(coauthorAssistants("I paired with Claude and Copilot on this.")).toEqual([]);
    expect(coauthorAssistants("Co-authored-by: Ana Silva <ana@example.com>")).toEqual([]);
    expect(coauthorAssistants("Signed-off-by: Claude <claude@example.com>")).toEqual([]);
    expect(coauthorAssistants("")).toEqual([]);
  });
});

describe("configuration files and topics", () => {
  it("name the assistants whose files exist", () => {
    expect(
      detectToolFiles([
        "README.md",
        "CLAUDE.md",
        ".cursor/rules/a.mdc",
        ".github/copilot-instructions.md",
        "src/a.ts",
        "AGENTS.md",
      ]),
    ).toEqual(["AGENTS.md", "Claude Code", "Cursor", "GitHub Copilot"]);
    expect(detectToolFiles([".claude/settings.json"])).toEqual(["Claude Code"]);
  });

  it("do not match a file of the same name in a subfolder, or nothing at all", () => {
    expect(detectToolFiles(["docs/CLAUDE.md", "src/AGENTS.md", "notes/.cursorrules"])).toEqual([]);
    expect(detectToolFiles([])).toEqual([]);
  });

  it("turn AI topics into readable names, once each", () => {
    expect(aiTopics(["llm", "rag", "typescript", "LLMs", "ai-agents", "agents"])).toEqual([
      "AI agents",
      "LLM",
      "RAG",
    ]);
    expect(aiTopics(["react", "css"])).toEqual([]);
  });
});

// ---------------------------------------------------------------- collection

describe("collecting releases and AI signals", () => {
  const config = (collect: Record<string, unknown>) => {
    const result = validateGitHubConfig({ version: 1, username: "octo", collect });
    if (!result.ok) throw new Error(result.errors.join("\n"));
    return result.value;
  };

  function client(handlers: Record<string, () => unknown>, calls: string[] = []) {
    return fakeClient({
      getAllPages: () => [makeRepoResponse({ topics: ["llm", "rag", "react"] })],
      getJson: (url) => {
        calls.push(url);
        const key = Object.keys(handlers).find((suffix) => url.includes(suffix));
        if (key === undefined) return makeReleaseResponse();
        return handlers[key]?.();
      },
    });
  }

  it("makes none of the extra calls unless the options are on", async () => {
    const calls: string[] = [];
    await collectRepositories(client({}, calls), config({ releases: false }), () => undefined);
    expect(calls).toEqual([]);
  });

  it("reads every published release, newest first, without drafts and pre-releases", async () => {
    const result = await collectRepositories(
      client({
        "/releases?per_page=30": () => [
          makeReleaseResponse({ tag_name: "v1.0.0", published_at: "2026-01-10T00:00:00Z" }),
          makeReleaseResponse({ tag_name: "v2.0.0", published_at: "2026-03-10T00:00:00Z" }),
          makeReleaseResponse({
            tag_name: "v3.0.0-rc",
            published_at: "2026-04-10T00:00:00Z",
            prerelease: true,
          }),
          makeReleaseResponse({
            tag_name: "v4.0.0",
            published_at: "2026-05-10T00:00:00Z",
            draft: true,
          }),
        ],
      }),
      config({ releases: false, releaseHistory: true }),
      () => undefined,
    );
    expect(result[0]?.releases?.map((release) => release.tagName)).toEqual(["v2.0.0", "v1.0.0"]);
  });

  it("looks at the repository files, the AI topics and the user's own commits", async () => {
    const calls: string[] = [];
    const result = await collectRepositories(
      client(
        {
          "/git/trees/HEAD?recursive=1": () => ({
            tree: [{ path: "CLAUDE.md" }, { path: "src/a.ts" }],
          }),
          "/commits?": () => [
            { commit: { message: message("Co-Authored-By: Claude <a@anthropic.com>") } },
            { commit: { message: message() } },
            { commit: { message: message("Co-authored-by: Copilot <c@github.com>") } },
            { commit: { message: message("Co-Authored-By: Claude <a@anthropic.com>") } },
          ],
        },
        calls,
      ),
      config({ releases: false, aiSignals: true }),
      () => undefined,
    );
    expect(result[0]?.findings).toEqual({
      toolFiles: ["Claude Code"],
      aiTopics: ["LLM", "RAG"],
      coauthored: {
        inspected: 4,
        matching: 3,
        assistants: [
          { name: "Claude", count: 2 },
          { name: "GitHub Copilot", count: 1 },
        ],
      },
    });
    expect(calls.find((call) => call.includes("/commits?"))).toContain("author=octo");
    expect(calls.find((call) => call.includes("/commits?"))).toContain("per_page=100");
  });

  it("keeps no text from the commits, only counts and assistant names", async () => {
    const result = await collectRepositories(
      client({
        "/commits?": () => [
          { commit: { message: message("Co-Authored-By: Claude <a@anthropic.com>") } },
        ],
        "/git/trees": () => ({ tree: [] }),
      }),
      config({ releases: false, aiSignals: true }),
      () => undefined,
    );
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("treats an empty repository and a missing tree as nothing found, not as an error", async () => {
    const empty = new GitHubApiError("http", "Conflict", { status: 409 });
    const result = await collectRepositories(
      client({
        "/git/trees": () => {
          throw empty;
        },
        "/commits?": () => {
          throw empty;
        },
      }),
      config({ releases: false, aiSignals: true }),
      () => undefined,
    );
    expect(result[0]?.findings).toEqual({ toolFiles: [], aiTopics: ["LLM", "RAG"] });
  });

  it("still fails on a rate limit, instead of returning partial findings", async () => {
    await expect(
      collectRepositories(
        client({
          "/git/trees": () => {
            throw new GitHubApiError("rate_limited", "GitHub API rate limit exceeded.");
          },
        }),
        config({ releases: false, aiSignals: true }),
        () => undefined,
      ),
    ).rejects.toThrow(/rate limit/);
  });

  it("validates the new options and the new snapshot fields", () => {
    expect(
      validateGitHubConfig({ version: 1, username: "octo", collect: { aiSignals: "yes" } }).ok,
    ).toBe(false);
    const good = makeSnapshot([
      makeRepository({
        findings: {
          toolFiles: ["Cursor"],
          aiTopics: ["LLM"],
          coauthored: { inspected: 10, matching: 2, assistants: [{ name: "Claude", count: 2 }] },
        },
        releases: [{ tagName: "v1", publishedAt: "2026-01-01T00:00:00Z" }],
      }),
    ]);
    expect(validateGitHubSnapshot(good).ok).toBe(true);
    const impossible = makeSnapshot([
      makeRepository({
        findings: {
          toolFiles: [],
          aiTopics: [],
          coauthored: { inspected: 1, matching: 5, assistants: [] },
        },
      }),
    ]);
    expect(validateGitHubSnapshot(impossible).ok).toBe(false);
  });
});

// ----------------------------------------------------------------- statistics

function repo(name: string, overrides: Partial<GitHubRepository> = {}): GitHubRepository {
  return makeRepository({
    fullName: `octo/${name}`,
    name,
    url: `https://github.com/octo/${name}`,
    latestRelease: undefined,
    ...overrides,
  });
}

describe("milestones from releases and findings in the repositories", () => {
  const repos = [
    repo("alpha", {
      releases: [
        { tagName: "v2.0.0", publishedAt: "2026-03-10T00:00:00Z" },
        { tagName: "v1.0.0", publishedAt: "2026-01-10T00:00:00Z" },
      ],
      findings: {
        toolFiles: ["Claude Code"],
        aiTopics: ["RAG"],
        coauthored: { inspected: 50, matching: 20, assistants: [{ name: "Claude", count: 20 }] },
      },
    }),
    repo("bravo", {
      latestRelease: { tagName: "v0.5.0", publishedAt: "2026-02-01T00:00:00Z" },
      findings: {
        toolFiles: [],
        aiTopics: [],
        coauthored: { inspected: 30, matching: 0, assistants: [] },
      },
    }),
    repo("charlie", { findings: { toolFiles: ["Cursor"], aiTopics: [] } }),
  ];

  it("turn each release into a milestone observed on GitHub", () => {
    const milestones = releaseMilestones(repos);
    expect(milestones.map((m) => m.title).sort()).toEqual([
      "alpha v1.0.0",
      "alpha v2.0.0",
      "bravo v0.5.0",
    ]);
    expect(milestones.every((m) => m.provenance === "OBSERVED" && m.visibility === "PUBLIC")).toBe(
      true,
    );
    expect(new Set(milestones.map((m) => m.id)).size).toBe(3);
  });

  it("use the latest release when the history was not collected", () => {
    expect(releaseMilestones([repos[1] as GitHubRepository]).map((m) => m.title)).toEqual([
      "bravo v0.5.0",
    ]);
  });

  it("list only repositories with a signal, most co-authored first, with totals over the repositories looked at", () => {
    const found = foundInRepositories(repos);
    expect(found?.repositories.map((r) => r.name)).toEqual(["alpha", "charlie"]);
    expect(found?.coauthored).toEqual({
      repositories: 2,
      inspected: 80,
      matching: 20,
      assistants: [{ name: "Claude", count: 20 }],
    });
    expect(found?.tools).toEqual(["Claude Code", "Cursor"]);
  });

  it("find nothing to say when no repository was looked at", () => {
    expect(foundInRepositories([repo("plain")])).toBeUndefined();
  });

  const stats = (settings: Record<string, unknown>) =>
    computeAiEngineeringStats(
      makeAiConfig({
        tools: [makeTool()],
        milestones: [
          {
            id: "mine",
            title: "Mine",
            date: "2026-02-20",
            visibility: "PUBLIC",
            provenance: "DECLARED",
          },
        ],
        settings,
      }),
      {},
      repos,
    );

  it("add nothing unless githubSignals is on", () => {
    const off = stats({});
    expect(off.found).toBeUndefined();
    expect(off.milestones.map((m) => m.id)).toEqual(["mine"]);
  });

  it("add the releases to the declared milestones, newest first", () => {
    const on = stats({ githubSignals: true });
    expect(on.milestones.map((m) => m.title)).toEqual([
      "alpha v2.0.0",
      "Mine",
      "bravo v0.5.0",
      "alpha v1.0.0",
    ]);
    expect(on.found?.repositories).toHaveLength(2);
  });
});

// ------------------------------------------------------------------ rendering

describe("the AI dashboard with GitHub signals", () => {
  const repos = [
    repo("alpha", {
      releases: [{ tagName: "v2.0.0", publishedAt: "2026-03-10T00:00:00Z" }],
      findings: {
        toolFiles: ["Claude Code"],
        aiTopics: ["RAG"],
        coauthored: { inspected: 50, matching: 20, assistants: [{ name: "Claude", count: 20 }] },
      },
    }),
  ];
  const render = (
    settings: Record<string, unknown> = { githubSignals: true },
    observed = repos,
  ) => {
    const config = makeAiConfig({
      tools: [makeTool()],
      settings: { dashboard: true, ...settings },
    });
    return renderAiEngineeringDashboard(computeAiEngineeringStats(config, {}, observed), {
      profile: config.profile,
      settings: config.settings,
      generatorVersion: "0.0.0-test",
    });
  };

  it("shows the panel, the chip and the release milestone, all labeled as found on GitHub", () => {
    const svg = render();
    expect(svg).toContain(">AI IN MY REPOSITORIES · FOUND ON GITHUB<");
    expect(svg).toContain(">AI Co-authored<");
    expect(svg).toContain(">20 of 50 recent commits<");
    expect(svg).toContain(">20 of 50 commits<");
    expect(svg).toContain(">Claude Code<");
    expect(svg).toContain(">alpha v2.0.0<");
    expect(svg).toContain(">Observed<");
  });

  it("says plainly what the number is not", () => {
    expect(render()).toContain("NOT A SHARE OF AI CODE");
  });

  it("draws neither without the setting, even when the snapshot has the data", () => {
    const svg = render({});
    expect(svg).not.toContain("FOUND ON GITHUB");
    expect(svg).not.toContain(">AI Co-authored<");
    expect(svg).not.toContain("alpha v2.0.0");
  });

  it("draws neither without data", () => {
    const svg = render({ githubSignals: true }, []);
    expect(svg).not.toContain("FOUND ON GITHUB");
  });

  it("claims no percentage of AI code and no score", () => {
    const visible = [...render().matchAll(/>([^<]+)</g)].map((match) => match[1]).join(" ");
    expect(visible).not.toMatch(/ai-generated code|productivity|score|% of (my )?code/i);
  });
});

describe("the generator with GitHub signals", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "devtrace-signals-"));
    await mkdir(path.join(root, "data"), { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const writeConfig = (settings: Record<string, unknown>) =>
    writeFile(
      path.join(root, "data", "ai-engineering.json"),
      JSON.stringify(
        makeRawAiConfig({ tools: [makeTool()], settings: { dashboard: true, ...settings } }),
      ),
      "utf8",
    );

  it("reads the snapshot and draws the findings", async () => {
    await writeConfig({ githubSignals: true });
    await writeFile(
      path.join(root, "data", "github-snapshot.json"),
      JSON.stringify(
        makeSnapshot([repo("alpha", { findings: { toolFiles: ["Claude Code"], aiTopics: [] } })]),
      ),
      "utf8",
    );
    const svg = await readFile(await generateAiEngineeringStats(root), "utf8");
    expect(svg).toContain("FOUND ON GITHUB");
  });

  it("warns when the setting is on and there is no GitHub data", async () => {
    await writeConfig({ githubSignals: true });
    const warnings: string[] = [];
    await generateAiEngineeringStats(root, { warn: (m) => warnings.push(m) });
    expect(warnings.join(" ")).toContain("devtrace sync");
  });
});
