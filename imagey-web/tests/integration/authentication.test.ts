import { MatchersV2 as Matchers, MatchersV3 } from "@pact-foundation/pact";
import { test, expect } from "./fixtures";
import {
  aesGcmEncrypt,
  clearLocalStorage,
  encryptKeyEnvelope,
  generateAesGcmKeyJwk,
  inputMarysPassword,
  prepareFreshUserSettings,
  prepareMarysChatsDocument,
  prepareMarysContactRequests,
  prepareMarysDocuments,
  prepareMarysEmptyDocumentsFolder,
  prepareMarysLogin,
  prepareMarysSettingsDocument,
  provider,
  setupMarysDevice,
  setupMockServer,
  TestData,
  runningPactRequests,
} from "./setup";
import { cryptoService } from "../../src/authentication/CryptoService";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test.afterEach("Wait for running requests", async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("new user enters wrong email", async ({ page }) => {
  // Given
  await page.goto("/");

  // When
  const emailInput = page.getByPlaceholder("email@imagey.cloud");
  await expect(emailInput).toBeVisible();
  await emailInput.fill("joe(at)imagey.cloud");
  await expect(
    page.getByText("Please enter a valid email address."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  // Then
  await expect(
    page.getByText("Please enter a valid email address."),
  ).toBeVisible();
});

test("new user visits page", async ({ page }) => {
  // Given: a brand-new visitor has no userId, so the client never looks up a
  // public key - it just asks the server to mail a verification link.
  await provider
    .addInteraction()
    .uponReceiving("a request of joe to verify his email")
    .withRequest("POST", "/users/verifications", (r) =>
      r
        .headers({
          "Content-Type": "application/json",
        })
        .jsonBody({ email: "joe@imagey.cloud" }),
    )
    .willRespondWith(201)
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await page.goto("/");
      const emailInput = page.getByPlaceholder("email@imagey.cloud");
      await expect(emailInput).toBeVisible();

      await emailInput.fill("joe@imagey.cloud");
      await page.getByRole("button", { name: "Confirm", exact: true }).click();

      // Then
      await expect(page.getByText(/verification link/)).toBeVisible();
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("existing user visits page with new device", async ({ page }) => {
  // Given: no userId in local storage or on the URL, so the client cannot
  // resolve the account - it goes straight to the email/verification flow
  // without ever looking up a public key.
  await provider
    .addInteraction()
    .uponReceiving("a request of mary to login")
    .withRequest("POST", "/users/verifications", (r) =>
      r
        .headers({ "Content-Type": "application/json" })
        .jsonBody({ email: "mary@imagey.cloud" }),
    )
    .willRespondWith(202)
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await page.goto("/");
      const emailInput = page.getByPlaceholder("email@imagey.cloud");
      await expect(emailInput).toBeVisible();

      await emailInput.fill("mary@imagey.cloud");
      await page.getByRole("button", { name: "Confirm", exact: true }).click();

      // Then
      await expect(page.getByText(/login link/)).toBeVisible();
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test.skip("existing user visits page with invalid token", async ({ page }) => {
  // Given
  provider
    .addInteraction()
    .given("User has invalid token")
    .uponReceiving("a request of mary to get symmetric key")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/symmetric-keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(403);

  await provider
    .addInteraction()
    .uponReceiving("a request of mary to register account")
    .withRequest("POST", "/users/", (r) =>
      r
        .headers({
          "Content-Type": "application/json",
        })
        .jsonBody({
          email: "mary@imagey.cloud",
          deviceId: Matchers.string("ab85c7ca-8288-4a67-9d7a-15b82e22e75b"),
          devicePublicKey: {
            crv: Matchers.string("P-256"),
            ext: Matchers.boolean(true),
            key_ops: [],
            kty: Matchers.string("EC"),
            x: Matchers.string("I_VS7DvICMehgUF2rA4llF0mjZOSs6vgO_A5PLobUmc"),
            y: Matchers.string("Z4astOZHg9NfhoAldwMZhC34UQsRU7CflGn8JpNGtAg"),
          },
          mainPublicKey: {
            crv: Matchers.string("P-256"),
            ext: Matchers.boolean(true),
            key_ops: [],
            kty: Matchers.string("EC"),
            x: Matchers.string("I_VS7DvICMehgUF2rA4llF0mjZOSs6vgO_A5PLobUmc"),
            y: Matchers.string("Z4astOZHg9NfhoAldwMZhC34UQsRU7CflGn8JpNGtAg"),
          },
          encryptedPrivateKey: Matchers.string("dummyEncryptedPrivateKey"),
          settings: Matchers.string("e30="),
          settingsSharedKey: {
            issuer: "d20cf443-4f96-418f-a957-c8cbef8677c3",
            kid: "0",
            sharedKey: Matchers.string("ZHVtbXlTaGFyZWRLZXk="),
          },
        }),
    )
    .willRespondWith(409)
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await page.evaluate(() =>
        localStorage.setItem(
          "imagey.user",
          "d20cf443-4f96-418f-a957-c8cbef8677c3",
        ),
      );
      await page.evaluate(
        (deviceId) =>
          localStorage.setItem(
            "imagey.deviceIds[d20cf443-4f96-418f-a957-c8cbef8677c3]",
            deviceId,
          ),
        TestData.mary.devices[0].deviceId,
      );
      await page.goto("/");
      const emailInput = page.getByPlaceholder("email@imagey.cloud");
      await expect(emailInput).toBeVisible();

      await emailInput.fill("mary@imagey.cloud");
      await page.getByRole("button", { name: "Confirm", exact: true }).click();

      // Then
      await expect(page.getByText(/login link/)).toBeVisible();
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("new user clicks registration link", async ({ page }) => {
  // Given
  provider
    .addInteraction()
    .uponReceiving("a request of registering joe to get public key")
    .withRequest(
      "GET",
      "/users/35c34cb3-559d-4001-a67b-23259e45e69e/public-keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(404);

  // Registration creates the root document, profile, chats and documents
  // list directly - a single multipart POST /users (no trailing slash):
  // one JSON "metadata" part plus the four encrypted document blobs as
  // binary parts (see AuthenticationRepository.register). The values are
  // all client-generated crypto (random per test run), so we only assert
  // the Content-Type shape here, same as prepareMarysFolderCreation()'s
  // multipart matcher elsewhere in this suite.
  provider
    .addInteraction()
    .uponReceiving("a request to register joe")
    .withRequest("POST", "/users", (r) =>
      r.headers({
        "Content-Type": MatchersV3.regex(
          "multipart/form-data.*",
          "multipart/form-data; boundary=.*",
        ),
      }),
    )
    .willRespondWith(200);

  // App.tsx always fetches the settings document once keys are available -
  // including right after registration, since RegistrationDialog only
  // passes the key pairs forward, not the settings/document-list data the
  // registration call itself just generated. See prepareFreshUserSettings()
  // for why this needs its own freshly-generated settings key rather than
  // one of Mary's fixed fixtures, and the crypto.subtle.decrypt override
  // below for how the one undecryptable envelope (wrapped under joe's
  // randomly-generated, in-browser mainKeyPair) is handled.
  const { settingsKeyJwk } = await prepareFreshUserSettings(
    "35c34cb3-559d-4001-a67b-23259e45e69e",
  );
  // The chats document (with an empty contacts list) is already mocked by
  // prepareFreshUserSettings() above, same as the document list.

  await provider
    .addInteraction()
    .given("Joe is registered")
    .uponReceiving("a request of joe to get contact requests")
    .withRequest(
      "GET",
      "/users/35c34cb3-559d-4001-a67b-23259e45e69e/contact-requests",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]))
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await page.addInitScript((fixedSettingsKey) => {
        const originalDecrypt = crypto.subtle.decrypt.bind(crypto.subtle);
        crypto.subtle.decrypt = async function (algorithm, key, data) {
          try {
            return await originalDecrypt(algorithm, key, data);
          } catch {
            return new TextEncoder().encode(JSON.stringify(fixedSettingsKey))
              .buffer;
          }
        };
      }, settingsKeyJwk);
      await page.goto(
        "/?email=joe@imagey.cloud&userId=35c34cb3-559d-4001-a67b-23259e45e69e",
      );

      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();
      await passwordInput.fill(TestData.mary.password);
      await page.getByLabel("Confirm Password").fill(TestData.mary.password);
      await page.getByRole("button", { name: "Confirm", exact: true }).click();

      // Then
      await expect(page.getByText(/Upload Images/)).toBeVisible({
        timeout: 10_000,
      });
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("new user registers via invite link and accepts the invitation", async ({
  page,
}) => {
  // Given: joe follows an invite link from mary. The link no longer carries
  // mary's public key - joe reads it off his own contact-request entry when
  // he accepts the invitation as the last step of registration (see
  // AuthenticationService.register / InvitationFilter).

  // The emailed link itself is a real provider interaction: GET
  // /invitations/<token> answers 302 back into the SPA with just the inviter
  // and email as query params. Pinning it here (rather than hand-building the
  // redirect URL) keeps the server responsible for the redirect shape - see
  // InvitationFilter / ContactService.invite.
  provider
    .addInteraction()
    .given("mary has invited joe")
    .uponReceiving("the browser following mary's emailed invitation link")
    .withRequest(
      "GET",
      MatchersV3.regex(
        "/invitations/[^/?]+",
        "/invitations/pact-invitation-token",
      ),
    )
    .willRespondWith(302, (r) =>
      r.headers({
        Location: MatchersV3.regex(
          "/\\?email=joe@imagey\\.cloud&userId=35c34cb3-559d-4001-a67b-23259e45e69e&inviter=d20cf443-4f96-418f-a957-c8cbef8677c3",
          `/?email=joe@imagey.cloud&userId=35c34cb3-559d-4001-a67b-23259e45e69e&inviter=d20cf443-4f96-418f-a957-c8cbef8677c3`,
        ),
      }),
    );

  provider
    .addInteraction()
    .uponReceiving(
      "a request of registering joe (invited by mary) to get public key",
    )
    .withRequest(
      "GET",
      "/users/35c34cb3-559d-4001-a67b-23259e45e69e/public-keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(404);

  // Same multipart registration call as "new user clicks registration
  // link" above - only assert the Content-Type shape, same reasoning.
  provider
    .addInteraction()
    .uponReceiving("a request to register joe invited by mary")
    .withRequest("POST", "/users", (r) =>
      r.headers({
        "Content-Type": MatchersV3.regex(
          "multipart/form-data.*",
          "multipart/form-data; boundary=.*",
        ),
      }),
    )
    .willRespondWith(200);

  const { settingsKeyJwk, profileId } = await prepareFreshUserSettings(
    "35c34cb3-559d-4001-a67b-23259e45e69e",
  );

  // Accepting mary's invitation as the last step of registration first
  // ensures joe has a named public profile of his own (§3.6, name entered
  // directly in the password dialog) - his freshly-registered, still
  // nameless private profile has to be read first (self-wrapped like
  // documentList/chatList above), then a fresh public-profile is created and
  // named.
  const joeProfileKey = await generateAesGcmKeyJwk();
  const joeProfileContent = await aesGcmEncrypt(
    joeProfileKey,
    new TextEncoder().encode(JSON.stringify({ emails: ["joe@imagey.cloud"] })),
  );
  const joeProfileWrappedKey = await encryptKeyEnvelope(
    joeProfileKey,
    settingsKeyJwk,
  );
  provider
    .addInteraction()
    .given("Joe is registered")
    // "Joe is registered" only restores his settings/document-list/chat-list
    // fixture (see ContractTest.joeIsRegistered) - his profile document
    // (44444444-..., self-wrapped) has no static fixture of its own, so the
    // generic "a document exists" state creates it here.
    .given("a document exists", {
      ownerId: "35c34cb3-559d-4001-a67b-23259e45e69e",
      documentId: profileId,
      kid: "35c34cb3-559d-4001-a67b-23259e45e69e",
      issuer: "35c34cb3-559d-4001-a67b-23259e45e69e",
    })
    .uponReceiving("a request of joe to get his fresh profile document")
    .withRequest(
      "GET",
      `/users/35c34cb3-559d-4001-a67b-23259e45e69e/documents/${profileId}`,
      (r) => r.headers({ Accept: "application/octet-stream" }),
    )
    .willRespondWith(200, (r) =>
      r.body("application/octet-stream", joeProfileContent),
    );
  provider
    .addInteraction()
    .given("Joe is registered")
    .given("a document exists", {
      ownerId: "35c34cb3-559d-4001-a67b-23259e45e69e",
      documentId: profileId,
      kid: "35c34cb3-559d-4001-a67b-23259e45e69e",
      issuer: "35c34cb3-559d-4001-a67b-23259e45e69e",
    })
    .uponReceiving("a request of joe to get his fresh profile document key")
    .withRequest(
      "GET",
      `/users/35c34cb3-559d-4001-a67b-23259e45e69e/documents/${profileId}/keys/35c34cb3-559d-4001-a67b-23259e45e69e`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        issuer: "35c34cb3-559d-4001-a67b-23259e45e69e",
        kid: "35c34cb3-559d-4001-a67b-23259e45e69e",
        sharedKey: MatchersV3.string(joeProfileWrappedKey),
      }),
    );
  provider
    .addInteraction()
    .uponReceiving(
      "a request of joe to create his public profile on registration",
    )
    .withRequest(
      "POST",
      "/users/35c34cb3-559d-4001-a67b-23259e45e69e/documents",
      (r) => {
        r.headers({
          "Content-Type": MatchersV3.regex(
            "multipart/form-data.*",
            "multipart/form-data; boundary=.*",
          ),
        });
      },
    )
    .willRespondWith(201, (r) =>
      r.headers({
        Location: MatchersV3.string(
          "/users/35c34cb3-559d-4001-a67b-23259e45e69e/documents/joes-public-profile",
        ),
        "Access-Control-Expose-Headers": "Location, ETag",
      }),
    );
  provider
    .addInteraction()
    .uponReceiving(
      "a request of joe to name his public profile on registration",
    )
    .withRequest(
      "PUT",
      Matchers.regex({
        matcher: `/users/35c34cb3-559d-4001-a67b-23259e45e69e/documents/(?!${profileId}).+$`,
        generate:
          "/users/35c34cb3-559d-4001-a67b-23259e45e69e/documents/joes-public-profile",
      }),
      (r) => r.headers({ "Content-Type": "application/octet-stream" }),
    )
    .willRespondWith(204, (r) =>
      r.headers({ ETag: MatchersV3.string('"joes-public-profile-etag"') }),
    );

  // Accepting mary's invitation as the last step of registration also
  // creates the chat's own Document - same shape as
  // prepareMarysChatCreation() elsewhere in this suite.
  provider
    .addInteraction()
    .uponReceiving("a request to create joes chat with mary on registration")
    .withRequest(
      "POST",
      "/users/35c34cb3-559d-4001-a67b-23259e45e69e/documents",
      (r) => {
        r.headers({
          "Content-Type": MatchersV3.regex(
            "multipart/form-data.*",
            "multipart/form-data; boundary=.*",
          ),
        });
      },
    )
    .willRespondWith(201, (r) =>
      r.headers({
        Location: MatchersV3.string(
          "/users/35c34cb3-559d-4001-a67b-23259e45e69e/documents/new-chat-id",
        ),
        "Access-Control-Expose-Headers": "Location, ETag",
      }),
    );

  // No dedicated fetch of mary's public key - it comes back on joe's own
  // contact-request entry (see the "get contact requests" interaction below,
  // which returns mary's still-pending INVITED request with her public key).
  provider
    .addInteraction()
    // Joe hasn't registered yet at this point in the test, but mary's invitation to him was
    // already persisted server-side when she sent it (see ContactService.invite) - the backend
    // needs to be told that's waiting for him so this PUT has something to accept.
    .given("mary has invited joe")
    .uponReceiving(
      "a request of joe to accept marys invitation on registration",
    )
    .withRequest(
      "PUT",
      "/users/35c34cb3-559d-4001-a67b-23259e45e69e/contact-requests/d20cf443-4f96-418f-a957-c8cbef8677c3",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        });
        // The encrypted key/chatId are generated dynamically (see
        // ContactService.acceptContactRequest) - only assert the shape.
        r.jsonBody({
          inviter: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          invitee: "35c34cb3-559d-4001-a67b-23259e45e69e",
          status: "ACCEPTED",
          publicKey: MatchersV3.like(TestData.mary.publicMainKey),
          chatId: MatchersV3.string("new-chat-id"),
          sharedKey: MatchersV3.string("dummy-encrypted-key"),
          publicProfileId: MatchersV3.string("joes-public-profile"),
        });
      },
    )
    .willRespondWith(204);

  // Joe also shares his freshly-named public profile into the new chat with
  // mary (§3.2).
  provider
    .addInteraction()
    .uponReceiving(
      "a request of joe to share his public profile with mary on registration",
    )
    .withRequest(
      "POST",
      Matchers.regex({
        matcher: `/users/35c34cb3-559d-4001-a67b-23259e45e69e/documents/(?!${profileId}).+/keys$`,
        generate:
          "/users/35c34cb3-559d-4001-a67b-23259e45e69e/documents/joes-public-profile/keys",
      }),
      (r) => {
        r.headers({ "Content-Type": "application/json" }).jsonBody({
          issuer: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          kid: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          sharedKey: MatchersV3.string("dummy-shared-key"),
        });
      },
    )
    .willRespondWith(200);

  await provider
    .addInteraction()
    .given("mary has invited joe")
    .uponReceiving("a request of joe to get contact requests after registering")
    .withRequest(
      "GET",
      "/users/35c34cb3-559d-4001-a67b-23259e45e69e/contact-requests",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          inviter: "d20cf443-4f96-418f-a957-c8cbef8677c3",
          invitee: "35c34cb3-559d-4001-a67b-23259e45e69e",
          status: "INVITED",
          publicKey: MatchersV3.like(TestData.mary.publicMainKey),
        },
      ]),
    )
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await page.addInitScript((fixedSettingsKey) => {
        const originalDecrypt = crypto.subtle.decrypt.bind(crypto.subtle);
        crypto.subtle.decrypt = async function (algorithm, key, data) {
          try {
            return await originalDecrypt(algorithm, key, data);
          } catch {
            return new TextEncoder().encode(JSON.stringify(fixedSettingsKey))
              .buffer;
          }
        };
      }, settingsKeyJwk);

      // Follow the emailed link; the mock server answers 302 and the browser
      // lands on the SPA with ?email/?inviter set.
      await page.goto("/invitations/pact-invitation-token");
      await expect(page).toHaveURL(
        /inviter=d20cf443-4f96-418f-a957-c8cbef8677c3/,
      );

      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();
      await passwordInput.fill(TestData.mary.password);
      await page.getByLabel("Confirm Password").fill(TestData.mary.password);
      // Invite-based registration also asks for a display name directly in
      // this dialog (§3.6/§10).
      await page.getByLabel("How should others see you?").fill("Joe Invited");
      await page.getByRole("button", { name: "Confirm", exact: true }).click();

      // Then: the accept PUT and the chat-document POST above are verified by
      // executeTest (it fails if an interaction was not called). Confirm the
      // SPA finished registration and landed in the app rather than erroring
      // on the dialog. Wait for the activities list to actually render (not
      // just the "Home" link, which is visible before Activities.tsx even
      // starts loading) - ActivityService.getActivities awaits the document
      // list fetch before contact requests turn into visible activity cards,
      // so this guarantees that fetch has already happened and
      // runningPactRequests can't dip to 0 while it's still pending - see
      // the imagey-web-runningpactrequests-race memory. The still-pending
      // invitation (mary's contact-requests entry is mocked as still
      // INVITED after accepting - see the interaction above) means the
      // document-list-empty "Upload Images" panel never renders here, so a
      // "Contact request" activity card is used as the signal instead.
      await expect(
        page.getByText("An error occurred during authentication"),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Contact request" }),
      ).toBeVisible({
        timeout: 10_000,
      });
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("mary logges in with new device", async ({ page }) => {
  // Given
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get public key")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));
  provider
    .addInteraction()
    .uponReceiving("a request of mary to store public key for device")
    .withRequest(
      "POST",
      Matchers.regex({
        generate: `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[1].deviceId}/public-keys/`,
        matcher:
          "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/.+/public-keys/",
      }),
      (r) =>
        r.headers({ "Content-Type": "application/json" }).jsonBody({
          crv: "P-256",
          ext: true,
          key_ops: [],
          kty: "EC",
          x: Matchers.string("arFY-wWlA-rikTjcTc62L5ghQ2DaqOStDEdQ2f0nUJ8"),
          y: Matchers.string("UsYeOva7ipzP218Va5RPJR46L1OXybK2vxISuVUAXyw"),
        }),
    )
    .willRespondWith(200);
  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get public device key for second device",
    )
    .withRequest(
      "GET",
      Matchers.regex({
        generate: `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[1].deviceId}/public-keys/0`,
        matcher:
          "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/.+/public-keys/0",
      }),
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(TestData.mary.devices[1].publicDeviceKey),
    );
  await provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get private main key for second device",
    )
    .withRequest(
      "GET",
      Matchers.regex({
        generate: `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[1].deviceId}/private-keys/0`,
        matcher:
          "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/.+/private-keys/0",
      }),
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(404)
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await page.goto(
        "/?email=mary@imagey.cloud&userId=d20cf443-4f96-418f-a957-c8cbef8677c3",
      );

      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();
      await passwordInput.fill(TestData.mary.password);
      await page.getByLabel("Confirm Password").fill(TestData.mary.password);
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(
        page.getByText(
          /Device registered, you can now activate it with another device/,
        ),
      ).toBeVisible();

      await page.getByRole("button", { name: "OK" }).click();

      // Then
      await expect(
        page.getByText(
          /Device registered, but still not unlocked. You need to unlock it with another device/,
        ),
      ).toBeVisible();
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("existing user clicks login link on existing device", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  const given = await prepareMarysContactRequests();

  await given.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.evaluate(() =>
      localStorage.setItem("imagey.user", "bob@imagey.cloud"),
    );
    await page.goto(
      "/?email=mary@imagey.cloud&userId=d20cf443-4f96-418f-a957-c8cbef8677c3",
    );

    await inputMarysPassword(page);

    // Then
    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("unauthenticated with a userId but no device and no email falls back to the email dialog", async ({
  page,
}) => {
  // Given: the redirect carried only ?userId= (no ?email=), this browser has
  // never held a device for the account, and the public-key lookup says the
  // session is not authenticated. With nothing else to go on, the component
  // asks for the address again so the mail flow can restart.
  await provider
    .addInteraction()
    .given("User has invalid token")
    .uponReceiving(
      "a request of an unauthenticated user to get their public key",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(401)
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await page.goto("/?userId=d20cf443-4f96-418f-a957-c8cbef8677c3");

      // Then
      await expect(page.getByPlaceholder("email@imagey.cloud")).toBeVisible();
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("visit page on existing device", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  const given = await prepareMarysContactRequests();

  await given.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await setupMarysDevice(page);
    await page.goto("/");

    const passwordInput = page.getByLabel("Password", { exact: true });
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill("MarysPassword123");
    await page.getByRole("button", { name: "Confirm", exact: true }).click();

    // Then
    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("visit page on existing device with wrong password", async ({ page }) => {
  // Given
  await provider
    .addInteraction()
    .uponReceiving("a request of mary to get public key")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey))
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await setupMarysDevice(page);
      await page.goto("/");

      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();
      await passwordInput.fill("wrongPassword");
      await page.getByRole("button", { name: "Confirm", exact: true }).click();

      // Then
      await expect(page.getByText(/Wrong password/)).toBeVisible();
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("login with missing email", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysDocuments();
  const provider = await prepareMarysContactRequests();

  await provider.executeTest(async (mockServer) => {
    // When: the stored account id is gone, but Mary follows the login link from
    // her mailbox - the server resolves her address and puts the id back on the
    // redirect, so the client can pick up where it left off.
    await setupMockServer(page, mockServer);
    await page.evaluate(() => localStorage.removeItem("imagey.user"));
    await page.goto(
      "/?email=mary@imagey.cloud&userId=d20cf443-4f96-418f-a957-c8cbef8677c3",
    );

    await inputMarysPassword(page);

    // Then
    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("login with lost private key", async ({ page }) => {
  // Given
  await provider
    .addInteraction()
    .uponReceiving("a request of mary to get public key")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey))
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await page.evaluate(() =>
        localStorage.setItem(
          "imagey.user",
          "d20cf443-4f96-418f-a957-c8cbef8677c3",
        ),
      );
      await page.evaluate(
        (deviceId) =>
          localStorage.setItem(
            "imagey.deviceIds[d20cf443-4f96-418f-a957-c8cbef8677c3]",
            deviceId,
          ),
        TestData.mary.devices[0].deviceId,
      );
      await page.goto("/");

      // Then
      await expect(
        page.getByText("Device key missing, please reregister device"),
      ).toBeVisible();
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("switch user using wrong user button", async ({ page }) => {
  // Given
  await provider
    .addInteraction()
    .uponReceiving("a request of mary to get public key for switch user")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey))
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      // Pass email as query param, this will open DeviceRegistrationDialog (since deviceId is missing)
      await page.goto(
        "/?email=mary@imagey.cloud&userId=d20cf443-4f96-418f-a957-c8cbef8677c3",
      );

      // Verify we are on DeviceRegistrationDialog (Password input is visible)
      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();

      // Click "Sign in with a different email"
      const wrongUserButton = page.getByText("Sign in with a different email");
      await expect(wrongUserButton).toBeVisible();
      await wrongUserButton.click();

      // Then: We should be back at EmailDialog
      const emailInput = page.getByPlaceholder("email@imagey.cloud");
      await expect(emailInput).toBeVisible();
      // Verify local storage is cleared
      const storedUser = await page.evaluate(() =>
        localStorage.getItem("imagey.user"),
      );
      expect(storedUser).toBeNull();

      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("existing user authenticates via challenge-response on existing device", async ({
  page,
}) => {
  // Given
  await prepareMarysDocuments();
  // App.tsx always fetches the settings document once keys are decrypted,
  // regardless of how the device got unlocked - this challenge-response
  // flow doesn't go through prepareMarysLogin(), so it has to be mocked
  // explicitly here too.
  await prepareMarysSettingsDocument();
  provider
    .addInteraction()
    .given("marys second device registered")
    .given("User has invalid token")
    .uponReceiving(
      "a request to get public key, returning 401 to trigger challenge",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(401);

  provider
    .addInteraction()
    .given("marys second device registered")
    .given("User has invalid token")
    .uponReceiving("a request for a challenge")
    .withRequest(
      "POST",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/challenges`,
    )
    .willRespondWith(201, (r) =>
      r.headers({ "Content-Type": "application/json" }).jsonBody({
        ephemeralPublicKey: Matchers.like({
          crv: TestData.mary.publicMainKey.crv,
          kty: TestData.mary.publicMainKey.kty,
          x: TestData.mary.publicMainKey.x,
          y: TestData.mary.publicMainKey.y,
        }),
        nonce: Matchers.like("some-random-nonce"),
      }),
    );

  provider
    .addInteraction()
    .given("marys second device registered")
    .given("User has invalid token")
    .uponReceiving("a request to authenticate with a challenge signature")
    .withRequest(
      "POST",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/authentications`,
      (r) =>
        r.headers({ "Content-Type": "application/json" }).jsonBody({
          signature: Matchers.string("any-signature"),
        }),
    )
    .willRespondWith(200, (r) =>
      r.headers({
        "Set-Cookie": Matchers.string("Authorization=test-token; Path=/"),
      }),
    );

  provider
    .addInteraction()
    .given("marys second device registered")
    .given("marys second device unlocked")
    .uponReceiving("a request to get private key after authentication")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/private-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.headers({ "Content-Type": "application/json" }).jsonBody({
        kid: "0",
        encryptingDeviceId: TestData.mary.devices[0].deviceId,
        key: TestData.mary.devices[0].encryptedPrivateMainKey,
      }),
    );

  provider
    .addInteraction()
    .given("marys second device registered")
    .given("marys second device unlocked")
    .uponReceiving("a request to get public main key after authentication")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
          Cookie: Matchers.like("Authorization="),
        }),
    )
    .willRespondWith(200, (r) =>
      r.headers({ "Content-Type": "application/json" }).jsonBody(
        Matchers.like({
          crv: TestData.mary.publicMainKey.crv,
          kty: TestData.mary.publicMainKey.kty,
          x: TestData.mary.publicMainKey.x,
          y: TestData.mary.publicMainKey.y,
        }),
      ),
    );

  provider
    .addInteraction()
    .given("marys second device registered")
    .given("marys second device unlocked")
    .uponReceiving("a request to get public device key after authentication")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/public-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
          Cookie: Matchers.like("Authorization="),
        }),
    )
    .willRespondWith(200, (r) =>
      r.headers({ "Content-Type": "application/json" }).jsonBody(
        Matchers.like({
          crv: TestData.mary.devices[0].publicDeviceKey!.crv,
          kty: TestData.mary.devices[0].publicDeviceKey!.kty,
          x: TestData.mary.devices[0].publicDeviceKey!.x,
          y: TestData.mary.devices[0].publicDeviceKey!.y,
        }),
      ),
    );

  await prepareMarysChatsDocument(
    [],
    [
      "marys second device registered",
      "marys second device unlocked",
      "mary has no contacts",
    ],
  );

  await provider
    .addInteraction()
    .given("marys second device registered")
    .given("marys second device unlocked")
    .uponReceiving("a request of mary to get contact requests after challenge")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]))
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await setupMarysDevice(page);

      await page.goto("/");

      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();
      await passwordInput.fill("MarysPassword123");

      const authenticationsResponse = page.waitForResponse(
        "**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/*/authentications*",
      );
      await page.getByRole("button", { name: "Confirm", exact: true }).click();

      // Then
      await authenticationsResponse;

      await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();

      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("existing user authenticates via challenge-response and selects keep me logged in", async ({
  page,
}) => {
  // Given
  // Same real-documents-root fix as unlock.test.ts: settings.documents
  // resolves to Mary's real documents root (68980188-...), not a
  // "root-folder-id" placeholder, so we need the empty variant of the real
  // root here (the old root-folder-id-based helper was removed as dead code).
  await prepareMarysEmptyDocumentsFolder();
  // App.tsx always fetches the settings document once keys are decrypted,
  // regardless of how the device got unlocked - this challenge-response
  // flow doesn't go through prepareMarysLogin(), so it has to be mocked
  // explicitly here too.
  await prepareMarysSettingsDocument();
  provider
    .addInteraction()
    .given("marys second device registered")
    .given("User has invalid token")
    .uponReceiving(
      "a request to get public key, returning 401 to trigger challenge with keep me logged in",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(401);

  provider
    .addInteraction()
    .given("marys second device registered")
    .given("User has invalid token")
    .uponReceiving("a request for a challenge with keep me logged in")
    .withRequest(
      "POST",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/challenges`,
    )
    .willRespondWith(201, (r) =>
      r.headers({ "Content-Type": "application/json" }).jsonBody({
        ephemeralPublicKey: Matchers.like({
          crv: TestData.mary.publicMainKey.crv,
          kty: TestData.mary.publicMainKey.kty,
          x: TestData.mary.publicMainKey.x,
          y: TestData.mary.publicMainKey.y,
        }),
        nonce: Matchers.like("some-random-nonce"),
      }),
    );

  await provider
    .addInteraction()
    .given("marys second device registered")
    .given("User has invalid token")
    .uponReceiving(
      "a request to authenticate with a challenge signature and trusted device",
    )
    .withRequest(
      "POST",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/authentications`,
      (r) =>
        r
          .query({ trusted: "true" })
          .headers({ "Content-Type": "application/json" })
          .jsonBody({
            signature: Matchers.string("any-signature"),
          }),
    )
    .willRespondWith(200, (r) =>
      r.headers({
        "Set-Cookie": Matchers.string(
          "Authorization=test-token; Path=/; Max-Age=2592000",
        ),
      }),
    );

  await provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request to store recovery key")
    .withRequest(
      "POST",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/recovery-key`,
      (r) =>
        r
          .headers({ "Content-Type": "application/json" })
          .jsonBody(Matchers.string('"any-recovery-key"')),
    )
    .willRespondWith(200);

  provider
    .addInteraction()
    .given("marys second device registered")
    .given("marys second device unlocked")
    .uponReceiving(
      "a request to get private key after authentication with keep me logged in",
    )
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/private-keys/0`,
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) =>
      r.headers({ "Content-Type": "application/json" }).jsonBody({
        kid: "0",
        encryptingDeviceId: TestData.mary.devices[0].deviceId,
        key: TestData.mary.devices[0].encryptedPrivateMainKey,
      }),
    );

  await provider
    .addInteraction()
    .given("marys second device registered")
    .given("marys second device unlocked")
    .uponReceiving(
      "a request to get public main key after authentication with keep me logged in",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
          Cookie: Matchers.like("Authorization="),
        }),
    )
    .willRespondWith(200, (r) =>
      r.headers({ "Content-Type": "application/json" }).jsonBody(
        Matchers.like({
          crv: TestData.mary.publicMainKey.crv,
          kty: TestData.mary.publicMainKey.kty,
          x: TestData.mary.publicMainKey.x,
          y: TestData.mary.publicMainKey.y,
        }),
      ),
    );

  await provider
    .addInteraction()
    .given("marys second device registered")
    .given("marys second device unlocked")
    .uponReceiving(
      "a request to get public device key after authentication with keep me logged in",
    )
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/public-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
          Cookie: Matchers.like("Authorization="),
        }),
    )
    .willRespondWith(200, (r) =>
      r.headers({ "Content-Type": "application/json" }).jsonBody(
        Matchers.like({
          crv: TestData.mary.devices[0].publicDeviceKey!.crv,
          kty: TestData.mary.devices[0].publicDeviceKey!.kty,
          x: TestData.mary.devices[0].publicDeviceKey!.x,
          y: TestData.mary.devices[0].publicDeviceKey!.y,
        }),
      ),
    );

  await prepareMarysChatsDocument(
    [],
    [
      "marys second device registered",
      "marys second device unlocked",
      "mary has no contacts",
    ],
  );

  await provider
    .addInteraction()
    .given("marys second device registered")
    .given("marys second device unlocked")
    .given("mary has no contacts")
    .uponReceiving(
      "a request of mary to get contact requests after challenge with keep me logged in",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/contact-requests",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]))
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await setupMarysDevice(page);

      await page.goto("/");

      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();
      await passwordInput.fill("MarysPassword123");

      const keepLoggedInCheckbox = page.getByRole("checkbox", {
        name: "Keep me logged in",
      });
      await expect(keepLoggedInCheckbox).toBeVisible();
      await keepLoggedInCheckbox.check({ force: true });

      const authenticationsResponse = page.waitForResponse(
        "**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/*/authentications*",
      );
      const recoveryKeyResponse = page.waitForResponse(
        "**/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/*/recovery-key",
      );
      await page.getByRole("button", { name: "Confirm", exact: true }).click();

      // Then
      await authenticationsResponse;
      await recoveryKeyResponse;

      await expect(page.getByText(/Upload Images/)).toBeVisible();

      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("existing user authenticates via challenge-response but provides wrong password", async ({
  page,
}) => {
  provider
    .addInteraction()
    .given("marys second device registered")
    .given("User has invalid token")
    .uponReceiving(
      "a request to get public key, returning 401 to trigger challenge for wrong password",
    )
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(401);

  await provider
    .addInteraction()
    .given("marys second device registered")
    .given("User has invalid token")
    .uponReceiving("a request for a challenge with wrong password")
    .withRequest(
      "POST",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/challenges`,
    )
    .willRespondWith(201, (r) =>
      r.headers({ "Content-Type": "application/json" }).jsonBody({
        ephemeralPublicKey: Matchers.like({
          crv: TestData.mary.publicMainKey.crv,
          kty: TestData.mary.publicMainKey.kty,
          x: TestData.mary.publicMainKey.x,
          y: TestData.mary.publicMainKey.y,
        }),
        nonce: Matchers.like("some-random-nonce"),
      }),
    )
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await setupMarysDevice(page);

      await page.goto("/");
      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();
      await passwordInput.fill("WrongPassword");

      await page.getByRole("button", { name: "Confirm", exact: true }).click();

      // Then
      await expect(page.getByText("Wrong password")).toBeVisible();
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("passwords do not match shows error", async ({ page }) => {
  await provider
    .addInteraction()
    .uponReceiving("a request to get public key for unknown user")
    .withRequest(
      "GET",
      "/users/00000000-0000-4000-8000-000000000002/public-keys/0",
    )
    .willRespondWith(404)
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      await page.goto(
        "/?email=unknown@imagey.cloud&userId=00000000-0000-4000-8000-000000000002",
      );

      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();
      await passwordInput.fill("Password123");

      const confirmPasswordInput = page.getByLabel("Confirm Password");
      await expect(confirmPasswordInput).toBeVisible();
      await confirmPasswordInput.fill("DifferentPassword123");

      await page.getByRole("button", { name: "Confirm", exact: true }).click();

      await expect(page.getByText("Passwords do not match")).toBeVisible();
    });
});

test("unlockLocalDeviceKey fails if private key missing locally", async ({
  page,
}) => {
  const builder = provider
    .addInteraction()
    .uponReceiving("a request of mary to get public key for unlock error")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    // Use an existing device (this sets localStorage with keys and deviceId)
    await setupMarysDevice(page);

    await page.goto(
      "/?email=mary@imagey.cloud&userId=d20cf443-4f96-418f-a957-c8cbef8677c3",
    );

    const passwordInput = page.getByLabel("Password", { exact: true });
    await expect(passwordInput).toBeVisible();

    // Clear the specific private key before filling password
    await page.evaluate((deviceId) => {
      localStorage.removeItem(`imagey.devices[${deviceId}].key`);
    }, TestData.mary.devices[0].deviceId);

    await passwordInput.fill(TestData.mary.password);
    await page.getByRole("button", { name: "Confirm", exact: true }).click();

    // Wrong password (since decrypt fails) or error
    await expect(page.getByText("Wrong password")).toBeVisible();
  });
});

test("existing user auto-logs in with stored recovery key", async ({
  page,
}) => {
  await prepareMarysDocuments();
  await prepareMarysContactRequests();
  // App.tsx always fetches the settings document once keys are decrypted,
  // regardless of how the device got unlocked - this auto-login-via-
  // recovery-key flow doesn't go through prepareMarysLogin(), so it has to
  // be mocked explicitly here too.
  await prepareMarysSettingsDocument();

  provider
    .addInteraction()
    .given("marys second device registered with recovery key")
    .uponReceiving("a request to get public key for auto login")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));

  await provider
    .addInteraction()
    .given("marys second device registered with recovery key")
    .uponReceiving("a request to fetch recovery key for auto login")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/recovery-key`,
    )
    .willRespondWith(200, (r) =>
      r.body("application/json", Buffer.from('"any-recovery-key"')),
    );

  await provider
    .addInteraction()
    .given("marys second device registered with recovery key")
    .uponReceiving("a request to get public device key for auto login")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/public-keys/0`,
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(
        Matchers.like({
          crv: TestData.mary.devices[0].publicDeviceKey!.crv,
          kty: TestData.mary.devices[0].publicDeviceKey!.kty,
          x: TestData.mary.devices[0].publicDeviceKey!.x,
          y: TestData.mary.devices[0].publicDeviceKey!.y,
        }),
      ),
    );

  await provider
    .addInteraction()
    .given("marys second device registered with recovery key")
    .uponReceiving(
      "a request of mary to get encrypted private main key for auto login",
    )
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/private-keys/0`,
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        kid: "0",
        encryptingDeviceId: TestData.mary.devices[0].deviceId,
        key: TestData.mary.devices[0].encryptedPrivateMainKey,
      }),
    )
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await setupMarysDevice(page);

      // Create encrypted recovery device key and store it
      const decryptedPrivateKey = await cryptoService.decryptPrivatePasswordKey(
        TestData.mary.devices[0].encryptedPrivateDeviceKey,
        TestData.mary.password,
      );
      const encryptedRecoveryKey =
        await cryptoService.encryptPrivatePasswordKey(
          decryptedPrivateKey,
          "any-recovery-key",
        );

      await page.evaluate(
        ({ deviceId, key }) => {
          localStorage.setItem(`imagey.devices[${deviceId}].recovery-key`, key);
        },
        {
          deviceId: TestData.mary.devices[0].deviceId,
          key: encryptedRecoveryKey,
        },
      );

      await page.goto("/");

      // Wait for auto-login to complete, UI should switch to main dashboard showing images
      await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
        timeout: 10000,
      });
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});

