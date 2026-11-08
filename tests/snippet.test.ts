import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";
import { buildSnippet } from "../src/cli/snippet.js";

const ALL = ["startup-stats.svg", "ai-engineering-stats.svg", "developer-activity.svg"];

describe("buildSnippet", () => {
  it("writes one block for each indicator that exists", () => {
    const text = buildSnippet({
      repository: "me/profile-data",
      pair: false,
      files: ["startup-stats.svg", "notes.txt"],
    }).join("\n");
    expect(text).toContain(
      "https://raw.githubusercontent.com/me/profile-data/HEAD/public/indicators/startup-stats.svg",
    );
    expect(text).not.toContain("ai-engineering");
    expect(text).not.toContain("notes.txt");
    expect(text).toContain('alt="Startup & SaaS Dashboard"');
  });

  it("uses a picture element for the dark and light pair, with the light file as the image", () => {
    const text = buildSnippet({
      repository: "me/profile-data",
      branch: "main",
      pair: true,
      files: [...ALL, "startup-stats-light.svg"],
    }).join("\n");
    expect(text).toContain("<picture>");
    expect(text).toContain(
      'srcset="https://raw.githubusercontent.com/me/profile-data/main/public/indicators/startup-stats.svg"',
    );
    expect(text).toContain(
      'src="https://raw.githubusercontent.com/me/profile-data/main/public/indicators/startup-stats-light.svg"',
    );
  });

  it("says how to create a light file that does not exist yet, instead of linking a missing one", () => {
    const text = buildSnippet({
      repository: "me/profile-data",
      pair: true,
      files: ["ai-engineering-stats.svg"],
    }).join("\n");
    expect(text).not.toContain('ai-engineering-stats-light.svg"');
    expect(text).toContain(
      "devtrace generate ai --theme LIGHT --output ai-engineering-stats-light.svg",
    );
  });

  it("refuses a malformed repository or branch, and an empty folder", () => {
    expect(() => buildSnippet({ repository: "nope", pair: false, files: ALL })).toThrow(
      "owner/name",
    );
    expect(() =>
      buildSnippet({ repository: "a/b", branch: "x y", pair: false, files: ALL }),
    ).toThrow("--branch");
    expect(() => buildSnippet({ repository: "a/b", pair: false, files: [] })).toThrow(
      "no indicator",
    );
  });
});

describe("devtrace snippet arguments", () => {
  it("reads the options and the flag", () => {
    expect(
      parseArgs(["snippet", "--repo", "a/b", "--branch", "main", "--pair"]).invocation,
    ).toEqual({ kind: "snippet", repository: "a/b", branch: "main", pair: true });
    expect(parseArgs(["snippet"]).invocation).toEqual({
      kind: "snippet",
      repository: undefined,
      branch: undefined,
      pair: false,
    });
  });

  it("rejects options that belong to other commands", () => {
    expect(() => parseArgs(["snippet", "--theme", "DARK"])).toThrow("does not apply");
  });
});
