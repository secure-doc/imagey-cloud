import { test, expect } from "./fixtures";
import { MatchersV3 } from "@pact-foundation/pact";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysLogin,
  setupMockServer,
  provider,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("display and act on open invitations", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);

  // Custom request returning 2 open invitations (one to accept, one to decline)
  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get contact requests with pending invitations",
    )
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) =>
      r.jsonBody([
        { email: { address: "alice@imagey.cloud" } },
        { email: { address: "bob@imagey.cloud" } },
      ]),
    );

  // Mock fetching public key for Alice to prepare for accepting
  provider
    .addInteraction()
    .given("alice is registered")
    .uponReceiving("a request of mary to get alices public key")
    .withRequest("GET", "/users/alice@imagey.cloud/public-keys/0", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) =>
      r.jsonBody({
        kty: "EC",
        crv: "P-256",
        x: "MKBCTNIcKUSDii11ySs3526iDZ8GmEbwKk1s8A9m8k4",
        y: "4Etl6SRW2YiLUrN5v0Ydz1kYU8zceX4EAsBovJMZ-bg",
        ext: true,
      }),
    );

  // Mock POST to accept Alice
  provider
    .addInteraction()
    .given("alice is registered")
    .uponReceiving("a request of mary to accept alices invitation")
    .withRequest(
      "PUT",
      "/users/mary@imagey.cloud/contacts/alice@imagey.cloud",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        });
        // We don't exact-match the encrypted key because it changes dynamically
        r.body(
          JSON.stringify({
            key: MatchersV3.like("dummy-encrypted-key"),
          }),
          "application/json",
        );
      },
    )
    .willRespondWith(204);

  // Mock POST to decline Bob
  provider
    .addInteraction()
    .given("bob is registered")
    .uponReceiving("a request of mary to decline bobs invitation")
    .withRequest(
      "PUT",
      "/users/mary@imagey.cloud/contact-requests/bob@imagey.cloud",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        });
        r.body(
          JSON.stringify({
            status: "DECLINED_BY_USER",
          }),
          "application/json",
        );
      },
    )
    .willRespondWith(204);

  // Empty documents stub
  const builder = provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request of mary to get documents for invitations test")
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // Then Both Invitations Visible
    const invitationsHeading = page.getByRole("heading", {
      name: "Open Invitations",
    });
    await expect(invitationsHeading).toBeVisible();

    const aliceListItem = page.getByText("alice@imagey.cloud");
    await expect(aliceListItem).toBeVisible();

    const bobListItem = page.getByText("bob@imagey.cloud");
    await expect(bobListItem).toBeVisible();

    // Act: Accept Alice
    const acceptAliceBtn = aliceListItem
      .locator("..")
      .locator('i:has-text("check")')
      .locator("..");
    await acceptAliceBtn.click();
    await expect(aliceListItem).not.toBeVisible();

    // Act: Decline Bob
    const declineBobBtn = bobListItem
      .locator("..")
      .locator('i:has-text("close")')
      .locator("..");
    await declineBobBtn.click();
    await expect(bobListItem).not.toBeVisible();

    // Once both are gone, the entire invitations block should disappear
    await expect(invitationsHeading).not.toBeVisible();
  });
});
