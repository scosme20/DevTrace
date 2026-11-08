import type { DeveloperActivitySettings } from "../core/developer-activity-models.js";
import type { StartupProfile } from "../core/models.js";
import {
  activityHeatmap,
  caption,
  compactMetric,
  entryList,
  horizontalBarChart,
  panel,
  progressBar,
  stack,
  timeline,
  verticalBarChart,
  type Builder,
  type MetricCardData,
  type EntryItem,
} from "../components/index.js";
import { EFFICIENCY_MIN_DAYS, type ActivityStats } from "../indicators/developer-activity/stats.js";
import { composeDashboard } from "./dashboard.js";

import { requireDashboardTokens, type DesignTokens } from "./design-tokens.js";

// The Developer Activity dashboard: a grid of panels built from the shared SVG
// components. It shows what GitHub reported for the repositories in the
// snapshot. It says nothing about productivity, quality or skill, and each
// panel names the data it comes from so it is not read as more than it is.

const TITLE = "Developer Activity Dashboard";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_CHART_HEIGHT = 110;

export interface DeveloperActivityOptions {
  readonly profile: StartupProfile;
  readonly settings: DeveloperActivitySettings;
  readonly generatorVersion: string;
}

const day = (iso: string): string => iso.slice(0, 10);

function repositories(count: number, kind = ""): string {
  return `${String(count)} ${kind}${count === 1 ? "repository" : "repositories"}`;
}

function metricCards(stats: ActivityStats): MetricCardData[] {
  return [
    { label: "Public Repositories", value: stats.repositoryCount },
    ...(stats.commits === undefined
      ? []
      : [
          {
            label: "Commits",
            value: stats.commits.total.toLocaleString("en-US"),
            caption: `${String(stats.commits.weeks)} weeks`,
          },
        ]),
    ...(stats.withRelease === 0
      ? []
      : [{ label: "With a Release", value: stats.withRelease, tone: "success" as const }]),
    ...(stats.lastPush === undefined
      ? []
      : [{ label: "Last Push", value: day(stats.lastPush), tone: "muted" as const }]),
  ];
}

function efficiencyPanel(stats: ActivityStats, tokens: DesignTokens): Builder | undefined {
  const { commits, efficiency } = stats;
  if (commits === undefined || efficiency === undefined) return undefined;
  const scope = `${commits.from} to ${commits.to}`;
  const note = efficiency.ready
    ? `Tokens per commit · ${scope} · ${String(efficiency.matchedDays)} days with both${efficiency.median === undefined ? "" : ` · median ${efficiency.median.toLocaleString("en-US")}`}`
    : `Needs ${String(EFFICIENCY_MIN_DAYS)} days with commits and tokens; ${String(efficiency.matchedDays)} found`;
  return panel(tokens, {
    title: "Token efficiency heatmap",
    tag: { label: "Estimated", tone: "warning" },
    content: stack({ gap: 8 }, [
      caption(tokens, note),
      activityHeatmap(tokens, efficiency.ready ? efficiency.heatmap : [], {
        rowLabels: WEEKDAY_LABELS,
        legend: true,
        legendLabels: ["More tokens", "Fewer"],
      }),
      caption(
        tokens,
        "Brighter means fewer tokens per commit, against your own days. A use measure, not quality. Gray is unknown.",
      ),
    ]),
  });
}

function heatmapPanel(stats: ActivityStats, tokens: DesignTokens): Builder | undefined {
  if (stats.efficiency !== undefined) return efficiencyPanel(stats, tokens);
  const { commits } = stats;
  if (commits === undefined) return undefined;
  return panel(tokens, {
    title: "Commit heatmap",
    content: stack({ gap: 8 }, [
      caption(
        tokens,
        `Commits per day · ${commits.from} to ${commits.to} · ${String(commits.reposWithData)} of ${String(stats.repositoryCount)} repositories`,
      ),
      activityHeatmap(tokens, commits.heatmap, { rowLabels: WEEKDAY_LABELS, legend: true }),
    ]),
  });
}

function commitPanel(stats: ActivityStats, tokens: DesignTokens): Builder | undefined {
  const { commits } = stats;
  if (commits === undefined) return undefined;
  const repositoryName = (fullName: string): string => fullName.split("/")[1] ?? fullName;
  return panel(tokens, {
    title: "Commit activity",
    content: stack({ gap: tokens.visual.gap }, [
      stack({ gap: 6 }, [
        caption(tokens, "Commits per month · gray months are partial"),
        verticalBarChart(
          tokens,
          commits.months.map((month) => ({
            label: MONTHS[Number(month.month.slice(5)) - 1] ?? month.month,
            value: month.commits,
            tone: month.partial ? "muted" : "primary",
          })),
          MONTH_CHART_HEIGHT,
        ),
      ]),
      ...(commits.trend === undefined
        ? []
        : [
            stack({ gap: 2 }, [
              caption(tokens, `Two equal periods of ${String(commits.trend.weeks)} complete weeks`),
              compactMetric(tokens, { label: "Latest period", value: commits.trend.current }),
              compactMetric(tokens, { label: "Previous period", value: commits.trend.previous }),
            ]),
          ]),
      ...(commits.byRepository.length === 0
        ? []
        : [
            stack({ gap: 6 }, [
              caption(tokens, "Commits by repository · not a ranking of quality"),
              horizontalBarChart(
                tokens,
                commits.byRepository.map((entry) => ({
                  label: repositoryName(entry.fullName),
                  value: entry.commits,
                })),
              ),
            ]),
          ]),
    ]),
  });
}

