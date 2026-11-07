import { describe, expect, it } from "vitest";
import { element, escapeXml, svgDocument, text, truncate } from "../src/shared/svg.js";

describe("escapeXml", () => {
  it("escapes the five XML special characters", () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;",
    );
  });

  it("removes characters that are illegal in XML", () => {
    expect(escapeXml("a\u0000b\u0008c")).toBe("abc");
  });
});

describe("truncate", () => {
  it("keeps short text and shortens long text with an ellipsis", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("abcdefghij", 5)).toBe("abcd…");
  });
});

describe("element and text", () => {
  it("escapes attribute values and skips undefined attributes", () => {
    expect(element("rect", { id: `a"b`, width: 3, rx: undefined })).toBe(
      '<rect id="a&quot;b" width="3"/>',
    );
  });

  it("escapes text content", () => {
    const result = text("<script>", { x: 1, y: 2, fill: "#fff", size: 12 });
    expect(result).toContain("&lt;script&gt;");
    expect(result).not.toContain("<script>");
  });
});

describe("svgDocument", () => {
  it("includes size, viewBox, title and description", () => {
    const svg = svgDocument(
      { width: 100, height: 50, title: "T & T", description: "D", fontFamily: "Arial" },
      "",
    );
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="50"');
    expect(svg).toContain('viewBox="0 0 100 50"');
    expect(svg).toContain('<title id="title">T &amp; T</title>');
    expect(svg).toContain('<desc id="desc">D</desc>');
  });
});
