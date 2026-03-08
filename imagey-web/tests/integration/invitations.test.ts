import { test, expect } from "./fixtures";
import { MatchersV3 } from "@pact-foundation/pact";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysLogin,
  setupMockServer,
  provider,
  TestData,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("display and accept open invitations", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);

  provider
    .addInteraction()
    .given("mary has open invitations")
    .uponReceiving("a request of mary to get documents")
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) => r.jsonBody([]));

  // Custom request returning 1 open invitation
  provider
    .addInteraction()
    .given("mary has open invitations")
    .uponReceiving(
      "a request of mary to get contact requests with pending invitations",
    )
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) => r.jsonBody(["alice@imagey.cloud"]));

  // Mock fetching public key for Alice to prepare for accepting
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get alices public key")
    .withRequest("GET", "/users/alice@imagey.cloud/public-keys/0", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) => r.jsonBody(TestData.alice.publicMainKey));

  // Mock POST to accept Alice
  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to accept alices invitation")
    .withRequest(
      "PUT",
      "/users/mary@imagey.cloud/contacts/alice@imagey.cloud",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        });
        // We don't exact-match the encrypted key because it changes dynamically
        r.jsonBody({
          key: MatchersV3.like("dummy-encrypted-key"),
        });
      },
    )
    .willRespondWith(204);

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // Then Invitation Visible
    const invitationPanel = page
      .getByRole("heading", {
        name: "Contact Request",
      })
      .locator("..");
    await expect(invitationPanel).toBeVisible();

    await expect(invitationPanel).toContainText("alice@imagey.cloud");

    // Act: Accept Alice
    const acceptAliceBtn = invitationPanel.getByRole("button", {
      name: "check",
    });
    await acceptAliceBtn.click();
    await expect(invitationPanel).not.toBeVisible();
  });
});

test("display and decline open invitations", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);

  provider
    .addInteraction()
    .given("mary has open invitations")
    .uponReceiving("a request of mary to get documents again")
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) => r.jsonBody([]));

  // Custom request returning 1 open invitation
  provider
    .addInteraction()
    .given("mary has open invitations")
    .uponReceiving(
      "a request of mary to get contact requests with pending invitations when declining",
    )
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) => r.jsonBody(["alice@imagey.cloud"]));

  // Mock POST to decline Alice
  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to decline alices invitation")
    .withRequest(
      "PUT",
      "/users/mary@imagey.cloud/contact-requests/alice@imagey.cloud",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        });
        r.jsonBody({
          status: "DECLINED_BY_USER",
        });
      },
    )
    .willRespondWith(204);

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    // Then Invitation Visible
    const invitationPanel = page
      .getByRole("heading", {
        name: "Contact Request",
      })
      .locator("..");
    await expect(invitationPanel).toBeVisible();

    await expect(invitationPanel).toContainText("alice@imagey.cloud");

    // Act: Accept Alice
    const acceptAliceBtn = invitationPanel.getByRole("button", {
      name: "close",
    });
    await acceptAliceBtn.click();
    await expect(invitationPanel).not.toBeVisible();
  });
});
