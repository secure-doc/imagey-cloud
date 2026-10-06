import { test, expect } from "./support/fixtures";
import {
  randomEmail,
  registerUser,
  serverURL,
  uploadImage,
} from "./support/users";

// F11 (docs/plans/f11-f3-second-server-guest-auth.md): the two servers of the stack are
// independent, as two real instances are. No federation feature is needed to show that.
test("F11: servers A and B share neither users, data nor sessions", async ({
  browser,
}) => {
  const image = "beach-4524911_480.jpg";
  const email = randomEmail("twin");

  // The same address registers on both servers, because their mappings are separate.
  const onA = await registerUser(browser, "twin", "a", email);
  const onB = await registerUser(browser, "twin", "b", email);

  // What A stores is not on B.
  await uploadImage(onA.page, image);
  await onB.page.getByRole("link", { name: "Images" }).click();
  await expect(onB.page.getByAltText(image)).toHaveCount(0);

  // The session cookie of A does not apply to B.
  await onA.page.goto(serverURL("b"));
  await expect(onA.page.getByPlaceholder("email@imagey.cloud")).toBeVisible();
});
