# Release process and quality gates

This document describes how a DevTrace release is prepared. Nothing here publishes automatically:
publishing to npm and creating a GitHub Release are manual, explicit steps.

## Versioning

DevTrace follows [Semantic Versioning](https://semver.org/). While the version is `0.x`, the
configuration format, the CLI and the SVG output may still change in a minor release; such
changes are listed in the changelog. `1.0.0` is reserved for the point where the configuration
format, CLI commands and indicator layout are declared stable. DevTrace is a CLI: it exposes no
library API (`package.json` has no `main` or `exports`).

## Blocking gates

A release is not ready if any of these fail:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`
3. `pnpm test`
4. `pnpm build`
5. `pnpm generate` leaves `public/indicators` unchanged (indicators up to date and valid SVG)
6. `node dist/index.js validate` and every file in `examples/` validate
7. `pnpm audit --prod` reports no vulnerabilities
8. No credentials in the repository (covered by `tests/repository-hygiene.test.ts`)
9. `npm pack --dry-run` lists only intended files (no stale `dist` files, no tests or data)
10. README, docs and CHANGELOG describe only implemented features
11. A `LICENSE` file exists and matches `package.json`
12. `package.json` has `repository`, `homepage` and `bugs`, and `private` is removed

## Optional improvements

Additional indicators, a library API, more themes and similar work do not block a release.

## Steps

1. Update `CHANGELOG.md`: move `Unreleased` entries under the new version and date.
2. Bump `version` in `package.json` and `src/core/version.ts` (a test keeps them equal).
3. Run every blocking gate above.
4. Tag the commit (`vX.Y.Z`) and push the tag.
5. Create the GitHub Release from the notes in `docs/release-notes-draft.md`.
6. Run `npm publish --access public` manually, after confirming the package contents.

## Status of the first release

| Area                | Item                                               | State   |
| ------------------- | -------------------------------------------------- | ------- |
| Technical           | Typecheck, lint, format, tests, build              | DONE    |
| Technical           | CI workflow                                        | DONE    |
| Security            | Dependency audit clean, no secrets, SVG escaping   | DONE    |
| Security            | Private vulnerability reporting enabled on GitHub  | PENDING |
| Licensing           | `LICENSE` file (MIT)                               | DONE    |
| Documentation       | README, docs, CHANGELOG, SECURITY                  | DONE    |
| Documentation       | `CODE_OF_CONDUCT.md`                               | DONE    |
| Distribution        | `repository`, `homepage`, `bugs`, remove `private` | BLOCKED |
| Release publication | Tag, GitHub Release, `npm publish`                 | PENDING |

The repository URL depends on a decision by the maintainer.
