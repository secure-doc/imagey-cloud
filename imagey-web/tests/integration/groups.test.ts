import { MatchersV3 } from "@pact-foundation/pact";

import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysLogin,
  prepareMarysChat,
  prepareMarysNamedPublicProfile,
  prepareMarysGroupCreation,
  prepareMarysGroupOwnProfileShare,
  prepareMarysGroupMetadataPut,
  prepareMarysGroupMemberKeyShare,
  prepareMarysChatsDocument,
  prepareMarysEmptyDocumentsFolder,
  buildGroupAccessPathForTest,
  setupMockServer,
  provider,
  runningPactRequests,
  TestData,
  LAURA_ID,
  ALICE_ID,
  MARY_ID,
  aesGcmEncrypt,
  encryptKeyEnvelope,
  generateAesGcmKeyJwk,
  sentMessageBody,
  messageId,
} from "./setup";
import type { groupService } from "../../src/contact/GroupService";

declare global {
  interface Window {
    groupService: typeof groupService;
  }
}

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test.afterEach("Clear IndexedDB", async ({ page }) => {
  try {
    await page.evaluate(async () => {
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        window.indexedDB.deleteDatabase(db.name!);
      }
    });
  } catch (e) {
    console.error(e);
  }
});

test("create a group and add a member", async ({ page }) => {
  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  await prepareMarysChat(LAURA_ID);
  const { publicProfileId } = await prepareMarysNamedPublicProfile("Mary");
  await prepareMarysGroupCreation();
  prepareMarysGroupOwnProfileShare(publicProfileId);
  prepareMarysGroupMetadataPut();
  prepareMarysGroupMemberKeyShare(LAURA_ID);

  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to send a group invitation to laura")
    .withRequest(
      "POST",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
      (r) => {
        r.headers({ "Content-Type": "text/plain" });
      },
    )
    .willRespondWith(201, (r) =>
      r
        .headers({
          Location: MatchersV3.string(
            `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages/${messageId(901)}`,
          ),
        })
        .jsonBody(sentMessageBody(901)),
    );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    await page.getByRole("button", { name: "group_add", exact: true }).click();

    const dialogHeading = page.getByRole("heading", { name: "Create Group" });
    await expect(dialogHeading).toBeVisible();

    await page.getByPlaceholder("Group Name").fill("Team");
    const lauraCheckbox = page.getByRole("checkbox", {
      name: "Laura",
      exact: true,
    });
    // Toggle twice - exercises both the "select" and "deselect" branches of
    // the checkbox handler - before settling on checked.
    await lauraCheckbox.check();
    await lauraCheckbox.uncheck();
    await lauraCheckbox.check();

    const invitationSent = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/chat-laura/messages"),
    );
    await page.getByRole("button", { name: "Create" }).click();
    await invitationSent;

    await expect(dialogHeading).not.toBeVisible();
    await expect(page.getByText("Team", { exact: true })).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("mary opens a group she owns and adds another member via Add Member", async ({
  page,
}) => {
  const GROUP_ID = "33333333-3333-3333-3333-333333333330";
  const chatsId = TestData.mary.settings!.chats;
  const groupKey = await generateAesGcmKeyJwk();
  const chatKey = await generateAesGcmKeyJwk();
  const marysPublicProfileId = "aaaaaaaa-1111-1111-1111-111111111111";

  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  // Mary owns this group herself - her "chats" document's GroupEntry has no
  // cached groupKey (unlike a member's), since the owner reaches it through
  // her own self-issued key entry instead (ADR 0019 decision 1).
  const chatsDocumentKey = await prepareMarysChatsDocument(
    [{ userId: LAURA_ID, chatId: "chat-laura", owner: MARY_ID }],
    undefined,
    undefined,
    [{ groupId: GROUP_ID, owner: MARY_ID, name: "Team" }],
  );
  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get contact requests before managing a group",
    )
    .withRequest("GET", `/users/${MARY_ID}/contact-requests`, (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  // Mary's own group Document - self-issued key entry wrapped by her chats key.
  const groupContent = await aesGcmEncrypt(
    groupKey,
    new TextEncoder().encode(
      JSON.stringify({
        documentId: GROUP_ID,
        name: "Team",
        type: "group",
        members: [MARY_ID],
        publicProfiles: { [MARY_ID]: marysPublicProfileId },
      }),
    ),
  );
  const groupExistsParams = {
    ownerId: MARY_ID,
    documentId: GROUP_ID,
    kid: chatsId,
    issuer: MARY_ID,
  };
  provider
    .addInteraction()
    .given("a document exists", groupExistsParams)
    .uponReceiving("a request of mary to get her own group document")
    .withRequest("GET", `/users/${MARY_ID}/documents/${GROUP_ID}`, (r) =>
      r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) =>
      r.body("application/octet-stream", groupContent),
    );
  const wrappedGroupKey = await encryptKeyEnvelope(groupKey, chatsDocumentKey);
  provider
    .addInteraction()
    .given("a document exists", groupExistsParams)
    .uponReceiving("a request of mary to get her own group document's key")
    .withRequest(
      "GET",
      `/users/${MARY_ID}/documents/${GROUP_ID}/keys/${chatsId}`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({ sharedKey: MatchersV3.string(wrappedGroupKey) }),
    );

  // Mary's 1:1 chat with laura (self-owned) - needed for
  // contactService.loadChatKey when adding her as a member.
  const chatContent = await aesGcmEncrypt(
    chatKey,
    new TextEncoder().encode(
      JSON.stringify({
        documentId: "chat-laura",
        name: "Chat",
        type: "chat",
        publicProfiles: {},
      }),
    ),
  );
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get her chat with laura")
    .withRequest("GET", `/users/${MARY_ID}/documents/chat-laura`, (r) =>
      r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) =>
      r.body("application/octet-stream", chatContent),
    );
  const wrappedChatKey = await encryptKeyEnvelope(chatKey, chatsDocumentKey);
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get her chat with laura's key")
    .withRequest(
      "GET",
      `/users/${MARY_ID}/documents/chat-laura/keys/${chatsId}`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({ sharedKey: MatchersV3.string(wrappedChatKey) }),
    );

  provider
    .addInteraction()
    .uponReceiving("a request of mary to receive her own group's messages")
    .withRequest(
      "GET",
      `/users/${MARY_ID}/documents/${GROUP_ID}/messages`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  prepareMarysGroupMetadataPut(" (adding laura to mary's own group)");
  prepareMarysGroupMemberKeyShare(LAURA_ID);

  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to invite laura into her own group")
    .withRequest(
      "POST",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
      (r) => r.headers({ "Content-Type": "text/plain" }),
    )
    .willRespondWith(201, (r) =>
      r
        .headers({
          Location: MatchersV3.string(
            `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages/${messageId(905)}`,
          ),
        })
        .jsonBody(sentMessageBody(905)),
    );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    await page.getByText("Team", { exact: true }).first().click();

    const addMemberButton = page.getByRole("button", {
      name: "person_add",
      exact: true,
    });
    await expect(addMemberButton).toBeVisible();
    await addMemberButton.click();

    const dialogHeading = page.getByRole("heading", { name: "Add Member" });
    await expect(dialogHeading).toBeVisible();
    const lauraCheckbox = page.getByRole("checkbox", {
      name: "Laura",
      exact: true,
    });
    await lauraCheckbox.check();
    await lauraCheckbox.uncheck();
    await lauraCheckbox.check();

    const invitationSent = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/chat-laura/messages"),
    );
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await invitationSent;

    await expect(dialogHeading).not.toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("leaving a group before a member's profile finishes loading doesn't error", async ({
  page,
}) => {
  const GROUP_ID = "44444444-4444-4444-4444-444444444444";
  const chatsId = TestData.mary.settings!.chats;
  const groupKey = await generateAesGcmKeyJwk();
  const marysPublicProfileId = "aaaaaaaa-3333-3333-3333-333333333333";
  const alicePublicProfileId = "bbbbbbbb-3333-3333-3333-333333333333";

  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  // Mary owns this group and alice is its only other member - useGroupMember
  // Profiles must fetch alice's profile, which this test delays.
  const chatsDocumentKey = await prepareMarysChatsDocument(
    [],
    undefined,
    undefined,
    [{ groupId: GROUP_ID, owner: MARY_ID, name: "Team" }],
  );
  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get contact requests before leaving a group early",
    )
    .withRequest("GET", `/users/${MARY_ID}/contact-requests`, (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  const groupContent = await aesGcmEncrypt(
    groupKey,
    new TextEncoder().encode(
      JSON.stringify({
        documentId: GROUP_ID,
        name: "Team",
        type: "group",
        members: [MARY_ID, ALICE_ID],
        publicProfiles: {
          [MARY_ID]: marysPublicProfileId,
          [ALICE_ID]: alicePublicProfileId,
        },
      }),
    ),
  );
  const groupExistsParams = {
    ownerId: MARY_ID,
    documentId: GROUP_ID,
    kid: chatsId,
    issuer: MARY_ID,
  };
  provider
    .addInteraction()
    .given("a document exists", groupExistsParams)
    .uponReceiving(
      "a request of mary to get her own group document before leaving early",
    )
    .withRequest("GET", `/users/${MARY_ID}/documents/${GROUP_ID}`, (r) =>
      r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) =>
      r.body("application/octet-stream", groupContent),
    );
  const wrappedGroupKey = await encryptKeyEnvelope(groupKey, chatsDocumentKey);
  provider
    .addInteraction()
    .given("a document exists", groupExistsParams)
    .uponReceiving(
      "a request of mary to get her own group document's key before leaving early",
    )
    .withRequest(
      "GET",
      `/users/${MARY_ID}/documents/${GROUP_ID}/keys/${chatsId}`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({ sharedKey: MatchersV3.string(wrappedGroupKey) }),
    );

  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to receive her own group's messages before leaving early",
    )
    .withRequest(
      "GET",
      `/users/${MARY_ID}/documents/${GROUP_ID}/messages`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  // Alice's public profile, shared into the group from her own tree (no
  // avatar needed) - the point is only that this request is still in flight
  // when mary navigates away.
  const aliceProfileAccessPath = buildGroupAccessPathForTest(
    alicePublicProfileId,
    ALICE_ID,
    GROUP_ID,
    MARY_ID,
  );
  const alicePublicProfileKey = await generateAesGcmKeyJwk();
  const aliceProfileContent = await aesGcmEncrypt(
    alicePublicProfileKey,
    new TextEncoder().encode(
      JSON.stringify({
        documentId: alicePublicProfileId,
        type: "publicProfile",
        name: "Alice",
      }),
    ),
  );
  const aliceProfileExistsParams = {
    ownerId: ALICE_ID,
    documentId: alicePublicProfileId,
    kid: GROUP_ID,
    issuer: MARY_ID,
  };
  provider
    .addInteraction()
    .given("a document exists", aliceProfileExistsParams)
    .uponReceiving(
      "a request of mary to load alice's profile via the group before leaving early",
    )
    .withRequest(
      "GET",
      `/users/${ALICE_ID}/documents/${alicePublicProfileId}`,
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
          "Access-Path": MatchersV3.string(aliceProfileAccessPath),
        }),
    )
    .willRespondWith(200, (r) =>
      r.body("application/octet-stream", aliceProfileContent),
    );
  const wrappedAliceProfileKey = await encryptKeyEnvelope(
    alicePublicProfileKey,
    groupKey,
  );
  const builder = provider
    .addInteraction()
    .given("a document exists", aliceProfileExistsParams)
    .uponReceiving(
      "a request of mary to load the key for alice's profile via the group before leaving early",
    )
    .withRequest(
      "GET",
      `/users/${ALICE_ID}/documents/${alicePublicProfileId}/keys/${GROUP_ID}`,
      (r) =>
        r.headers({
          Accept: "application/json",
          "Access-Path": MatchersV3.string(aliceProfileAccessPath),
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({ sharedKey: MatchersV3.string(wrappedAliceProfileKey) }),
    );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    // Delay alice's profile document fetch so it's still in flight when mary
    // navigates away from the group - exercising useGroupMemberProfiles'
    // cancelled-cleanup path (the object-URL leak fix) rather than its
    // ordinary happy path. Registered after setupMockServer's catch-all, so
    // it wins for this one request before falling through to the mock
    // server's response.
    await page.route(
      `**/users/${ALICE_ID}/documents/${alicePublicProfileId}`,
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.fallback();
      },
    );
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    await page.getByText("Team", { exact: true }).first().click();
    await expect(
      page.getByRole("button", { name: "person_add", exact: true }),
    ).toBeVisible();
    // The chats page's "add contact"/"new group" actions don't belong here.
    await expect(
      page.getByRole("button", { name: "group_add", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "add", exact: true }),
    ).toHaveCount(0);

    // Leave before alice's profile (still in flight) resolves.
    await page.getByRole("link", { name: "Chats" }).first().click();
    await expect(
      page.getByRole("button", { name: "group_add", exact: true }),
    ).toBeVisible();

    // Give the delayed response time to land after navigating away - it must
    // not throw or log, even though the component that requested it is gone.
    // (The dev-only manifest.json 404 is unrelated pre-existing noise.)
    await page.waitForTimeout(1500);
    expect(consoleErrors.filter((e) => !e.includes("manifest"))).toEqual([]);
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

// The remaining tests call GroupService directly (window.groupService, see
// main.tsx's DEV-only exposure) rather than driving the UI, for scenarios no
// UI flow reaches on its own - a 412 concurrent-modification retry, or
// re-adding an already-added member - the same pattern folder.test.ts uses
// for its Access-Path negative case.

test("addMember re-adding an existing member dedupes and leaves publicProfiles untouched", async ({
  page,
}) => {
  const GROUP_ID = "44444444-4444-4444-4444-444444444444";
  const groupKey = await generateAesGcmKeyJwk();
  const pairChatKey = await generateAesGcmKeyJwk();

  provider
    .addInteraction()
    .uponReceiving(
      "a request to update group metadata when re-adding an existing member",
    )
    .withRequest("PUT", `/users/${MARY_ID}/documents/${GROUP_ID}`, (r) =>
      r.headers({ "Content-Type": "application/octet-stream" }),
    )
    .willRespondWith(204, (r) =>
      r.headers({ ETag: MatchersV3.string('"group-etag-readd"') }),
    );

  provider
    .addInteraction()
    // Pre-files the exact (issuer=laura, kid=laura) slot the POST below
    // re-sends - a real server 409s on a second write to the same slot
    // (key entries are write-once), which is exactly what's under test.
    .given("a document exists", {
      ownerId: MARY_ID,
      documentId: GROUP_ID,
      kid: LAURA_ID,
      issuer: LAURA_ID,
    })
    .uponReceiving(
      "a request to re-share the group key with an existing member",
    )
    .withRequest(
      "POST",
      `/users/${MARY_ID}/documents/${GROUP_ID}/keys`,
      (r) => {
        r.headers({ "Content-Type": "application/json" }).jsonBody({
          issuer: LAURA_ID,
          kid: LAURA_ID,
          sharedKey: MatchersV3.string("dummy-shared-key"),
        });
      },
    )
    // Key slots are write-once - re-filing an already-shared entry 409s, and
    // GroupService.addMember (via documentRepository.storeSharedKey) treats
    // that as success.
    .willRespondWith(409);

  const builder = provider
    .addInteraction()
    .uponReceiving("a request to resend the invitation to an existing member")
    .withRequest(
      "POST",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages",
      (r) => r.headers({ "Content-Type": "text/plain" }),
    )
    .willRespondWith(201, (r) =>
      r
        .headers({
          Location: MatchersV3.string(
            `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/documents/chat-laura/messages/${messageId(906)}`,
          ),
        })
        .jsonBody(sentMessageBody(906)),
    );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await page.goto("/");

    const result = await page.evaluate(
      async ({ groupId, groupKey, pairChatKey }) => {
        return window.groupService.addMember(
          "d20cf443-4f96-418f-a957-c8cbef8677c3",
          {
            documentId: groupId,
            key: groupKey,
            revision: '"group-etag-0"',
            name: "Team",
            // Laura is already a member - no publicProfileId given this time
            // (she already shared it earlier).
            members: ["7f53a4ea-58b7-4bbf-b94d-f2038752d5b6"],
            publicProfiles: {},
          },
          {
            userId: "7f53a4ea-58b7-4bbf-b94d-f2038752d5b6",
            chatOwnerId: "d20cf443-4f96-418f-a957-c8cbef8677c3",
            chatId: "chat-laura",
            pairChatKey,
          },
        );
      },
      { groupId: GROUP_ID, groupKey, pairChatKey },
    );

    expect(result.members).toEqual([LAURA_ID]);
    expect(result.publicProfiles).toEqual({});
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("renameGroup updates only the renamed group's entry, leaving others untouched", async ({
  page,
}) => {
  const GROUP_ID = "66666666-6666-6666-6666-666666666666";
  const OTHER_GROUP_ID = "77777777-7777-7777-7777-777777777776";
  const chatsId = TestData.mary.settings!.chats;
  const chatsDocumentKey = await generateAesGcmKeyJwk();
  const groupKey = await generateAesGcmKeyJwk();

  provider
    .addInteraction()
    .uponReceiving("a request to update the renamed group's own metadata")
    .withRequest("PUT", `/users/${MARY_ID}/documents/${GROUP_ID}`, (r) =>
      r.headers({ "Content-Type": "application/octet-stream" }),
    )
    .willRespondWith(204, (r) =>
      r.headers({ ETag: MatchersV3.string('"group-etag-renamed"') }),
    );

  const builder = provider
    .addInteraction()
    .uponReceiving("a request to update the chats list with the new group name")
    .withRequest("PUT", `/users/${MARY_ID}/documents/${chatsId}`, (r) =>
      r.headers({ "Content-Type": "application/octet-stream" }),
    )
    .willRespondWith(204, (r) =>
      r.headers({ ETag: MatchersV3.string('"chats-etag-renamed"') }),
    );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await page.goto("/");

    const result = await page.evaluate(
      async ({
        groupId,
        otherGroupId,
        chatsId,
        chatsDocumentKey,
        groupKey,
      }) => {
        return window.groupService.renameGroup(
          "d20cf443-4f96-418f-a957-c8cbef8677c3",
          {
            documentId: groupId,
            key: groupKey,
            revision: '"group-etag-0"',
            name: "Old Name",
            members: ["d20cf443-4f96-418f-a957-c8cbef8677c3"],
            publicProfiles: {},
          },
          {
            documentId: chatsId,
            name: "Chats",
            key: chatsDocumentKey,
            revision: '"chats-etag-0"',
            contacts: [],
            sharedFolders: [],
            groups: [
              {
                groupId,
                owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
                name: "Old Name",
              },
              {
                groupId: otherGroupId,
                owner: "d20cf443-4f96-418f-a957-c8cbef8677c3",
                name: "Other Group",
              },
            ],
          },
          "New Name",
        );
      },
      {
        groupId: GROUP_ID,
        otherGroupId: OTHER_GROUP_ID,
        chatsId,
        chatsDocumentKey,
        groupKey,
      },
    );

    expect(result.group.name).toBe("New Name");
    const renamed = result.list.groups.find((g) => g.groupId === GROUP_ID);
    const other = result.list.groups.find((g) => g.groupId === OTHER_GROUP_ID);
    expect(renamed?.name).toBe("New Name");
    expect(other?.name).toBe("Other Group");
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("loadGroupKey rejects when the target document isn't actually a group", async ({
  page,
}) => {
  const documentId = "not-actually-a-group";
  const pairChatKey = await generateAesGcmKeyJwk();
  const content = await aesGcmEncrypt(
    pairChatKey,
    new TextEncoder().encode(
      JSON.stringify({
        documentId,
        name: "Chat",
        type: "chat",
        publicProfiles: {},
      }),
    ),
  );
  const notAGroupExistsParams = {
    ownerId: ALICE_ID,
    documentId,
    kid: MARY_ID,
    issuer: MARY_ID,
  };
  provider
    .addInteraction()
    .given("a document exists", notAGroupExistsParams)
    .uponReceiving(
      "a request to get a document that turns out not to be a group",
    )
    .withRequest("GET", `/users/${ALICE_ID}/documents/${documentId}`, (r) =>
      r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) => r.body("application/octet-stream", content));
  const wrappedKey = await encryptKeyEnvelope(pairChatKey, pairChatKey);
  const builder = provider
    .addInteraction()
    .given("a document exists", notAGroupExistsParams)
    .uponReceiving(
      "a request to get mary's key entry for a document that turns out not to be a group",
    )
    .withRequest(
      "GET",
      `/users/${ALICE_ID}/documents/${documentId}/keys/${MARY_ID}`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({ sharedKey: MatchersV3.string(wrappedKey) }),
    );

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await page.goto("/");

    const message = await page.evaluate(
      async ({ documentId, pairChatKey }) => {
        try {
          await window.groupService.loadGroupKey(
            "d20cf443-4f96-418f-a957-c8cbef8677c3",
            "10ad1cce-816b-4e12-b94d-7ef824c0d162",
            documentId,
            pairChatKey as JsonWebKey,
          );
          return "<resolved>";
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      },
      { documentId, pairChatKey },
    );

    expect(message).toBe("Expected a group document, got chat");
  });
});

test("Add Member shows an empty state once every contact is already a member", async ({
  page,
}) => {
  const GROUP_ID = "44444444-4444-4444-4444-444444444440";
  const chatsId = TestData.mary.settings!.chats;
  const groupKey = await generateAesGcmKeyJwk();

  await prepareMarysLogin(page);
  await prepareMarysEmptyDocumentsFolder();
  // Laura - mary's only contact - is already a member of this group.
  const chatsDocumentKey = await prepareMarysChatsDocument(
    [{ userId: LAURA_ID, chatId: "chat-laura", owner: MARY_ID }],
    undefined,
    undefined,
    [{ groupId: GROUP_ID, owner: MARY_ID, name: "Team" }],
  );
  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get contact requests before an empty add-member state",
    )
    .withRequest("GET", `/users/${MARY_ID}/contact-requests`, (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  const groupContent = await aesGcmEncrypt(
    groupKey,
    new TextEncoder().encode(
      JSON.stringify({
        documentId: GROUP_ID,
        name: "Team",
        type: "group",
        members: [MARY_ID, LAURA_ID],
        publicProfiles: {},
      }),
    ),
  );
  const groupExistsParams = {
    ownerId: MARY_ID,
    documentId: GROUP_ID,
    kid: chatsId,
    issuer: MARY_ID,
  };
  provider
    .addInteraction()
    .given("a document exists", groupExistsParams)
    .uponReceiving(
      "a request of mary to get her group before an empty add-member state",
    )
    .withRequest("GET", `/users/${MARY_ID}/documents/${GROUP_ID}`, (r) =>
      r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) =>
      r.body("application/octet-stream", groupContent),
    );
  const wrappedGroupKey = await encryptKeyEnvelope(groupKey, chatsDocumentKey);
  provider
    .addInteraction()
    .given("a document exists", groupExistsParams)
    .uponReceiving(
      "a request of mary to get her group's key before an empty add-member state",
    )
    .withRequest(
      "GET",
      `/users/${MARY_ID}/documents/${GROUP_ID}/keys/${chatsId}`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({ sharedKey: MatchersV3.string(wrappedGroupKey) }),
    );

  const builder = provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to receive messages before an empty add-member state",
    )
    .withRequest(
      "GET",
      `/users/${MARY_ID}/documents/${GROUP_ID}/messages`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    await loginAsMary(page);

    await page.getByRole("link", { name: "Chats" }).first().click();
    await page.getByText("Team", { exact: true }).first().click();

    await page.getByRole("button", { name: "person_add", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Add Member" }),
    ).toBeVisible();
    await expect(
      page.getByText("All your contacts are already members"),
    ).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
