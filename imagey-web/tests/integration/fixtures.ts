import { test as base } from "@playwright/test";
import fs from "fs";

export const test = base.extend({
  page: async ({ page }, use) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    const coverage = await page.evaluate(() => window["__coverage__"]);
    if (coverage) {
      await fs.promises.mkdir(".nyc_output", { recursive: true });
      await fs.promises.writeFile(
        `.nyc_output/coverage-${Date.now()}.json`,
        JSON.stringify(coverage),
      );
    }
  },
});

export { expect } from "@playwright/test";
