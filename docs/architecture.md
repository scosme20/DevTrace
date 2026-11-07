# Architecture

## Boundaries and responsibilities

| Module                                             | Responsibility                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/core/models`, `ai-engineering-models`         | Domain types and literal unions per indicator. No dependency on SVG or filesystem.      |
| `src/core/schema-primitives`                       | Zod building blocks shared by every schema (dates, URLs, enums, error formatting).      |
| `src/core/validation`, `ai-engineering-validation` | One Zod schema per indicator; turns untrusted data into a `Result`.                     |
| `src/core/config`                                  | Generic loader: read, parse, validate. One entry point per indicator.                   |
| `src/core/output`                                  | Writes SVG files, restricted to the indicators directory.                               |
| `src/shared/svg`                                   | XML escaping, element and document helpers. No domain knowledge.                        |
| `src/indicators`                                   | Per indicator: public-data selection and statistics. No rendering.                      |
| `src/templates/card`                               | Layout shared by all cards: header, summary tiles, footer, stacking.                    |
| `src/core/appearance`                              | Appearance settings: types, Zod schema and the display flags. No rendering.             |
| `src/templates/themes`                             | The five palettes (semantic tokens) and the corner radius of each theme.                |
| `src/templates/design-tokens`                      | Resolves settings into tokens: precedence, layout presets, fonts, contrast warnings.    |
| `src/templates/rows`                               | The one list-row renderer shared by every list; fits each text to its column.           |
| `src/shared/color`, `text-fit`                     | Hex colors, WCAG contrast, and text width estimation. Pure functions.                   |
| `src/templates/*-stats`                            | Indicator-specific sections, built on `card`.                                           |
| `src/github/client`                                | Read-only REST client: timeout, retries, rate limits, pagination. No domain knowledge.  |
| `src/github/repositories`, `mapping`, `collect`    | Validate API responses, map them to the domain model, apply the configured selection.   |
| `src/core/github-*`, `snapshot-output`             | GitHub config and snapshot types, schemas, and the atomic snapshot writer.              |
| `src/indicators/github-link`                       | Connects projects to snapshot data by explicit link; never edits a project.             |
| `src/generators`                                   | Coordinates the steps; contains no business rules.                                      |
| `src/cli/args`, `commands`, `main`, `help`, `init` | Parse the command line into an `Invocation`, run it, print help, create starter files.  |
| `src/cli/errors`, `suggestions`                    | Exit codes, `UsageError`, error formatting (verbose mode) and fix hints.                |
| `src/validate`                                     | The `validate` command: runs the real validators per file and builds a report.          |
| `src/index.ts`                                     | Entry point: builds the `CliIo` from the process and exits with the code from `runCli`. |

## Data flow

```
data/startup.json -> loadStartupConfig (read, parse, validate; applies defaults)
                  -> selectPublicProjects (privacy boundary)
                  -> computeStartupStats (aggregation of public projects)
                  -> renderStartupStats (SVG string, theme and settings from config)
                  -> writeIndicator (public/indicators/startup-stats.svg)
```

```
data/ai-engineering.json -> loadAiEngineeringConfig (read, parse, validate; applies defaults)
                         -> selectPublicAiData (privacy boundary, incl. references)
                         -> computeAiEngineeringStats (aggregation of public data)
                         -> renderAiEngineeringStats (SVG string)
                         -> writeIndicator (public/indicators/ai-engineering-stats.svg)
```

GitHub data takes a separate path, so the generators never use the network:

```
data/github.json -> loadGitHubConfig -> collectRepositories (GitHub client, validation, mapping)
                 -> writeGitHubSnapshot (data/github-snapshot.json, atomic)

generators: loadGitHubSnapshot -> linkGitHubRepositories (public projects only)
            -> compute*Stats(..., github) -> render* (extra "GitHub · ..." line)
```

Each generator wraps any failure in `Failed to generate <name> indicator.` and keeps the original
error as `cause`. `describeError` prints the whole chain.

## Command line

```
argv -> parseArgs (tokens -> Invocation; throws UsageError)
     -> runCli (switch on invocation.kind; never throws, returns an exit code)
        -> runGenerate | runValidate | runSync | runInit | runHelp | runVersion
```

The CLI holds no business rules. `runCli` receives a `CliIo` (root directory, environment and
output functions), which is why the tests run it without a process. Exit codes: `0` success, `1`
failure, `2` usage error. `validate` calls the same loaders and validators the generators use, so
it cannot disagree with `generate`, and it never writes. Errors are formatted in one place
(`formatError`), with the full cause chain and stack only under `--verbose`.

## SVG generation

`templates/card.ts` owns what every card has in common: header, summary tiles, footer, section
stacking and the frame. An indicator template only builds its own sections and calls
`composeCard`. Each section is drawn from `y = 0` and the card stacks them with `translate`, so
the height follows the enabled sections. Colors live in `templates/themes.ts` (`DARK` and
`LIGHT` palettes); templates never hardcode a color.

The AI card uses one generic three-column row (`left`, `middle`, `right`, optional `detail`
line) for tools, models, projects, activity and token usage, and display text for enum values
lives in `templates/ai-engineering-labels.ts` as exhaustive records, so a new enum member without
a label does not compile.

Templates build the document with helpers from `shared/svg`. Every text and attribute value goes
through `escapeXml`. Output has no timestamps, scripts or external resources, so identical input
yields identical SVG. The generator version in the footer comes from `core/version.ts`, which a
test keeps equal to `package.json`.

## Dashboards

The three dashboards (Startup & SaaS, AI Engineering, Developer Activity) share one frame,
`src/templates/dashboard.ts`: the card header and footer, a strip of metric cards, an optional
notice about the scope of the data, and a grid of panels packed by `packPanels`. Each dashboard
supplies only its metrics and panels, built from the shared components and the design tokens, and
its own aggregation in `src/indicators/`. A test (`tests/dashboards-consistency.test.ts`) keeps their
width, header, footer, frame and colors identical in every theme and layout.

## SVG components

`src/components/` holds reusable layout, metric and chart components built on the same design
tokens. They receive finished data and return SVG; see [SVG components](svg-components.md).

## Appearance

Appearance flows in one direction, so each step can be tested on its own:

```
settings (JSON) -> appearanceShape (validated: hex colors, named fonts, bounded numbers)
                -> applyAppearanceOverrides (command line --theme / --layout)
                -> resolveDesignTokens (theme -> layout -> explicit colors, typography, dimensions)
                -> render* (read tokens only) -> composeCard (header, summary, sections, footer)
```

- **Tokens, not literals.** Renderers contain no color, font size or distance: they read
  `DesignTokens` (palette, font, box, layout, font metrics). A new look needs no renderer change.
- **Defaults reproduce history.** The `DEFAULT` layout and the `DARK` / `LIGHT` palettes carry the
  exact numbers of earlier versions, and golden SVG files produced by 0.4.0 are compared byte for byte.
- **Layouts are data.** `COMPACT`, `DEFAULT` and `EXPANDED` are presets of geometry (header and
  summary style, row heights, type sizes, spacing). Organization differs, not only scale.
- **Text is fitted, not clipped.** `fitText` estimates widths for the configured font and each row
  budgets its columns from the space between neighbors. A checker in the tests parses the SVG and
  verifies that nothing leaves the card, nothing overlaps and sections do not collide.
- **Closed vocabularies.** Colors are hexadecimal only and fonts are four named stacks, so a
  configuration value can never carry SVG syntax. Invalid values fail with their path; nothing is
  corrected silently.
- **Contrast is advice.** Hard-to-read custom colors produce a warning but are the user's call.

## Design decisions

- **Zod for validation.** Configuration is external data; runtime validation with precise error
  paths is the main value of the tool. Unknown fields are rejected (strict objects).
- **Validation returns a `Result`; I/O throws `DevTraceError`.** Invalid data is an expected
  outcome, while a missing file is exceptional. The config loader converts errors into one
  message and keeps the original `cause`.
- **Private data stays out.** `selectPublicProjects` runs before aggregation, so private
  projects cannot affect any number, name or link. The SVG never includes descriptions or URLs;
  links appear only as `repo` / `site` indicators.
- **Settings have defaults, invalid values are errors.** Omitted `profile` and `settings` fields
  use defaults; a present but invalid value (for example `"theme": "NEON"`) is rejected.
- **Safe output.** `writeIndicator` accepts only kebab-case `.svg` file names, so path traversal
  is impossible by construction.
- **Lifecycle stage and status are separate fields.**
- **Two project models.** Startup projects (lifecycle, dates) and AI projects (techniques,
  tools) have different fields, so they stay separate. What is truly shared is extracted:
  visibility, provenance (`DataSource`, called `provenance` in the AI file), status, theme and the
  schema primitives.
- **Privacy follows references.** The AI selection runs before aggregation and also drops what
  could reveal a private entity: activities of private projects and token metrics of private
  models. Token metrics reference a model by ID instead of repeating its name, which makes that
  possible. Costs are excluded unless `showCost` is on.
- **Referential integrity is validated.** A project cannot list an unknown tool, an activity an
  unknown project, nor a metric an unknown model.
- **No computed judgments.** There are no scores, rankings, percentages, totals of token usage or
  cost calculations. Skill levels are declared values and are shown as such.
- **Activity records, not counts.** Records are listed with their AI involvement and provenance;
  no contribution count exists because none could be measured honestly.
- **Future integrations.** A future integration would produce validated entities with
  `provenance: OBSERVED` and a `source`; selection, statistics and templates would not change.
  No integration code exists today.
- **Sync and generation are separate.** Only `pnpm sync:github` uses the network. Generators read
  a validated snapshot from disk, so they stay fast, offline and deterministic, and an outage can
  never produce a partial SVG: a failed sync leaves the previous snapshot untouched.
- **Declared data wins, observed data is added beside it.** Linking is explicit
  (`githubRepository`); GitHub values are shown on their own line and never feed totals, status or
  stage. Conflicts are warned about, not resolved.
- **Provenance is enforced, not just documented.** The snapshot schema accepts only `OBSERVED`.
- **Privacy follows the link.** Private projects are ignored by the linker, so neither their data
  nor their IDs (in warnings) reach SVGs or public CI logs.
- **The token has one entry point.** `GITHUB_TOKEN` is read by the sync command and handed to the
  client, which sends it only to the API host. A test checks that no other source file reads it.
- **No GitHub-specific abstraction layers.** One small client interface (`getJson`,
  `getAllPages`) exists because the sync logic is tested against it; nothing else is abstracted.
