import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = process.cwd();
const WORKFLOW = path.join(root, ".github", "workflows", "update-indicators.yml");

interface Step {
  name?: string;
  id?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
  "continue-on-error"?: boolean;
}

interface Workflow {
  name: string;
  on: { workflow_dispatch?: unknown; schedule?: { cron: string }[] };
  permissions: Record<string, string>;
  concurrency: { group: string; "cancel-in-progress": boolean };
  jobs: Record<
    string,
    { "runs-on": string; "timeout-minutes": number; permissions?: unknown; steps: Step[] }
  >;
}

async function loadWorkflow(): Promise<{ raw: string; workflow: Workflow; steps: Step[] }> {
  const raw = await readFile(WORKFLOW, "utf8");
  const workflow = parse(raw) as Workflow;
  const job = Object.values(workflow.jobs)[0];
  return { raw, workflow, steps: job?.steps ?? [] };
}

const stepIndex = (steps: Step[], predicate: (step: Step) => boolean) => steps.findIndex(predicate);
const runs = (command: string) => (step: Step) => step.run?.trim() === command;

describe("update-indicators workflow", () => {
  it("is valid YAML with a single job", async () => {
    const { workflow } = await loadWorkflow();
    expect(workflow.name).toBe("Update indicators");
    expect(Object.keys(workflow.jobs)).toHaveLength(1);
  });

  it("can be started manually and runs on a schedule", async () => {
    const { workflow } = await loadWorkflow();
    expect("workflow_dispatch" in workflow.on).toBe(true);
    const [schedule] = workflow.on.schedule ?? [];
    expect(schedule?.cron.split(" ")).toHaveLength(5);
  });

  it("asks for the minimum permissions: only writing repository contents", async () => {
    const { workflow } = await loadWorkflow();
    expect(workflow.permissions).toEqual({ contents: "write" });
    expect(Object.values(workflow.jobs)[0]?.permissions).toBeUndefined();
  });

  it("does not run two updates at once and cannot hang forever", async () => {
    const { workflow } = await loadWorkflow();
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
    expect(Object.values(workflow.jobs)[0]?.["timeout-minutes"]).toBeLessThanOrEqual(15);
  });

  it("installs with pnpm and a supported Node.js version", async () => {
    const { steps } = await loadWorkflow();
    const pnpmSetup = stepIndex(
      steps,
      (step) => step.uses?.startsWith("pnpm/action-setup@") === true,
    );
    const nodeSetup = stepIndex(
      steps,
      (step) => step.uses?.startsWith("actions/setup-node@") === true,
    );
    const install = stepIndex(steps, runs("pnpm install --frozen-lockfile"));
    expect(pnpmSetup).toBeGreaterThanOrEqual(0);
    expect(nodeSetup).toBeGreaterThan(pnpmSetup);
    expect(install).toBeGreaterThan(nodeSetup);
    expect(String(steps[nodeSetup]?.with?.["node-version"])).toBe("22");
    expect(steps[nodeSetup]?.with?.cache).toBe("pnpm");
  });

  it("pins every action to a major version", async () => {
    const { steps } = await loadWorkflow();
    const uses = steps.map((step) => step.uses).filter((value) => value !== undefined);
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) {
      expect(action).toMatch(/^[\w.-]+\/[\w.-]+@v\d+$/);
    }
  });

  it("tests, validates, syncs, generates every indicator and only then commits", async () => {
    const { steps } = await loadWorkflow();
    const order = [
      runs("pnpm install --frozen-lockfile"),
      runs("pnpm test"),
      runs("pnpm validate"),
      runs("pnpm sync:github"),
      runs("pnpm generate"),
      (step: Step) => step.run?.includes("git commit") === true,
    ].map((predicate) => stepIndex(steps, predicate));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("only runs scripts that exist in package.json", async () => {
    const { steps } = await loadWorkflow();
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const scripts = steps
      .map((step) => /^pnpm ([\w:-]+)$/.exec(step.run?.trim() ?? "")?.[1])
      .filter((name) => name !== undefined && name !== "install");
    expect(scripts.length).toBeGreaterThan(0);
    for (const name of scripts) {
      expect(Object.keys(pkg.scripts)).toContain(name);
    }
  });

  it("gives the token to the sync step only", async () => {
    const { steps, raw } = await loadWorkflow();
    const withEnv = steps.filter((step) => step.env !== undefined && "GITHUB_TOKEN" in step.env);
    expect(withEnv).toHaveLength(1);
    expect(withEnv[0]?.id).toBe("sync");
    expect(withEnv[0]?.env?.["GITHUB_TOKEN"]).toBe("${{ secrets.GITHUB_TOKEN }}");
    expect(raw.match(/secrets\./g)).toHaveLength(1);
  });

  it("keeps generating when the sync fails, and still reports the failure", async () => {
    const { steps } = await loadWorkflow();
    const sync = steps.find((step) => step.id === "sync");
    expect(sync?.["continue-on-error"]).toBe(true);
    const report = steps.at(-1);
    expect(report?.if).toBe("steps.sync.outcome == 'failure'");
    expect(report?.run).toContain("exit 1");
  });

  it("commits only changed SVG files and never creates an empty commit", async () => {
    const { steps } = await loadWorkflow();
    const commit = steps.find((step) => step.run?.includes("git commit"));
    const script = commit?.run ?? "";
    expect(script).toContain("git add --all -- public/indicators");
    expect(script).toContain("git diff --cached --quiet");
    expect(script.indexOf("git diff --cached --quiet")).toBeLessThan(script.indexOf("git commit"));
    expect(script).toContain("exit 0");
    // The snapshot is committed only together with changed SVG files, never on its own.
    expect(script.indexOf("git add -- data/github-snapshot.json")).toBeGreaterThan(
      script.indexOf("git diff --cached --quiet"),
    );
    expect(script.indexOf("git add -- data/github-snapshot.json")).toBeLessThan(
      script.indexOf("git commit"),
    );
    expect(script).not.toContain("--allow-empty");
    expect(script).not.toMatch(/--force|-f\b/);
  });

  it("does not hardcode the default branch", async () => {
    const { raw, steps } = await loadWorkflow();
    expect(raw).not.toMatch(/\b(main|master|trunk)\b/);
    const commit = steps.find((step) => step.run?.includes("git push"));
    expect(commit?.env?.["TARGET_BRANCH"]).toBe("${{ github.ref_name }}");
    expect(commit?.run).toContain('git push origin "HEAD:${TARGET_BRANCH}"');
  });

  it("does not put workflow expressions inside shell scripts", async () => {
    const { steps } = await loadWorkflow();
    for (const step of steps) {
      expect(step.run ?? "").not.toContain("${{");
    }
  });

  it("does not deploy or publish anywhere", async () => {
    const { raw } = await loadWorkflow();
    expect(raw).not.toMatch(/deploy|publish|gh-pages|upload-pages|upload-artifact|npm publish/i);
  });

  it("is one of exactly two workflows (CI and this one)", async () => {
    expect(await readdir(path.dirname(WORKFLOW))).toEqual(["ci.yml", "update-indicators.yml"]);
  });
});

describe("ci workflow", () => {
  it("runs on pull requests with read-only permissions and no secrets", async () => {
    const raw = await readFile(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
    const ci = parse(raw) as {
      on: { pull_request?: unknown; push?: { branches: string[] } };
      permissions: Record<string, string>;
    };
    expect("pull_request" in ci.on).toBe(true);
    expect(ci.on.push?.branches).toContain("main");
    expect(ci.permissions).toEqual({ contents: "read" });
    expect(raw).not.toMatch(/secrets\./);
    for (const command of [
      "pnpm typecheck",
      "pnpm lint",
      "pnpm format:check",
      "pnpm test",
      "pnpm build",
    ]) {
      expect(raw).toContain(command);
    }
  });
});
