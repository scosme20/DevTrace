import { rename, writeFile } from "node:fs/promises";
import type { GitHubSnapshot } from "./github-models.js";
import { validateGitHubSnapshot } from "./github-validation.js";
import { DevTraceError } from "./result.js";

/**
 * Validates and writes the snapshot. The file is written to a temporary name
 * and renamed, so a crash cannot leave a half-written snapshot behind. The
 * path is chosen by the caller (never by user input).
 */
export async function writeGitHubSnapshot(
  filePath: string,
  snapshot: GitHubSnapshot,
): Promise<void> {
  const checked = validateGitHubSnapshot(snapshot);
  if (!checked.ok) {
    throw new DevTraceError(
      `Refusing to write an invalid GitHub snapshot:\n  - ${checked.errors.join("\n  - ")}`,
    );
  }
  const temporaryPath = `${filePath}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(checked.value, null, 2)}\n`, "utf8");
    await rename(temporaryPath, filePath);
  } catch (cause) {
    throw new DevTraceError(`Failed to write GitHub snapshot: ${filePath}`, { cause });
  }
}
