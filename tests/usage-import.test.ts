import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";
import { runCli } from "../src/cli/main.js";
import { validateUsageSnapshot, type UsageSnapshot } from "../src/core/usage-snapshot.js";
import { generateAiEngineeringStats } from "../src/generators/ai-engineering.js";
import { importUsage } from "../src/generators/usage.js";
import { computeAiEngineeringStats } from "../src/indicators/ai-engineering/stats.js";
import { mergeUsageSnapshot, modelId } from "../src/indicators/ai-engineering/usage.js";
import { renderAiEngineeringDashboard } from "../src/templates/ai-engineering-dashboard.js";
import { aggregateUsage } from "../src/usage/aggregate.js";
import { collectUsage, defaultUsageFolders } from "../src/usage/collect.js";
import { parseClaudeLog, parseCodexLog, type UsageRecord } from "../src/usage/parsers.js";
import { makeAiConfig, makeRawAiConfig, makeTool } from "./ai-fixtures.js";

// ----------------------------------------------------------------- log lines
// All text below is made up. The SECRET strings stand for conversation text and
// paths, and must never appear in anything the importer produces.

const SECRET = "ZZ-SECRET-CONVERSATION-TEXT";
const SECRET_PATH = "C:/Users/someone/private-project";

function claudeLine(overrides: Record<string, unknown> = {}, usage: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "assistant",
    uuid: "u-1",
    requestId: "req-1",
    timestamp: "2026-03-10T10:00:00.000Z",
    cwd: SECRET_PATH,
    message: {
      id: "msg-1",
      model: "claude-opus-5-5",
      content: [{ type: "text", text: SECRET }],
      usage: {
        input_tokens: 10,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 70,
        output_tokens: 5,
        ...usage,
      },
    },
    ...overrides,
  });
}

function codexLines(
  steps: readonly { model?: string; input: number; cached: number; output: number; at?: string }[],
): string {
  const lines: string[] = [];
  steps.forEach((step, index) => {
    if (step.model !== undefined) {
      lines.push(
        JSON.stringify({ type: "turn_context", payload: { model: step.model, cwd: SECRET_PATH } }),
      );
    }
    lines.push(
      JSON.stringify({
        type: "event_msg",
        timestamp: step.at ?? `2026-03-1${String(index)}T10:00:00.000Z`,
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: step.input,
              cached_input_tokens: step.cached,
              output_tokens: step.output,
            },
          },
        },
      }),
    );
  });
  return lines.join("\n");
}

const record = (overrides: Partial<UsageRecord> = {}): UsageRecord => ({
  source: "CLAUDE_CODE",
  model: "claude-opus-5-5",
  timestamp: "2026-03-10T10:00:00.000Z",
  input: 100,
  cached: 70,
  output: 5,
  ...overrides,
});

// ------------------------------------------------------------------- parsers

describe("Claude Code log parser", () => {
  it("counts prompt tokens as input plus cache creation plus cache read", () => {
    const [entry] = parseClaudeLog(claudeLine());
    expect(entry?.record).toMatchObject({
      input: 100,
      cached: 70,
      output: 5,
      model: "claude-opus-5-5",
    });
  });

  it("keeps only numbers: nothing of the message, path or ids is in a record", () => {
    const [entry] = parseClaudeLog(claudeLine());
    expect(Object.keys(entry?.record ?? {}).sort()).toEqual([
      "cached",
      "input",
      "model",
      "output",
      "source",
      "timestamp",
    ]);
    expect(JSON.stringify(entry?.record)).not.toContain(SECRET);
    expect(JSON.stringify(entry?.record)).not.toContain("private-project");
  });

  it("identifies a response by message id and request id", () => {
    const keys = parseClaudeLog([claudeLine(), claudeLine({ requestId: "req-2" })].join("\n")).map(
      (e) => e.key,
    );
    expect(keys).toEqual(["msg-1:req-1", "msg-1:req-2"]);
  });

  it("skips other entries, the synthetic model, empty usage and broken lines", () => {
    const text = [
      claudeLine({ type: "user" }),
      claudeLine({ message: { id: "m", model: "<synthetic>", usage: { input_tokens: 5 } } }),
      claudeLine(
        {},
        {
          input_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          output_tokens: 0,
        },
      ),
      "{not json",
      "",
      claudeLine({ timestamp: undefined }),
    ].join("\n");
    expect(parseClaudeLog(text)).toEqual([]);
  });

  it("treats missing or odd counters as zero", () => {
    const [entry] = parseClaudeLog(
      claudeLine(
        {},
        {
          input_tokens: "many",
          cache_creation_input_tokens: -5,
          cache_read_input_tokens: null,
          output_tokens: 7.9,
        },
      ),
    );
    expect(entry?.record).toMatchObject({ input: 0 + 0 + 0, cached: 0, output: 7 });
  });
});

