# Using DevTrace in your GitHub profile

DevTrace writes three SVG files. This guide shows how to get them into your profile README and keep
them current. Nothing here changes another repository for you: you decide where the files go.

## The files

`devtrace generate` writes into `public/indicators/` of the DevTrace project:

| File                                         | Dashboard          | Configured by                  | Written when                                  |
| -------------------------------------------- | ------------------ | ------------------------------ | --------------------------------------------- |
| `public/indicators/ai-engineering-stats.svg` | AI Engineering     | `data/ai-engineering.json`     | always (a dashboard with `"dashboard": true`) |
| `public/indicators/startup-stats.svg`        | Startup & SaaS     | `data/startup.json`            | always (a dashboard with `"dashboard": true`) |
| `public/indicators/developer-activity.svg`   | Developer Activity | `data/developer-activity.json` | only when that file exists                    |

The first two files hold the original single-column cards unless you set `"dashboard": true` in the
settings. The three dashboards are 880 pixels wide in the default layout (720 `COMPACT`, 960
`EXPANDED`), so they line up when they are stacked. Use any of them alone or all together: each one
is a complete image about one subject, and they are never merged into one.

## Where the DevTrace project and your profile live

A profile README is the `README.md` of a repository named like your username (`<username>/<username>`).
That can be a different repository from the one that holds DevTrace. There are two ways to connect
them:

1. **Reference the files where they are generated.** Run DevTrace in a repository of your own (a
   copy of this project with your data), commit the generated SVG files, and point your profile
   README at them with raw URLs. Nothing has to be copied. This works only while that repository is
   public.
2. **Copy the files into the profile repository.** Run DevTrace anywhere, copy the three SVG files
   into the profile repository (for example into an `assets/` folder), commit them and use relative
   paths. You repeat the copy whenever you regenerate.

## Embedding

Replace `<username>` and `<repository>`. `HEAD` points to the default branch, so no branch name is
assumed.

```html
<img
  src="https://raw.githubusercontent.com/<username>/<repository>/HEAD/public/indicators/ai-engineering-stats.svg"
  alt="AI Engineering Dashboard"
/>
<img
  src="https://raw.githubusercontent.com/<username>/<repository>/HEAD/public/indicators/startup-stats.svg"
  alt="Startup & SaaS Dashboard"
/>
<img
  src="https://raw.githubusercontent.com/<username>/<repository>/HEAD/public/indicators/developer-activity.svg"
  alt="Developer Activity Dashboard"
/>
```

With copied files (option 2), use relative paths in the profile repository:

```html
<img src="./assets/ai-engineering-stats.svg" alt="AI Engineering Dashboard" />
<img src="./assets/startup-stats.svg" alt="Startup & SaaS Dashboard" />
<img src="./assets/developer-activity.svg" alt="Developer Activity Dashboard" />
```

Use as many of the three as you want, in any order. A good order for a profile is the work first
(Startup & SaaS), then how you build (AI Engineering), then the activity behind it (Developer
Activity). Add a short sentence of your own between them; DevTrace does not write your text.

### A light and a dark version

GitHub can show a different image to viewers with a light or a dark theme. Generate both and let a
`<picture>` element choose:

```bash
pnpm dev generate startup --theme DARK --output startup-dark.svg
pnpm dev generate startup --theme LIGHT --output startup-light.svg
```

```html
<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="
      https://raw.githubusercontent.com/<username>/<repository>/HEAD/public/indicators/startup-dark.svg
    "
  />
  <img
    src="https://raw.githubusercontent.com/<username>/<repository>/HEAD/public/indicators/startup-light.svg"
    alt="Startup & SaaS Dashboard"
  />
</picture>
```

Instead of writing the HTML by hand, `devtrace snippet` prints it for the files that exist:

```bash
devtrace snippet --repo <username>/<repository> --pair
```

With `--pair` the file `x.svg` is the dark version and `x-light.svg` the light one; the command says
how to create a light file that is missing. Without `--pair` it prints one plain image per
indicator. `--branch` replaces `HEAD` in the links.

The `TRANSPARENT` theme has no background, so it adapts to either page, at a lower contrast than the
opaque themes (see [customization](customization.md)).

## Updating the images

- **By hand:** `pnpm sync:github` (only if you use GitHub data), then `pnpm generate`, then commit
  the changed files. `devtrace generate` writes the developer activity dashboard only when
  `data/developer-activity.json` exists.
- **Automatically:** the workflow `.github/workflows/update-indicators.yml` does the same every day
  and on demand, and commits only when a file changed. It commits **to the repository it runs in**.
  With option 1 that is the repository the profile README points to, so the images update by
  themselves. With option 2 you still copy the files, because DevTrace never writes to another
  repository.

GitHub caches README images, so a new version can take a few minutes to show.

## Tokens and permissions

- The workflow uses the built-in `GITHUB_TOKEN`, passed to the sync step only, with `contents:
write`. It reads public data and needs no secret from you.
- A personal access token is **not** required, and DevTrace never asks for one. If you run `pnpm
sync:github` locally you may set `GITHUB_TOKEN` in your shell to raise the rate limit; it is read
  from the environment, never stored and never printed. Do not put a token in any file of the
  project.
- DevTrace reads public repositories only. It cannot see private ones, and they never appear in the
  files.

## Common problems

| Problem                               | Cause and fix                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| The image does not show               | The repository is private, or the path is wrong. Raw URLs work only for public repositories.                            |
| The image is old                      | GitHub caches it for a few minutes. Reload later, or check that the workflow committed a new file.                      |
| `developer-activity.svg` is missing   | `data/developer-activity.json` does not exist. Create it with `{ "version": 1 }` and run `pnpm generate` again.         |
| The activity dashboard has no heatmap | `collect.commitActivity` is off in `data/github.json`, or GitHub had not computed the statistics yet. Sync again later. |
| The workflow cannot push              | The branch is protected. Allow the Actions bot to push, or generate the files locally.                                  |
| The scheduled run stopped             | GitHub disables scheduled workflows after 60 days without repository activity. Run it once to re-enable it.             |

More messages and fixes are in [troubleshooting](troubleshooting.md).
