# CLI reference

DevTrace has one command line, `devtrace`. The repository is not published to npm, so you run it
through the package scripts or directly:

```bash
pnpm dev <command> [options]        # runs the TypeScript source with tsx
pnpm build && node dist/index.js <command> [options]
```

Both use the current directory as the project root: they read `data/*.json` and write
`public/indicators/*.svg` there. The documentation writes `devtrace` for either form.

## Help

```text
devtrace - generate SVG indicators for your GitHub profile README

Usage:
  devtrace <command> [options]

Commands:
  init [options]        Create starter configuration files in data/
  validate [target]     Check the configuration without writing anything
  generate [target]     Generate the SVG indicators (default target: all)
  sync                  Read public GitHub data into data/github-snapshot.json
  import usage          Read token usage from local Claude Code and Codex logs
  import git <folder>   Count the commits of a local clone, even a private one
  snippet               Print the Markdown that shows the generated SVGs
  help [command]        Show help for a command

Targets:
  generate              startup, ai, activity, all
  validate              startup, ai, activity, github, all

Options:
  -h, --help            Show help; after a command, help for that command
  -v, --version         Print the version
      --verbose         Show every cause and the stack trace when a command fails

Examples:
  devtrace init
  devtrace validate
  devtrace generate
  devtrace generate startup --theme MIDNIGHT --layout COMPACT --output preview.svg
  devtrace sync --force

Exit codes:
  0  success
  1  failure: invalid configuration, or a generation or sync error
  2  usage error: unknown command, option or value

DevTrace reads data/*.json and writes public/indicators/*.svg in the current directory.
```

A test keeps this block identical to the text printed by `devtrace --help`.

## Commands

| Command             | What it does                                                          | Writes                                          |
| ------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| `init`              | Creates valid, empty starter files. Never overwrites an existing one. | `data/startup.json`, `data/ai-engineering.json` |
| `validate [target]` | Checks the configuration and prints a summary of what would be made.  | nothing                                         |
| `generate [target]` | Builds the SVG files from the configuration and the GitHub snapshot.  | `public/indicators/*.svg`                       |
| `sync [--force]`    | Reads public GitHub data. The only command that uses the network.     | `data/github-snapshot.json`                     |
| `help [command]`    | Shows the help of a command.                                          | nothing                                         |

### `generate`

| Target    | File                                         |
| --------- | -------------------------------------------- |
| `startup` | `public/indicators/startup-stats.svg`        |
| `ai`      | `public/indicators/ai-engineering-stats.svg` |
| `all`     | both (the default)                           |

| Option              | Values                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `--theme <theme>`   | `DARK`, `LIGHT`, `MIDNIGHT`, `MINIMAL`, `TRANSPARENT`                                                 |
| `--layout <layout>` | `COMPACT`, `DEFAULT`, `EXPANDED`                                                                      |
| `--output <file>`   | A file name, or a path, inside `public/indicators`. Not with the target `all`, which writes two files |

`--theme` and `--layout` replace the setting in the file for this run only, and are not case
sensitive. With `all`, one indicator failing does not stop the other from being written; the exit
code is `1` if any failed.

### `validate`

Targets: `startup`, `ai`, `github`, `all` (the default). The command checks structure, required
fields, types, allowed values, URLs, colors, dimensions, themes, GitHub settings, references
between entries, and privacy and provenance rules. Errors fail the command (exit `1`); warnings
point at things that are valid but probably not intended, and do not. See
[troubleshooting](troubleshooting.md) for example output.

### `sync`

Reads public repository data as configured in `data/github.json`. `--force` ignores the cache.
`GITHUB_TOKEN` is optional and only raises the rate limit. See
[GitHub integration](github-integration.md).

### `init`

`devtrace init` creates the starter files. `--name`, `--github`, `--theme` and `--workflow` fill them
in: the name shown on the indicators, a GitHub username (which also creates `data/github.json` and
`data/developer-activity.json`), a theme, and a workflow that runs the DevTrace action every day.
Existing files are never overwritten.

### `import`

`devtrace import usage` reads token usage from the local logs of Claude Code and Codex
([usage import](usage-import.md)). `devtrace import git <folder> --label <name> [--author <email>]`
counts the commits of a local clone, even a private one, keeping only counts and dates
([local repositories](developer-activity-dashboard.md#local-repositories)).

### `snippet`

`devtrace snippet --repo <owner/name> [--branch <name>] [--pair]` prints the Markdown that shows the
generated SVGs, with an optional dark and light pair. It writes nothing
([embedding](github-profile.md#a-light-and-a-dark-version)).

## The GitHub Action

The repository is also a reusable action. A workflow in your own repository can run it instead of
installing DevTrace:

```yaml
- uses: actions/checkout@v4
- uses: scosme20/DevTrace@v0.8.0
  with:
    target: all # startup, ai, activity or all
    sync: "true" # read public GitHub data first
    commit: "true" # commit the changed SVGs and the snapshot
```

The action builds the version you selected, validates, syncs (the only step with the token),
generates and commits only `public/indicators` and `data/github-snapshot.json`. It publishes
nowhere. The job needs `permissions: contents: write`. `devtrace init --workflow` writes this
workflow for you.

## Package scripts

| Script                     | Runs                              |
| -------------------------- | --------------------------------- |
| `pnpm dev <args>`          | `devtrace <args>` from the source |
| `pnpm validate`            | `devtrace validate`               |
| `pnpm generate`            | `devtrace generate all`           |
| `pnpm generate:startup`    | `devtrace generate startup`       |
| `pnpm generate:ai`         | `devtrace generate ai`            |
| `pnpm generate:activity`   | `devtrace generate activity`      |
| `pnpm sync:github`         | `devtrace sync`                   |
| `pnpm build`, `pnpm start` | Compile to `dist/`, run the build |

The development scripts (`test`, `typecheck`, `lint`, `format:check`, `check`) are listed in
[CONTRIBUTING](../CONTRIBUTING.md).

## Names used before 0.6.0

`devtrace startup`, `devtrace ai` and `devtrace github` still work and mean
`generate startup`, `generate ai` and `sync`. They are not advertised.

## Exit codes and errors

| Code | Meaning                                                                                     |
| ---- | ------------------------------------------------------------------------------------------- |
| `0`  | Success. Warnings do not change it.                                                         |
| `1`  | The command ran and failed: invalid or missing configuration, a generation or a sync error. |
| `2`  | The command line is wrong: unknown command, option or value.                                |

Errors name the file and the field, and suggest a fix where one is known. Stack traces are hidden;
add `--verbose` to see every cause and the stack. Nothing is ever corrected silently: an invalid
file is reported and left as it is.