describe("Codex log parser", () => {
  it("turns running totals into the usage of each call", () => {
    const records = parseCodexLog(
      codexLines([
        { model: "gpt-a", input: 100, cached: 40, output: 10 },
        { input: 250, cached: 100, output: 30 },
      ]),
    );
    expect(records.map((r) => [r.model, r.input, r.cached, r.output])).toEqual([
      ["gpt-a", 100, 40, 10],
      ["gpt-a", 150, 60, 20],
    ]);
  });

  it("attributes each call to the model of its turn", () => {
    const records = parseCodexLog(
      codexLines([
        { model: "gpt-a", input: 100, cached: 0, output: 10 },
        { model: "gpt-b", input: 160, cached: 0, output: 20 },
      ]),
    );
    expect(records.map((r) => [r.model, r.input])).toEqual([
      ["gpt-a", 100],
      ["gpt-b", 60],
    ]);
  });

  it("ignores repeated totals and calls before any model is known", () => {
    expect(
      parseCodexLog(
        codexLines([
          { input: 50, cached: 0, output: 5 },
          { model: "gpt-a", input: 50, cached: 0, output: 5 },
          { input: 50, cached: 0, output: 5 },
        ]),
      ),
    ).toEqual([]);
  });

  it("starts a new count when a total goes down", () => {
    const records = parseCodexLog(
      codexLines([
        { model: "gpt-a", input: 500, cached: 0, output: 50 },
        { input: 120, cached: 0, output: 12 },
      ]),
    );
    expect(records.map((r) => r.input)).toEqual([500, 120]);
  });

  it("never reports more cached tokens than input tokens", () => {
    const [entry] = parseCodexLog(
      codexLines([{ model: "gpt-a", input: 10, cached: 99, output: 1 }]),
    );
    expect(entry?.cached).toBeLessThanOrEqual(entry?.input ?? 0);
  });

  it("keeps no text or path", () => {
    const [entry] = parseCodexLog(
      codexLines([{ model: "gpt-a", input: 10, cached: 0, output: 1 }]),
    );
    expect(JSON.stringify(entry)).not.toContain("private-project");
  });
});

// --------------------------------------------------------------- aggregation

describe("aggregateUsage", () => {
  const files = { CLAUDE_CODE: 2, CODEX: 0 };
  const period = { start: "2026-03-01", end: "2026-03-31" };

  it("sums per model inside the period, both ends included", () => {
    const snapshot = aggregateUsage(
      [
        record({ timestamp: "2026-03-01T00:00:00Z" }),
        record({ timestamp: "2026-03-31T23:59:59Z" }),
        record({ timestamp: "2026-02-28T23:59:59Z" }),
        record({ timestamp: "2026-04-01T00:00:00Z" }),
      ],
      period,
      files,
    );
    expect(snapshot.models).toHaveLength(1);
    expect(snapshot.models[0]).toMatchObject({
      inputTokens: 200,
      cachedInputTokens: 140,
      outputTokens: 10,
    });
  });

  it("names the provider from the model, and orders by size then name", () => {
    const snapshot = aggregateUsage(
      [
        record({ model: "gpt-5", source: "CODEX", input: 10, output: 1, cached: 0 }),
        record({ model: "claude-small", input: 10, output: 1, cached: 0 }),
        record({ model: "claude-big", input: 1000, output: 1, cached: 0 }),
        record({ model: "mystery", source: "CODEX", input: 1, output: 1, cached: 0 }),
      ],
      period,
      { CLAUDE_CODE: 1, CODEX: 1 },
    );
    expect(snapshot.models.map((m) => [m.name, m.provider])).toEqual([
      ["claude-big", "Anthropic"],
      ["claude-small", "Anthropic"],
      ["gpt-5", "OpenAI"],
      ["mystery", "OpenAI"],
    ]);
  });

  it("lists only sources that had files, and validates", () => {
    const snapshot = aggregateUsage([record()], period, files);
    expect(snapshot.sources).toEqual([{ label: "Claude Code local logs", files: 2 }]);
    expect(validateUsageSnapshot(snapshot).ok).toBe(true);
  });

  it("is deterministic and empty without usage in the period", () => {
    const records = [record(), record({ model: "claude-x" })];
    expect(aggregateUsage(records, period, files)).toEqual(
      aggregateUsage([...records].reverse(), period, files),
    );
    expect(
      aggregateUsage([record({ timestamp: "2025-01-01T00:00:00Z" })], period, files).models,
    ).toEqual([]);
  });
});

