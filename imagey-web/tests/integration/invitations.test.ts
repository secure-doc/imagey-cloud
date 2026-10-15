import { test, expect } from "./fixtures";
import { MatchersV3 } from "@pact-foundation/pact";
import {
  clearLocalStorage,
  generateAesGcmKeyJwk,
  loginAsMary,
  prepareMarysChatsDocumentUpdate,
  prepareMarysChatsDocument,
  prepareMarysLogin,
  setupMockServer,
  provider,
  TestData,
  prepareMarysContactRequests,
  prepareMarysEmptyDocumentsFolder,
  prepareMarysNamedPublicProfile,
  prepareMarysProfileWithoutPublicProfile,
  prepareMarysPublicProfileCreation,
  prepareMarysPublicProfileMetadataPut,
  prepareMarysPublicProfileShare,
  prepareMarysPublicProfileShareForFreshProfile,
  runningPactRequests,
} from "./setup";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("accept open invitations fails", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  const chatsDocumentKey = await generateAesGcmKeyJwk();
  const builder = await prepareMarysContactRequests(chatsDocumentKey);
  // Accepting first ensures mary's own named public profile before it ever
  // reaches the (overridden-to-fail) PUT below.
  const { publicProfileId } = await prepareMarysNamedPublicProfile();

  // Accepting re-reads and updates the "chats" document and shares mary's
  // public profile before it ever reaches the (overridden-to-fail) PUT
  // below - all need to be mocked so the flow actually gets there.
  await prepareMarysChatsDocument(
    [],
    "mary has no contacts and a contact request from bill",
    chatsDocumentKey,
  );
  prepareMarysChatsDocumentUpdate(
    "mary has no contacts and a contact request from bill",
  );
  prepareMarysPublicProfileShare(
    publicProfileId,
    "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
  );

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);

    // Override the PUT request with Playwright's page.route to return 500
    // so we don't pollute the Pact contract!
    let acceptPutAttempted = false;
    await page.route(
      "**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests/a358c2ed-07d4-4a25-a7db-d860d5c0b895",
      async (route) => {
        if (route.request().method() === "PUT") {
          acceptPutAttempted = true;
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

    // The failure path leaves the panel visible, so there's no UI change to
    // wait on. Gate the callback's return on the failing PUT actually being
    // reached: it's the last call in the accept flow, so by the time it
    // fires the preceding chats re-read + update + profile share have already
    // completed against the Pact mock server - without this, executeTest can
    // tear the mock server down while one of those is still in flight
    // ("route.fetch: connect ECONNREFUSED" / "request expected but not
    // received").
    await expect.poll(() => acceptPutAttempted).toBe(true);

    // Panel should still be visible because it threw an error
    await expect(invitationPanel).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("decline open invitations fails", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  const builder = await prepareMarysContactRequests();

  await builder.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);

    // Override the DELETE request with Playwright's page.route to return 500
    let declineDeleteAttempted = false;
    await page.route(
      "**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests/a358c2ed-07d4-4a25-a7db-d860d5c0b895",
      async (route) => {
        if (route.request().method() === "DELETE") {
          declineDeleteAttempted = true;
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

    // The failure path leaves the panel visible, so gate on the failing
    // DELETE actually being reached before letting executeTest tear the
    // mock server down (see the accept-fails test above).
    await expect.poll(() => declineDeleteAttempted).toBe(true);

    // Panel should still be visible because it threw an error
    await expect(invitationPanel).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("accept invitation prompts for a display name when mary has no public profile yet", async ({
  page,
}) => {
  // Given: mary's private profile exists but has no publicProfileId yet
  // (§3.5) - accepting must ask for a name before it can go through.
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  const chatsDocumentKey = await generateAesGcmKeyJwk();
  await prepareMarysContactRequests(chatsDocumentKey);
  await prepareMarysProfileWithoutPublicProfile();
  await prepareMarysPublicProfileCreation();
  prepareMarysPublicProfileMetadataPut();

  const builder = provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving(
      "a request of mary to accept bills invitation after naming her public profile",
    )
    .withRequest(
      "PUT",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests/a358c2ed-07d4-4a25-a7db-d860d5c0b895",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        });
        r.jsonBody({
          inviter: "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
          invitee: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          status: "ACCEPTED",
          publicKey: MatchersV3.like(TestData.mary.publicMainKey),
          sharedKey: MatchersV3.string("dummy-encrypted-key"),
          publicProfileId: MatchersV3.string("new-public-profile-id"),
          // Our own name/address, encrypted under the chat key.
          contactInfo: MatchersV3.string("ZW5jcnlwdGVkLWNvbnRhY3QtaW5mbw=="),
        });
      },
    )
    .willRespondWith(204);

  await prepareMarysChatsDocument(
    [],
    "mary has no contacts and a contact request from bill",
    chatsDocumentKey,
  );
  prepareMarysChatsDocumentUpdate(
    "mary has no contacts and a contact request from bill",
  );
  prepareMarysPublicProfileShareForFreshProfile(
    "a358c2ed-07d4-4a25-a7db-d860d5c0b895",
  );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    const invitationPanel = page
      .getByRole("heading", { name: "Contact Request" })
      .locator("..");
    await expect(invitationPanel).toBeVisible();

    const acceptBtn = invitationPanel.getByRole("button", { name: "check" });
    await acceptBtn.click();

    const namePromptHeading = page.getByRole("heading", {
      name: "How should others see you?",
    });
    await expect(namePromptHeading).toBeVisible();
    await page.getByLabel("Name").fill("Mary Doe");
    // After naming, accepting runs the full chain; pin its terminal accept
    // request so the panel-gone assertion doesn't race it under load.
    const accepted = page.waitForResponse(
      (r) =>
        r.request().method() === "PUT" &&
        r.url().includes("/contact-requests/"),
    );
    await page.getByRole("button", { name: "Confirm" }).click();
    await accepted;

    await expect(namePromptHeading).not.toBeVisible();
    await expect(invitationPanel).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("cancel the display-name prompt when accepting an invitation", async ({
  page,
}) => {
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  const chatsDocumentKey = await generateAesGcmKeyJwk();
  const builder = await prepareMarysContactRequests(chatsDocumentKey);
  await prepareMarysProfileWithoutPublicProfile();
  await prepareMarysPublicProfileCreation();

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    const invitationPanel = page
      .getByRole("heading", { name: "Contact Request" })
      .locator("..");
    await expect(invitationPanel).toBeVisible();

    const acceptBtn = invitationPanel.getByRole("button", { name: "check" });
    await acceptBtn.click();

    const namePromptHeading = page.getByRole("heading", {
      name: "How should others see you?",
    });
    await expect(namePromptHeading).toBeVisible();

    // Cancelling must not accept the invitation (Pact would fail on an
    // unexpected PUT, since none is registered for this test).
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(namePromptHeading).not.toBeVisible();
    await expect(invitationPanel).toBeVisible();

    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
