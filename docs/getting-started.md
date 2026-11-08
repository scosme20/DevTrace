# Getting started

This guide takes you from nothing to an SVG in your GitHub profile README.

DevTrace is **not published to npm**. You use it by cloning the repository (or your own copy of it)
and running it with pnpm. Every command below runs against the current code.

## 1. Get the project

You need Node.js 22 or newer and [pnpm](https://pnpm.io) 9.

```bash
git clone <url-of-your-copy-of-devtrace> devtrace
cd devtrace
```

A copy under your own account (a fork, or a repository created from it) is the best setup, because
the SVG files and the optional GitHub Actions workflow live in the repository you commit to.

## 2. Install the dependencies

```bash
pnpm install
```

## 3. Create the configuration

```bash
pnpm dev init
```

If you started from a copy of this repository, the `data/` folder holds the author's own data:
replace those files first (delete them, then run `init`, or copy from `examples/`).

This writes `data/startup.json` and `data/ai-engineering.json`. The files are valid and hold no
projects: nothing is invented for you, and existing files are never overwritten.

Add your own projects. The [`examples/`](../examples) directory has complete files to copy from,
and [configuration](configuration.md) explains every field.

## 4. Validate

```bash
pnpm validate
```

The command reports every problem with the file, the field and a suggestion, and prints what
would be generated. It never writes or changes anything. It exits with `0` when the configuration
is valid and `1` when it has errors.

## 5. Generate

```bash
pnpm generate
```

This writes `public/indicators/startup-stats.svg` and `public/indicators/ai-engineering-stats.svg`.
Generate one with `pnpm generate:startup` or `pnpm generate:ai`. To try another look without
editing the file:

```bash
pnpm dev generate startup --theme MIDNIGHT --layout COMPACT --output preview.svg
```

## 6. Show it in your profile README

Commit the SVG files and reference them from your profile repository. The exact snippets,
including the `<picture>` element that switches between a light and a dark card, are in the
[README](../README.md#using-the-svgs-in-your-profile-readme).

## What next

- Keep the files fresh with the [update workflow](github-integration.md#github-actions).
- Read public repository data with the optional [GitHub integration](github-integration.md).
- Change colors, fonts and size in [customization](customization.md).
- Something went wrong? See [troubleshooting](troubleshooting.md).
