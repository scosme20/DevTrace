import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateAiEngineeringConfig } from "../src/core/ai-engineering-validation.js";
import { validateGitHubConfig } from "../src/core/github-validation.js";
import { validateStartupConfig } from "../src/core/validation.js";

// The files in examples/ are what people copy. Each one must pass the real
// validators, and none may carry credentials.

const dir = path.join(process.cwd(), "examples");

const validators: Readonly<Record<string, (value: unknown) => { ok: boolean }>> = {
  startup: validateStartupConfig,
  "ai-engineering": validateAiEngineeringConfig,
  github: validateGitHubConfig,
};

const validatorFor = (file: string) =>
  Object.entries(validators).find(([prefix]) => file.startsWith(prefix))?.[1];

describe("examples/", async () => {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));

  it("covers startup, AI engineering and GitHub, with each theme and layout it promises", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "startup-dark.json",
        "startup-light-compact.json",
        "startup-custom-colors.json",
        "ai-engineering.json",
        "github.json",
      ]),
    );
  });

  it.each(files)("%s is valid and holds no credentials", async (file) => {
    const text = await readFile(path.join(dir, file), "utf8");
    const validate = validatorFor(file);
    expect(validate, `no validator for ${file}`).toBeDefined();
    const result = validate?.(JSON.parse(text) as unknown);
    expect(result, file).toMatchObject({ ok: true });
    expect(text).not.toMatch(/ghp_|github_pat_|Bearer |"(token|password|secret)"/i);
  });
});
