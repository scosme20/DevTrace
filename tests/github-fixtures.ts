import type { GitHubClient } from "../src/github/client.js";
import type { GitHubRepository, GitHubSnapshot } from "../src/core/github-models.js";

type Overrides = Record<string, unknown>;

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

export function notFound(): Response {
  return jsonResponse({ message: "Not Found" }, { status: 404 });
}

export interface RecordedCall {
  readonly url: URL;
  readonly headers: Headers;
  readonly method: string | undefined;
}

/** A fetch replacement that records every call. No test touches the network. */
export function mockFetch(handler: (call: RecordedCall) => Response | Promise<Response>): {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  return {
    calls,
    fetch: async (input, init) => {
      const call: RecordedCall = {
        url: new URL(typeof input === "string" || input instanceof URL ? input : input.url),
        headers: new Headers(init?.headers),
        method: init?.method,
      };
      calls.push(call);
      return handler(call);
    },
  };
}

/** Answers by URL path. Unknown paths answer 404, like GitHub does. */
export function routedFetch(routes: Record<string, () => Response>) {
  return mockFetch((call) => routes[call.url.pathname]?.() ?? notFound());
}

export function makeRepoResponse(overrides: Overrides = {}): Record<string, unknown> {
  return {
    full_name: "octo/app",
    name: "app",
    description: "An example application.",
    language: "TypeScript",
    stargazers_count: 12,
    forks_count: 3,
    archived: false,
    fork: false,
    private: false,
    created_at: "2025-01-01T00:00:00Z",
    pushed_at: "2026-10-01T00:00:00Z",
    html_url: "https://github.com/octo/app",
    ...overrides,
  };
}

export function makeReleaseResponse(overrides: Overrides = {}): Record<string, unknown> {
  return {
    tag_name: "v1.2.0",
    name: "Version 1.2.0",
    published_at: "2026-10-01T10:00:00Z",
    draft: false,
    ...overrides,
  };
}

export function makeRepository(overrides: Partial<GitHubRepository> = {}): GitHubRepository {
  return {
    fullName: "octo/app",
    name: "app",
    url: "https://github.com/octo/app",
    description: "An example application.",
    language: "TypeScript",
    stars: 12,
    forks: 3,
    archived: false,
    fork: false,
    createdAt: "2025-01-01T00:00:00Z",
    latestRelease: { tagName: "v1.2.0", publishedAt: "2026-10-01T10:00:00Z" },
    provenance: "OBSERVED",
    ...overrides,
  };
}

export function makeSnapshot(
  repositories: readonly GitHubRepository[] = [makeRepository()],
  overrides: Partial<GitHubSnapshot> = {},
): GitHubSnapshot {
  return {
    version: 1,
    source: "GitHub REST API",
    username: "octo",
    fetchedAt: "2026-11-07T12:00:00.000Z",
    repositories,
    ...overrides,
  };
}

/** A GitHub client stub for code that does not need HTTP behavior. */
export function fakeClient(handlers: {
  getJson?: (path: string) => unknown;
  getAllPages?: (path: string) => unknown[];
}): GitHubClient {
  return {
    getJson: (path) => Promise.resolve(handlers.getJson?.(path)),
    getAllPages: (path) => Promise.resolve(handlers.getAllPages?.(path) ?? []),
  };
}

export function recordingSleep(): { sleep: (ms: number) => Promise<void>; waits: number[] } {
  const waits: number[] = [];
  return {
    waits,
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  };
}
