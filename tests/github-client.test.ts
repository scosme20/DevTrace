import { describe, expect, it } from "vitest";
import {
  GitHubApiError,
  createGitHubClient,
  type GitHubClientOptions,
} from "../src/github/client.js";
import { jsonResponse, mockFetch, recordingSleep, type RecordedCall } from "./github-fixtures.js";

type Handler = (call: RecordedCall) => Response | Promise<Response>;

function setup(handler: Handler, options: Partial<GitHubClientOptions> = {}) {
  const { fetch, calls } = mockFetch(handler);
  const { sleep, waits } = recordingSleep();
  const client = createGitHubClient({
    userAgent: "devtrace/test",
    fetch,
    sleep,
    retryBaseDelayMs: 500,
    ...options,
  });
  return { client, calls, waits };
}

async function errorOf(promise: Promise<unknown>): Promise<GitHubApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GitHubApiError) return error;
    throw error;
  }
  throw new Error("Expected a GitHubApiError.");
}

describe("request basics", () => {
  it("sends the required headers and no credentials without a token", async () => {
    const { client, calls } = setup(() => jsonResponse({ ok: true }));
    expect(await client.getJson("/users/octo")).toEqual({ ok: true });
    const [call] = calls;
    expect(call?.url.href).toBe("https://api.github.com/users/octo");
    expect(call?.headers.get("accept")).toBe("application/vnd.github+json");
    expect(call?.headers.get("x-github-api-version")).toBe("2022-11-28");
    expect(call?.headers.get("user-agent")).toBe("devtrace/test");
    expect(call?.headers.has("authorization")).toBe(false);
  });

  it("sends the token as a bearer credential when configured", async () => {
    const { client, calls } = setup(() => jsonResponse({}), { token: "secret-token" });
    await client.getJson("/users/octo");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer secret-token");
  });

  it("treats an empty token as no token", async () => {
    const { client, calls } = setup(() => jsonResponse({}), { token: "" });
    await client.getJson("/users/octo");
    expect(calls[0]?.headers.has("authorization")).toBe(false);
  });

  it("only issues read-only GET requests", async () => {
    const { client, calls } = setup(() => jsonResponse([]));
    await client.getJson("/a");
    await client.getAllPages("/b");
    expect(calls.every((call) => call.method === undefined)).toBe(true);
  });

  it("refuses to call a different host", async () => {
    const { client, calls } = setup(() => jsonResponse({}), { token: "secret-token" });
    const error = await errorOf(client.getJson("https://evil.example/steal"));
    expect(error.kind).toBe("invalid_response");
    expect(calls).toHaveLength(0);
  });
});

describe("HTTP errors", () => {
  it("reports 404 as not_found without retrying", async () => {
    const { client, calls } = setup(() => jsonResponse({ message: "Not Found" }, { status: 404 }));
    const error = await errorOf(client.getJson("/repos/octo/ghost"));
    expect(error.kind).toBe("not_found");
    expect(error.status).toBe(404);
    expect(error.message).toContain("Not Found");
    expect(calls).toHaveLength(1);
  });

  it("reports 401 as unauthorized without retrying or echoing the token", async () => {
    const { client, calls } = setup(
      () => jsonResponse({ message: "Bad credentials" }, { status: 401 }),
      {
        token: "secret-token",
      },
    );
    const error = await errorOf(client.getJson("/user"));
    expect(error.kind).toBe("unauthorized");
    expect(error.message).toContain("GITHUB_TOKEN");
    expect(error.message).not.toContain("secret-token");
    expect(calls).toHaveLength(1);
  });

  it("reports a plain 403 as forbidden without retrying", async () => {
    const { client, calls } = setup(() => jsonResponse({ message: "Blocked" }, { status: 403 }));
    const error = await errorOf(client.getJson("/repos/octo/blocked"));
    expect(error.kind).toBe("forbidden");
    expect(calls).toHaveLength(1);
  });

  it("does not retry other client errors", async () => {
    const { client, calls } = setup(() => jsonResponse({ message: "Gone" }, { status: 410 }));
    const error = await errorOf(client.getJson("/x"));
    expect(error.kind).toBe("http");
    expect(calls).toHaveLength(1);
  });

  it("rejects a body that is not JSON", async () => {
    const { client } = setup(() => new Response("<html>oops</html>", { status: 200 }));
    expect((await errorOf(client.getJson("/x"))).kind).toBe("invalid_response");
  });

  it("never puts the token in any error", async () => {
    for (const status of [401, 403, 404, 410, 500, 429]) {
      const { client } = setup(() => jsonResponse({ message: "nope" }, { status }), {
        token: "secret-token",
        maxAttempts: 1,
      });
      const error = await errorOf(client.getJson("/x"));
      expect(JSON.stringify([error.message, error.status, error.cause])).not.toContain(
        "secret-token",
      );
    }
  });
});

