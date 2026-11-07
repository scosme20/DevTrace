import { describe, expect, it } from "vitest";
import { GitHubApiError } from "../src/github/client.js";
import { mapRelease, mapRepository, sanitizeText } from "../src/github/mapping.js";
import {
  fetchLatestRelease,
  fetchRepository,
  listUserRepositories,
  type ReleaseResponse,
  type RepositoryResponse,
} from "../src/github/repositories.js";
import type { GitHubCollectSettings } from "../src/core/github-models.js";
import {
  fakeClient,
  jsonResponse,
  makeReleaseResponse,
  makeRepoResponse,
  notFound,
} from "./github-fixtures.js";

const everything: GitHubCollectSettings = {
  description: true,
  language: true,
  stars: true,
  forks: true,
  releases: true,
};

const repo = (overrides: Record<string, unknown> = {}) =>
  makeRepoResponse(overrides) as unknown as RepositoryResponse;
const release = (overrides: Record<string, unknown> = {}) =>
  makeReleaseResponse(overrides) as unknown as ReleaseResponse;

describe("sanitizeText", () => {
  it("removes control characters and collapses whitespace", () => {
    expect(sanitizeText("  a\u0000b\u0007\n\n c\t d  ", 50)).toBe("a b c d");
  });

  it("returns undefined for empty or whitespace-only text", () => {
    expect(sanitizeText("   \n\t ", 50)).toBeUndefined();
  });

  it("truncates long text with an ellipsis", () => {
    expect(sanitizeText("abcdefghij", 5)).toBe("abcd…");
  });

  it("keeps markup as plain text; escaping happens when the SVG is written", () => {
    expect(sanitizeText("<script>alert(1)</script>", 50)).toBe("<script>alert(1)</script>");
  });
});

describe("mapRepository", () => {
  it("maps every collected field and marks the data as OBSERVED", () => {
    expect(mapRepository(repo(), everything, mapRelease(release()))).toEqual({
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
      pushedAt: "2026-10-01T00:00:00Z",
      latestRelease: {
        tagName: "v1.2.0",
        name: "Version 1.2.0",
        publishedAt: "2026-10-01T10:00:00Z",
      },
      provenance: "OBSERVED",
    });
  });

  it("rebuilds the URL instead of trusting the API", () => {
    const mapped = mapRepository(repo({ html_url: "https://evil.example/phish" }), everything);
    expect(mapped.url).toBe("https://github.com/octo/app");
  });

  it("omits fields that are not collected", () => {
    const mapped = mapRepository(
      repo(),
      { description: false, language: false, stars: false, forks: false, releases: false },
      mapRelease(release()),
    );
    expect(mapped).not.toHaveProperty("description");
    expect(mapped).not.toHaveProperty("language");
    expect(mapped).not.toHaveProperty("stars");
    expect(mapped).not.toHaveProperty("forks");
    expect(mapped).not.toHaveProperty("latestRelease");
    expect(mapped.provenance).toBe("OBSERVED");
  });

  it("handles missing optional data", () => {
    const mapped = mapRepository(
      repo({ description: null, language: null, pushed_at: null }),
      everything,
    );
    expect(mapped).not.toHaveProperty("description");
    expect(mapped).not.toHaveProperty("language");
    expect(mapped).not.toHaveProperty("pushedAt");
    expect(mapped).not.toHaveProperty("latestRelease");
  });

  it("sanitizes the description", () => {
    const mapped = mapRepository(
      repo({ description: `Line one\nLine\u0000 two ${"x".repeat(300)}` }),
      everything,
    );
    expect(Array.from(mapped.description ?? "").every((char) => char.charCodeAt(0) > 31)).toBe(
      true,
    );
    expect(Array.from(mapped.description ?? "").length).toBeLessThanOrEqual(200);
  });
});

describe("mapRelease", () => {
  it("maps a published release", () => {
    expect(mapRelease(release())).toEqual({
      tagName: "v1.2.0",
      name: "Version 1.2.0",
      publishedAt: "2026-10-01T10:00:00Z",
    });
  });

  it("ignores drafts and releases without a publication date", () => {
    expect(mapRelease(release({ draft: true }))).toBeUndefined();
    expect(mapRelease(release({ published_at: null }))).toBeUndefined();
  });

  it("omits an empty release name", () => {
    expect(mapRelease(release({ name: null }))).not.toHaveProperty("name");
  });
});

describe("response validation", () => {
  it("rejects a repository response with the wrong shape", async () => {
    const client = fakeClient({ getJson: () => makeRepoResponse({ stargazers_count: "many" }) });
    const error = await fetchRepository(client, "octo/app").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect((error as GitHubApiError).kind).toBe("invalid_response");
    expect((error as GitHubApiError).message).toContain("repository octo/app");
    expect((error as GitHubApiError).message).toContain("stargazers_count");
  });

  it("rejects a repository response with missing fields", async () => {
    const client = fakeClient({ getJson: () => ({ full_name: "octo/app" }) });
    await expect(fetchRepository(client, "octo/app")).rejects.toThrow("Unexpected GitHub response");
  });

  it("ignores fields DevTrace does not read", async () => {
    const client = fakeClient({ getJson: () => makeRepoResponse({ brand_new_field: { a: 1 } }) });
    expect((await fetchRepository(client, "octo/app")).full_name).toBe("octo/app");
  });

  it("validates every item of a list", async () => {
    const client = fakeClient({ getAllPages: () => [makeRepoResponse(), { nope: true }] });
    await expect(listUserRepositories(client, "octo")).rejects.toThrow("repositories of octo");
  });

  it("requests the public repositories endpoint of the user, never the authenticated one", async () => {
    const paths: string[] = [];
    const client = fakeClient({
      getAllPages: (path) => {
        paths.push(path);
        return [];
      },
    });
    await listUserRepositories(client, "octo");
    expect(paths[0]).toMatch(/^\/users\/octo\/repos\?/);
    expect(paths[0]).not.toContain("/user/repos");
  });

  it("encodes path segments", async () => {
    const paths: string[] = [];
    const client = fakeClient({
      getJson: (path) => {
        paths.push(path);
        return makeRepoResponse();
      },
    });
    await fetchRepository(client, "octo/a b");
    expect(paths[0]).toBe("/repos/octo/a%20b");
  });

  it("treats a repository without releases as no release", async () => {
    const client = {
      getJson: () => Promise.reject(new GitHubApiError("not_found", "Not Found", { status: 404 })),
      getAllPages: () => Promise.resolve([]),
    };
    expect(await fetchLatestRelease(client, "octo/app")).toBeUndefined();
  });

  it("does not hide other release errors", async () => {
    const client = {
      getJson: () => Promise.reject(new GitHubApiError("http", "boom", { status: 500 })),
      getAllPages: () => Promise.resolve([]),
    };
    await expect(fetchLatestRelease(client, "octo/app")).rejects.toThrow("boom");
  });

  it("keeps helper responses well-formed", async () => {
    expect(await jsonResponse({ a: 1 }).json()).toEqual({ a: 1 });
    expect(notFound().status).toBe(404);
  });
});
