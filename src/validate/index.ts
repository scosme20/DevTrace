import path from "node:path";
import { suggestFix } from "../cli/suggestions.js";
import type { AiEngineeringConfig } from "../core/ai-engineering-models.js";
import { validateAiEngineeringConfig } from "../core/ai-engineering-validation.js";
import type { AppearanceSettings } from "../core/appearance.js";
import { loadGitHubSnapshot, readConfigJson } from "../core/config.js";
import type { GitHubConfig, GitHubSnapshot } from "../core/github-models.js";
import { validateGitHubConfig } from "../core/github-validation.js";
import type { StartupConfig } from "../core/models.js";
import type { Result } from "../core/result.js";
import { validateStartupConfig } from "../core/validation.js";
import {
  AI_ENGINEERING_CONFIG_FILE,
  AI_ENGINEERING_INDICATOR_FILE,
} from "../generators/ai-engineering.js";
import { GITHUB_CONFIG_FILE, GITHUB_SNAPSHOT_FILE } from "../generators/github.js";
import {
  INDICATORS_DIR,
  STARTUP_CONFIG_FILE,
  STARTUP_INDICATOR_FILE,
} from "../generators/startup.js";
import { selectPublicAiData } from "../indicators/ai-engineering/stats.js";
import { linkGitHubRepositories } from "../indicators/github-link.js";
import { selectPublicProjects } from "../indicators/startup/stats.js";
import { contrastWarnings, resolveDesignTokens } from "../templates/design-tokens.js";
import { summarize, type FileReport, type Finding, type ValidationReport } from "./report.js";

export type ValidationTarget = "startup" | "ai" | "github";