describe("retries", () => {
  it("retries a transient 5xx and then succeeds, with exponential backoff", async () => {
    let attempts = 0;
    const { client, calls, waits } = setup(() => {
      attempts += 1;
      return attempts < 3 ? jsonResponse({}, { status: 503 }) : jsonResponse({ ok: true });
    });
    expect(await client.getJson("/x")).toEqual({ ok: true });
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([500, 1000]);
  });

  it("gives up after the maximum number of attempts", async () => {
    const { client, calls, waits } = setup(() =>
      jsonResponse({ message: "down" }, { status: 503 }),
    );
    const error = await errorOf(client.getJson("/x"));
    expect(error.kind).toBe("http");
    expect(error.status).toBe(503);
    expect(error.message).toContain("HTTP 503");
    expect(error.message).toContain("3 attempts");
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([500, 1000]);
  });

  it("honors a custom attempt limit", async () => {
    const { client, calls } = setup(() => jsonResponse({}, { status: 502 }), { maxAttempts: 1 });
    await errorOf(client.getJson("/x"));
    expect(calls).toHaveLength(1);
  });

  it("retries a network failure and then succeeds", async () => {
    let attempts = 0;
    const { client, calls } = setup(() => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("fetch failed");
      return jsonResponse({ ok: true });
    });
    expect(await client.getJson("/x")).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it("reports a persistent network failure with its cause", async () => {
    const { client, calls } = setup(() => {
      throw new TypeError("fetch failed");
    });
    const error = await errorOf(client.getJson("/x"));
    expect(error.kind).toBe("network");
    expect(error.cause).toBeInstanceOf(TypeError);
    expect(calls).toHaveLength(3);
  });
});

describe("timeout", () => {
  it("aborts a request that takes too long", async () => {
    const calls: string[] = [];
    const client = createGitHubClient({
      userAgent: "devtrace/test",
      timeoutMs: 20,
      maxAttempts: 1,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          calls.push("started");
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason as Error);
          });
        }),
    });
    const error = await errorOf(client.getJson("/slow"));
    expect(error.kind).toBe("timeout");
    expect(error.message).toContain("timed out after 20 ms");
    expect(calls).toEqual(["started"]);
  });

  it("retries after a timeout", async () => {
    let attempts = 0;
    const { waits, sleep } = recordingSleep();
    const client = createGitHubClient({
      userAgent: "devtrace/test",
      timeoutMs: 20,
      maxAttempts: 2,
      retryBaseDelayMs: 500,
      sleep,
      fetch: (_input, init) => {
        attempts += 1;
        if (attempts === 2) return Promise.resolve(jsonResponse({ ok: true }));
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason as Error);
          });
        });
      },
    });
    expect(await client.getJson("/slow")).toEqual({ ok: true });
    expect(attempts).toBe(2);
    expect(waits).toEqual([500]);
  });
});

