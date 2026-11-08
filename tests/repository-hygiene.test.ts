import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEVTRACE_VERSION } from "../src/core/version.js";

const root = process.cwd();

// Shapes of real GitHub credentials. Nothing like these belongs in the repository.
const TOKEN_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /Authorization:\s*(?:Bearer|token)\s+[A-Za-z0-9_-]{20,}/i,
];

const SCANNED = ["src", "data", "docs", ".github", "public"];
const SCANNED_FILES = ["README.md", "package.json", ".gitignore"];

async function* walk(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(entryPath);
    else yield entryPath;
  }
}

describe("credentials", () => {
  it("are not present in any tracked source, data, doc or generated file", async () => {
    const files = [...SCANNED_FILES.map((file) => path.join(root, file))];
    for (const directory of SCANNED) {
      for await (const file of walk(path.join(root, directory))) files.push(file);
    }
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const content = await readFile(file, "utf8");
      for (const pattern of TOKEN_PATTERNS) {
        expect(
          pattern.test(content),
          `${path.relative(root, file)} matches ${String(pattern)}`,
        ).toBe(false);
      }
    }
  });

  it("have no place in the GitHub configuration file", async () => {
    const configPath = path.join(root, "data", "github.json");
    try {
      const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
      expect(JSON.stringify(config).toLowerCase()).not.toMatch(/token|secret|password|credential/);
    } catch (error) {
      // The file is optional: without it the integration is simply off.
      expect((error as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });

  it("are kept out of version control by .gitignore", async () => {
    const ignore = (await readFile(path.join(root, ".gitignore"), "utf8")).split("\n");
    expect(ignore).toContain(".env");
    expect(ignore).toContain(".env.*");
    // The GitHub snapshot is committed on purpose, so the SVG files can be reproduced from
    // what is in the repository. It holds public data only, and the credential scan covers it.
    expect(ignore).not.toContain("data/github-snapshot.json");
  });

  it("are only read from the environment by the client code", async () => {
    const offenders: string[] = [];
    for await (const file of walk(path.join(root, "src"))) {
      const content = await readFile(file, "utf8");
      // help.ts only documents the variable name; it never reads the value.
      const allowed = /generators[\\/]github\.ts$|client\.ts$|cli[\\/]help\.ts$/;
      if (/GITHUB_TOKEN/.test(content) && !allowed.test(file)) {
        offenders.push(path.relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("generated SVG files", () => {
  it("contain no credentials, scripts or external references", async () => {
    for await (const file of walk(path.join(root, "public", "indicators"))) {
      const content = await readFile(file, "utf8");
      expect(content, file).not.toMatch(/<script|javascript:|onload=|href=|<image|<foreignObject/i);
      expect(content, file).not.toMatch(/GITHUB_TOKEN|Bearer |ghp_/);
    }
  });
});

describe("package metadata", () => {
  it("matches package.json and exposes the documented scripts", async () => {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      version: string;
      scripts: Record<string, string>;
    };
    expect(pkg.version).toBe(DEVTRACE_VERSION);
    expect(pkg.scripts["sync:github"]).toBe("tsx src/index.ts sync");
    expect(pkg.scripts["generate:startup"]).toBe("tsx src/index.ts generate startup");
    expect(pkg.scripts["generate:ai"]).toBe("tsx src/index.ts generate ai");
  });
});
