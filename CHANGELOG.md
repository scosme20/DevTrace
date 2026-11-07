# Changelog

All notable changes to DevTrace are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/). No version has been published yet.

## [Unreleased]

### Added

- Startup & SaaS Statistics indicator, generated from `data/startup.json`.
- AI Engineering Statistics indicator (tools, models, skills, projects, activities, token usage and
  data provenance), generated from `data/ai-engineering.json`.
- Optional read-only GitHub integration (`devtrace sync`) that maps public repository data onto
  projects, with caching and rate-limit handling.
- `Update indicators` GitHub Actions workflow that regenerates and commits the SVG files.
- Five themes (`DARK`, `LIGHT`, `MIDNIGHT`, `MINIMAL`, `TRANSPARENT`), three layouts, custom
  colors, fonts and dimensions.
- CLI with `init`, `validate`, `generate`, `sync` and `help`, plus `--version`.
- Documentation in `docs/` and validated example configurations in `examples/`.
- `CI` workflow: typecheck, lint, format check, tests, build, CLI smoke test, a check that the
  committed indicators are up to date, and a production dependency audit.
- MIT `LICENSE`, `SECURITY.md`, issue templates, a pull request template and `docs/release.md`.

### Changed

- `pnpm build` now removes `dist/` first, so stale compiled files can no longer end up in the
  package.

### Fixed

- Stale build output (`dist/cli.js`, `dist/templates/tokens.js`) no longer ships in the package.

### Removed

- An empty stray file (`scripts_tmp_unused`) from the repository root.

### Security

- Pinned `minimatch` to `^11.0.1` through a pnpm override to resolve a moderate advisory
  (GHSA-g3hv-75wg-m249) reached through the ESLint dev dependency. `pnpm audit` reports no known
  vulnerabilities.
