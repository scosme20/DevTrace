import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DevTraceError } from "./result.js";

const SAFE_FILE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*\.svg$/;

/**
 * Writes an indicator inside `indicatorsDir` only. The strict file name check
 * rejects separators and "..", so callers cannot escape the output directory.
 */
export async function writeIndicator(
  indicatorsDir: string,
  fileName: string,
  content: string,
): Promise<string> {
  if (!SAFE_FILE_NAME.test(fileName)) {
    throw new DevTraceError(
      `Invalid indicator file name: "${fileName}". Use kebab-case with a .svg extension.`,
    );
  }
  const target = path.join(path.resolve(indicatorsDir), fileName);
  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  } catch (cause) {
    throw new DevTraceError(`Failed to write indicator: ${target}`, { cause });
  }
  return target;
}
