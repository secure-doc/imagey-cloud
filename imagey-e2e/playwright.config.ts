import { defineConfig, devices } from "@playwright/test";

// Blackbox E2E suite against the real backend (docs/plans/e2e-test-setup.md).
// scripts/run-e2e.mjs starts the Docker stack and sets E2E_BASE_URL (server A), E2E_BASE_URL_B (server B) and E2E_MAIL_URL.
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A flaky E2E test is a bug, not noise.
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://imagey.localhost:8080",
    timezoneId: "Europe/Berlin",
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
