# Developer Activity Dashboard

The Developer Activity Dashboard shows what GitHub reported about the public repositories in your
GitHub snapshot: a commit heatmap, commits per month, repositories, languages and releases. It is a
static SVG file, drawn in the same style as the other dashboards.

## What it is, and what it is not

It shows **observed activity in the monitored repositories**. It is not your whole activity on
GitHub, and it is not a measure of productivity, code quality, skill or experience. There are no
scores, rankings of quality or percentages of "AI-written" code.

Every number covers only the repositories in `data/github-snapshot.json` (the public repositories
that `data/github.json` selects). The dashboard says so in a line under the metrics.

## Setting it up

1. Configure the GitHub integration and turn on the data this dashboard uses
   ([`examples/github-activity.json`](../examples/github-activity.json)):

   ```json
   "collect": { "languages": true, "commitActivity": true }
   ```

2. Collect the data. This is the only step that uses the network (see
   [GitHub integration](github-integration.md)):

   ```bash
   pnpm sync:github --force
   ```

3. Create `data/developer-activity.json`
   ([`examples/developer-activity.json`](../examples/developer-activity.json)). Every setting is
   optional; `{ "version": 1 }` is valid.
4. Generate the SVG:

   ```bash
   pnpm generate:activity
   ```

It is written to `public/indicators/developer-activity.svg`. `devtrace generate` (target `all`)
includes it only when `data/developer-activity.json` exists, so existing projects are unaffected.
`devtrace validate activity` checks the file.

## Heatmap mode: tokens per commit

`settings.heatmapMode` is `COMMITS` by default. With `TOKEN_EFFICIENCY` the heatmap is replaced by a
panel that colors each day by the tokens spent per commit, so a day with fewer tokens for its commits
is brighter.

- **Where the numbers come from:** tokens from `data/usage-snapshot.json` (run `devtrace import usage`;
  input plus output tokens of all models for the day) and commits from the GitHub snapshot.
- **What a color means:** the day's tokens per commit, ranked against your own other days in four steps.
  It says nothing about other people, and a day is never "good" in absolute terms.
- **Unknown, not bad:** a day with no commits, no tokens or that has not happened is gray. The grid is
  drawn only when at least 8 days have both; before that the panel says how many it found.
- **It is an estimate** and is tagged so. The tokens come from all your work, including private
  repositories, while the commits are the public ones. A day with many tokens and no public commit is
  not an unproductive day. A big commit counts the same as a small one. Read it as a measure of use, not
  of quality or productivity.

```json
{ "version": 1, "settings": { "heatmapMode": "TOKEN_EFFICIENCY" } }
```

## Panels

A panel is drawn only when its data exists. Nothing is estimated to fill a gap.

| Panel                 | Setting              | Source and meaning                                                                                                            |
| --------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Metrics               | `showSummary`        | Public repositories, commits in the window, repositories with a release, last push                                            |
| Commit heatmap        | `showHeatmap`        | Commits per day on the default branch, summed over the repositories that reported them (`collect.commitActivity`)             |
| Commit activity       | `showCommitActivity` | Commits per month, two equal periods of 13 complete weeks (when comparable), commits by repository                            |
| Repository activity   | `showRepositories`   | Most recently pushed repositories, with language, stars and forks as reported by GitHub (`repositoryLimit`, default 6)        |
| Programming languages | `showLanguages`      | Share of the code bytes GitHub reports (`collect.languages`); without them, the primary language of each repository as counts |
| Releases              | `showReleases`       | The latest published release of each repository, newest first (`releaseLimit`, default 5)                                     |

The options `showTitle`, `showSummary` and `showFooter`, the themes, layouts, colors and dimensions
work as for the other indicators. The dashboard is 720, 880 or 960 pixels wide by layout.

## How to read the numbers

- **Commits** are commits on the default branch that GitHub counted in its weekly statistics, for the
  last 52 weeks. They are not the GitHub "contributions" calendar, which also counts pull requests,
  issues and reviews, and they say nothing about quality or effort. Weeks start on Sunday.
- **The heatmap** sums the repositories that reported data; its caption says how many of the
  monitored repositories that is. A day that had not happened yet when the data was fetched is drawn
  as an outlined cell, not as zero. A repository whose statistics were not ready is unknown, not zero.
- **Commits per month**: the first and last months of the window are partial and drawn in gray.
- **Two periods**: the latest 13 complete weeks against the 13 before them, from the same data and
  method. It appears only when every monitored repository reported data and enough complete weeks
  exist. The current, unfinished week is left out. The two numbers are shown as they are: no growth
  claim is made.
- **Languages** are bytes of code as reported by GitHub across the repositories that reported them.
  They are not time spent, effort or proficiency. DevTrace never turns a count of repositories into
  percentages.
- **Stars and forks** are GitHub metadata, not quality.

## Provenance

All of this data is `OBSERVED`: it is read from the GitHub API by `devtrace sync` and stored in the
snapshot. Nothing in this dashboard is declared by you or estimated.

## Privacy

The integration only requests public repositories, and a repository that is not public is skipped,
so private repositories and their names never reach the snapshot or the SVG.

## Not available

These are not shown because DevTrace does not collect them: pull requests, issues, the contributions
calendar, commits per author, the history of releases (only the latest per repository), and a
timeline of commits, pull requests or issues. A timeline built from repository metadata alone would
be misleading, so the Releases panel lists real release dates instead.

## Embedding

```html
<img
  src="https://raw.githubusercontent.com/<username>/<repository>/HEAD/public/indicators/developer-activity.svg"
  alt="Developer Activity Dashboard"
/>
```

See the [GitHub Actions workflow](github-integration.md#github-actions) to keep the data fresh.

## Implementation

`src/github/` collects the extra data (opt in, one request per repository, same client, retries and
rate-limit handling). `src/indicators/developer-activity/stats.ts` aggregates it, and
`src/templates/developer-activity-dashboard.ts` draws it with the [SVG components](svg-components.md).
