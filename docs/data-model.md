# Data model

DevTrace has two data files: `data/startup.json` (described first) and
`data/ai-engineering.json` ([see below](#ai-engineering-data-model)). Both are validated at
runtime and reject unknown fields.

## Startup data model

`data/startup.json` contains an object with `version`, optional `profile` and `settings`, and a
`projects` array. Unknown fields are rejected at every level.

## Top-level fields

| Field                                | Type    | Required | Default               |
| ------------------------------------ | ------- | -------- | --------------------- |
| `version`                            | `1`     | yes      |                       |
| `profile.displayName`                | string  | no       | `Developer Portfolio` |
| `settings.theme`                     | enum    | no       | `DARK` (or `LIGHT`)   |
| `settings.showProjectList`           | boolean | no       | `true`                |
| `settings.showLifecycleDistribution` | boolean | no       | `true`                |
| `settings.showLinks`                 | boolean | no       | `true`                |
| `settings.dashboard`                 | boolean | no       | `false` (not stored)  |
| `settings.showOperationalStatus`     | boolean | no       | `true` in dashboard   |
| `settings.showPipeline`              | boolean | no       | `true` in dashboard   |
| `settings.showHighlights`            | boolean | no       | `true` in dashboard   |
| `settings.showGitHubInsights`        | boolean | no       | `true` in dashboard   |
| `settings.projectListLimit`          | integer | no       | `6` (1 to 20)         |
| `projects`                           | array   | yes      |                       |

`profile.displayName` must be 1 to 40 characters.

## Project fields

| Field              | Type   | Required | Notes                                                                                     |
| ------------------ | ------ | -------- | ----------------------------------------------------------------------------------------- |
| `id`               | string | yes      | Lowercase kebab-case, unique                                                              |
| `name`             | string | yes      | Non-empty                                                                                 |
| `description`      | string | yes      | Non-empty; not rendered in the SVG                                                        |
| `category`         | string | yes      | Non-empty                                                                                 |
| `lifecycleStage`   | enum   | yes      | See below                                                                                 |
| `status`           | enum   | yes      | Operational status, see below                                                             |
| `visibility`       | enum   | yes      | `PUBLIC` or `PRIVATE`; private is never rendered                                          |
| `dataSource`       | enum   | yes      | `OBSERVED`, `DECLARED` or `ESTIMATED`                                                     |
| `repositoryUrl`    | string | no       | Absolute http(s) URL                                                                      |
| `websiteUrl`       | string | no       | Absolute http(s) URL                                                                      |
| `githubRepository` | string | no       | `owner/name`. Links observed GitHub data; see [GitHub integration](github-integration.md) |
| `createdAt`        | string | yes      | ISO 8601 date or datetime                                                                 |
| `updatedAt`        | string | yes      | ISO 8601 date or datetime, not before `createdAt`                                         |

## Lifecycle stages

`IDEA`, `RESEARCH`, `PROTOTYPE`, `MVP`, `DEVELOPMENT`, `LAUNCHED`, `GROWING`, `MAINTENANCE`,
`ARCHIVED`.

## Operational status

`ACTIVE`, `PAUSED`, `INACTIVE`. It is independent from the lifecycle stage (a project in
`DEVELOPMENT` can be `ACTIVE` or `PAUSED`).

## Data source

- `OBSERVED`: collected from a verifiable source.
- `DECLARED`: stated by the user.
- `ESTIMATED`: inferred from incomplete data; must not be presented as fact.

Currently only the field is stored and validated; the SVG does not yet display it.

## Validation rules

- Missing required fields, unknown fields, invalid enum values.
- Duplicate `id` values.
- Malformed URLs or non-http(s) protocols.
- Invalid dates, or `updatedAt` earlier than `createdAt`.
- `ARCHIVED` projects cannot be `ACTIVE`.

Errors list the path of each problem, for example
`projects[1].id: Duplicate project ID detected: x.`

## Appearance settings (both files)

`settings` of `data/startup.json` and `data/ai-engineering.json` accept the same optional
appearance fields. None is written back as a default, so a configuration that does not use them is
unchanged. Details and examples: [customization.md](customization.md).

| Field                                                                                           | Type    | Values / range                                                  |
| ----------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------- |
| `theme`                                                                                         | enum    | `DARK` (default), `LIGHT`, `MIDNIGHT`, `MINIMAL`, `TRANSPARENT` |
| `layout`                                                                                        | enum    | `COMPACT`, `DEFAULT`, `EXPANDED`                                |
| `colors.background`, `colors.surface`                                                           | string  | `#RGB`, `#RRGGBB` or `transparent`                              |
| `colors.border`, `text`, `secondaryText`, `mutedText`, `primary`, `success`, `warning`, `error` | string  | `#RGB` or `#RRGGBB`                                             |
| `typography.fontFamily`                                                                         | enum    | `SYSTEM`, `SANS_SERIF`, `SERIF`, `MONOSPACE`                    |
| `typography.titleSize`                                                                          | integer | 14 to 32                                                        |
| `typography.bodySize`                                                                           | integer | 10 to 18                                                        |
| `typography.labelSize`                                                                          | integer | 9 to 16                                                         |
| `typography.fontWeight`                                                                         | integer | 400, 500, 600 or 700                                            |
| `dimensions.width`                                                                              | integer | 360 to 960                                                      |
| `dimensions.padding`                                                                            | integer | 12 to 48                                                        |
| `dimensions.spacing`                                                                            | integer | 8 to 48                                                         |
| `dimensions.radius`                                                                             | integer | 0 to 24                                                         |
| `showTitle`                                                                                     | boolean | default `true`                                                  |
| `showSummary`                                                                                   | boolean | default `true`                                                  |
| `showDescriptions`                                                                              | boolean | default `false`                                                 |
| `showFooter`                                                                                    | boolean | default `true`                                                  |

Validation rules:

- Colors must be hexadecimal. `transparent` is accepted only for `background` and `surface`.
- Font families are the four named stacks; arbitrary names and URLs are rejected.
- Numbers must be whole and inside their range. There is no `height`: it is computed.
- Unknown fields are rejected at every level, so `colors.track` or `dimensions.height` are errors.
- After resolving the layout, width minus twice the padding must be at least 280 px. This is checked
  when the card is generated, because the default padding comes from the layout.

## AI Engineering data model

`data/ai-engineering.json` contains `version` (required, `1`), optional `profile` and `settings`,
and six optional lists (default `[]`): `tools`, `models`, `skills`, `projects`, `activities`,
`tokenUsage`. IDs are lowercase kebab-case and unique within their own list.

### Settings and profile

| Field                     | Type    | Default                  |
| ------------------------- | ------- | ------------------------ |
| `profile.displayName`     | string  | `AI Engineering Profile` |
| `settings.theme`          | enum    | `DARK` (or `LIGHT`)      |
| `settings.showTools`      | boolean | `true`                   |
| `settings.showModels`     | boolean | `true`                   |
| `settings.showSkills`     | boolean | `true`                   |
| `settings.showProjects`   | boolean | `true`                   |
| `settings.showActivity`   | boolean | `false`                  |
| `settings.showTokenUsage` | boolean | `false`                  |
| `settings.showCost`       | boolean | `false`                  |
| `settings.showLinks`      | boolean | `true`                   |
| `settings.dashboard`      | boolean | `false` (not stored)     |
| `settings.showMilestones` | boolean | `true` in dashboard      |
| `settings.usageSnapshot`  | boolean | `false` (not stored)     |
| `settings.githubSignals`  | boolean | `false` (not stored)     |

### Fields common to every entity

| Field        | Type   | Notes                                                                                      |
| ------------ | ------ | ------------------------------------------------------------------------------------------ |
| `id`         | string | Lowercase kebab-case, unique within the list                                               |
| `visibility` | enum   | Required. `PUBLIC` or `PRIVATE`                                                            |
| `provenance` | enum   | Required. `OBSERVED`, `DECLARED` or `ESTIMATED` (same meaning as the startup `dataSource`) |

### Tool (a product, not a provider or a model)

`name` (max 60), `provider` (max 60), `category`, and optional `usageType` and
`experienceLevel`. Both are validated but not rendered.

- `category`: `AI_ASSISTANT`, `IDE_ASSISTANT`, `API_PROVIDER`, `AGENT_FRAMEWORK`,
  `DEVELOPMENT_TOOL`, `MODEL_PLATFORM`.
- `usageType`: `PERSONAL`, `PROFESSIONAL`, `OPEN_SOURCE`, `ACADEMIC`.
- `experienceLevel`: a proficiency level (below). It is a declaration.

### Model (a specific model that belongs to a family)

`name` (for example a specific version), `provider`, `modelFamily` (all max 60) and an optional
`usageContext` (max 80). `usageContext` is validated but not rendered.

### Skill

`name`, `category`, `proficiencyLevel` and an optional `description` (max 200, not rendered).

- `category`: `LLM_ENGINEERING`, `AI_AGENTS`, `RETRIEVAL_KNOWLEDGE`, `AI_SYSTEM_DESIGN`.
- `proficiencyLevel`: `EXPLORING`, `LEARNING`, `PRACTICING`, `PROFICIENT`, `ADVANCED`. These are
  self-declared statements, not certifications. They are never computed.

The skill name is free text; the catalog of examples (RAG, Embeddings, ...) is not enforced.

### AI project

`name`, `description` (not rendered), `category`, `status` (`ACTIVE`, `PAUSED`, `INACTIVE`),
`techniques` (list of `RAG`, `AI_AGENTS`, `FUNCTION_CALLING`, `TOOL_USE`, `LLM_INTEGRATION`,
`VECTOR_SEARCH`, `PROMPT_ENGINEERING`), `tools` (list of tool IDs) and optional `repositoryUrl`
and `websiteUrl` (absolute http(s)).

AI projects also accept an optional `githubRepository` (`owner/name`). It only attaches observed
repository data to the card; it never changes a declared field.

### Activity

`activityType`, `involvement`, `description` (max 200), `date` (ISO 8601) and an optional
`projectId`.

- `activityType`: `AI_ASSISTED_CODING`, `AI_ASSISTED_REFACTORING`, `TEST_GENERATION`,
  `DOCUMENTATION_GENERATION`, `CODE_REVIEW_ASSISTANCE`, `RAG_IMPLEMENTATION`,
  `AGENT_DEVELOPMENT`, `LLM_INTEGRATION`.
- `involvement`: `AI_ASSISTED`, `AI_GENERATED` or `AI_RELATED_ENGINEERING`. Being related to AI
  does not mean the work was AI-generated.

### Token usage metric

`modelId`, `kind`, `value`, `unit`, `period` (`start` and `end`, ISO 8601) and an optional
`source` (max 120).

- `kind`: `INPUT_TOKENS`, `OUTPUT_TOKENS`, `TOTAL_TOKENS`, `ESTIMATED_COST`.
- Token kinds require `unit: "TOKENS"` and a whole, non-negative `value`. `ESTIMATED_COST`
  requires an ISO 4217 code (`USD`) and a non-negative `value`.
- `provenance: OBSERVED` requires a `source`.

### Validation rules

- Missing required fields, unknown fields, invalid enum values, wrong types.
- Duplicate IDs within a list (`Duplicate tool ID detected: x.`).
- Malformed URLs or non-http(s) protocols.
- Invalid dates, and a measurement period that ends before it starts.
- Negative or non-finite values, fractional token counts, a wrong unit for the metric kind.
- References to unknown IDs (`Unknown tool ID referenced: x.`, project IDs in activities,
  model IDs in metrics).

### Privacy rules

Private entities are removed before aggregation. Activities of private projects and metrics of
private models are removed as well, and cost metrics are removed unless `showCost` is `true`.

## GitHub data model

The GitHub integration adds two files. See [github-integration.md](github-integration.md) for
behavior; this section lists the fields.

### `data/github.json` (optional, written by hand)

`version` (`1`), `username` (a valid GitHub username), `repositories` (`include`, `exclude`,
`includeForks`, `includeArchived`), `collect` (`description`, `language`, `stars`, `forks`,
`releases`, and the optional `languages` and `commitActivity`), `onUnavailable` (`SKIP` or `FAIL`) and `cacheTtlMinutes` (0 to 1440). Defaults are listed
in the integration guide. Repository entries are `name` or `owner/name`. Unknown fields are
rejected, so a credential cannot be stored here.

### `data/github-snapshot.json` (generated, not committed)

Written only by `pnpm sync:github`.

| Field          | Notes                                                      |
| -------------- | ---------------------------------------------------------- |
| `version`      | `1`                                                        |
| `source`       | Always `GitHub REST API`                                   |
| `username`     | The account the snapshot was read for                      |
| `fetchedAt`    | ISO 8601 datetime. Used only for the cache; never rendered |
| `repositories` | List of repositories, sorted by `fullName`                 |

Each repository has `fullName`, `name`, `url` (`https://github.com/...`), `archived`, `fork`,
`createdAt`, `provenance` and, depending on `collect` and on the data, `description`, `language`,
`stars`, `forks`, `pushedAt` and `latestRelease` (`tagName`, optional `name`, `publishedAt`).

### Validation rules

- `provenance` must be `OBSERVED` on every repository; any other value is rejected.
- Repository URLs must start with `https://github.com/`. Counts must be non-negative integers and
  dates must be ISO 8601.
- A repository may appear only once (case-insensitive).
- `githubRepository` in a project must look like `owner/name`.
