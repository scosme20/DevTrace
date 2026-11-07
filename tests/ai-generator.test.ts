import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeError } from "../src/core/result.js";
import { generateAiEngineeringStats } from "../src/generators/ai-engineering.js";
import { makeAiProject, makeModel, makeRawAiConfig, makeTool } from "./ai-fixtures.js";

let root: string;
const outputPath = () => path.join(root, "public", "indicators", "ai-engineering-stats.svg");

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "devtrace-ai-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeConfig(content: string): Promise<void> {
  await mkdir(path.join(root, "data"), { recursive: true });
  await writeFile(path.join(root, "data", "ai-engineering.json"), content, "utf8");
}

async function writeRawConfig(overrides: Record<string, unknown>): Promise<void> {
  await writeConfig(JSON.stringify(makeRawAiConfig(overrides)));
}

async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return describeError(error);
  }
  throw new Error("Expected the promise to reject.");
}

describe("generateAiEngineeringStats", () => {
  it("reads the configuration and writes public/indicators/ai-engineering-stats.svg", async () => {
    await writeRawConfig({ tools: [makeTool({ name: "Claude Code" })] });
    const output = await generateAiEngineeringStats(root);
    expect(output).toBe(outputPath());
    expect(await readFile(output, "utf8")).toContain(">Claude Code<");
  });

  it("generates the empty state from an empty configuration", async () => {
    await writeRawConfig({});
    const svg = await readFile(await generateAiEngineeringStats(root), "utf8");
    expect(svg).toContain(">No AI engineering data to display.<");
  });

  it("excludes private entities from the written file", async () => {
    await writeRawConfig({
      tools: [
        makeTool({ id: "open", name: "OpenTool" }),
        makeTool({ id: "hidden", name: "HiddenTool", visibility: "PRIVATE" }),
      ],
      models: [makeModel({ name: "HiddenModel", visibility: "PRIVATE" })],
      projects: [makeAiProject({ name: "HiddenProject", visibility: "PRIVATE" })],
    });
    const svg = await readFile(await generateAiEngineeringStats(root), "utf8");
    expect(svg).toContain("OpenTool");
    for (const secret of ["HiddenTool", "HiddenModel", "HiddenProject"]) {
      expect(svg).not.toContain(secret);
    }
  });

  it("produces identical output for identical input", async () => {
    await writeRawConfig({ tools: [makeTool()], models: [makeModel()] });
    const first = await readFile(await generateAiEngineeringStats(root), "utf8");
    const second = await readFile(await generateAiEngineeringStats(root), "utf8");
    expect(second).toBe(first);
  });

  it("writes only the AI indicator inside public/indicators", async () => {
    await writeRawConfig({});
    await generateAiEngineeringStats(root);
    expect(await readdir(path.join(root, "public", "indicators"))).toEqual([
      "ai-engineering-stats.svg",
    ]);
  });

  it("applies the theme from the configuration", async () => {
    await writeRawConfig({ settings: { theme: "LIGHT" } });
    expect(await readFile(await generateAiEngineeringStats(root), "utf8")).toContain(
      'fill="#ffffff"',
    );
  });

  it("fails with clear context for invalid configuration and writes nothing", async () => {
    await writeRawConfig({ tools: [makeTool({ category: "CHATBOT" })] });
    const message = await failureOf(generateAiEngineeringStats(root));
    expect(message).toContain("Failed to generate AI engineering statistics indicator.");
    expect(message).toContain("Failed to load AI engineering configuration.");
    expect(message).toContain("Invalid AI engineering configuration in");
    expect(message).toContain("Invalid tool category: CHATBOT.");
    await expect(readFile(outputPath())).rejects.toThrow();
  });

  it("reports duplicate IDs and unknown references", async () => {
    await writeRawConfig({
      tools: [makeTool({ id: "dup" }), makeTool({ id: "dup" })],
      projects: [makeAiProject({ tools: ["ghost"] })],
    });
    const message = await failureOf(generateAiEngineeringStats(root));
    expect(message).toContain("Duplicate tool ID detected: dup.");
    expect(message).toContain("Unknown tool ID referenced: ghost.");
  });

  it("fails when the file is missing or is not JSON", async () => {
    expect(await failureOf(generateAiEngineeringStats(root))).toContain(
      "Configuration file not found",
    );
    await writeConfig("{ nope");
    expect(await failureOf(generateAiEngineeringStats(root))).toContain("not valid JSON");
  });
});
