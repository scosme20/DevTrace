export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

export interface DevTraceErrorOptions extends ErrorOptions {
  /** What the user can do about it. Shown below the message by the command line. */
  readonly hint?: string | undefined;
}

export class DevTraceError extends Error {
  readonly hint: string | undefined;

  constructor(message: string, options?: DevTraceErrorOptions) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "DevTraceError";
    this.hint = options?.hint;
  }
}

/** Joins an error and its causes so technical context survives wrapping. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const lines = [error.message];
  let cause: unknown = error.cause;
  while (cause !== undefined) {
    lines.push(`Caused by: ${cause instanceof Error ? cause.message : JSON.stringify(cause)}`);
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return lines.join("\n");
}
