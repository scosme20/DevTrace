import { z } from "zod";
import type { Result } from "./result.js";

// Building blocks shared by every indicator schema, so validation rules and
// error wording stay identical across indicators.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

export const isoDate = z
  .string()
  .refine((value) => ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)), {
    message: "Invalid date. Expected ISO 8601 such as 2026-01-31.",
  });

// Only http(s) is accepted so javascript: or file: links never reach an SVG.
export const httpUrl = z.string().refine(
  (value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === "https:" || protocol === "http:";
    } catch {
      return false;
    }
  },
  { message: "Malformed URL. Expected an absolute http(s) URL." },
);

export const kebabCaseId = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Invalid id. Use lowercase kebab-case.");

// GitHub usernames: alphanumeric or single hyphens, at most 39 characters.
export const githubUsername = z
  .string()
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/, "Invalid GitHub username.");

export const githubRepoFullName = z
  .string()
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}\/[A-Za-z0-9._-]{1,100}$/,
    "Invalid GitHub repository. Expected owner/name.",
  );

export const requiredText = (field: string) =>
  z.string().trim().min(1, `${field} must not be empty.`);

export function enumField<const T extends readonly [string, ...string[]]>(
  label: string,
  values: T,
) {
  return z.enum(values, {
    error: (issue) =>
      issue.input === undefined
        ? "Required."
        : `Invalid ${label}: ${typeof issue.input === "string" ? issue.input : JSON.stringify(issue.input)}. Expected one of ${values.join(", ")}.`,
  });
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, part) => {
    if (typeof part === "number") return `${acc}[${String(part)}]`;
    return acc ? `${acc}.${String(part)}` : String(part);
  }, "");
}

/** Validates untrusted data and never repairs it: invalid input yields errors. */
export function validateWith<S extends z.ZodType>(schema: S, input: unknown): Result<z.output<S>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  const errors = parsed.error.issues.map((issue) => {
    const path = formatPath(issue.path);
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return { ok: false, errors };
}