const MISSING_HINT =
  'Run "devtrace init" to create the configuration files, or copy one from the examples directory.';

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? "" : "s"}`;
const split = (total: number, visible: number): string =>
  `${String(total)} (${String(visible)} public, ${String(total - visible)} private)`;

interface Context {
  readonly rootDir: string;
  readonly snapshot: GitHubSnapshot | undefined;
  readonly snapshotError: string | undefined;
  readonly githubConfig: GitHubConfig | undefined;
}

type Loaded<T> =
  | { readonly kind: "ok"; readonly config: T }
  | { readonly kind: "report"; readonly report: FileReport };

function schemaFindings(errors: readonly string[]): Finding[] {
  return errors.map((message) => ({ level: "error", message, hint: suggestFix(message) }));
}

async function loadFile<T>(
  context: Context,
  target: FileReport["target"],
  file: string,
  validate: (input: unknown) => Result<T>,
): Promise<Loaded<T>> {
  const read = await readConfigJson(path.join(context.rootDir, file));
  const fail = (message: string, hint?: string): Loaded<T> => ({
    kind: "report",
    report: {
      target,
      file,
      status: "invalid",
      summary: ["Cannot be used."],
      findings: [{ level: "error", message, hint }],
    },
  });
  if (!read.ok) {
    if (read.reason === "missing") return fail(`File not found: ${file}`, MISSING_HINT);
    if (read.reason === "invalid-json") {
      const detail = read.cause instanceof Error ? read.cause.message : "invalid syntax";
      return fail(
        `Not valid JSON: ${detail}`,
        "Look for a trailing comma, a comment, a missing quote or a missing bracket near that position.",
      );
    }
    return fail(`Cannot read ${file}.`, "Check that the file is readable and is not a directory.");
  }
  const result = validate(read.json);
  if (!result.ok) {
    return {
      kind: "report",
      report: {
        target,
        file,
        status: "invalid",
        summary: [`${plural(result.errors.length, "problem")} found.`],
        findings: schemaFindings(result.errors),
      },
    };
  }
  return { kind: "ok", config: result.value };
}

function appearanceFindings(settings: AppearanceSettings): Finding[] {
  const resolved = resolveDesignTokens(settings);
  if (!resolved.ok) {
    // The generator would fail with this, so it is an error here too.
    return resolved.errors.map((message) => ({
      level: "error",
      message: `settings.dimensions: ${message}`,
    }));
  }
  return contrastWarnings(settings).map((message) => ({
    level: "warning",
    message,
    hint: "Pick colors with more contrast, or keep them if the look is intentional.",
  }));
}

function provenanceFindings(
  kind: string,
  items: readonly { readonly id: string; readonly provenance: string }[],
): Finding[] {
  return items
    .filter((item) => item.provenance === "OBSERVED")
    .map((item) => ({
      level: "warning",
      message: `${kind} "${item.id}" is marked OBSERVED, but no DevTrace integration observes this kind of data.`,
      hint: 'Use "DECLARED" for values you entered yourself, or "ESTIMATED" for inferred ones.',
    }));
}

function snapshotFindings(context: Context): Finding[] {
  return context.snapshotError === undefined
    ? []
    : [
        {
          level: "error",
          message: `${GITHUB_SNAPSHOT_FILE} is not valid, so generating would fail: ${context.snapshotError}`,
          hint: 'It is generated data: delete it and run "devtrace sync --force".',
        },
      ];
}

function linkFindings(
  projects: readonly {
    id: string;
    visibility: "PUBLIC" | "PRIVATE";
    githubRepository?: string | undefined;
    repositoryUrl?: string | undefined;
  }[],
  context: Context,
): Finding[] {
  const linked = projects.filter(
    (project) => project.visibility === "PUBLIC" && project.githubRepository !== undefined,
  );
  if (linked.length === 0) return [];
  if (context.githubConfig === undefined) {
    return [
      {
        level: "warning",
        message: `${plural(linked.length, "project")} link a GitHub repository, but the GitHub integration is not configured.`,
        hint: `Create ${GITHUB_CONFIG_FILE} (see examples/github.json), or remove "githubRepository".`,
      },
    ];
  }
  return linkGitHubRepositories(projects, context.snapshot).warnings.map((message) => ({
    level: "warning",
    message,
  }));
}

function emptyCard(message: string, hint: string): Finding {
  return { level: "warning", message, hint };
}

function startupReport(config: StartupConfig, context: Context): FileReport {
  const publicProjects = selectPublicProjects(config.projects);
  const findings: Finding[] = [...snapshotFindings(context)];

  if (config.projects.length === 0) {
    findings.push(
      emptyCard(
        "No projects are configured, so the card will be empty.",
        'Add projects to "projects" (see examples/startup-dark.json).',
      ),
    );
  } else if (publicProjects.length === 0) {
    findings.push(
      emptyCard(
        "Every project is PRIVATE, so the card will show no projects.",
        'Set "visibility": "PUBLIC" on the projects you want to show.',
      ),
    );
  }
  findings.push(
    ...provenanceFindings(
      "Project",
      config.projects.map((project) => ({ id: project.id, provenance: project.dataSource })),
    ),
  );
  findings.push(...linkFindings(config.projects, context));
  findings.push(...appearanceFindings(config.settings));

  return {
    target: "startup",
    file: STARTUP_CONFIG_FILE,
    status: findings.some((finding) => finding.level === "error") ? "invalid" : "valid",
    summary: [
      `Projects: ${split(config.projects.length, publicProjects.length)}`,
      `Look: ${config.settings.theme} theme, ${config.settings.layout ?? "DEFAULT"} layout`,
      `Will write: ${INDICATORS_DIR}/${STARTUP_INDICATOR_FILE}`,
    ],
    findings,
  };
}

function aiReport(config: AiEngineeringConfig, context: Context): FileReport {
  const visible = selectPublicAiData(config);
  const publicProjectIds = new Set(visible.projects.map((project) => project.id));
  const publicModelIds = new Set(visible.models.map((model) => model.id));
  const findings: Finding[] = [...snapshotFindings(context)];

  const entries = [
    config.tools.length,
    config.models.length,
    config.skills.length,
    config.projects.length,
  ];
  if (entries.every((count) => count === 0)) {
    findings.push(
      emptyCard(
        "No tools, models, skills or projects are configured, so the card will be empty.",
        "Add entries to the lists (see examples/ai-engineering.json).",
      ),
    );
  } else if (
    visible.tools.length +
      visible.models.length +
      visible.skills.length +
      visible.projects.length ===
    0
  ) {
    findings.push(
      emptyCard(
        "Everything is PRIVATE, so the card will show nothing.",
        'Set "visibility": "PUBLIC" on the entries you want to show.',
      ),
    );
  }

  const hiddenActivities = config.activities.filter(
    (activity) =>
      activity.visibility === "PUBLIC" &&
      activity.projectId !== undefined &&
      !publicProjectIds.has(activity.projectId),
  ).length;
  if (hiddenActivities > 0) {
    findings.push({
      level: "warning",
      message: `${plural(hiddenActivities, "public activity record")} will not be shown because ${hiddenActivities === 1 ? "it is" : "they are"} linked to a private project.`,
      hint: "This protects the private project. Make the project PUBLIC or the activity PRIVATE to remove this warning.",
    });
  }
  const hiddenMetrics = config.tokenUsage.filter(
    (metric) => metric.visibility === "PUBLIC" && !publicModelIds.has(metric.modelId),
  ).length;
  if (hiddenMetrics > 0) {
    findings.push({
      level: "warning",
      message: `${plural(hiddenMetrics, "public token metric")} will not be shown because ${hiddenMetrics === 1 ? "its" : "their"} model is private.`,
      hint: "This protects the private model. Make the model PUBLIC or the metric PRIVATE to remove this warning.",
    });
  }

  findings.push(
    ...provenanceFindings("Tool", config.tools),
    ...provenanceFindings("Model", config.models),
    ...provenanceFindings("Skill", config.skills),
    ...provenanceFindings("Project", config.projects),
    ...provenanceFindings("Activity", config.activities),
  );
  findings.push(...linkFindings(config.projects, context));
  findings.push(...appearanceFindings(config.settings));

  return {
    target: "ai",
    file: AI_ENGINEERING_CONFIG_FILE,
    status: findings.some((finding) => finding.level === "error") ? "invalid" : "valid",
    summary: [
      `Tools: ${split(config.tools.length, visible.tools.length)}`,
      `Models: ${split(config.models.length, visible.models.length)}`,
      `Skills: ${split(config.skills.length, visible.skills.length)}`,
      `Projects: ${split(config.projects.length, visible.projects.length)}`,
      `Activity records: ${String(config.activities.length)}, token metrics: ${String(config.tokenUsage.length)} (shown only when enabled)`,
      `Look: ${config.settings.theme} theme, ${config.settings.layout ?? "DEFAULT"} layout`,
      `Will write: ${INDICATORS_DIR}/${AI_ENGINEERING_INDICATOR_FILE}`,
    ],
    findings,
  };
}

function overlaps(include: string, exclude: string): boolean {
  const a = include.toLowerCase();
  const b = exclude.toLowerCase();
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function githubReport(config: GitHubConfig, context: Context): FileReport {
  const { repositories } = config;
  const findings: Finding[] = [];

  for (const include of repositories.include) {
    const clash = repositories.exclude.find((exclude) => overlaps(include, exclude));
    if (clash !== undefined) {
      findings.push({
        level: "warning",
        message: `"${include}" is in both repositories.include and repositories.exclude. Exclusion wins, so it is not collected.`,
        hint: "Remove it from one of the two lists.",
      });
    }
  }
  if (
    context.snapshot !== undefined &&
    context.snapshot.username.toLowerCase() !== config.username.toLowerCase()
  ) {
    findings.push({
      level: "warning",
      message: `${GITHUB_SNAPSHOT_FILE} was synced for "${context.snapshot.username}", but ${GITHUB_CONFIG_FILE} is for "${config.username}".`,
      hint: 'Run "devtrace sync --force" to refresh it.',
    });
  }
  findings.push(...snapshotFindings(context));

  const collected = (["description", "language", "stars", "forks", "releases"] as const).filter(
    (field) => config.collect[field],
  );
  const snapshot = context.snapshot;
  return {
    target: "github",
    file: GITHUB_CONFIG_FILE,
    status: findings.some((finding) => finding.level === "error") ? "invalid" : "valid",
    summary: [
      `User: ${config.username}`,
      repositories.include.length === 0
        ? `Repositories: all public ones (forks ${repositories.includeForks ? "included" : "skipped"}, archived ${repositories.includeArchived ? "included" : "skipped"})`
        : `Repositories: ${plural(repositories.include.length, "listed one")}`,
      `Collects: ${collected.length === 0 ? "basic metadata only" : collected.join(", ")}`,
      `Cache: ${String(config.cacheTtlMinutes)} minutes, unavailable repositories: ${config.onUnavailable === "SKIP" ? "skipped" : "stop the sync"}`,
      snapshot === undefined
        ? 'Snapshot: not synced yet (run "devtrace sync")'
        : `Snapshot: ${plural(snapshot.repositories.length, "repository")}, synced ${snapshot.fetchedAt}`,
    ],
    findings,
  };
}

/**
 * Validates the configuration files without writing anything. Problems are
 * reported with the file, the field and a suggestion; nothing is corrected.
 */
export async function validateProject(
  rootDir: string,
  targets: readonly ValidationTarget[],
): Promise<ValidationReport> {
  let snapshot: GitHubSnapshot | undefined;
  let snapshotError: string | undefined;
  try {
    snapshot = await loadGitHubSnapshot(path.join(rootDir, GITHUB_SNAPSHOT_FILE));
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    snapshotError = cause instanceof Error ? cause.message.split("\n")[0] : "it cannot be read";
  }

  const githubRead = await readConfigJson(path.join(rootDir, GITHUB_CONFIG_FILE));
  const githubChecked = githubRead.ok ? validateGitHubConfig(githubRead.json) : undefined;
  const context: Context = {
    rootDir,
    snapshot,
    snapshotError,
    githubConfig: githubChecked?.ok === true ? githubChecked.value : undefined,
  };

  const files: FileReport[] = [];
  for (const target of targets) {
    if (target === "startup") {
      const loaded = await loadFile(context, "startup", STARTUP_CONFIG_FILE, validateStartupConfig);
      files.push(loaded.kind === "ok" ? startupReport(loaded.config, context) : loaded.report);
    } else if (target === "ai") {
      const loaded = await loadFile(
        context,
        "ai",
        AI_ENGINEERING_CONFIG_FILE,
        validateAiEngineeringConfig,
      );
      files.push(loaded.kind === "ok" ? aiReport(loaded.config, context) : loaded.report);
    } else if (!githubRead.ok && githubRead.reason === "missing") {
      files.push({
        target: "github",
        file: GITHUB_CONFIG_FILE,
        status: "skipped",
        summary: ["Not configured. The GitHub integration is optional."],
        findings: [],
      });
    } else {
      const loaded = await loadFile(context, "github", GITHUB_CONFIG_FILE, validateGitHubConfig);
      files.push(loaded.kind === "ok" ? githubReport(loaded.config, context) : loaded.report);
    }
  }
  return summarize(files);
}
