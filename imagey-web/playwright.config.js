import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Look for test files in the "tests" directory, relative to this configuration file.
  testDir: "tests/integration",

  // Cleans up the per-worker Pact directories of earlier runs
  globalSetup: "./tests/integration/global-setup.ts",

  // Global teardown script (merges the per-worker Pact files)
  globalTeardown: "./tests/integration/global-teardown.ts",

  // Run all tests in parallel.
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,

  // Retry on CI only.
  retries: 3,

  // Tests are isolated (own browser context, own Pact mock server), so run them
  // in parallel. A 4 vCPU CI runner is saturated by two workers (browser +
  // Playwright/Pact processes need ~1.5 cores each), more only adds flakiness.
  workers: process.env.CI ? 2 : 4,

  // Reporter to use, see https://playwright.dev/docs/test-reporters
  reporter: "list",

  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    baseURL: "http://localhost:5173",

    // Collect trace when retrying the failed test.
    trace: "on-first-retry",
  },
  // Configure projects for major browsers.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Run your local dev server before starting the tests.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
});