function repositoriesPanel(stats: ActivityStats, tokens: DesignTokens): Builder | undefined {
  if (stats.repositoryCount === 0) return undefined;
  const entries: EntryItem[] = stats.listedRepositories.map((repository) => ({
    title: repository.name,
    ...(repository.pushedAt === undefined
      ? {}
      : { trailing: `pushed ${day(repository.pushedAt)}` }),
    subtitle:
      [
        repository.language,
        repository.stars === undefined
          ? undefined
          : `${repository.stars.toLocaleString("en-US")} stars`,
        repository.forks === undefined
          ? undefined
          : `${repository.forks.toLocaleString("en-US")} forks`,
        repository.archived ? "archived" : undefined,
        repository.fork ? "fork" : undefined,
      ]
        .filter((part) => part !== undefined)
        .join(" · ") || "GitHub repository",
  }));
  return panel(tokens, {
    title: "Repository activity",
    content: stack({ gap: 8 }, [
      caption(tokens, "Latest push first · not a quality ranking"),
      entryList(tokens, entries, {
        hidden: stats.repositoryCount - stats.listedRepositories.length,
      }),
    ]),
  });
}

function percentText(percent: number): string {
  return percent > 0 && percent < 1 ? "<1%" : `${String(Math.round(percent))}%`;
}

function languagesPanel(stats: ActivityStats, tokens: DesignTokens): Builder | undefined {
  const { languages } = stats;
  if (languages !== undefined) {
    return panel(tokens, {
      title: "Programming languages",
      content: stack({ gap: 8 }, [
        caption(
          tokens,
          `Code bytes reported by GitHub · ${String(languages.reposWithData)} of ${String(stats.repositoryCount)} repos · not time spent`,
        ),
        stack(
          { gap: 4 },
          languages.shares.map((share) =>
            progressBar(tokens, {
              label: share.name,
              value: share.bytes,
              max: languages.totalBytes,
              valueText: percentText(share.percent),
            }),
          ),
        ),
      ]),
    });
  }
  if (stats.primaryLanguages.length === 0) return undefined;
  return panel(tokens, {
    title: "Programming languages",
    content: stack({ gap: 8 }, [
      caption(tokens, "Primary language of each repository · counts, not usage"),
      stack(
        { gap: 2 },
        stats.primaryLanguages.slice(0, 6).map((entry) =>
          compactMetric(tokens, {
            label: entry.name,
            value: repositories(entry.repositories),
          }),
        ),
      ),
    ]),
  });
}

function releasesPanel(stats: ActivityStats, tokens: DesignTokens): Builder | undefined {
  if (stats.releases.length === 0) return undefined;
  const repositoryName = (fullName: string): string => fullName.split("/")[1] ?? fullName;
  return panel(tokens, {
    title: "Releases",
    content: stack({ gap: 8 }, [
      caption(tokens, "Latest published release of each repository"),
      timeline(
        tokens,
        stats.releases.map((release) => ({
          label: `${repositoryName(release.repository)} ${release.tag}`,
          date: day(release.date),
          tone: "success" as const,
        })),
      ),
      ...(stats.hiddenReleases > 0
        ? [caption(tokens, `+${String(stats.hiddenReleases)} more`)]
        : []),
    ]),
  });
}

export function renderDeveloperActivityDashboard(
  stats: ActivityStats,
  options: DeveloperActivityOptions,
): string {
  const { profile, settings, generatorVersion } = options;
  const tokens = requireDashboardTokens(settings);
  const hasData = stats.repositoryCount > 0;

  return composeDashboard({
    title: TITLE,
    description: `${profile.displayName}: activity observed on ${repositories(stats.repositoryCount, "public ")} (GitHub snapshot).`,
    displayName: profile.displayName,
    generatorVersion,
    settings,
    metrics: hasData ? metricCards(stats) : [],
    // The scope of every number below, stated once.
    notice: hasData
      ? `Observed on ${repositories(stats.repositoryCount, "monitored public ")} · snapshot of ${day(stats.observedAt ?? "")} · not all GitHub activity`
      : undefined,
    panels: hasData
      ? [
          { build: settings.showHeatmap ? heatmapPanel(stats, tokens) : undefined, span: 2 },
          { build: settings.showCommitActivity ? commitPanel(stats, tokens) : undefined, span: 1 },
          {
            build: settings.showRepositories ? repositoriesPanel(stats, tokens) : undefined,
            span: 1,
          },
          { build: settings.showLanguages ? languagesPanel(stats, tokens) : undefined, span: 1 },
          { build: settings.showReleases ? releasesPanel(stats, tokens) : undefined, span: 1 },
        ]
      : [],
    emptyMessage: 'No GitHub data yet. Run "devtrace sync" first.',
  });
}
