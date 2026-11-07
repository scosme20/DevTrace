import { DevTraceError } from "../core/result.js";

const DEFAULT_BASE_URL = "https://api.github.com";
const API_VERSION = "2022-11-28";
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const MAX_ERROR_MESSAGE_LENGTH = 200;

export type GitHubErrorKind =
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "http"
  | "network"
  | "timeout"
  | "invalid_response";

const HINTS: Partial<Record<GitHubErrorKind, string>> = {
  rate_limited: "Try again after the reset time, or set GITHUB_TOKEN to raise the limit.",
  unauthorized:
    "Check that GITHUB_TOKEN is valid and has not expired, or unset it to read public data without a token.",
  forbidden:
    "The repository may be blocked or restricted. Remove it from repositories.include, or add it to repositories.exclude.",
  network: "Check your internet connection and try again.",
  timeout: "Check your internet connection and try again.",
};

export class GitHubApiError extends DevTraceError {
  readonly kind: GitHubErrorKind;
  readonly status: number | undefined;

  constructor(
    kind: GitHubErrorKind,
    message: string,
    options: { status?: number | undefined; cause?: unknown } = {},
  ) {
    super(message, {
      ...(options.cause === undefined ? {} : { cause: options.cause }),
      hint: HINTS[kind],
    });
    this.name = "GitHubApiError";
    this.kind = kind;
    this.status = options.status;
  }
}

export interface GitHubClientOptions {
  /** Optional. Sent only to the API host, and never logged or put in errors. */
  readonly token?: string | undefined;
  readonly userAgent: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  /** Total tries per request, including the first one. */
  readonly maxAttempts?: number;
  readonly retryBaseDelayMs?: number;
  /** Longest wait accepted for a retry or a rate limit reset. Longer waits fail. */
  readonly maxWaitMs?: number;
  readonly maxPages?: number;
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

export interface GitHubClient {
  /** GET a JSON document. */
  getJson(path: string): Promise<unknown>;
  /** GET every page of a list endpoint and return the concatenated items. */
  getAllPages(path: string): Promise<unknown[]>;
}

interface Page {
  readonly body: unknown;
  readonly nextUrl: string | undefined;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseNextLink(header: string | null): string | undefined {
  if (header === null) return undefined;
  for (const part of header.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (match?.[1] !== undefined) return match[1];
  }
  return undefined;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "message" in body) {
      const { message } = body;
      if (typeof message === "string") {
        return message.replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_MESSAGE_LENGTH);
      }
    }
  } catch {
    // The status code alone is enough context when the body is not JSON.
    return "";
  }
  return "";
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/**
 * Read-only GitHub REST client. It only issues GET requests, so it cannot
 * create or change anything on GitHub.
 */