test("existing user fails auto-login due to wrong recovery key", async ({
  page,
}) => {
  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request to get public key for failed auto login")
    .withRequest(
      "GET",
      "/users/d20cf443-4f96-418f-a957-c8cbef8677c3/public-keys/0",
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));

  await provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request to fetch recovery key returning 404")
    .withRequest(
      "GET",
      `/users/d20cf443-4f96-418f-a957-c8cbef8677c3/devices/${TestData.mary.devices[0].deviceId}/recovery-key`,
    )
    .willRespondWith(404)
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await setupMarysDevice(page);

      // Create encrypted recovery device key and store it
      const decryptedPrivateKey = await cryptoService.decryptPrivatePasswordKey(
        TestData.mary.devices[0].encryptedPrivateDeviceKey,
        TestData.mary.password,
      );
      const encryptedRecoveryKey =
        await cryptoService.encryptPrivatePasswordKey(
          decryptedPrivateKey,
          "any-recovery-key",
        );

      await page.evaluate(
        ({ deviceId, key }) => {
          localStorage.setItem(`imagey.devices[${deviceId}].recovery-key`, key);
        },
        {
          deviceId: TestData.mary.devices[0].deviceId,
          key: encryptedRecoveryKey,
        },
      );

      await page.goto("/");

      // Should fall back to password challenge dialog
      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();
      await expect.poll(() => runningPactRequests).toBe(0);
    });
});
