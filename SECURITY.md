# Security Policy

## Supported versions

DevTrace is pre-1.0. Only the latest released version receives security fixes.

## Reporting a vulnerability

Do not open a public issue for a security problem. Report it privately using the **Report a
vulnerability** button on the repository's **Security** tab (GitHub private vulnerability
reporting). Include the DevTrace version, the command you ran and the smallest configuration that
reproduces the problem. Never include a real token.

## Scope and design notes

- DevTrace makes no network requests except the optional, read-only `sync` command to the GitHub
  API. `GITHUB_TOKEN` is read from the environment only and is never written to disk.
- Generated SVG files contain no scripts or remote resources; all text is XML-escaped.
- Indicators are written only inside the indicators directory, with a strict file-name check.
