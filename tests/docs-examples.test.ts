import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAIN_HELP } from "../src/cli/help.js";
import { validateAiEngineeringConfig } from "../src/core/ai-engineering-validation.js";
import { validateGitHubConfig } from "../src/core/github-validation.js";
import { validateStartupConfig } from "../src/core/validation.js";
import { resolveDesignTokens } from "../src/templates/design-tokens.js";

// Documentation that is wrong is worse than none. Every JSON example in the
// public documentation is validated with the real validators, so an example
// that stops working (a renamed option, an out-of-range value) fails here.

const FENCE = "```";
const DOCS = [
  "README.md",
  "docs/customization.md",
  "docs/github-integration.md",
  "docs/data-model.md",
  "docs/getting-started.md",
  "docs/configuration.md",
  "docs/indicators.md",
  "docs/troubleshooting.md",
];

async function jsonBlocks(file: string): Promise<unknown[]> {
  const text = await readFile(path.join(process.cwd(), file), "utf8");
  return text
    .split(`${FENCE}json`)
    .slice(1)
    .map((part) => part.slice(0, part.indexOf(FENCE)))
    .map((block) => JSON.parse(block) as unknown);
}

type Kind = "startup" | "ai" | "github" | "settings" | "other";

function classify(block: unknown): Kind {
  if (typeof block !== "object" || block === null || Array.isArray(block)) return "other";
  const keys = Object.keys(block);
  if (keys.includes("username")) return "github";
  if (keys.every((key) => key === "settings")) return "settings";
  if (!keys.includes("version")) return "other";
  if (["tools", "models", "skills", "activities", "tokenUsage"].some((key) => keys.includes(key)))
    return "ai";
  const projects = (block as { projects?: unknown }).projects;
  if (
    Array.isArray(projects) &&
    projects.some((project) => (project as { techniques?: unknown }).techniques !== undefined)
  )
    return "ai";
  return "startup";
}

function problems(block: unknown): readonly string[] {
  const result = { ok: true, errors: [] as readonly string[] };
  const check = (outcome: { ok: boolean; errors?: readonly string[] }) => {
    if (!outcome.ok) return outcome.errors ?? ["invalid"];
    return [];
  };
  switch (classify(block)) {
    case "startup":
      return check(validateStartupConfig(block));
    case "ai":
      return check(validateAiEngineeringConfig(block));
    case "github":
      return check(validateGitHubConfig(block));
    case "settings":
      // A bare `settings` snippet must work in both configuration files.
      return [
        ...check(validateStartupConfig({ version: 1, projects: [], ...(block as object) })),
        ...check(validateAiEngineeringConfig({ version: 1, ...(block as object) })),
      ];
    case "other":
      return result.errors;
  }
}

describe.each(DOCS)("JSON examples in %s", (file) => {
  it("are valid for the configuration they show", async () => {
    for (const block of await jsonBlocks(file)) {
      expect(problems(block), JSON.stringify(block).slice(0, 120)).toEqual([]);
    }
  });

  it("use appearance settings that can be resolved into a card", async () => {
    for (const block of await jsonBlocks(file)) {
      const settings = (block as { settings?: Record<string, unknown> }).settings;
      if (settings === undefined || classify(block) === "github") continue;
      const resolved = resolveDesignTokens({ theme: "DARK", ...settings } as never);
      expect(resolved.ok, JSON.stringify(settings)).toBe(true);
    }
  });
});

describe("the public documentation", () => {
  it("contains the examples this test is meant to protect", async () => {
    const kinds = (await Promise.all(DOCS.map(jsonBlocks))).flat().map(classify);
    expect(kinds.filter((kind) => kind === "startup").length).toBeGreaterThanOrEqual(2);
    expect(kinds.filter((kind) => kind === "ai").length).toBeGreaterThanOrEqual(2);
    expect(kinds.filter((kind) => kind === "settings").length).toBeGreaterThanOrEqual(3);
    expect(kinds.filter((kind) => kind === "github").length).toBeGreaterThanOrEqual(2);
  });

  it("documents every theme and layout the code supports", async () => {
    const text = await readFile(path.join(process.cwd(), "docs", "customization.md"), "utf8");
    for (const word of [
      "DARK",
      "LIGHT",
      "MIDNIGHT",
      "MINIMAL",
      "TRANSPARENT",
      "COMPACT",
      "DEFAULT",
      "EXPANDED",
      "SYSTEM",
      "SANS_SERIF",
      "SERIF",
      "MONOSPACE",
    ]) {
      expect(text, word).toContain(`\`${word}\``);
    }
  });
});

describe("docs/cli-reference.md", () => {
  it("shows exactly the help the CLI prints", async () => {
    const text = await readFile(path.join(process.cwd(), "docs", "cli-reference.md"), "utf8");
    expect(text).toContain(`${FENCE}text\n${MAIN_HELP}\n${FENCE}`);
  });
});

describe("local links in the documentation", () => {
  it("point at files that exist", async () => {
    const files = [
      "README.md",
      "CONTRIBUTING.md",
      ...(await readdir("docs")).map((f) => `docs/${f}`),
    ];
    const broken: string[] = [];
    for (const file of files.filter((f) => f.endsWith(".md"))) {
      const text = await readFile(file, "utf8");
      for (const match of text.matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)/g)) {
        const target = path.join(path.dirname(file), match[1] ?? "");
        try {
          await stat(target);
        } catch {
          broken.push(`${file} -> ${match[1] ?? ""}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