export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const baseUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxAttempts = options.maxAttempts ?? 3;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
  const maxWaitMs = options.maxWaitMs ?? 60_000;
  const maxPages = options.maxPages ?? 20;
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const token = options.token === undefined || options.token === "" ? undefined : options.token;

  function headers(): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": options.userAgent,
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    };
  }

  function backoff(attempt: number): number {
    return retryBaseDelayMs * 2 ** (attempt - 1);
  }

  function rateLimitWait(response: Response, attempt: number): number {
    const retryAfter = Number(response.headers.get("retry-after"));
    if (response.headers.get("retry-after") !== null && Number.isFinite(retryAfter)) {
      return Math.ceil(retryAfter * 1000);
    }
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    if (response.headers.get("x-ratelimit-remaining") === "0" && Number.isFinite(reset)) {
      return Math.max(0, reset * 1000 - now());
    }
    return backoff(attempt);
  }

  function isRateLimited(response: Response, message: string): boolean {
    if (response.status === 429) return true;
    if (response.status !== 403) return false;
    return (
      response.headers.get("retry-after") !== null ||
      response.headers.get("x-ratelimit-remaining") === "0" ||
      /rate limit/i.test(message)
    );
  }

  function rateLimitError(response: Response, waitMs: number): GitHubApiError {
    const minutes = Math.max(1, Math.ceil(waitMs / 60_000));
    const hint = token === undefined ? " Set GITHUB_TOKEN to raise the limit." : "";
    return new GitHubApiError(
      "rate_limited",
      `GitHub API rate limit exceeded; it resets in about ${String(minutes)} minute(s).${hint}`,
      { status: response.status },
    );
  }

  async function request(url: string): Promise<{ body: unknown; headers: Headers }> {
    for (let attempt = 1; ; attempt += 1) {
      const isLastAttempt = attempt >= maxAttempts;

      let response: Response;
      try {
        response = await doFetch(url, {
          headers: headers(),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        const timedOut = isTimeout(cause);
        if (!isLastAttempt) {
          await sleep(backoff(attempt));
          continue;
        }
        throw new GitHubApiError(
          timedOut ? "timeout" : "network",
          timedOut
            ? `GitHub API request timed out after ${String(timeoutMs)} ms (${String(attempt)} attempts).`
            : `GitHub API request failed (${String(attempt)} attempts).`,
          { cause },
        );
      }

      if (response.ok) {
        try {
          return { body: await response.json(), headers: response.headers };
        } catch (cause) {
          throw new GitHubApiError("invalid_response", "GitHub API returned invalid JSON.", {
            status: response.status,
            cause,
          });
        }
      }

      const message = await readErrorMessage(response);
      const detail = message === "" ? "" : `: ${message}`;

      if (isRateLimited(response, message)) {
        const waitMs = rateLimitWait(response, attempt);
        if (waitMs > maxWaitMs) throw rateLimitError(response, waitMs);
        if (isLastAttempt) throw rateLimitError(response, waitMs);
        await sleep(waitMs);
        continue;
      }
      if (RETRYABLE_STATUSES.has(response.status) && !isLastAttempt) {
        await sleep(backoff(attempt));
        continue;
      }

      const status = response.status;
      if (status === 404) {
        throw new GitHubApiError("not_found", `GitHub resource not found (404)${detail}`, {
          status,
        });
      }
      if (status === 401) {
        throw new GitHubApiError(
          "unauthorized",
          "GitHub rejected the credentials (401). Check GITHUB_TOKEN.",
          { status },
        );
      }
      if (status === 403) {
        throw new GitHubApiError("forbidden", `GitHub denied the request (403)${detail}`, {
          status,
        });
      }
      throw new GitHubApiError(
        "http",
        `GitHub API request failed with HTTP ${String(status)}${detail} (${String(attempt)} attempts).`,
        { status },
      );
    }
  }

  function resolve(path: string): string {
    const url = new URL(path, baseUrl);
    if (url.origin !== baseUrl.origin) {
      throw new GitHubApiError("invalid_response", "Refusing to call a different host.");
    }
    return url.toString();
  }

  async function getPage(url: string): Promise<Page> {
    const { body, headers: responseHeaders } = await request(url);
    return { body, nextUrl: parseNextLink(responseHeaders.get("link")) };
  }

  return {
    async getJson(path) {
      return (await request(resolve(path))).body;
    },

    async getAllPages(path) {
      const separator = path.includes("?") ? "&" : "?";
      let url: string | undefined = resolve(`${path}${separator}per_page=100`);
      const items: unknown[] = [];
      for (let page = 1; url !== undefined; page += 1) {
        if (page > maxPages) {
          throw new GitHubApiError(
            "invalid_response",
            `GitHub API returned more than ${String(maxPages)} pages; refusing to continue.`,
          );
        }
        const { body, nextUrl } = await getPage(url);
        if (!Array.isArray(body)) {
          throw new GitHubApiError("invalid_response", "Expected a list from the GitHub API.");
        }
        items.push(...(body as unknown[]));
        // `resolve` rejects other hosts, so the token never leaves the API origin.
        url = nextUrl === undefined ? undefined : resolve(nextUrl);
      }
      return items;
    },
  };
}
