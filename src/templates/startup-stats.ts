import { displayFlags } from "../core/appearance.js";
import type { StartupProfile, StartupProject, StartupSettings } from "../core/models.js";
import type { LifecycleCount, StartupStats } from "../indicators/startup/stats.js";
import { element, text } from "../shared/svg.js";
import {
  composeCard,
  label,
  pluralize,
  renderEmptyState,
  sectionHeading,
  type Section,
} from "./card.js";
import { fit, requireDesignTokens, type DesignTokens } from "./design-tokens.js";
import { formatGitHubLine } from "./github.js";
import { renderRows, type Row } from "./rows.js";
import { statusColor } from "./themes.js";

// Where the stage and the status start, as a fraction of the content width.
const STAGE_COLUMN = 240 / 504;
const STATUS_COLUMN = 360 / 504;
const COUNT_WIDTH = 40;

export interface StartupCardOptions {
  readonly profile: StartupProfile;
  readonly settings: StartupSettings;
  readonly generatorVersion: string;
}

function renderLifecycle(
  counts: readonly LifecycleCount[],
  total: number,
  tokens: DesignTokens,
): Section {
  const { palette, font, box, layout } = tokens;
  const labelWidth = Math.round((112 * font.body) / 13);
  const trackWidth = box.contentWidth - labelWidth - COUNT_WIDTH;
  const trackX = box.padding + labelWidth;

  const rows = counts
    .map(({ stage, count }, index) => {
      const y = layout.listStart + index * layout.barRowHeight;
      const fillWidth = Math.max(
        layout.barHeight / 2,
        Math.round((count / total) * trackWidth * 10) / 10,
      );
      const barY = y - layout.barHeight - 1;
      return (
        text(fit(tokens, label(stage), labelWidth - 10, font.body), {
          x: box.padding,
          y,
          fill: palette.secondaryText,
          size: font.body,
        }) +
        element("rect", {
          x: trackX,
          y: barY,
          width: trackWidth,
          height: layout.barHeight,
          rx: box.barRadius,
          fill: palette.track,
        }) +
        element("rect", {
          x: trackX,
          y: barY,
          width: fillWidth,
          height: layout.barHeight,
          rx: box.barRadius,
          fill: palette.primary,
        }) +
        text(String(count), {
          x: box.width - box.padding,
          y,
          fill: palette.secondaryText,
          size: font.body,
          weight: font.emphasis,
          anchor: "end",
        })
      );
    })
    .join("");
  return {
    body: sectionHeading("Lifecycle", tokens) + rows,
    height: layout.listStart + counts.length * layout.barRowHeight - layout.listTrim,
  };
}

function linkIndicators(project: StartupProject, hasGitHubData: boolean): string {
  // Only the kind of link is shown, never the URL itself. A project linked to a
  // GitHub repository has a repository even if no URL was declared.
  const kinds = [
    project.repositoryUrl === undefined && !hasGitHubData ? undefined : "repo",
    project.websiteUrl === undefined ? undefined : "site",
  ];
  return kinds.filter((kind) => kind !== undefined).join(" · ");
}

function renderProjectList(
  stats: StartupStats,
  settings: StartupSettings,
  showDescriptions: boolean,
  tokens: DesignTokens,
): Section {
  const { palette, layout } = tokens;
  const rows: Row[] = stats.projectList.map((project) => {
    const repository = stats.github[project.id];
    const color = statusColor(palette, project.status);
    const links = settings.showLinks ? linkIndicators(project, repository !== undefined) : "";
    const details = [
      ...(showDescriptions ? [project.description] : []),
      ...(repository === undefined ? [] : [formatGitHubLine(repository)]),
    ];
    return {
      left: project.name,
      dotColor: color,
      cells: [
        { col: STAGE_COLUMN, text: label(project.lifecycleStage) },
        { col: STATUS_COLUMN, text: label(project.status), fill: color },
      ],
      ...(links === "" ? {} : { right: links, rightSmall: true }),
      ...(details.length === 0 ? {} : { details }),
    };
  });
  // The first row sits a little lower than in the other lists to make room
  // for its status dot.
  const { body, y } = renderRows(rows, layout.listStart + 4, layout.projectRowHeight, tokens);
  return {
    body: sectionHeading("Projects", tokens) + body,
    height: y - (layout.listTrim + 4),
  };
}

export function renderStartupStats(stats: StartupStats, options: StartupCardOptions): string {
  const { profile, settings, generatorVersion } = options;
  const tokens = requireDesignTokens(settings);
  const display = displayFlags(settings);

  const sections: Section[] = [];
  if (stats.totalProjects === 0) {
    sections.push(renderEmptyState("No public projects configured.", tokens));
  } else {
    if (settings.showLifecycleDistribution) {
      sections.push(renderLifecycle(stats.projectsByLifecycleStage, stats.totalProjects, tokens));
    }
    if (settings.showProjectList) {
      sections.push(renderProjectList(stats, settings, display.descriptions, tokens));
    }
  }

  return composeCard({
    title: "Startup & SaaS Statistics",
    description: `${profile.displayName}: ${pluralize(stats.totalProjects, "public project")}, ${String(stats.activeProjects)} active, ${String(stats.launchedProjects)} launched.`,
    displayName: profile.displayName,
    generatorVersion,
    tokens,
    display,
    summary: [
      { value: stats.totalProjects, name: "Total Projects" },
      { value: stats.activeProjects, name: "Active Projects" },
      { value: stats.launchedProjects, name: "Launched Projects" },
    ],
    sections,
  });
}
