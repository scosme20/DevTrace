import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadStartupConfig } from "../src/core/config.js";
import { writeIndicator } from "../src/core/output.js";
import { describeError } from "../src/core/result.js";
import { DEVTRACE_VERSION } from "../src/core/version.js";
import { generateStartupStats } from "../src/generators/startup.js";
import { makeProject, makeRawConfig } from "./fixtures.js";

let root: string;
const outputPath = () => path.join(root, "public", "indicators", "startup-stats.svg");

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "devtrace-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeConfig(content: string): Promise<void> {
  await mkdir(path.join(root, "data"), { recursive: true });
  await writeFile(path.join(root, "data", "startup.json"), content, "utf8");
}

async function writeRawConfig(
  projects: unknown[],
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await writeConfig(JSON.stringify(makeRawConfig(projects, overrides)));
}

async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return describeError(error);
  }
  throw new Error("Expected the promise to reject.");
}

describe("generateStartupStats", () => {
  it("reads the configuration and writes public/indicators/startup-stats.svg", async () => {
    await writeRawConfig([makeProject({ name: "Alpha" })]);
    const output = await generateStartupStats(root);
    expect(output).toBe(outputPath());
    expect(await readFile(output, "utf8")).toContain(">Alpha<");
  });

  it("excludes private projects from the written file", async () => {
    await writeRawConfig([
      makeProject({ id: "open", name: "OpenApp" }),
      makeProject({ id: "hidden", name: "HiddenApp", visibility: "PRIVATE" }),
    ]);
    const svg = await readFile(await generateStartupStats(root), "utf8");
    expect(svg).toContain("OpenApp");
    expect(svg).not.toContain("HiddenApp");
  });

  it("produces identical output for identical input", async () => {
    await writeRawConfig([makeProject()]);
    const first = await readFile(await generateStartupStats(root), "utf8");
    const second = await readFile(await generateStartupStats(root), "utf8");
    expect(second).toBe(first);
  });

  it("writes only the indicator file inside public/indicators", async () => {
    await writeRawConfig([makeProject()]);
    await generateStartupStats(root);
    expect(await readdir(path.join(root, "public", "indicators"))).toEqual(["startup-stats.svg"]);
  });

  it("applies the theme from the configuration", async () => {
    await writeRawConfig([makeProject()], { settings: { theme: "LIGHT" } });
    const svg = await readFile(await generateStartupStats(root), "utf8");
    expect(svg).toContain('fill="#ffffff"');
  });

  it("fails with clear context for invalid configuration and writes nothing", async () => {
    await writeRawConfig([makeProject({ lifecycleStage: "UNKNOWN" })]);
    const message = await failureOf(generateStartupStats(root));
    expect(message).toContain("Failed to generate startup statistics indicator.");
    expect(message).toContain("Failed to load startup configuration.");
    expect(message).toContain("Invalid lifecycle stage: UNKNOWN.");
    await expect(readFile(outputPath())).rejects.toThrow();
  });

  it("reports duplicate project ids", async () => {
    await writeRawConfig([makeProject({ id: "buildflow" }), makeProject({ id: "buildflow" })]);
    expect(await failureOf(generateStartupStats(root))).toContain(
      "Duplicate project ID detected: buildflow.",
    );
  });

  it("fails when the file is missing or is not JSON", async () => {
    expect(await failureOf(generateStartupStats(root))).toContain("Configuration file not found");
    await writeConfig("{ nope");
    expect(await failureOf(generateStartupStats(root))).toContain("not valid JSON");
  });
});

describe("loadStartupConfig", () => {
  it("preserves the original cause", async () => {
    const error = await loadStartupConfig(path.join(root, "missing.json")).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).cause).toBeInstanceOf(Error);
  });
});

describe("writeIndicator", () => {
  it("writes the file inside the indicators directory", async () => {
    const dir = path.join(root, "out");
    const target = await writeIndicator(dir, "demo.svg", "<svg/>");
    expect(target).toBe(path.join(dir, "demo.svg"));
    expect(await readFile(target, "utf8")).toBe("<svg/>");
  });

  it.each(["../escape.svg", "a/b.svg", "a\\b.svg", "demo.txt", "..svg", ""])(
    "rejects the unsafe file name %j",
    async (name) => {
      await expect(writeIndicator(root, name, "x")).rejects.toThrow("Invalid indicator file name");
    },
  );
});

describe("version", () => {
  it("matches package.json", async () => {
    const pkg = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8")) as {
      version: string;
    };
    expect(DEVTRACE_VERSION).toBe(pkg.version);
  });
});
