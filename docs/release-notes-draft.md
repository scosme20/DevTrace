# DevTrace: first public release (DRAFT)

> Draft. Not published. The version number and date are not decided.

## Overview

DevTrace generates static SVG indicators for a GitHub profile README from small JSON files. It runs
locally or in your own GitHub Actions workflow; there is no hosted service, dashboard or account.

## Features

- **Startup & SaaS Statistics**: projects, lifecycle stages, status and links, from `data/startup.json`.
- **AI Engineering Statistics**: tools, models, skills, projects, activities and token usage, each
  with its data provenance (`OBSERVED`, `DECLARED` or `ESTIMATED`), from `data/ai-engineering.json`.
- **GitHub integration**: optional, read-only sync of public repository data (`devtrace sync`).
  `GITHUB_TOKEN` is optional and never stored.
- **Visual customization**: five themes, three layouts, custom colors, fonts and dimensions.
- **CLI**: `init`, `validate`, `generate`, `sync`, `help`, `--version`.
- Private entries are removed before any statistic is computed; SVGs contain no scripts or remote
  resources.

## Usage

DevTrace is not on npm yet. From a clone of the repository (Node.js 22+, pnpm 9):

```bash
pnpm install
pnpm validate
pnpm generate
```

See `README.md` and `docs/` for configuration, themes and the GitHub Actions workflow.

## Known limitations

- Not published to npm; run it from a clone.
- Pre-1.0: configuration and output may change between minor versions.
- GitHub scheduled workflows are disabled after 60 days without repository activity.

## Contributing

See `CONTRIBUTING.md`. Run `pnpm check` and `pnpm build` before opening a pull request. Report
vulnerabilities privately as described in `SECURITY.md`.
