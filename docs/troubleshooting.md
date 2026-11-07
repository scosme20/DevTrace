# Troubleshooting

Add `--verbose` to any command to see every cause and the stack trace. Without it, DevTrace shows
what went wrong and what to do about it.

## Validation errors

```text
data/startup.json
  [invalid] 2 problems found.
  [error] projects[0].id: Invalid id. Use lowercase kebab-case.
            Hint: Use lowercase letters, digits and single hyphens, for example "my-app".
  [error] projects[0]: Unrecognized key: "theme"
            Hint: Check the spelling of the field, or remove it. Unknown fields are rejected so that typos are not silently ignored.
```

Each error starts with the path of the field (`projects[0].id` is the first project's `id`).
DevTrace never fixes a file for you. Edit it, then run `devtrace validate` again.

## Common problems

| Message                                                | Cause and fix                                                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `Configuration file not found: ...data/startup.json`   | The file does not exist. Run `devtrace init`, or run the command from the project root.              |
| `Configuration file is not valid JSON`                 | A syntax error such as a trailing comma or a missing quote. The message includes the position.       |
| `Unrecognized key: "..."`                              | A typo, or a field that does not exist. Fields are listed in [data-model](data-model.md).            |
| `Invalid --theme value: "NEON". Expected one of: ...`  | Use one of the listed values. Values are not case sensitive. Exit code `2`.                          |
| `Unknown command: "generat". Did you mean "generate"?` | A typo in the command. Exit code `2`.                                                                |
| `--output cannot be used with the target "all"`        | `all` writes two files. Generate one indicator at a time to choose its file name.                    |
| `Low contrast: text ... is 1.1:1`                      | A warning, not an error: your custom colors are hard to read. See [customization](customization.md). |
| `Dimensions leave only ...px of content`               | `dimensions.width` minus twice the padding must be at least 280 px.                                  |

## The card is empty

`validate` warns when there is nothing to show. Check that entries are not `PRIVATE`, and that the
settings that switch sections on (`showProjectList`, `showTools`, `showActivity`, ...) are enabled.
Token usage and cost are off by default.

## GitHub sync problems

| Symptom                                                           | What to do                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GitHub integration is not configured`                            | `data/github.json` does not exist. The integration is optional; create it from `examples/github.json`. |
| `GitHub API rate limit exceeded; it resets in about N minute(s).` | Try again after that time, or set `GITHUB_TOKEN` to raise the limit.                                   |
| A repository is unavailable                                       | It does not exist or is not public. With `onUnavailable: "SKIP"` it is skipped with a warning.         |

If a sync fails, the previous `data/github-snapshot.json` is kept and the SVG files are not touched.
`devtrace generate` never uses the network.

## The README still shows the old image

GitHub caches images embedded in READMEs, so a new version can take a few minutes to appear. Check
that the SVG file was committed and pushed.

## Environment

DevTrace needs Node.js 22 or newer (`node --version`) and pnpm 9. If `pnpm install` fails, check
both versions first.
