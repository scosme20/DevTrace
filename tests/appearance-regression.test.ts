import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateAiEngineeringConfig } from "../src/core/ai-engineering-validation.js";
import { validateStartupConfig } from "../src/core/validation.js";
import { renderAiScenario, renderStartupScenario } from "./golden-scenarios.js";

// The golden files were produced by the 0.4.0 renderers, before the appearance
// system existed. A configuration that does not mention appearance must keep
// producing them byte for byte, so existing users see no change.

const golden = (name: string) =>
  readFile(path.join(process.cwd(), "tests", "golden", name), "utf8");

describe("default appearance matches 0.4.0", () => {
  it.each(["DARK", "LIGHT"] as const)("renders the startup card unchanged (%s)", async (theme) => {
    expect(renderStartupScenario({ theme })).toBe(
      await golden(`startup-${theme.toLowerCase()}.svg`),
    );
  });

  it.each(["DARK", "LIGHT"] as const)(
    "renders the AI engineering card unchanged (%s)",
    async (theme) => {
      expect(renderAiScenario({ theme })).toBe(await golden(`ai-${theme.toLowerCase()}.svg`));
    },
  );

  it("renders the same card when the defaults are written out explicitly", async () => {
    const explicit = {
      layout: "DEFAULT",
      typography: {
        fontFamily: "SYSTEM",
        titleSize: 20,
        bodySize: 13,
        labelSize: 12,
        fontWeight: 600,
      },
      dimensions: { width: 560, padding: 28, spacing: 24, radius: 10 },
      showTitle: true,
      showSummary: true,
      showDescriptions: false,
      showFooter: true,
    };
    expect(renderStartupScenario({ theme: "DARK", ...explicit })).toBe(
      await golden("startup-dark.svg"),
    );
    expect(renderAiScenario({ theme: "LIGHT", ...explicit })).toBe(await golden("ai-light.svg"));
  });

  it("renders the same card when the theme's own colors are written out explicitly", async () => {
    const colors = {
      background: "#0D1117",
      surface: "#161B22",
      border: "#30363D",
      text: "#F0F6FC",
      secondaryText: "#C9D1D9",
      mutedText: "#8B949E",
      primary: "#58A6FF",
      success: "#3FB950",
      warning: "#D29922",
      error: "#F85149",
    };
    const svg = renderStartupScenario({ theme: "DARK", colors });
    // The track is derived when surface colors are overridden, so only it may differ.
    const withoutTrack = (value: string) =>
      value.replace(/#[0-9a-f]{6}(?="\/><rect[^>]*fill="#58a6ff")/g, "TRACK");
    expect(withoutTrack(svg)).toBe(withoutTrack(await golden("startup-dark.svg")));
  });
});

describe("configurations written for earlier versions", () => {
  const oldStartup = {
    version: 1,
    profile: { displayName: "Developer Portfolio" },
    settings: {
      theme: "DARK",
      showProjectList: true,
      showLifecycleDistribution: true,
      showLinks: true,
    },
    projects: [],
  };

  it("are still valid and are not given appearance fields", () => {
    const result = validateStartupConfig(oldStartup);
    expect(result.ok).toBe(true);
    expect(result.ok && Object.keys(result.value.settings).sort()).toEqual([
      "showLifecycleDistribution",
      "showLinks",
      "showProjectList",
      "theme",
    ]);
  });

  it("accept the minimal 0.2.0 shape with no settings at all", () => {
    const result = validateStartupConfig({ version: 1, projects: [] });
    expect(result.ok && result.value.settings).toEqual({
      theme: "DARK",
      showProjectList: true,
      showLifecycleDistribution: true,
      showLinks: true,
    });
  });

  it("accept an AI engineering configuration of 0.3.0", () => {
    const result = validateAiEngineeringConfig({
      version: 1,
      settings: { theme: "LIGHT", showActivity: true },
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.settings.theme).toBe("LIGHT");
    expect(result.ok && "layout" in result.value.settings).toBe(false);
    expect(result.ok && "colors" in result.value.settings).toBe(false);
  });
});