describe("usage snapshot validation", () => {
  const valid = aggregateUsage(
    [record()],
    { start: "2026-03-01", end: "2026-03-31" },
    { CLAUDE_CODE: 1, CODEX: 0 },
  );

  it.each([
    [
      "more cached tokens than input",
      { models: [{ ...valid.models[0], cachedInputTokens: 10_000 }] },
    ],
    ["a period that ends before it starts", { period: { start: "2026-03-31", end: "2026-03-01" } }],
    ["a text field it should not carry", { models: [{ ...valid.models[0], text: SECRET }] }],
    ["a negative count", { models: [{ ...valid.models[0], inputTokens: -1 }] }],
  ])("rejects %s", (_name, change) => {
    expect(validateUsageSnapshot({ ...valid, ...change }).ok).toBe(false);
  });
});

// ------------------------------------------------------------------- merging

describe("merging usage into the AI configuration", () => {
  const snapshot: UsageSnapshot = aggregateUsage(
    [
      record({ model: "gpt-5.6-terra", source: "CODEX", input: 400, cached: 100, output: 20 }),
      record({ model: "claude-opus-5-5", input: 1000, cached: 900, output: 100 }),
    ],
    { start: "2026-03-01", end: "2026-03-31" },
    { CLAUDE_CODE: 1, CODEX: 1 },
  );
  const base = makeAiConfig({
    tools: [makeTool()],
    settings: { dashboard: true, showTokenUsage: true },
  });
  const merged = mergeUsageSnapshot(base, snapshot);

  it("turns a model name into a valid id", () => {
    expect(modelId("gpt-5.6-terra")).toBe("gpt-5-6-terra");
    expect(modelId("###")).toBe("model");
  });

  it("adds the observed models and metrics, all OBSERVED, with their source", () => {
    expect(merged.models.map((m) => m.id)).toEqual(["claude-opus-5-5", "gpt-5-6-terra"]);
    expect(merged.models.every((m) => m.provenance === "OBSERVED")).toBe(true);
    const sources = new Set(merged.tokenUsage.map((m) => m.source));
    expect(sources).toEqual(new Set(["Claude Code local logs", "Codex local logs"]));
    expect(merged.tokenUsage.every((m) => m.provenance === "OBSERVED" && m.unit === "TOKENS")).toBe(
      true,
    );
  });

  it("lists the totals first, and totals are input plus output", () => {
    expect(merged.tokenUsage.slice(0, 2).map((m) => m.kind)).toEqual([
      "TOTAL_TOKENS",
      "TOTAL_TOKENS",
    ]);
    expect(merged.tokenUsage[0]?.value).toBe(1100);
  });

  it("reuses a model that is already declared, and keeps unique ids", () => {
    const declared = makeAiConfig({
      models: [
        {
          id: "claude-opus-5-5",
          name: "Claude Opus",
          provider: "Anthropic",
          modelFamily: "Claude",
          visibility: "PUBLIC",
          provenance: "DECLARED",
        },
      ],
      settings: { showTokenUsage: true },
    });
    const again = mergeUsageSnapshot(declared, snapshot);
    expect(again.models.filter((m) => m.id === "claude-opus-5-5")).toHaveLength(1);
    expect(new Set(again.tokenUsage.map((m) => m.id)).size).toBe(again.tokenUsage.length);
  });

  it("makes the dashboard show the cache hit, the top model and the shares", () => {
    const svg = renderAiEngineeringDashboard(computeAiEngineeringStats(merged), {
      profile: merged.profile,
      settings: merged.settings,
      generatorVersion: "0.0.0-test",
    });
    expect(svg).toContain(">Top Model<");
    expect(svg).toContain(">Cache Hit<");
    expect(svg).toContain("Claude Code local logs");
    expect(svg).toContain(">Observed<");
  });

  it("still shows nothing about tokens when showTokenUsage is off", () => {
    const hidden = mergeUsageSnapshot(
      makeAiConfig({ tools: [makeTool()], settings: { dashboard: true } }),
      snapshot,
    );
    const svg = renderAiEngineeringDashboard(computeAiEngineeringStats(hidden), {
      profile: hidden.profile,
      settings: hidden.settings,
      generatorVersion: "0.0.0-test",
    });
    expect(svg).not.toContain("TOKEN ECONOMICS");
    expect(svg).not.toContain(">Cache Hit<");
  });
});

