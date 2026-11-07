# Development

## Local environment

- Node.js 22 or newer.
- pnpm 9.

## Installation

```bash
pnpm install
```

## Commands

See the script table in [CONTRIBUTING](../CONTRIBUTING.md). Before opening a pull request
run:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm build
```

## Testing

Tests live in `tests/` and use Vitest. They check observable behavior (validation errors,
structural SVG content, escaping, file output) and use temporary directories for filesystem
tests. Apart from the repository hygiene checks (credential scan, workflow validation), they do
not depend on the real `data/` contents.

## GitHub integration while developing

- Tests never use the network: the GitHub client is tested with a fake `fetch`, and the sync is
  tested against an in-memory GitHub. Keep it that way.
- To try the integration for real, create `data/github.json` and run `pnpm sync:github`.
  `GITHUB_TOKEN` is optional; never put it in a file that is committed.
- `data/github-snapshot.json` is generated and ignored by git. Delete it to see the cards
  without GitHub data.
- `pnpm sync:github --force` ignores the snapshot cache.

## Contribution guidelines

- Write everything in English: code, comments, docs, errors, tests and commit messages.
- Keep modules within their boundaries (see [architecture](architecture.md)).
- Validate external data; never repair invalid data silently.
- Escape all user-controlled text before it reaches an SVG.
- Add a test for each behavior you change. Comments should explain why, not what.
- Do not add dependencies or abstractions without a concrete need.
