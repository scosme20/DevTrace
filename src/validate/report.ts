export type Level = "error" | "warning";

export interface Finding {
  readonly level: Level;
  readonly message: string;
  /** How to fix it. Never applied automatically. */
  readonly hint?: string | undefined;
}

export type Status = "valid" | "invalid" | "skipped";

export interface FileReport {
  readonly target: "startup" | "ai" | "activity" | "github";
  /** Path relative to the project directory. */
  readonly file: string;
  readonly status: Status;
  /** What the configuration contains and what would be generated from it. */
  readonly summary: readonly string[];
  readonly findings: readonly Finding[];
}

export interface ValidationReport {
  readonly files: readonly FileReport[];
  readonly errors: number;
  readonly warnings: number;
}

export function summarize(files: readonly FileReport[]): ValidationReport {
  const all = files.flatMap((file) => file.findings);
  return {
    files,
    errors: all.filter((finding) => finding.level === "error").length,
    warnings: all.filter((finding) => finding.level === "warning").length,
  };
}

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? "" : "s"}`;

const STATUS_TAG: Readonly<Record<Status, string>> = {
  valid: "[ok]     ",
  invalid: "[invalid]",
  skipped: "[skipped]",
};

/** The report as lines of plain text, in a layout that works in any terminal. */
export function formatReport(report: ValidationReport): string[] {
  const lines: string[] = [];
  for (const file of report.files) {
    lines.push(file.file);
    const summary = file.summary;
    lines.push(`  ${STATUS_TAG[file.status]} ${summary[0] ?? ""}`.trimEnd());
    for (const line of summary.slice(1)) lines.push(`            ${line}`);
    for (const finding of file.findings) {
      lines.push(`  [${finding.level}] ${finding.message}`);
      if (finding.hint !== undefined) lines.push(`            Hint: ${finding.hint}`);
    }
    lines.push("");
  }
  const verdict =
    report.errors === 0 ? "The configuration is valid." : "The configuration has errors.";
  lines.push(
    `Result: ${plural(report.errors, "error")}, ${plural(report.warnings, "warning")}. ${verdict}`,
  );
  return lines;
}