// ------------------------------------------------- files, command and generator

describe("importing from folders", () => {
  let root: string;
  let claude: string;
  let codex: string;
  const folders = () => ({ claude, codex });

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "devtrace-usage-"));
    claude = path.join(root, "claude-projects");
    codex = path.join(root, "codex-sessions");
    await mkdir(path.join(claude, "p1"), { recursive: true });
    await mkdir(path.join(claude, "p2"), { recursive: true });
    await mkdir(path.join(codex, "2026", "03"), { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const options = {
    sources: ["CLAUDE_CODE", "CODEX"] as const,
    since: "2026-03-01",
    until: "2026-03-31",
  };

  it("counts a response once even when it is in several files, keeping the final line", async () => {
    await writeFile(
      path.join(claude, "p1", "a.jsonl"),
      claudeLine({}, { output_tokens: 5 }),
      "utf8",
    );
    await writeFile(
      path.join(claude, "p2", "b.jsonl"),
      [claudeLine({}, { output_tokens: 40 }), claudeLine({}, { output_tokens: 9 })].join("\n"),
      "utf8",
    );
    const { records, files } = await collectUsage(folders(), ["CLAUDE_CODE"]);
    expect(files.CLAUDE_CODE).toBe(2);
    expect(records).toHaveLength(1);
    expect(records[0]?.output).toBe(40);
  });

  it("reads only .jsonl files and treats a missing folder as no logs", async () => {
    await writeFile(path.join(claude, "p1", "notes.txt"), claudeLine(), "utf8");
    const none = await collectUsage({ claude, codex: path.join(root, "missing") }, [
      "CLAUDE_CODE",
      "CODEX",
    ]);
    expect(none.records).toEqual([]);
    expect(none.files).toEqual({ CLAUDE_CODE: 0, CODEX: 0 });
  });

  it("honors the variables the tools use for their folders", () => {
    expect(defaultUsageFolders({ CLAUDE_CONFIG_DIR: "/a", CODEX_HOME: "/b" }, "/home")).toEqual({
      claude: path.join("/a", "projects"),
      codex: path.join("/b", "sessions"),
    });
    expect(defaultUsageFolders({}, "/home").claude).toBe(path.join("/home", ".claude", "projects"));
  });

  it("writes a snapshot that holds numbers only, and the same one every time", async () => {
    await writeFile(path.join(claude, "p1", "a.jsonl"), claudeLine(), "utf8");
    await writeFile(
      path.join(codex, "2026", "03", "rollout.jsonl"),
      codexLines([{ model: "gpt-a", input: 100, cached: 50, output: 10 }]),
      "utf8",
    );
    const lines = await importUsage(root, { ...options, folders: folders() });
    const first = await readFile(path.join(root, "data", "usage-snapshot.json"), "utf8");
    await importUsage(root, { ...options, folders: folders() });
    expect(await readFile(path.join(root, "data", "usage-snapshot.json"), "utf8")).toBe(first);

    expect(first).not.toContain(SECRET);
    expect(first).not.toContain("private-project");
    expect(JSON.stringify(validateUsageSnapshot(JSON.parse(first)))).toContain('"ok":true');
    expect(lines.join("\n")).toContain("claude-opus-5-5: 105 tokens");
    expect(lines.join("\n")).toContain("gpt-a: 110 tokens");
  });

  it("resolves the period from --days and an injected date", async () => {
    await writeFile(path.join(claude, "p1", "a.jsonl"), claudeLine(), "utf8");
    await importUsage(root, {
      sources: ["CLAUDE_CODE"],
      days: 7,
      now: () => new Date("2026-03-12T08:00:00Z"),
      folders: folders(),
    });
    const snapshot = JSON.parse(
      await readFile(path.join(root, "data", "usage-snapshot.json"), "utf8"),
    ) as UsageSnapshot;
    expect(snapshot.period).toEqual({ start: "2026-03-06", end: "2026-03-12" });
    expect(snapshot.models).toHaveLength(1);
  });

  it("fails clearly when there are no logs, or the period is backwards", async () => {
    await expect(
      importUsage(root, {
        ...options,
        folders: { claude: path.join(root, "x"), codex: path.join(root, "y") },
      }),
    ).rejects.toThrow(/No usage logs/);
    await expect(
      importUsage(root, {
        sources: ["CLAUDE_CODE"],
        since: "2026-04-01",
        until: "2026-03-01",
        folders: folders(),
      }),
    ).rejects.toThrow(/before it starts/);
  });

  it("warns, and still writes, when the period holds no usage", async () => {
    await writeFile(
      path.join(claude, "p1", "a.jsonl"),
      claudeLine({ timestamp: "2020-01-01T00:00:00Z" }),
      "utf8",
    );
    const warnings: string[] = [];
    await importUsage(root, { ...options, folders: folders(), warn: (m) => warnings.push(m) });
    expect(warnings.join(" ")).toContain("no usage");
  });
});

