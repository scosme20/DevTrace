# Startup & SaaS Dashboard

The Startup & SaaS Dashboard is a multi-panel version of the Startup indicator. It is the same
indicator, configured by the same `data/startup.json`, drawn as a grid of panels instead of a single
column. The output is one static SVG file.

## Enabling it

Add `"dashboard": true` to `settings`. The file is still written to
`public/indicators/startup-stats.svg`, so an existing README image keeps working.

```bash
pnpm generate:startup
```

Without the setting (or with `"dashboard": false`) the original card is drawn, exactly as before. A
complete example is in [`examples/startup-dashboard.json`](../examples/startup-dashboard.json). Its
names are placeholders: replace them with your own projects.

## Panels

A panel is drawn only when it is enabled and has data. Missing panels leave no gap: two narrow panels
share a row, and a narrow panel without a partner takes the whole row.

| Panel                       | Setting                               | What it shows                                                                                         |
| --------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Overview metrics            | `showSummary`                         | Total, active, launched, in development and paused projects (a metric appears when it is not zero)    |
| Project portfolio           | `showProjectList`, `projectListLimit` | Each public project: name, category, status, lifecycle stage, link kinds (`showLinks`), provenance    |
| Lifecycle stage             | `showLifecycleDistribution`           | Number of projects in each lifecycle stage that has at least one project                              |
| Operational status          | `showOperationalStatus`               | Projects per status, as a chart, with each status's share of the public projects                      |
| Development pipeline        | `showPipeline`                        | All nine stages in order with the number of projects in each; `MVP` and `DEVELOPMENT` are highlighted |
| Project highlights          | `showHighlights`                      | Launched and growing projects, and MVP and development projects, most recently updated first          |
| GitHub development insights | `showGitHubInsights`                  | Linked public repositories, releases, last observed push, for projects linked to a repository         |

`showOperationalStatus`, `showPipeline`, `showHighlights` and `showGitHubInsights` are `true` unless
you set them to `false`. The portfolio shows at most `projectListLimit` projects (default 6, from 1
to 20) and ends with "+N more". The options `showTitle`, `showSummary`, `showDescriptions` and
`showFooter` apply as for the card.

## Lifecycle stage and operational status

They answer different questions and are never combined:

- **Lifecycle stage** (`IDEA` to `ARCHIVED`) says where a project is in its life.
- **Operational status** (`ACTIVE`, `PAUSED`, `INACTIVE`) says whether it is being worked on.

A project in `DEVELOPMENT` can be `ACTIVE` or `PAUSED`. The portfolio shows the stage as a badge and
the status as a colored dot and a word. "Launched" counts the stages `LAUNCHED` and `GROWING`, as in
the card; "In development" counts the stage `DEVELOPMENT`. The schema has no "completed" status, so
the dashboard has none either.

The pipeline is a snapshot: it shows how many projects are in each stage today. DevTrace stores no
history, so it draws no evolution over time.

## Highlights

Selection is deterministic: the most recently updated projects (by `updatedAt`, then by `id`), up to
three in each group. DevTrace does not rank projects by quality or potential, and GitHub stars or
activity never influence the selection.

## GitHub insights

This panel needs the GitHub integration (`pnpm sync:github`, see [GitHub integration](github-integration.md))
and projects linked with `githubRepository`. It shows only observed values, marked "Observed". GitHub
activity does not prove commercial success, so nothing is inferred from it.

## What it does not show

There are no revenue, MRR, ARR, customer, conversion, GMV or milestone panels. The data model has no
fields for them, and DevTrace does not infer them. They would need explicit, reliable data first.

## Provenance and privacy

- Each project shows how its data was obtained: `Observed`, `Declared` or `Estimated`, in different
  tones.
- Private projects are removed before any number is computed, as for the card. No total, share,
  chart, highlight or list can reveal that a private project exists.

## Themes and size

All five themes, the three layouts, custom colors, typography and dimensions work as for the card. The
dashboard is wider by default: 720 (`COMPACT`), 880 (`DEFAULT`) or 960 pixels (`EXPANDED`);
`dimensions.width` overrides it.

## Embedding

```html
<img
  src="https://raw.githubusercontent.com/<username>/<repository>/HEAD/public/indicators/startup-stats.svg"
  alt="Startup & SaaS Dashboard"
/>
```

See the [GitHub Actions workflow](github-integration.md#github-actions) to keep the file up to date.

## Implementation

`src/indicators/startup/dashboard.ts` decides what each panel shows from the public statistics, and
`src/templates/startup-dashboard.ts` draws it with the [SVG components](svg-components.md). The
privacy filter runs once, in `selectPublicProjects`.
