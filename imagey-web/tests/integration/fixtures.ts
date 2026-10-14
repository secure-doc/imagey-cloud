import { test as base } from "@playwright/test";
import * as fs from "fs";

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coverage = await page.evaluate(() => (window as any)["__coverage__"]);
    if (coverage) {
      await fs.promises.mkdir(".coverage-raw", { recursive: true });
      await fs.promises.writeFile(
        `.coverage-raw/coverage-${testInfo.testId}-${testInfo.retry}.json`,
        JSON.stringify(coverage),
      );
    }
  },
});

export { expect } from "@playwright/test";
