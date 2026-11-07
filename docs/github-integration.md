# GitHub integration

DevTrace can read **public** repository information from the GitHub REST API and show it next to
the projects you declare. The integration is optional, read-only and never needed to generate the
indicators.

## How it works

```
data/github.json ──> pnpm sync:github ──> data/github-snapshot.json ──┐
                     (the only step that                              ├─> pnpm generate:startup
                      uses the network)                               └─> pnpm generate:ai
```

1. **Sync.** `pnpm sync:github` reads `data/github.json`, calls the GitHub API and writes a
   validated snapshot to `data/github-snapshot.json`.
2. **Generate.** `pnpm generate:startup` and `pnpm generate:ai` read the snapshot from disk. They
   never use the network, so generation is fast, offline and deterministic: the same snapshot
   always produces the same SVG.

Because the steps are separate, a GitHub outage can never produce a broken or half-filled SVG:
if the sync fails, the previous snapshot is left exactly as it was and the existing SVG files are
not touched.

The snapshot is generated data. It is listed in `.gitignore` and is not committed.

## Configuration: `data/github.json`

The file is optional. Without it, `pnpm sync:github` prints a message and does nothing.

```json
{
  "version": 1,
  "username": "your-github-username",
  "repositories": {
    "include": [],
    "exclude": [],
    "includeForks": false,
    "includeArchived": false
  },
  "collect": {
    "description": true,
    "language": true,
    "stars": true,
    "forks": true,
    "releases": true
  },
  "onUnavailable": "SKIP",
  "cacheTtlMinutes": 60
}
```

| Field                          | Default  | Meaning                                                                                   |
| ------------------------------ | -------- | ----------------------------------------------------------------------------------------- |
| `version`                      | required | Must be `1`.                                                                              |
| `username`                     | required | The GitHub account whose public repositories are read.                                    |
| `repositories.include`         | `[]`     | `name` or `owner/name`. Empty means all public repositories of `username`.                |
| `repositories.exclude`         | `[]`     | `name` or `owner/name`, case-insensitive. Exclusion wins over inclusion.                  |
| `repositories.includeForks`    | `false`  | Applies when `include` is empty. Naming a repository in `include` overrides it.           |
| `repositories.includeArchived` | `false`  | Applies when `include` is empty. Naming a repository in `include` overrides it.           |
| `collect.*`                    | all on   | Fields left out are not stored. `releases: false` also saves one API call per repository. |
| `onUnavailable`                | `SKIP`   | `SKIP` warns and continues, `FAIL` stops the sync. See below.                             |
| `cacheTtlMinutes`              | `60`     | A snapshot younger than this is reused. `0` disables the cache. Maximum 1440.             |

The file never contains credentials, and a `token` field is rejected as an unknown field.

### Unavailable repositories

A repository is _unavailable_ when it does not exist, was removed, is blocked, or is not public.

- `SKIP` (default): a warning is printed (`Repository "octo/ghost" is unavailable. It was
skipped.`) and the sync continues without it.
- `FAIL`: the sync stops with an error and the previous snapshot is kept.

Other problems (rate limit, outage, invalid responses) are not "unavailable": they always fail the
whole sync, so a partial result is never stored as if it were complete.

## Linking projects to repositories

Add `githubRepository` (`owner/name`) to a project in `data/startup.json` or to an AI project in
`data/ai-engineering.json`:

```json
{ "id": "my-app", "name": "My App", "githubRepository": "octo/app" }
```

Nothing is linked automatically: DevTrace never guesses which repository belongs to a project.

### Precedence between declared and observed data

**Declared values always win and are never overwritten.** GitHub data is attached next to them:

| Field                                                                       | Source                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `name`, `description`, `category`, `lifecycleStage`, `status`, `visibility` | Always the declared value. GitHub is never used for these. |
| `repositoryUrl`, `websiteUrl`                                               | Always the declared value.                                 |
| Totals (total, active, launched, by stage or status)                        | Computed from declared values only.                        |
| Stars, forks, primary language, latest release                              | Observed on GitHub, shown as a separate line.              |

If a project declares a `repositoryUrl` that points to a different repository than
`githubRepository`, a warning is printed and the declared value is kept. If a project links a
repository for which no data exists, a warning suggests running `pnpm sync:github`.

Warnings are never printed for private projects, so their IDs cannot end up in public CI logs.

### What is displayed

Under a linked project the card shows one muted line, always starting with `GitHub`:

```
GitHub · 3,909 stars · 7,404 forks · TypeScript · release v1.2.0 (2026-10-01)
```

Only the collected fields appear. Repository descriptions and URLs are never rendered. These are
GitHub metrics, not measures of commercial success: DevTrace does not derive revenue, customers,
users, sales, conversion, operational status or lifecycle stage from them.

### AI engineering

For AI projects the same line is shown. GitHub provides no evidence about which AI tools or
models were used, token usage, cost, productivity or how much code was written by AI, so none of
that is inferred. Tools, models, skills, activity and token usage stay declared by hand.

## Data provenance

Everything read from the GitHub API is `OBSERVED`. The snapshot stores `"provenance": "OBSERVED"`
on every repository and the validator **rejects** any other value, so estimated or declared data
cannot be passed off as observed by editing the file. Values you type in remain `DECLARED` (or
`ESTIMATED`), and the card keeps the two visibly apart.

## Authentication and rate limits

