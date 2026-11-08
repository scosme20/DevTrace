import type { CommandName } from "./args.js";

// Help text is plain data so that it can be tested and quoted in the documentation
// (docs/cli-reference.md contains the main help, and a test keeps them equal).

export const MAIN_HELP = `devtrace - generate SVG indicators for your GitHub profile README

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

DevTrace reads data/*.json and writes public/indicators/*.svg in the current directory.`;

const COMMAND_HELP: Readonly<Record<CommandName, string>> = {
  init: `devtrace init [--name <name>] [--github <user>] [--theme <theme>] [--workflow]

Creates the starter configuration files:
  data/startup.json
  data/ai-engineering.json

Options fill them in, so the first run already looks like you:
  --name <name>      The name shown on the indicators
  --github <user>    Also creates data/github.json and data/developer-activity.json
  --theme <theme>    DARK, LIGHT, MIDNIGHT, MINIMAL, TRANSPARENT or TERMINAL
  --workflow         Also writes .github/workflows/update-indicators.yml, which runs the
                     DevTrace action every day

Existing files are never overwritten: they are skipped and left as they are.
The files are valid and contain no projects, so nothing is shown on a card until
you add your own data. See docs/configuration.md and the examples directory.

Next: edit the files, run "devtrace validate", then "devtrace generate".`,

  validate: `devtrace validate [target]

Checks the configuration files and reports problems with the file, the field and
a suggestion. It never writes or changes anything.

Targets:
  startup   data/startup.json
  ai        data/ai-engineering.json
  activity  data/developer-activity.json (optional)
  github    data/github.json (optional) and data/github-snapshot.json
  all       everything above (default)

Checks: structure, required fields, types, allowed values, URLs, colors,
dimensions, themes, GitHub settings, references between entries, privacy and
provenance. It also prints a summary of what would be generated.

Errors make the command fail (exit code 1). Warnings point at things that are
valid but probably not intended, and do not.`,

  generate: `devtrace generate [target] [options]

Generates the SVG indicators from the configuration files.

Targets:
  startup   public/indicators/startup-stats.svg
  ai        public/indicators/ai-engineering-stats.svg
  activity  public/indicators/developer-activity.svg (needs data/developer-activity.json)
  all       startup and ai, plus activity when it is configured (default)

Options:
  --theme <theme>     DARK, LIGHT, MIDNIGHT, MINIMAL, TRANSPARENT or TERMINAL
  --layout <layout>   COMPACT, DEFAULT or EXPANDED
  --output <file>     File name inside public/indicators (not with the target "all")

--theme and --layout replace the setting in the file for this run only. They are
not case sensitive. GitHub data is read from data/github-snapshot.json: run
"devtrace sync" first to refresh it. Generating never uses the network.`,

  sync: `devtrace sync [options]

Reads public repository data from the GitHub API into data/github-snapshot.json,
as configured in data/github.json. This is the only command that uses the network.

Options:
  --force   Ignore the cache and call the API even if the snapshot is recent

Set the GITHUB_TOKEN environment variable to raise the rate limit. It is optional
for public data, and is never stored or printed. If the sync fails, the previous
snapshot is left untouched.`,

  import: `devtrace import usage [options]
       devtrace import git <folder> --label <name> [--author <email>]

Reads the token usage that Claude Code and Codex keep in their local log files and
writes the totals of one period, per model, to data/usage-snapshot.json. It reads
only the model, the time and the token counts of each entry: never message text,
file paths or project names. It uses no network.

Options:
  --source <source>   CLAUDE, CODEX or ALL (default: ALL)
  --days <n>          Number of days up to --until (default: 30, at most 365)
  --since <date>      First day, like 2026-03-01 (replaces --days)
  --until <date>      Last day (default: today, UTC)

The tools' folders are ~/.claude and ~/.codex; CLAUDE_CONFIG_DIR and CODEX_HOME
change them. To show the numbers, set settings.usageSnapshot and
settings.showTokenUsage to true in data/ai-engineering.json.

"import git" counts the commits of a local clone, so a private repository can be
shown without exposing it. It runs "git log" and "git ls-files" and keeps only
counts, dates and file extensions under the --label you chose: never messages,
author names, file names, paths or hashes. It uses no network. --author counts only
the commits of that e-mail. Set settings.showLocalGit to true in
data/developer-activity.json to show it.`,

  snippet: `devtrace snippet --repo <owner/name> [--branch <name>] [--pair]

Prints the Markdown that puts the generated SVGs in a README, one block for each file
that exists in public/indicators. It writes nothing.

Options:
  --repo <owner/name>   The repository that holds the SVGs (GITHUB_REPOSITORY is the default)
  --branch <name>       Branch or tag in the links (default: HEAD, the default branch)
  --pair                Dark and light: a <picture> that picks the file by the viewer's theme

The light file of "x.svg" is "x-light.svg". Create it with, for example:
  devtrace generate startup --theme LIGHT --output startup-stats-light.svg`,

  help: `devtrace help [command]

Shows the help of a command: init, validate, generate, sync, import, snippet or help.
"devtrace <command> --help" does the same.`,
};

export function helpFor(topic: CommandName | undefined): string {
  return topic === undefined ? MAIN_HELP : COMMAND_HELP[topic];
}
