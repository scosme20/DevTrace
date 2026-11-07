# AI Engineering Dashboard

The AI Engineering Dashboard is a multi-panel version of the AI Engineering indicator. It is the same
indicator, configured by the same `data/ai-engineering.json`, drawn as a grid of panels instead of a
single column. The output is one static SVG file.

## Enabling it

Add `"dashboard": true` to `settings`. Nothing else changes: the file is still written to
`public/indicators/ai-engineering-stats.svg`, so an existing README image keeps working.

```bash
pnpm generate:ai
```

Without the setting (or with `"dashboard": false`) the original single-column card is drawn, exactly
as before. A complete example is in
[`examples/ai-engineering-dashboard.json`](../examples/ai-engineering-dashboard.json). Its names are
placeholders: replace them with your own data.

## Panels

A panel is drawn only when its section is enabled and has public data. Missing panels leave no gap:
two narrow panels share a row, and a narrow panel without a partner takes the whole row.

| Panel                   | Setting          | What it shows                                                                                              |
| ----------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Metrics strip           | `showSummary`    | Counts of tools, providers, models, skills, projects and activity records (only for sections with data)    |
| AI tools & providers    | `showTools`      | Tools by category, the providers, and each tool with its provider, category, declared level and provenance |
| AI foundation models    | `showModels`     | Each model with its provider, family, usage context and provenance                                         |
| AI engineering skills   | `showSkills`     | Skills grouped by category, with the level you declared on a five-step scale                               |
| AI projects             | `showProjects`   | Public projects: status, category, techniques, public tools used, link kinds (`showLinks`), provenance     |
| AI engineering activity | `showActivity`   | Records by involvement and by type, and the most recent records                                            |
| Token usage             | `showTokenUsage` | The measurements you reported, one row each; costs only with `showCost`                                    |

Each list shows a limited number of entries (5 tools, 5 models, 3 skills per category, 3 projects,
3 recent records, 4 token rows) and ends with "+N more" for the rest. The same display options as the
card apply: `showTitle`, `showSummary`, `showDescriptions` and `showFooter`.

The milestones panel is not implemented: the configuration has no milestone data.

## Themes and size

All five themes, the three layouts, custom colors, typography and dimensions work as they do for the
card. The dashboard is wider by default so that panels fit side by side: 720 (`COMPACT`), 880
(`DEFAULT`) or 960 pixels (`EXPANDED`). `dimensions.width` overrides it. GitHub scales images down to
the width of the README, so very large widths reduce legibility.

## Data and provenance

- Provider, product and model are separate: a tool has a provider (the company) and a category; a
  model has a provider and a family. DevTrace never infers a model from a tool.
- Every tool, model, project, activity and token row carries its provenance label (`Observed`,
  `Declared` or `Estimated`). An estimate is drawn in a different color than an observation.
- Skill levels are your own statements. They are not certifications or measurements.
- Activity records keep the distinction between AI-assisted, AI-generated and AI-related
  engineering. DevTrace does not classify commits and does not read repositories to decide this.
- Token rows are the values you reported. DevTrace estimates nothing and adds nothing up. Costs are
  hidden unless `showCost` is `true`, and are labeled as estimated costs.
- There is no productivity, efficiency or "AI-generated code" score, because nothing in the data
  supports one.

## Privacy

Private records are removed before any number is computed, as for the card. This also covers
references: an activity linked to a private project, token usage of a private model, and a private
tool used by a public project are all left out, so no total, distribution, ranking or list can reveal
that a private record exists.

## Embedding

```html
<img
  src="https://raw.githubusercontent.com/<username>/<repository>/HEAD/public/indicators/ai-engineering-stats.svg"
  alt="AI Engineering Dashboard"
/>
```

See the [GitHub Actions workflow](github-integration.md#github-actions) to keep the file up to date.

## Implementation

`src/indicators/ai-engineering/dashboard.ts` decides what each panel shows from the public
statistics. `src/templates/ai-engineering-dashboard.ts` draws it with the
[SVG components](svg-components.md). Neither duplicates the privacy filter, which runs once in
`selectPublicAiData`.
