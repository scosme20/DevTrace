const XML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

// XML 1.0 forbids most control characters even when escaped, so drop them.
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML_CHARS, "")
    .replace(/[&<>"']/g, (char) => XML_ENTITIES[char] ?? char);
}

export function truncate(value: string, maxLength: number): string {
  const chars = Array.from(value);
  return chars.length <= maxLength ? value : `${chars.slice(0, maxLength - 1).join("")}…`;
}

export type SvgAttributes = Readonly<Record<string, string | number | undefined>>;

function formatAttributes(attributes: SvgAttributes): string {
  return (
    Object.entries(attributes)
      .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
      // 1 is the SVG default stroke width, so writing it adds bytes and nothing else.
      .filter(([name, value]) => !(name === "stroke-width" && String(value) === "1"))
      .map(([name, value]) => ` ${name}="${escapeXml(String(value))}"`)
      .join("")
  );
}

/** Builds an element. `children` must already be escaped or built by this module. */
export function element(name: string, attributes: SvgAttributes, children = ""): string {
  const attrs = formatAttributes(attributes);
  return children === "" ? `<${name}${attrs}/>` : `<${name}${attrs}>${children}</${name}>`;
}

export interface TextOptions {
  readonly x: number;
  readonly y: number;
  readonly fill: string;
  readonly size: number;
  readonly weight?: number;
  readonly anchor?: "start" | "middle" | "end";
  /** A font stack for this text only, for numbers in a different face. */
  readonly family?: string;
}

/** Empty text draws nothing, so an element with no content is never written. */
export function text(content: string, options: TextOptions): string {
  if (content === "") return "";
  return element(
    "text",
    {
      x: options.x,
      y: options.y,
      fill: options.fill,
      "font-size": options.size,
      "font-weight": options.weight,
      "text-anchor": options.anchor,
      "font-family": options.family,
    },
    escapeXml(content),
  );
}

export interface SvgDocumentOptions {
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly description: string;
  readonly fontFamily: string;
}

export function svgDocument(options: SvgDocumentOptions, body: string): string {
  const { width, height } = options;
  const root = element(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width,
      height,
      viewBox: `0 0 ${String(width)} ${String(height)}`,
      role: "img",
      "aria-labelledby": "title desc",
      "font-family": options.fontFamily,
    },
    element("title", { id: "title" }, escapeXml(options.title)) +
      element("desc", { id: "desc" }, escapeXml(options.description)) +
      body,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n${root}\n`;
}
