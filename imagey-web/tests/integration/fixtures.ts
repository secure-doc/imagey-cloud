import { randomUUID } from "node:crypto";
import { test as base } from "@playwright/test";
import * as fs from "fs";

export const coverageDir = "target/coverage-istanbul/contract";

// Every test would otherwise write the complete coverage object, including the (large, always
// identical) statement maps and source maps of every file. A test writes its counters only; the
// maps of a file are written once per worker, when the worker sees the file for the first time
// (scripts/coverage-report.mjs joins them again).
const mapsWritten = new Set<string>();

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    const known = [...mapsWritten];
    const result = await page.evaluate((known) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const coverage = (window as any)["__coverage__"];
      if (!coverage) {
        return undefined;
      }
      const counters: Record<string, unknown> = {};
      const maps: Record<string, unknown> = {};
      for (const [file, entry] of Object.entries(coverage)) {
        const { s, f, b } = entry as { s: unknown; f: unknown; b: unknown };
        counters[file] = { s, f, b };
        if (!known.includes(file)) {
          maps[file] = entry;
        }
      }
      return { counters, maps };
    }, known);
    if (result) {
      await fs.promises.mkdir(coverageDir, { recursive: true });
      if (Object.keys(result.maps).length > 0) {
        Object.keys(result.maps).forEach((file) => mapsWritten.add(file));
        await fs.promises.writeFile(
          `${coverageDir}/maps-${randomUUID()}.json`,
          JSON.stringify(result.maps),
        );
      }
      await fs.promises.writeFile(
        `${coverageDir}/coverage-${testInfo.testId}-${testInfo.retry}.json`,
        JSON.stringify(result.counters),
      );
    }
  },
});

export { expect } from "@playwright/test";
