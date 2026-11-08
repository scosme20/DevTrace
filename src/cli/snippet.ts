import { readdir } from "node:fs/promises";
import path from "node:path";
import { UsageError } from "./errors.js";

// Builds the Markdown that puts the generated SVGs in a README. It only looks
// at which files exist in public/indicators and prints text: it writes nothing.

const KNOWN: readonly { readonly file: string; readonly alt: string }[] = [
  { file: "startup-stats.svg", alt: "Startup & SaaS Dashboard" },
  { file: "ai-engineering-stats.svg", alt: "AI Engineering Dashboard" },
  { file: "developer-activity.svg", alt: "Developer Activity Dashboard" },
];

const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}\/[A-Za-z0-9._-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,100}$/;

export interface SnippetOptions {
  /** `owner/name` of the repository that holds the SVGs. */
  readonly repository: string;
  /** Default `HEAD`, the default branch. */
  readonly branch?: string | undefined;
  /** The light version of every file is `<name>-light.svg`. */
  readonly pair: boolean;
  /** The file names found in public/indicators. */
  readonly files: readonly string[];
}

const lightName = (file: string): string => file.replace(/\.svg$/, "-light.svg");

/** The Markdown, one block per indicator that exists. */
export function buildSnippet(options: SnippetOptions): string[] {
  if (!REPOSITORY.test(options.repository)) {
    throw new UsageError(
      `Invalid --repo: "${options.repository}". Expected owner/name.`,
      "For example: --repo scosme20/DevTrace.",
    );
  }
  const branch = options.branch ?? "HEAD";
  if (!BRANCH.test(branch) || branch.includes("..")) {
    throw new UsageError(`Invalid --branch: "${branch}".`);
  }
  const present = KNOWN.filter((entry) => options.files.includes(entry.file));
  if (present.length === 0) {
    throw new UsageError(
      "There is no indicator in public/indicators yet.",
      'Run "devtrace generate" first.',
    );
  }
  const url = (file: string): string =>
    `https://raw.githubusercontent.com/${options.repository}/${branch}/public/indicators/${file}`;

  const blocks = present.map((entry) => {
    const light = lightName(entry.file);
    const image = options.pair
      ? [
          "<picture>",
          `  <source media="(prefers-color-scheme: dark)" srcset="${url(entry.file)}" />`,
          `  <img width="100%" src="${url(options.files.includes(light) ? light : entry.file)}" alt="${entry.alt}" />`,
          "</picture>",
        ]
      : [`<img width="100%" src="${url(entry.file)}" alt="${entry.alt}" />`];
    return ['<div align="center">', ...image.map((line) => `  ${line}`), "</div>", ""];
  });

  const missing = options.pair
    ? present.filter((entry) => !options.files.includes(lightName(entry.file)))
    : [];
  return [
    ...blocks.flat(),
    ...missing.map(
      (entry) =>
        `<!-- No light version of ${entry.file} yet. Create it: devtrace generate ${targetOf(entry.file)} --theme LIGHT --output ${lightName(entry.file)} -->`,
    ),
  ];
}

function targetOf(file: string): string {
  if (file.startsWith("startup")) return "startup";
  if (file.startsWith("ai-")) return "ai";
  return "activity";
}

export async function indicatorFiles(rootDir: string): Promise<string[]> {
  try {
    return await readdir(path.join(rootDir, "public/indicators"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
