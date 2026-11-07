import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";
import { EXIT } from "../src/cli/errors.js";
import { runCli } from "../src/cli/main.js";
import { DEVTRACE_VERSION } from "../src/core/version.js";
import { makeAiProject, makeRawAiConfig, makeTool } from "./ai-fixtures.js";
import { makeProject, makeRawConfig } from "./fixtures.js";

const invocationOf = (...argv: string[]) => parseArgs(argv).invocation;

describe("parseArgs", () => {
  it("shows the help when no command is given", () => {
    expect(invocationOf()).toEqual({ kind: "help" });
  });

  it("reads --version and --help", () => {
    expect(invocationOf("--version")).toEqual({ kind: "version" });
    expect(invocationOf("-v")).toEqual({ kind: "version" });
    expect(invocationOf("generate", "--help")).toEqual({ kind: "help", topic: "generate" });
    expect(invocationOf("help", "sync")).toEqual({ kind: "help", topic: "sync" });
  });

  it("generates everything by default", () => {
    expect(invocationOf("generate")).toMatchObject({ kind: "generate", target: "all" });
  });

  it("reads each option as `--name value` or `--name=value`, in any case", () => {
    expect(invocationOf("generate", "startup", "--theme", "midnight")).toMatchObject({
      theme: "MIDNIGHT",
    });
    expect(invocationOf("generate", "ai", "--layout=Compact")).toMatchObject({
      layout: "COMPACT",
    });
    expect(invocationOf("generate", "ai", "--output=x.svg")).toMatchObject({ output: "x.svg" });
  });

  it("lets the last occurrence win", () => {
    expect(invocationOf("generate", "ai", "--theme", "DARK", "--theme", "LIGHT")).toMatchObject({
      theme: "LIGHT",
    });
  });

  it("keeps the names used before 0.6.0 working", () => {
    expect(invocationOf("startup")).toMatchObject({ kind: "generate", target: "startup" });
    expect(invocationOf("ai")).toMatchObject({ kind: "generate", target: "ai" });
    expect(invocationOf("github", "--force")).toEqual({ kind: "sync", force: true });
  });

  it.each([
    ["public/indicators/custom.svg", "custom.svg"],
    ["./public/indicators/custom.svg", "custom.svg"],
    ["public\\indicators\\custom.svg", "custom.svg"],
  ])("accepts the output path %s", (value, expected) => {
    expect(invocationOf("generate", "ai", "--output", value)).toMatchObject({ output: expected });
  });

  it.each([
    [["generate", "ai", "--output", "../escape.svg"], "Invalid --output"],
    [["generate", "ai", "--output", "public/other/x.svg"], "Invalid --output"],
    [["generate", "--output", "x.svg"], "cannot be used with the target"],
    [["generate", "ai", "--theme", "NEON"], 'Invalid --theme value: "NEON"'],
    [["generate", "ai", "--layout", "HUGE"], 'Invalid --layout value: "HUGE"'],
    [["generate", "ai", "--theme"], "Option --theme requires a value."],
    [["sync", "--force=yes"], "does not take a value"],
    [["sync", "--theme", "DARK"], 'does not apply to "sync"'],
    [["generate", "ai", "--token=abc"], 'Unknown option: "--token=abc".'],
    [["generate", "nothing"], 'Invalid target "nothing"'],
    [["generate", "ai", "extra"], 'Unexpected argument: "extra".'],
    [["toString"], 'Unknown command: "toString".'],
    [["generat"], 'Unknown command: "generat".'],
    [["--theme", "DARK"], "Missing command."],
  ])("rejects %j", (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });
});

describe("runCli", () => {
  let root: string;
  let out: string[];
  let err: string[];

  const run = (...argv: string[]) =>
    runCli(argv, {
      rootDir: root,
      env: {},
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    });
  const write = async (name: string, value: unknown) => {
    await mkdir(path.join(root, "data"), { recursive: true });
    await writeFile(path.join(root, "data", name), JSON.stringify(value), "utf8");
  };

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "devtrace-cli-"));
    out = [];
    err = [];
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("prints the version", async () => {
    expect(await run("--version")).toBe(EXIT.OK);
    expect(out).toEqual([DEVTRACE_VERSION]);
  });

  it("prints the help", async () => {
    expect(await run("help")).toBe(EXIT.OK);
    expect(out.join("\n")).toContain("generate");
  });

  it("exits with the usage code for a mistake in the command line", async () => {
    expect(await run("generat")).toBe(EXIT.USAGE);
    expect(err.join("\n")).toContain('Did you mean "generate"?');
    expect(err.join("\n")).toContain('Run "devtrace --help" for usage.');
  });

  it("creates the starter files, then leaves them alone", async () => {
    expect(await run("init")).toBe(EXIT.OK);
    const before = await readFile(path.join(root, "data", "startup.json"), "utf8");
    out = [];
    expect(await run("init")).toBe(EXIT.OK);
    expect(out.join("\n")).toContain("Nothing to do");
    expect(await readFile(path.join(root, "data", "startup.json"), "utf8")).toBe(before);
  });

  it("validates the starter files without writing anything", async () => {
    await run("init");
    expect(await run("validate")).toBe(EXIT.OK);
    await expect(
      readFile(path.join(root, "public", "indicators", "startup-stats.svg")),
    ).rejects.toThrow();
  });

  it("fails validation with exit code 1 for an invalid configuration", async () => {
    await write("startup.json", makeRawConfig([makeProject({ lifecycleStage: "UNKNOWN" })]));
    expect(await run("validate", "startup")).toBe(EXIT.FAILURE);
    expect(out.join("\n")).toContain("UNKNOWN");
  });

  it("generates one indicator with --theme, --layout and --output", async () => {
    await write("startup.json", makeRawConfig([makeProject()]));
    expect(
      await run(
        "generate",
        "startup",
        "--theme",
        "MIDNIGHT",
        "--layout",
        "COMPACT",
        "--output",
        "p.svg",
      ),
    ).toBe(EXIT.OK);
    const svg = await readFile(path.join(root, "public", "indicators", "p.svg"), "utf8");
    expect(svg).toContain('width="480"');
    expect(out.join("\n")).toContain(path.join("public", "indicators", "p.svg"));
  });

  it("keeps going when one indicator fails and still reports the failure", async () => {
    await write(
      "ai-engineering.json",
      makeRawAiConfig({ tools: [makeTool()], projects: [makeAiProject()] }),
    );
    expect(await run("generate")).toBe(EXIT.FAILURE);
    await expect(
      readFile(path.join(root, "public", "indicators", "ai-engineering-stats.svg"), "utf8"),
    ).resolves.toContain("<svg");
    expect(err.join("\n")).toContain("startup");
  });
});
