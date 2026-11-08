import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseArgs } from "../src/cli/args.js";
import { initProject } from "../src/cli/init.js";
import { validateProject } from "../src/validate/index.js";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const scratch = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "devtrace-init-"));
  temporary.push(dir);
  return dir;
};

describe("devtrace init with answers", () => {
  it("fills the name and the theme in every starter file", async () => {
    const root = await scratch();
    await initProject(root, { name: "Ada Lovelace", github: "ada", theme: "TERMINAL" });
    for (const file of ["data/startup.json", "data/ai-engineering.json"]) {
      const config = JSON.parse(await readFile(path.join(root, file), "utf8")) as {
        profile: { displayName: string };
        settings: { theme: string };
      };
      expect(config.profile.displayName).toBe("Ada Lovelace");
      expect(config.settings.theme).toBe("TERMINAL");
    }
  });

  it("creates the GitHub and activity files only when a username is given, and they validate", async () => {
    const without = await scratch();
    const result = await initProject(without, {});
    expect(result.created).not.toContain("data/github.json");

    const root = await scratch();
    const created = await initProject(root, { github: "ada", name: "Ada" });
    expect(created.created).toEqual(
      expect.arrayContaining(["data/github.json", "data/developer-activity.json"]),
    );
    const report = await validateProject(root, ["startup", "ai", "activity", "github"]);
    expect(report.errors).toBe(0);
  });

  it("writes a workflow that uses the DevTrace action only when asked", async () => {
    const root = await scratch();
    await initProject(root, { workflow: true });
    const text = await readFile(path.join(root, ".github/workflows/update-indicators.yml"), "utf8");
    expect(text).toMatch(/uses: scosme20\/DevTrace@v\d+\.\d+\.\d+/);
    expect(parse(text)).toBeTypeOf("object");
    const plain = await scratch();
    await initProject(plain, {});
    await expect(
      readFile(path.join(plain, ".github/workflows/update-indicators.yml"), "utf8"),
    ).rejects.toThrow();
  });

  it("never overwrites a file that exists", async () => {
    const root = await scratch();
    await initProject(root, { name: "First" });
    const again = await initProject(root, { name: "Second" });
    expect(again.created).toEqual([]);
    const config = JSON.parse(await readFile(path.join(root, "data/startup.json"), "utf8")) as {
      profile: { displayName: string };
    };
    expect(config.profile.displayName).toBe("First");
  });

  it("parses and checks the options", () => {
    expect(
      parseArgs(["init", "--name", "Ada", "--github", "ada", "--theme", "terminal", "--workflow"])
        .invocation,
    ).toEqual({ kind: "init", name: "Ada", github: "ada", theme: "TERMINAL", workflow: true });
    expect(() => parseArgs(["init", "--github", "not a user"])).toThrow("GitHub username");
    expect(() => parseArgs(["init", "--theme", "PINK"])).toThrow("--theme");
  });
});

interface ActionStep {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  if?: string;
  "working-directory"?: string;
  shell?: string;
}
interface Action {
  runs: { using: string; steps: ActionStep[] };
  inputs: Record<string, { default?: string }>;
}

async function loadAction(): Promise<{ raw: string; action: Action }> {
  const raw = await readFile(path.join(process.cwd(), "action.yml"), "utf8");
  return { raw, action: parse(raw) as Action };
}

describe("the reusable action (action.yml)", () => {
  it("is a composite action with a shell on every script step", async () => {
    const { action } = await loadAction();
    expect(action.runs.using).toBe("composite");
    for (const step of action.runs.steps.filter((entry) => entry.run !== undefined)) {
      expect(step.shell).toBe("bash");
    }
  });

  it("pins every action it uses to a major version", async () => {
    const { action } = await loadAction();
    for (const step of action.runs.steps.filter((entry) => entry.uses !== undefined)) {
      expect(step.uses).toMatch(/@v\d+$/);
    }
  });

  it("gives the token to the sync step only", async () => {
    const { raw, action } = await loadAction();
    const holders = action.runs.steps.filter((step) => step.env?.["GITHUB_TOKEN"] !== undefined);
    expect(holders).toHaveLength(1);
    expect(holders[0]?.run).toContain("sync");
    expect(raw.match(/github-token/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("builds DevTrace from the action's own checkout and runs that build in the caller's repository", async () => {
    const { action } = await loadAction();
    const build = action.runs.steps.find((step) => step.run?.includes("pnpm build"));
    expect(build?.["working-directory"]).toBe("${{ github.action_path }}");
    const generate = action.runs.steps.find((step) => step.run?.includes(" generate "));
    expect(generate?.["working-directory"]).toBeUndefined();
    expect(generate?.run).toContain("${GITHUB_ACTION_PATH}/dist/index.js");
  });

  it("keeps workflow expressions out of the shell scripts", async () => {
    const { action } = await loadAction();
    for (const step of action.runs.steps) expect(step.run ?? "").not.toContain("${{");
  });

  it("commits only generated files and publishes nowhere", async () => {
    const { raw, action } = await loadAction();
    const commit = action.runs.steps.find((step) => step.run?.includes("git commit"));
    expect(commit?.run).toContain("git add --all -- public/indicators");
    expect(commit?.run).not.toMatch(/git add (-A|\.|--all)\s*$/m);
    expect(raw).not.toMatch(/npm publish|gh release|pages-build|deploy/);
  });

  it("defaults to generating everything, syncing and committing", async () => {
    const { action } = await loadAction();
    expect(action.inputs["target"]?.default).toBe("all");
    expect(action.inputs["sync"]?.default).toBe("true");
    expect(action.inputs["commit"]?.default).toBe("true");
  });
});
