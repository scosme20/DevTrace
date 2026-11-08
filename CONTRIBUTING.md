# Contributing to DevTrace

Thank you for helping. DevTrace is a small tool that turns JSON files into SVG indicators for a
GitHub profile README. Changes that keep it small, predictable and honest are the easiest to merge.

## Development setup

You need Node.js 22 or newer and pnpm 9.

```bash
pnpm install
pnpm dev --help        # run the CLI from the source
pnpm check             # typecheck, lint, tests and format check
```

| Script              | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `pnpm dev <args>`   | Run the CLI from the source with tsx             |
| `pnpm build`        | Compile to `dist/`                               |
| `pnpm test`         | Run the tests once (`pnpm test:watch` to watch)  |
| `pnpm typecheck`    | Type-check without emitting                      |
| `pnpm lint`         | ESLint                                           |
| `pnpm format`       | Format with Prettier                             |
| `pnpm format:check` | Check formatting                                 |
| `pnpm check`        | Typecheck, lint, test and format check, in order |

The CLI commands are in the [CLI reference](docs/cli-reference.md).

## Project structure

```text
src/cli/          Argument parsing, commands, help, error formatting, init
src/core/         Models, validation, configuration loading, results
src/generators/   One generator per indicator, plus the GitHub sync
src/github/       GitHub API client, collection, mapping
src/indicators/   Aggregation of the data an indicator shows
src/components/   Reusable SVG components: layout, metrics and charts
src/templates/    Themes, design tokens, SVG layout and rendering
src/validate/     The `validate` command
src/shared/       SVG escaping, color and text helpers
tests/            Vitest tests, one file per area
examples/         Complete configuration files, validated by a test
docs/             Documentation; architecture.md explains how the pieces fit
```

## Coding conventions

- TypeScript in strict mode, ESM, Node.js 22+. No `any`; validate external data at the boundary.
- Write everything in English: code, comments, errors, docs, tests and commit messages.
- Comments explain why, not what.
- Escape every user-controlled string before it reaches an SVG.
- Never repair invalid data silently: report it with the file and the field.
- Keep the CLI thin. It parses arguments and prints; generators and validators hold the logic.
- Do not add a dependency or an abstraction without a concrete need.
- Prettier decides formatting (`pnpm format`).

## Testing

Tests use Vitest and live in `tests/`.

- Add a test for every behavior you change or add.
- Tests must not use the network or depend on the real `data/` files. The GitHub client is tested
  with a fake `fetch`. Filesystem tests use temporary directories.
- Documentation is tested: JSON examples in the docs and in `examples/` are checked with the real
  validators, and `docs/cli-reference.md` must match `devtrace --help`.

Run `pnpm check` before you open a pull request. The `CI` workflow runs the same checks, plus the
build and a check that generating is deterministic. See [release](docs/release.md).

## Pull requests

1. Open an issue first for anything larger than a small fix, so the direction can be agreed.
2. Work on a branch and keep the pull request focused on one change.
3. Update the documentation and the tests together with the code.
4. Make sure `pnpm check` and `pnpm build` pass.
5. Describe what changed and why, and how you tested it.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`,
`test:`, `refactor:`, `chore:`. Write in the imperative mood, for example
`fix: reject output paths outside public/indicators`.

## Bug reports

Include the DevTrace version (`devtrace --version`), your Node.js version and operating system,
the command you ran, and the full output (add `--verbose`). Attach the smallest configuration
that reproduces the problem. **Remove any token, secret or private project before you share
anything.** If you found a security problem, do not open a public issue; contact the maintainer
privately.

## Feature requests

Describe the problem first, then the change you imagine. DevTrace deliberately has no dashboard,
server or accounts, and it never invents data, so requests that need those are unlikely to fit.