describe("rate limits", () => {
  it("waits for Retry-After and then succeeds", async () => {
    let attempts = 0;
    const { client, waits } = setup(() => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ message: "slow down" }, { status: 429, headers: { "retry-after": "2" } })
        : jsonResponse({ ok: true });
    });
    expect(await client.getJson("/x")).toEqual({ ok: true });
    expect(waits).toEqual([2000]);
  });

  it("waits until the reset time when the primary limit is exhausted", async () => {
    let attempts = 0;
    const { client, waits } = setup(
      () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse(
              { message: "API rate limit exceeded" },
              {
                status: 403,
                headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1030" },
              },
            )
          : jsonResponse({ ok: true });
      },
      { now: () => 1_000_000 },
    );
    expect(await client.getJson("/x")).toEqual({ ok: true });
    expect(waits).toEqual([30_000]);
  });

  it("recognizes a secondary rate limit by its message", async () => {
    let attempts = 0;
    const { client, waits } = setup(() => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ message: "You have exceeded a secondary rate limit" }, { status: 403 })
        : jsonResponse({ ok: true });
    });
    expect(await client.getJson("/x")).toEqual({ ok: true });
    expect(waits).toEqual([500]);
  });

  it("fails without sleeping when the reset is further away than the allowed wait", async () => {
    const { client, calls, waits } = setup(
      () =>
        jsonResponse(
          { message: "API rate limit exceeded" },
          { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "4600" } },
        ),
      { now: () => 1_000_000, maxWaitMs: 60_000 },
    );
    const error = await errorOf(client.getJson("/x"));
    expect(error.kind).toBe("rate_limited");
    expect(error.message).toContain("resets in about 60 minute(s)");
    expect(error.message).toContain("GITHUB_TOKEN");
    expect(calls).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("does not suggest a token when one is already configured", async () => {
    const { client } = setup(
      () => jsonResponse({}, { status: 429, headers: { "retry-after": "7200" } }),
      { token: "secret-token" },
    );
    const error = await errorOf(client.getJson("/x"));
    expect(error.kind).toBe("rate_limited");
    expect(error.message).not.toContain("GITHUB_TOKEN");
    expect(error.message).not.toContain("secret-token");
  });

  it("fails when the limit persists through every attempt", async () => {
    const { client, calls } = setup(
      () => jsonResponse({}, { status: 429, headers: { "retry-after": "1" } }),
      { maxAttempts: 2 },
    );
    const error = await errorOf(client.getJson("/x"));
    expect(error.kind).toBe("rate_limited");
    expect(calls).toHaveLength(2);
  });
});

describe("pagination", () => {
  function pagedRoutes(): Handler {
    return (call) => {
      const page = Number(call.url.searchParams.get("page") ?? "1");
      const next = new URL(call.url);
      next.searchParams.set("page", String(page + 1));
      return jsonResponse([`item-${String(page)}a`, `item-${String(page)}b`], {
        headers: page < 3 ? { link: `<${next.href}>; rel="next", <${next.href}>; rel="last"` } : {},
      });
    };
  }

  it("follows Link headers and concatenates every page", async () => {
    const { client, calls } = setup(pagedRoutes());
    const items = await client.getAllPages("/users/octo/repos?type=owner");
    expect(items).toEqual(["item-1a", "item-1b", "item-2a", "item-2b", "item-3a", "item-3b"]);
    expect(calls).toHaveLength(3);
    expect(calls[0]?.url.searchParams.get("per_page")).toBe("100");
    expect(calls[0]?.url.searchParams.get("type")).toBe("owner");
  });

  it("makes a single request when there is no next page", async () => {
    const { client, calls } = setup(() => jsonResponse(["only"]));
    expect(await client.getAllPages("/x")).toEqual(["only"]);
    expect(calls).toHaveLength(1);
  });

  it("refuses a next link on another host so the token cannot leak", async () => {
    const { client, calls } = setup(
      () => jsonResponse(["a"], { headers: { link: '<https://evil.example/next>; rel="next"' } }),
      { token: "secret-token" },
    );
    const error = await errorOf(client.getAllPages("/x"));
    expect(error.kind).toBe("invalid_response");
    expect(calls).toHaveLength(1);
    expect(calls.every((call) => call.url.host === "api.github.com")).toBe(true);
  });

  it("stops when the page limit is exceeded", async () => {
    const { client } = setup(pagedRoutes(), { maxPages: 2 });
    const error = await errorOf(client.getAllPages("/x"));
    expect(error.kind).toBe("invalid_response");
    expect(error.message).toContain("more than 2 pages");
  });

  it("rejects a response that is not a list", async () => {
    const { client } = setup(() => jsonResponse({ not: "a list" }));
    expect((await errorOf(client.getAllPages("/x"))).kind).toBe("invalid_response");
  });

  it("retries a failing page without refetching the earlier ones", async () => {
    let failed = false;
    const { client, calls } = setup((call) => {
      const page = Number(call.url.searchParams.get("page") ?? "1");
      if (page === 2 && !failed) {
        failed = true;
        return jsonResponse({}, { status: 503 });
      }
      const next = new URL(call.url);
      next.searchParams.set("page", String(page + 1));
      return jsonResponse([page], {
        headers: page < 2 ? { link: `<${next.href}>; rel="next"` } : {},
      });
    });
    expect(await client.getAllPages("/x")).toEqual([1, 2]);
    expect(calls.map((call) => call.url.searchParams.get("page"))).toEqual([null, "2", "2"]);
  });
});
