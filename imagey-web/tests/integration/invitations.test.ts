import { test, expect } from "./fixtures";
import { MatchersV3 } from "@pact-foundation/pact";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysLogin,
  setupMockServer,
  provider,
  TestData,
  prepareMarysContactRequests,
  prepareMarysDocuments,
  runningPactRequests,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("accept open invitations", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  await prepareMarysContactRequests();

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get lauras public key")
    .withRequest("GET", "/users/laura@imagey.cloud/public-keys/0", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) => r.jsonBody(TestData.laura.publicMainKey));

  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to accept lauras invitation")
    .withRequest(
      "PUT",
      "/users/mary@imagey.cloud/contacts/laura@imagey.cloud",
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

    await expect(invitationPanel).toContainText("laura@imagey.cloud");

    // Act: Accept Alice
    const acceptAliceBtn = invitationPanel.getByRole("button", {
      name: "check",
    });
    await acceptAliceBtn.click();
    await expect(invitationPanel).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("decline open invitations", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  await prepareMarysContactRequests();

  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to decline lauras invitation")
    .withRequest(
      "DELETE",
      "/users/mary@imagey.cloud/contact-requests/laura@imagey.cloud",
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

    await expect(invitationPanel).toContainText("laura@imagey.cloud");

    // Act: Decline Alice
    const declineAliceBtn = invitationPanel.getByRole("button", {
      name: "close",
    });
    await declineAliceBtn.click();
    await expect(invitationPanel).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("accept open invitations fails", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  await prepareMarysContactRequests();

  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to get lauras public key (fail case)")
    .withRequest("GET", "/users/laura@imagey.cloud/public-keys/0", (r) => {
      r.headers({
        Accept: "application/json",
      });
    })
    .willRespondWith(200, (r) => r.jsonBody(TestData.laura.publicMainKey));

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);

    // Override the PUT request with Playwright's page.route to return 500
    // so we don't pollute the Pact contract!
    await page.route(
      "**/users/mary@imagey.cloud/contacts/laura@imagey.cloud",
      async (route) => {
        if (route.request().method() === "PUT") {
          await route.fulfill({ status: 500 });
        } else {
          await route.fallback();
        }
      },
    );

    await loginAsMary(page);

    const invitationPanel = page
      .getByRole("heading", {
        name: "Contact Request",
      })
      .locator("..");
    await expect(invitationPanel).toBeVisible();

    // Act: Accept Alice
    const acceptAliceBtn = invitationPanel.getByRole("button", {
      name: "check",
    });
    await acceptAliceBtn.click();

    // Panel should still be visible because it threw an error
    await expect(invitationPanel).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("decline open invitations fails", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  const builder = await prepareMarysContactRequests();

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);

    // Override the DELETE request with Playwright's page.route to return 500
    await page.route(
      "**/users/mary@imagey.cloud/contact-requests/laura@imagey.cloud",
      async (route) => {
        if (route.request().method() === "DELETE") {
          await route.fulfill({ status: 500 });
        } else {
          await route.fallback();
        }
      },
    );

    await loginAsMary(page);

    const invitationPanel = page
      .getByRole("heading", {
        name: "Contact Request",
      })
      .locator("..");
    await expect(invitationPanel).toBeVisible();

    // Act: Decline Alice
    const declineAliceBtn = invitationPanel.getByRole("button", {
      name: "close",
    });
    await declineAliceBtn.click();

    // Panel should still be visible because it threw an error
    await expect(invitationPanel).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
