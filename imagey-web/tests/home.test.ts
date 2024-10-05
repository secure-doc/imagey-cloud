import { test, expect } from "playwright-test-coverage";

test("has button", async ({ page }) => {
  await page.goto("/");

  page.getByText("count is 0").click();
  await expect(page.getByText("count is 1")).toBeVisible();
});
