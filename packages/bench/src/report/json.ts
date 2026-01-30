/**
 * JSON report writer.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BenchmarkResults } from "../types.js";

/**
 * Writes benchmark results to a JSON file.
 * @returns Path to the written file.
 */
export async function writeJsonReport(
  results: BenchmarkResults,
  outputDir: string,
): Promise<string> {
  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  // Generate filename with timestamp
  const timestamp = results.meta.timestamp.replace(/[:.]/g, "-");
  const filename = `benchmark-${timestamp}.json`;
  const filepath = join(outputDir, filename);

  // Write JSON with pretty formatting
  const json = JSON.stringify(results, null, 2);
  await writeFile(filepath, json, "utf-8");

  return filepath;
}
