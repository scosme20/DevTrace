# Configuration

DevTrace reads up to three files from `data/`. All are JSON, all reject unknown fields, and none
ever contains credentials.

| File                        | Required      | Written by              | Purpose                           |
| --------------------------- | ------------- | ----------------------- | --------------------------------- |
| `data/startup.json`         | for `startup` | you (`init` creates it) | Startup & SaaS Statistics card    |
| `data/ai-engineering.json`  | for `ai`      | you (`init` creates it) | AI Engineering Statistics card    |
| `data/github.json`          | no            | you                     | Which public repositories to read |
| `data/github-snapshot.json` | no            | `sync`                  | Generated GitHub data. Committed  |

Complete, valid files to copy from are in [`examples/`](../examples):

| Example                      | Shows                                                        |
| ---------------------------- | ------------------------------------------------------------ |
| `startup-dark.json`          | Startup card, `DARK` theme, a private project that is hidden |
| `startup-light-compact.json` | `LIGHT` theme with the `COMPACT` layout                      |
| `startup-custom-colors.json` | Theme with custom colors, font, width and radius             |
| `ai-engineering.json`        | AI Engineering card with a tool, model, skill and project    |
| `github.json`                | GitHub integration                                           |

The examples use placeholder names (`Example App`, `your-github-username`). Replace them: DevTrace
never makes up data, and a card shows exactly what the file says. A test validates every example
with the real validators.

## Where each topic is documented

| Topic                                                         | Document                                    |
| ------------------------------------------------------------- | ------------------------------------------- |
| Required and optional fields, allowed values, defaults        | [data-model](data-model.md)                 |
| Themes, custom colors, layouts, dimensions, fonts, visibility | [customization](customization.md)           |
| GitHub integration, rate limits, environment variables        | [github-integration](github-integration.md) |
| Command line options                                          | [cli-reference](cli-reference.md)           |

## The short version

- `version` is always `1`.
- A startup project needs `id`, `name`, `description`, `category`, `lifecycleStage`, `status`,
  `visibility`, `dataSource`, `createdAt` and `updatedAt`. Everything else is optional.
- `settings` is optional. Without it you get the `DARK` theme and the `DEFAULT` layout.
- Appearance (`theme`, `layout`, `colors`, `typography`, `dimensions`, `showTitle`, `showSummary`,
  `showDescriptions`, `showFooter`) works the same in both card files.
- Precedence, lowest to highest: theme, layout, explicit `colors`/`typography`/`dimensions`,
  then `--theme` / `--layout` on the command line.

## Privacy and provenance

- `visibility: "PRIVATE"` entries are validated but never drawn, and never counted in the summary.
- Every entry says where its data came from: `OBSERVED` (a verifiable source), `DECLARED` (you
  said so) or `ESTIMATED` (inferred; do not present it as fact). Observed GitHub data never
  overwrites what you declared.
- Token usage and cost are off by default, and are shown only when you enable them.

## Environment variables

| Variable       | Required | Use                                                                         |
| -------------- | -------- | --------------------------------------------------------------------------- |
| `GITHUB_TOKEN` | no       | Raises the GitHub rate limit. Read only by `sync`. Never stored or printed. |

Run `devtrace validate` after every change: it tells you the file, the field and a suggestion.
