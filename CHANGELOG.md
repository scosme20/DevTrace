# Changelog

All notable changes to DevTrace are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/). Versions are published as GitHub releases; the package is not on npm.

## [Unreleased]

## [0.7.0] - 2026-11-07

### Added

- `TERMINAL` theme: pure black, cyan accent titles, a source pill with a dot, green bars and mono numbers
  (in the dashboards). The five existing themes are unchanged. The Startup data now has the declared
  stages of the profile projects.

- AI signals found on GitHub (`settings.githubSignals`): releases as `OBSERVED` milestones, a panel and
  a chip for assistant configuration files, AI topics and commits that name an AI co-author. Collected
  by two new opt-in options, `collect.releaseHistory` and `collect.aiSignals`. Commit text is never
  stored. See `docs/ai-engineering-dashboard.md`.

- `devtrace import usage`: reads the token usage kept in the local logs of Claude Code and Codex
  (model, time and token counts only, no text or paths, no network) into `data/usage-snapshot.json`.
  `settings.usageSnapshot` adds the numbers to the AI dashboard as `OBSERVED` data with their source.
  See `docs/usage-import.md`.

- AI Engineering Dashboard: a strip of chips (AI stack, top model, cache hit), a source tag in every
  panel header, a milestones panel, a cache hit rate and model shares of reported tokens, skill
  frequency, and model capability and context window. New optional data: `milestones`,
  `CACHED_INPUT_TOKENS`, `skills[].frequency`, `models[].contextWindow` and `models[].capability`.
  Older files stay valid. The activity panel is now titled "AI contributions" and the token panel
  "Token economics". See `docs/ai-engineering-dashboard.md`.

- Final composition (M12): the three dashboards are drawn by one shared frame
  (`src/templates/dashboard.ts`) and a test keeps their width, header, footer, frame and colors
  identical in every theme and layout. `docs/github-profile.md` explains embedding, updating, tokens
  and common problems. `pnpm generate:activity` was added, and the workflow now validates the
  configuration and runs `pnpm generate`, which includes the developer activity dashboard when it
  is configured.

- Developer Activity Dashboard (`generate activity`, `data/developer-activity.json`): commit heatmap,
  commit activity by month, repository activity, languages by reported bytes and releases, built from
  the GitHub snapshot. Optional: `generate` includes it only when its configuration exists. See
  `docs/developer-activity-dashboard.md`.
- GitHub collection options `collect.languages` and `collect.commitActivity` (off by default), stored
  in the snapshot as optional fields; statistics that GitHub has not computed yet stay unknown.
- `validate activity`, and the `activity` target of `generate`.
- The heatmap component accepts "no data" cells and weekday labels. Captions are shortened to fit.

- Startup & SaaS Dashboard: a multi-panel version of the Startup indicator (overview metrics,
  project portfolio, lifecycle stage, operational status, development pipeline, highlights and GitHub
  development insights), enabled with `settings.dashboard`. Same output file; the card is unchanged.
  New options: `showOperationalStatus`, `showPipeline`, `showHighlights`, `showGitHubInsights` and
  `projectListLimit`. Added the `pipeline` component. `caption` and `packPanels` moved to the shared
  components. See `docs/startup-dashboard.md` and `examples/startup-dashboard.json`.
- AI Engineering Dashboard: a multi-panel version of the AI indicator (overview metrics, tools and
  providers, foundation models, declared skill levels, projects, activity records and reported
  token usage), enabled with `settings.dashboard`. It reuses the SVG components and writes to the same
  output file. `entryList` and `badgeRow` components were added for it. See
  `docs/ai-engineering-dashboard.md`.
- `examples/ai-engineering-dashboard.json`.
- SVG component system in `src/components/`: layout (`row`, `grid`, `stack`, `panel`, `divider`),
  metrics (`metricCard`, `compactMetric`, `progressBar`, `distributionBar`, `rankingList`,
  `statusIndicator`, `badge`) and charts (horizontal and vertical bars, donut, activity heatmap,
  timeline), documented in `docs/svg-components.md`. No indicator uses them yet.
- Startup & SaaS Statistics indicator, generated from `data/startup.json`.
- AI Engineering Statistics indicator (tools, models, skills, projects, activities, token usage and
  data provenance), generated from `data/ai-engineering.json`.
- Optional read-only GitHub integration (`devtrace sync`) that maps public repository data onto
  projects, with caching and rate-limit handling.
- `Update indicators` GitHub Actions workflow that regenerates and commits the SVG files.
- Five themes (`DARK`, `LIGHT`, `MIDNIGHT`, `MINIMAL`, `TRANSPARENT`), three layouts, custom
  colors, fonts and dimensions.
- CLI with `init`, `validate`, `generate`, `sync` and `help`, plus `--version`.
- Documentation in `docs/` and validated example configurations in `examples/`.
- `CI` workflow: typecheck, lint, format check, tests, build, CLI smoke test, a check that the
  committed indicators are up to date, and a production dependency audit. The GitHub snapshot is
  now committed, so the SVG files can be reproduced from the repository.
- MIT `LICENSE`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue templates, a pull request template and `docs/release.md`.

### Changed

- Dashboard SVGs are smaller: a group that moves nothing and the default `stroke-width="1"` are no
  longer written, and heatmap cells share a group per intensity. Output stays deterministic.

- Added `visual` design tokens (tones, chart series colors, heatmap levels, spacing) derived from the
  existing palette. Existing themes, colors and configuration are unchanged.
- `text()` no longer writes an element for empty text.

- `pnpm build` now removes `dist/` first, so stale compiled files can no longer end up in the
  package.

### Fixed

- Stale build output (`dist/cli.js`, `dist/templates/tokens.js`) no longer ships in the package.

### Removed

- An empty stray file (`scripts_tmp_unused`) from the repository root.

### Security

- Pinned `minimatch` to `^11.0.1` through a pnpm override to resolve a moderate advisory
  (GHSA-g3hv-75wg-m249) reached through the ESLint dev dependency. `pnpm audit` reports no known
  vulnerabilities.
