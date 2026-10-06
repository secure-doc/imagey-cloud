import { test as base } from "@playwright/test";
import { closeAllDevices } from "./users";

export { expect } from "@playwright/test";

// Closes every device (browser context) a test opened, whether the test passed or not.
export const test = base.extend<{ devices: void }>({
  devices: [
    // Playwright needs the destructuring pattern to see that no fixture is requested.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use();
      await closeAllDevices();
    },
    { auto: true },
  ],
});