No token is needed for public data. Without one, GitHub allows 60 requests per hour per IP
address; with a token the limit is much higher.

The number of requests is small and predictable:

- listing mode: 1 request per 100 repositories, plus 1 per repository for its latest release;
- `include` mode: 1 request per repository, plus 1 per repository for its latest release;
- `collect.releases: false` removes the release request.

To save requests, DevTrace reuses a snapshot younger than `cacheTtlMinutes` (use
`pnpm sync:github --force` to refresh anyway).

### Environment variables

| Variable       | Required | Use                                                                           |
| -------------- | -------- | ----------------------------------------------------------------------------- |
| `GITHUB_TOKEN` | no       | Raises the rate limit. Only read by the sync command. Never stored or logged. |

```bash
# macOS / Linux
GITHUB_TOKEN=<your token> pnpm sync:github

# Windows PowerShell
$env:GITHUB_TOKEN = "<your token>"; pnpm sync:github
```

A token needs no scopes for public data. Do not put it in any JSON file.

### How the client behaves

- **Read-only:** only `GET` requests are made, to `https://api.github.com`.
- **Timeout:** 10 seconds per request.
- **Retries:** at most 3 attempts per request, with exponential backoff (0.5 s, then 1 s), for
  network errors, timeouts and HTTP 500, 502, 503 and 504.
- **Rate limits:** HTTP 429, and HTTP 403 with an exhausted limit, wait for `Retry-After` or the
  `x-ratelimit-reset` time. If the wait would exceed 60 seconds, the sync fails right away with a
  message saying when the limit resets, instead of blocking a CI job.
- **Pagination:** `Link` headers are followed (100 items per page, at most 20 pages).
- **Validation:** every response is validated before use; unexpected shapes fail with the field
  that was wrong. Descriptions are sanitized (control characters removed, length capped).
- **Errors:** 404, 401 and 403 are reported distinctly and never retried.

## GitHub Actions

`.github/workflows/update-indicators.yml` regenerates the SVG files and commits them when they
change.

| Trigger             | Details                                                      |
| ------------------- | ------------------------------------------------------------ |
| `workflow_dispatch` | Run it manually from the **Actions** tab of the repository.  |
| `schedule`          | Daily at 04:23 UTC. Edit the `cron` expression to change it. |

Steps: install with `pnpm install --frozen-lockfile` on Node.js 22, run `pnpm test`, sync GitHub
data, run `pnpm generate:startup` and `pnpm generate:ai`, then commit and push only if something
under `public/indicators` changed (no empty commits). It does not deploy or publish anywhere.

### Setup

1. Put the project in the repository that should host the SVG files, and push it.
2. Edit `data/github.json` (optional) and the data files, then commit them.
3. In **Settings → Actions → General**, make sure Actions are allowed. The workflow requests
   `contents: write` itself; if your organization forces read-only workflow permissions, allow
   read and write there.
4. Open **Actions → Update indicators → Run workflow** to run it once.

No secret has to be created: the workflow passes the built-in `GITHUB_TOKEN` to the sync step
only, which gives public API access with a higher rate limit.

### Behavior worth knowing

- **Branch:** the workflow pushes to the branch it ran on (`github.ref_name`) and never hardcodes
  a branch name. Scheduled runs always use the repository's default branch.
- **Protected branches:** if the default branch requires pull requests or status checks, the push
  of the bot commit will be rejected. Allow the Actions bot to bypass the rule, or generate the
  SVG files locally.
- **A failed sync does not block regeneration:** the SVG files are generated from the previous
  snapshot (when there is none, without GitHub lines) and the job still ends as failed, so the
  problem is visible.
- **In CI the snapshot does not persist** between runs (it is not committed), so every run
  syncs again. The cache only saves requests when running locally.
- GitHub disables scheduled workflows after 60 days without repository activity; run it manually
  to re-enable it.

## Security considerations

- The integration is read-only and limited to public data. It requests
  `/users/{username}/repos`, never `/user/repos`, and refuses any repository that GitHub reports
  as private, even if a token could read it.
- The token comes only from the `GITHUB_TOKEN` environment variable. It is sent only to
  `api.github.com`: requests to any other host, including pagination links, are refused. It is not
  written to the snapshot, SVG, logs or error messages, and the configuration file rejects it.
- Text from GitHub is sanitized and then escaped as XML when the SVG is written. The repository
  URL is rebuilt from the repository name instead of trusting the API.
- The snapshot is validated before it is written and before it is read; it is written to a
  temporary file and renamed, so an interrupted sync cannot leave a half-written file.
- The workflow uses the minimum permission (`contents: write`), pins actions to major versions,
  keeps workflow expressions out of shell scripts and gives the token to a single step. For
  stricter supply-chain control, pin the actions to commit SHAs.
- A repository test scans the source, data, docs, workflow and generated SVG files for the shape
  of GitHub tokens.

## Known limitations

- Only public repositories of one account (or those named with `owner/name`) are read.
- Only the latest published, non-draft, non-prerelease release is read (GitHub's `latest`
  endpoint), not the full release history.
- No activity metrics (commits, pull requests, contribution counts) are collected: there is no
  agreed definition of what they would measure.
- Stars and forks are shown as numbers at the time of the sync; DevTrace keeps no history.
- No conditional requests (ETags). The snapshot cache is the only cache.
- Linking is explicit and one repository per project.
