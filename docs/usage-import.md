# Importing token usage from local logs

`devtrace import usage` reads the token usage that **Claude Code** and **Codex** keep in log files on
your own computer, and turns it into the numbers of the Token Economics panel of the
[AI Engineering Dashboard](ai-engineering-dashboard.md): tokens per model, and the cache hit rate.
Nothing is typed by hand, and nothing is estimated.

## Run it

```bash
pnpm dev import usage                 # last 30 days, both tools
pnpm dev import usage --source codex  # one tool: claude, codex or all
pnpm dev import usage --days 90
pnpm dev import usage --since 2026-03-01 --until 2026-03-31
```

It prints what it read and writes `data/usage-snapshot.json`: model names and token totals for **one
period**. It reads files and uses no network.

Then turn the numbers on in `data/ai-engineering.json`, and generate:

```json
{ "settings": { "dashboard": true, "usageSnapshot": true, "showTokenUsage": true } }
```

```bash
pnpm generate:ai
```

`usageSnapshot` adds the imported models and numbers to the dashboard; `showTokenUsage` is the
existing switch that shows token usage at all. Both are off by default, so nothing is published
unless you choose to.

The snapshot also holds the tokens of each week (Monday to Sunday, input plus output of every
model). Set `"showTokenTrend": true` to draw them as a trend panel. Weeks cut by the period are
shown in gray, and the change between the last 4 weeks and the 4 before needs 8 complete weeks:
with less, the panel says so instead of showing a number. Snapshots made before this field existed
still work; run the import again to get it.

## Where it reads

| Tool        | Folder               | Changed by          |
| ----------- | -------------------- | ------------------- |
| Claude Code | `~/.claude/projects` | `CLAUDE_CONFIG_DIR` |
| Codex       | `~/.codex/sessions`  | `CODEX_HOME`        |

Only files ending in `.jsonl` in those folders are read. A tool that is not installed is skipped.

## What it reads, and what it never does

From each log entry it keeps **the model name, the time and the token counts**. It does not keep, and
the snapshot cannot hold, message text, file paths, project names or session identifiers. The snapshot
is validated on load and rejects any other field. Nothing leaves your machine.

## How the numbers are defined

- **Claude Code** writes each response several times, so a response (message id and request id) is
  counted once, using its final line. Input tokens are the three input counters added together
  (new input, cache creation and cache read); **cached** tokens are the cache reads.
- **Codex** reports a running total after each call. A call's usage is the difference between two
  totals, attributed to the model of that turn. Input already includes the cached part.
- **Total** is input plus output. The cache hit is cached input divided by input, per model, for the
  period, so it is a real ratio with a real denominator.

Each number is `OBSERVED` and names its source ("Claude Code local logs", "Codex local logs").

## Things to know

- **Large numbers are normal.** Every turn of an agent re-reads its whole context, mostly from the
  cache, so input totals are far larger than what you typed. That is why the cache hit is high.
- **Only what the logs hold.** If a tool deletes old logs, or you use it on another computer, those
  tokens are not here. The dashboard shows the period it covers.
- **Not cost.** Token counts are not money, and DevTrace converts nothing into a price.
- **One period.** Models are compared only inside one shared period, as the shares require. Declared
  token entries with other periods are listed but do not take part in the shares.
- **Keeping the result stable.** The logs exist only on your machine, so a GitHub Actions run cannot
  read them. If your workflow regenerates the SVGs, commit `data/usage-snapshot.json` too (it holds
  only model names and token totals); otherwise the scheduled run would draw the dashboard without
  these numbers. Re-run the import when you want fresh numbers.