describe("the import command", () => {
  const argsOf = (...argv: string[]) => parseArgs(argv).invocation;

  it("defaults to both sources, and reads the options", () => {
    expect(argsOf("import", "usage")).toMatchObject({ kind: "import", source: "ALL" });
    expect(argsOf("import", "usage", "--source", "codex", "--days", "7")).toMatchObject({
      source: "CODEX",
      days: 7,
    });
    expect(
      argsOf("import", "usage", "--since", "2026-03-01", "--until", "2026-03-31"),
    ).toMatchObject({
      since: "2026-03-01",
      until: "2026-03-31",
    });
  });

  it.each([
    [["import"], /Expected one of: usage/],
    [["import", "nope"], /Invalid target/],
    [["import", "usage", "--days", "0"], /--days/],
    [["import", "usage", "--days", "1.5"], /--days/],
    [["import", "usage", "--since", "march"], /--since/],
    [["import", "usage", "--source", "gemini"], /--source/],
    [["import", "usage", "--theme", "DARK"], /does not apply/],
  ])("rejects %j", (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });

  it("runs from the command line and tells where the numbers came from", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devtrace-usage-cli-"));
    try {
      const claude = path.join(root, "cfg", "projects", "p");
      await mkdir(claude, { recursive: true });
      await writeFile(path.join(claude, "a.jsonl"), claudeLine(), "utf8");
      const out: string[] = [];
      const err: string[] = [];
      const code = await runCli(
        ["import", "usage", "--source", "claude", "--since", "2026-03-01", "--until", "2026-03-31"],
        {
          rootDir: root,
          env: { CLAUDE_CONFIG_DIR: path.join(root, "cfg"), CODEX_HOME: path.join(root, "none") },
          out: (line) => out.push(line),
          err: (line) => err.push(line),
        },
      );
      expect(code).toBe(0);
      expect(out.join("\n")).toContain("nothing leaves this machine");
      expect(out.join("\n")).toContain("Claude Code local logs: 1 log file(s) read");
      expect(err).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("the AI generator with usage", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "devtrace-usage-gen-"));
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

  it("adds the snapshot only when usageSnapshot is on", async () => {
    await writeConfig({ showTokenUsage: true, usageSnapshot: true });
    await writeFile(
      path.join(root, "data", "usage-snapshot.json"),
      JSON.stringify(
        aggregateUsage(
          [record()],
          { start: "2026-03-01", end: "2026-03-31" },
          { CLAUDE_CODE: 1, CODEX: 0 },
        ),
      ),
      "utf8",
    );
    const on = await readFile(await generateAiEngineeringStats(root), "utf8");
    expect(on).toContain("TOKEN ECONOMICS");

    await writeConfig({ showTokenUsage: true });
    const off = await readFile(await generateAiEngineeringStats(root), "utf8");
    expect(off).not.toContain("TOKEN ECONOMICS");
  });

  it("warns when the option is on but nothing was imported", async () => {
    await writeConfig({ showTokenUsage: true, usageSnapshot: true });
    const warnings: string[] = [];
    await generateAiEngineeringStats(root, { warn: (m) => warnings.push(m) });
    expect(warnings.join(" ")).toContain("devtrace import usage");
  });
});
