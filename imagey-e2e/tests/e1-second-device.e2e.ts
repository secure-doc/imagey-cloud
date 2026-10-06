import { test, expect } from "./support/fixtures";
import {
  activateDevice,
  loginOnNewDevice,
  newDevice,
  registerUser,
  setPassword,
  uploadImage,
} from "./support/users";

// E1: a second device is registered through the login mail, activated by the first one and then
// reads the first device's data. Device 1 renames it afterwards.
test("E1: alice activates her second device, which then sees her image", async ({
  browser,
}) => {
  const image = "beach-4524911_480.jpg";
  const alice = await registerUser(browser, "alice");
  const second = await newDevice(browser);
  await uploadImage(alice.page, image);

  await loginOnNewDevice(second, alice.email);
  await activateDevice(alice);

  // Device 2 now unlocks with the password and reads what device 1 stored.
  await second.page.reload();
  await setPassword(second.page, "unlock");
  await second.page.getByRole("link", { name: "Images" }).click();
  await expect(second.page.getByAltText(image)).toBeVisible();

  // Device 1 renames device 2 (the info is encrypted for all devices, ADR 0017).
  const other = alice.page
    .locator("li")
    .filter({ hasText: "Registered on" })
    .filter({ hasNotText: "This device" });
  await other.getByRole("button", { name: "Rename device" }).click();
  await alice.page.getByLabel("Device name").fill("Alice's Tablet");
  await alice.page.getByRole("button", { name: "Save" }).click();
  await expect(
    alice.page.getByRole("heading", { name: "Alice's Tablet" }),
  ).toBeVisible();

  // Device 2 shows the new name as well: the name travels encrypted through the server.
  await second.page.getByRole("link", { name: "Settings" }).click();
  await second.page.getByRole("heading", { name: "Devices" }).click();
  await expect(
    second.page
      .locator("li")
      .filter({ hasText: "This device" })
      .getByRole("heading", { name: "Alice's Tablet" }),
  ).toBeVisible();
});
