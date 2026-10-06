import { test, expect } from "./support/fixtures";
import { login, registerUser, uploadImage } from "./support/users";

// E0 (docs/plans/e2e-test-setup.md): the only single-user test of this suite. It proves the whole
// chain - bundle, FrontendFilter, mail, cookies - against the real server.
test("E0: new user registers, uploads an image and stays logged in across reloads", async ({
  browser,
}) => {
  const image = "beach-4524911_480.jpg";
  const { page, context, email } = await registerUser(browser, "smoke");
  // What only the real server can prove: service worker, manifest and session cookie.
  await page.evaluate(() => navigator.serviceWorker.ready);
  const manifest = await page.request.get("/manifest.json");
  expect(manifest.ok()).toBe(true);
  expect(manifest.headers()["content-type"]).toContain("json");
  expect(await manifest.json()).toMatchObject({
    start_url: expect.any(String),
  });
  const token = (await context.cookies()).find((c) => c.name === "token");
  expect(token).toMatchObject({ httpOnly: true, sameSite: "Lax" });

  await uploadImage(page, image);

  // Without "keep me logged in" the session ends with the page: a reload asks for the email
  // and the login mail again.
  await page.reload();
  await login(page, email, { keepLoggedIn: true });
  await page.getByRole("link", { name: "Images" }).click();
  await expect(page.getByAltText(image)).toBeVisible();

  // "Keep me logged in" stored a recovery key, so no password is asked for any more.
  await page.reload();
  await expect(page.getByRole("link", { name: "Images" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Images" }).click();
  await expect(page.getByAltText(image)).toBeVisible();
});
