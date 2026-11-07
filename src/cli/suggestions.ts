// Suggestions only explain how to fix a problem. Nothing here changes a file:
// DevTrace never corrects a configuration on its own.

/** Number of single-character edits needed to turn `a` into `b`. */
export function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j] ?? 0;
      previous[j] = Math.min(
        above + 1,
        (previous[j - 1] ?? 0) + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length] ?? 0;
}

/** The candidate closest to `input`, if it is close enough to be a likely typo. */
export function closestMatch(input: string, candidates: readonly string[]): string | undefined {
  const lower = input.toLowerCase();
  let best: { candidate: string; distance: number } | undefined;
  for (const candidate of candidates) {
    const distance = editDistance(lower, candidate.toLowerCase());
    if (best === undefined || distance < best.distance) best = { candidate, distance };
  }
  const allowed = Math.max(2, Math.floor(input.length / 3));
  return best !== undefined && best.distance <= allowed ? best.candidate : undefined;
}

const ENUM_ERROR = /Invalid ([^:]+): (.*)\. Expected one of (.+)\.$/;

const PATTERNS: readonly [RegExp, string][] = [
  [
    /Invalid color/,
    'Write colors as hexadecimal values such as "#58a6ff" or "#fff". Names such as "red" and functions such as rgb() are not supported.',
  ],
  [/Malformed URL/, 'Use an absolute http(s) URL such as "https://example.com".'],
  [/Invalid date/, 'Use ISO 8601, for example "2026-01-31".'],
  [
    /Unrecognized keys?:/,
    "Check the spelling of the field, or remove it. Unknown fields are rejected so that typos are not silently ignored.",
  ],
  [/Duplicate .* ID detected/, "IDs must be unique within their list. Rename one of them."],
  [
    /Unknown (tool|project|model) ID referenced/,
    'Add an entry with that "id", or fix the reference.',
  ],
  [/Unsupported (configuration|snapshot) version/, 'Set "version" to 1.'],
  [
    /Invalid id\. Use lowercase kebab-case/,
    'Use lowercase letters, digits and single hyphens, for example "my-app".',
  ],
  [
    /Invalid GitHub username/,
    "GitHub usernames use letters, digits and single hyphens, up to 39 characters.",
  ],
  [/Invalid GitHub repository/, 'Write it as "owner/name", for example "octocat/Hello-World".'],
  [
    /Invalid repository\. Expected name or owner\/name/,
    'Use "name" for one of your repositories, or "owner/name".',
  ],
  [
    /OBSERVED metrics must name a source/,
    'Add a "source", or use "DECLARED" if you entered the value yourself.',
  ],
  [/Invalid cost unit/, 'Use an ISO 4217 currency code such as "USD".'],
  [/must not be empty/, "Provide a non-empty value."],
  [
    /(?:^Required\.$|expected \w+, received undefined)/,
    "Add this field. See docs/configuration.md for the required fields.",
  ],
  [/expected (\w+), received (\w+)/, "Use a value of the expected type."],
];

/** One line of advice for a configuration error, when there is something useful to say. */
export function suggestFix(error: string): string | undefined {
  const enumMatch = ENUM_ERROR.exec(error);
  if (enumMatch !== null) {
    const input = enumMatch[2] ?? "";
    const values = (enumMatch[3] ?? "").split(", ");
    const close = closestMatch(input, values);
    if (close === undefined) return undefined;
    return close === input
      ? undefined
      : close.toLowerCase() === input.toLowerCase()
        ? `Did you mean "${close}"? Values are case sensitive in configuration files.`
        : `Did you mean "${close}"?`;
  }
  return PATTERNS.find(([pattern]) => pattern.test(error))?.[1];
}
