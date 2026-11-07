import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeError } from "../src/core/result.js";
import { generateAiEngineeringStats } from "../src/generators/ai-engineering.js";
import { generateStartupStats } from "../src/generators/startup.js";
import { PALETTES } from "../src/templates/themes.js";
import { makeAiProject, makeRawAiConfig, makeTool } from "./ai-fixtures.js";
import { makeProject, makeRawConfig } from "./fixtures.js";

describe("generating with a custom appearance", () => {
  let root: string;
  const file = (name: string) => path.join(root, "public", "indicators", name);

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "devtrace-look-"));
    await mkdir(path.join(root, "data"), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const writeStartup = (settings?: Record<string, unknown>) =>
    writeFile(
      path.join(root, "data", "startup.json"),
      JSON.stringify(
        makeRawConfig([makeProject({ name: "Alpha" })], settings === undefined ? {} : { settings }),
      ),
      "utf8",
    );
  const writeAi = (settings?: Record<string, unknown>) =>
    writeFile(
      path.join(root, "data", "ai-engineering.json"),
      JSON.stringify(
        makeRawAiConfig({
          ...(settings === undefined ? {} : { settings }),
          tools: [makeTool()],
          projects: [makeAiProject()],
        }),
      ),
      "utf8",
    );
  const read = async (promise: Promise<string>) => readFile(await promise, "utf8");
  const failureOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return describeError(error);
    }
    throw new Error("Expected the promise to reject.");
  };

  describe.each([
    {
      name: "startup",
      write: writeStartup,
      generate: generateStartupStats,
      output: "startup-stats.svg",
    },
    {
      name: "AI engineering",
      write: writeAi,
      generate: generateAiEngineeringStats,
      output: "ai-engineering-stats.svg",
    },
  ])("$name indicator", ({ write, generate, output }) => {
    it("applies the appearance written in the configuration file", async () => {
      await write({
        theme: "MIDNIGHT",
        layout: "COMPACT",
        colors: { primary: "#ff00aa" },
        dimensions: { width: 500, padding: 20 },
      });
      const svg = await read(generate(root));
      expect(svg).toContain('width="500"');
      expect(svg).toContain(`fill="${PALETTES.MIDNIGHT.background}"`);
      expect(svg).toContain('fill="#ff00aa"');
    });

    it("renders a configuration without any appearance exactly as before", async () => {
      await write();
      expect(await read(generate(root))).toContain(`fill="${PALETTES.DARK.background}"`);
    });

    it("lets the command line theme and layout win over the file", async () => {
      await write({ theme: "DARK", layout: "EXPANDED" });
      const svg = await read(generate(root, { theme: "MINIMAL", layout: "COMPACT" }));
      expect(svg).toContain('width="480"');
      expect(svg).toContain(`fill="${PALETTES.MINIMAL.background}"`);
      expect(svg).not.toContain(PALETTES.DARK.background);
    });

    it("keeps the rest of the file's appearance when only one option is overridden", async () => {
      await write({ theme: "MIDNIGHT", colors: { primary: "#ff00aa" } });
      const svg = await read(generate(root, { layout: "COMPACT" }));
      expect(svg).toContain(`fill="${PALETTES.MIDNIGHT.background}"`);
      expect(svg).toContain('fill="#ff00aa"');
      expect(svg).toContain('width="480"');
    });

    it("writes the output file given, and only that one", async () => {
      await write();
      const written = await generate(root, { outputFile: "custom.svg" });
      expect(written).toBe(file("custom.svg"));
      expect(await readdir(path.join(root, "public", "indicators"))).toEqual(["custom.svg"]);
      expect(output).not.toBe("custom.svg");
    });

    it("refuses an unsafe output name and writes nothing", async () => {
      await write();
      for (const outputFile of [
        "../escape.svg",
        "a/b.svg",
        "UPPER.svg",
        "no-extension",
        "x.svg.exe",
      ]) {
        expect(await failureOf(generate(root, { outputFile }))).toContain(
          "Invalid indicator file name",
        );
      }
      await expect(readdir(path.join(root, "public"))).rejects.toThrow();
    });

    it("rejects an invalid color with its location and writes nothing", async () => {
      await write({ colors: { primary: "red" } });
      const message = await failureOf(generate(root));
      expect(message).toContain(
        "settings.colors.primary: Invalid color: expected #RGB or #RRGGBB.",
      );
      await expect(readFile(file(output))).rejects.toThrow();
    });

    it("rejects dimensions that leave no room and writes nothing", async () => {
      await write({ dimensions: { width: 360, padding: 48 } });
      const message = await failureOf(generate(root));
      expect(message).toContain("Failed to generate");
      expect(message).toContain("Dimensions leave only 264px of content");
      await expect(readFile(file(output))).rejects.toThrow();
    });

    it("rejects out-of-range typography with its location", async () => {
      await write({ typography: { titleSize: 99 } });
      expect(await failureOf(generate(root))).toContain(
        "settings.typography.titleSize: Invalid titleSize: must be at most 32.",
      );
    });

    it("warns about colors that are hard to read, and still generates", async () => {
      await write({ colors: { text: "#10161d" } });
      const warnings: string[] = [];
      const svg = await read(generate(root, { warn: (message) => warnings.push(message) }));
      expect(svg).toContain("</svg>");
      expect(
        warnings.some((warning) =>
          warning.startsWith("Low contrast: text #10161d on background #0d1117"),
        ),
      ).toBe(true);
    });

    it("does not warn about the built-in themes", async () => {
      for (const theme of ["DARK", "LIGHT", "MIDNIGHT", "MINIMAL", "TRANSPARENT"]) {
        await write({ theme });
        const warnings: string[] = [];
        await generate(root, {
          warn: (message) => warnings.push(message),
          outputFile: `${theme.toLowerCase()}.svg`,
        });
        expect(warnings, theme).toEqual([]);
      }
    });

    it("warns about contrast of a command line theme too", async () => {
      await write({ colors: { background: "#ffffff" } });
      const warnings: string[] = [];
      await generate(root, { warn: (message) => warnings.push(message) });
      expect(warnings.length).toBeGreaterThan(0);
    });
  });
});
