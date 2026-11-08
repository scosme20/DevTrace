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

| Panel                     | Setting          | What it shows                                                                                                      |
| ------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| Metrics strip             | `showSummary`    | Counts of tools, providers, models, skills, projects and activity records (only for sections with data)            |
| Chips                     | `showSummary`    | The AI stack (the first tools), the top model by reported tokens and the cache hit, each only when its data exists |
| AI tools & providers      | `showTools`      | Tools by category, the providers, and each tool with its provider, category and declared level                     |
| AI foundation models      | `showModels`     | Each model with provider, family, capability and context window; its share of the reported tokens                  |
| AI engineering skills     | `showSkills`     | Skills grouped by category, with the level and, if declared, how often you use them                                |
| AI projects               | `showProjects`   | Public projects: status, category, techniques, public tools used, link kinds (`showLinks`)                         |
| AI contributions          | `showActivity`   | Declared records by involvement and by type, and the most recent records                                           |
| Token economics           | `showTokenUsage` | The measurements you reported, one row each, and the cache hit; costs only with `showCost`                         |
| AI engineering milestones | `showMilestones` | Dated steps you declare, newest first. No levels, tiers or badges                                                  |

Every panel has a small tag in its header with where its data comes from (`Declared`, `Observed`,
`Estimated`, or `Mixed` when the records differ). With a uniform source the rows do not repeat it;
with mixed sources each row keeps its own.

Each list shows a limited number of entries (5 tools, 5 models, 3 skills per category, 3 projects,
3 recent records, 4 token rows) and ends with "+N more" for the rest. The same display options as the
card apply: `showTitle`, `showSummary`, `showDescriptions` and `showFooter`.

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
- **Cache hit** is cached input tokens divided by input tokens. It exists only where the same model
  reported both for the same period and the input is not zero; pairs from different periods or models
  are never combined. The chip appears only when every pair covers the same period.
- **Share of tokens** is a model's part of the reported `TOTAL_TOKENS`, and exists only when all the
  totals cover one shared period. It says nothing about quality.
- **Token usage can be imported** from your local Claude Code and Codex logs instead of typed: see
  [Token usage from local logs](usage-import.md).
- **Milestones** are declared by you (`milestones` in `data/ai-engineering.json`). A milestone of a
  private project is never drawn.
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

## AI signals found on GitHub

With `"githubSignals": true` in `settings`, the dashboard also uses what the GitHub snapshot shows. It
needs the data, collected by `devtrace sync` with these options in `data/github.json`
(see [examples/github-ai-signals.json](../examples/github-ai-signals.json)):

```json
"collect": { "releaseHistory": true, "aiSignals": true }
```

Everything below is `OBSERVED` on GitHub, comes from public repositories only, and is labeled "found on
GitHub". None of it is a measure of how much work an AI did.

- **Milestones from releases.** Each published release (drafts and pre-releases excluded) becomes a
  milestone: "repository tag", on the date it was published. They are mixed, by date, with the
  milestones you declared.
- **AI in my repositories.** One row per repository where something was found:
  - **Assistant files:** `CLAUDE.md` or `.claude/`, `AGENTS.md`, `.cursorrules` or `.cursor/`,
    `.github/copilot-instructions.md`, `GEMINI.md`, `.windsurfrules` at the expected path. They show
    that an assistant was set up in the repository, not how much it was used.
  - **AI topics** of the repository (for example `llm`, `rag`, `ai-agents`): labels the owner chose.
  - **Co-authored commits:** of your 100 most recent commits in the repository, how many have a
    `Co-authored-by:` line that names an AI assistant. It counts a declaration in the message. A
    commit with no such line may still have had help, and the line says nothing about how much of the
    code came from the AI.
- **A chip** at the top ("AI Co-authored: 20 of 50 recent commits") sums the repositories whose commits
  were looked at, and says how many commits that is.

Only the assistant's name and counts are kept: commit text is read to find the trailer and is never
stored, and the snapshot rejects any other field. The panel does not guess projects or tools from
dependencies or from code.
