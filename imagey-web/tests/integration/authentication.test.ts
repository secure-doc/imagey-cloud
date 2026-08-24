import { MatchersV2 as Matchers, MatchersV3 } from "@pact-foundation/pact";
import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
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
  // Given
  provider
    .addInteraction()
    .uponReceiving("a request of joe to verify his email")
    .withRequest("POST", "/users/joe@imagey.cloud/verifications/", (r) =>
      r.headers({
        "Content-Type": "application/json",
      }),
    )
    .willRespondWith(201);

  await provider
    .addInteraction()
    .given("User is unauthenticated")
    .uponReceiving("a request of unauthenticated joe to get public key")
    .withRequest("GET", "/users/joe@imagey.cloud/public-keys/0", (r) =>
      r.headers({
        "Content-Type": "application/json",
      }),
    )
    .willRespondWith(401)
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
  // Given
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get public key")
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({
        "Content-Type": "application/json",
      }),
    )
    .willRespondWith(401);

  await provider
    .addInteraction()
    .uponReceiving("a request of mary to login")
    .withRequest("POST", "/users/mary@imagey.cloud/verifications/")
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
    .withRequest("GET", "/users/mary@imagey.cloud/symmetric-keys/0", (r) =>
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
            issuer: "mary@imagey.cloud",
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
        localStorage.setItem("imagey.user", "mary@imagey.cloud"),
      );
      await page.evaluate(
        (deviceId) =>
          localStorage.setItem("imagey.deviceIds[mary@imagey.cloud]", deviceId),
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
    .withRequest("GET", "/users/joe@imagey.cloud/public-keys/0", (r) =>
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
  const { settingsKeyJwk } = await prepareFreshUserSettings("joe@imagey.cloud");
  // The chats document (with an empty contacts list) is already mocked by
  // prepareFreshUserSettings() above, same as the document list.

  await provider
    .addInteraction()
    .given("Joe is registered")
    .uponReceiving("a request of joe to get contact requests")
    .withRequest("GET", "/users/joe@imagey.cloud/contact-requests", (r) =>
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
      await page.goto("/?email=joe@imagey.cloud");

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
          "/\\?email=joe@imagey\\.cloud&inviter=mary@imagey\\.cloud",
          `/?email=joe@imagey.cloud&inviter=mary@imagey.cloud`,
        ),
      }),
    );

  provider
    .addInteraction()
    .uponReceiving(
      "a request of registering joe (invited by mary) to get public key",
    )
    .withRequest("GET", "/users/joe@imagey.cloud/public-keys/0", (r) =>
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

  const { settingsKeyJwk } = await prepareFreshUserSettings("joe@imagey.cloud");

  // Accepting mary's invitation as the last step of registration also
  // creates the chat's own Document - same shape as
  // prepareMarysChatCreation() elsewhere in this suite.
  provider
    .addInteraction()
    .uponReceiving("a request to create joes chat with mary on registration")
    .withRequest("POST", "/users/joe@imagey.cloud/documents", (r) => {
      r.headers({
        "Content-Type": MatchersV3.regex(
          "multipart/form-data.*",
          "multipart/form-data; boundary=.*",
        ),
      });
    })
    .willRespondWith(201, (r) =>
      r.headers({
        Location: MatchersV3.string(
          "/users/joe@imagey.cloud/documents/new-chat-id",
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
      "/users/joe@imagey.cloud/contact-requests/mary@imagey.cloud",
      (r) => {
        r.headers({
          "Content-Type": "application/json",
        });
        // The encrypted key/chatId are generated dynamically (see
        // ContactService.acceptContactRequest) - only assert the shape.
        r.jsonBody({
          inviter: "mary@imagey.cloud",
          invitee: "joe@imagey.cloud",
          status: "ACCEPTED",
          publicKey: MatchersV3.like(TestData.mary.publicMainKey),
          chatId: MatchersV3.string("new-chat-id"),
          sharedKey: MatchersV3.string("dummy-encrypted-key"),
        });
      },
    )
    .willRespondWith(204);

  await provider
    .addInteraction()
    .given("mary has invited joe")
    .uponReceiving("a request of joe to get contact requests after registering")
    .withRequest("GET", "/users/joe@imagey.cloud/contact-requests", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          inviter: "mary@imagey.cloud",
          invitee: "joe@imagey.cloud",
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
      await expect(page).toHaveURL(/inviter=mary@imagey\.cloud/);

      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();
      await passwordInput.fill(TestData.mary.password);
      await page.getByLabel("Confirm Password").fill(TestData.mary.password);
      await page.getByRole("button", { name: "Confirm", exact: true }).click();

      // Then: the accept PUT and the chat-document POST above are verified by
      // executeTest (it fails if an interaction was not called). Confirm the
      // SPA finished registration and landed in the app rather than erroring
      // on the dialog.
      await expect(
        page.getByText("An error occurred during authentication"),
      ).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Home" })).toBeVisible({
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
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));
  provider
    .addInteraction()
    .uponReceiving("a request of mary to store public key for device")
    .withRequest(
      "POST",
      Matchers.regex({
        generate: `/users/mary@imagey.cloud/devices/${TestData.mary.devices[1].deviceId}/public-keys/`,
        matcher: "/users/mary@imagey\\.cloud/devices/.+/public-keys/",
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
        generate: `/users/mary@imagey.cloud/devices/${TestData.mary.devices[1].deviceId}/public-keys/0`,
        matcher: "/users/mary@imagey\\.cloud/devices/.+/public-keys/0",
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
        generate: `/users/mary@imagey.cloud/devices/${TestData.mary.devices[1].deviceId}/private-keys/0`,
        matcher: "/users/mary@imagey\\.cloud/devices/.+/private-keys/0",
      }),
      (r) => r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(404)
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await page.goto("/?email=mary@imagey.cloud");

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
    await page.goto("/?email=mary@imagey.cloud");

    await inputMarysPassword(page);

    // Then
    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByAltText("beach-4524911_1920.jpg")).toBeVisible();
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
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
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
    // When
    await setupMockServer(page, mockServer);
    await page.evaluate(() => localStorage.removeItem("imagey.user"));
    await page.goto("/");
    const emailInput = page.getByPlaceholder("email@imagey.cloud");
    await expect(emailInput).toBeVisible();

    await emailInput.fill("mary@imagey.cloud");
    await page.getByRole("button", { name: "Confirm", exact: true }).click();

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
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey))
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      await page.evaluate(() =>
        localStorage.setItem("imagey.user", "mary@imagey.cloud"),
      );
      await page.evaluate(
        (deviceId) =>
          localStorage.setItem("imagey.deviceIds[mary@imagey.cloud]", deviceId),
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
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey))
    .executeTest(async (mockServer) => {
      // When
      await setupMockServer(page, mockServer);
      // Pass email as query param, this will open DeviceRegistrationDialog (since deviceId is missing)
      await page.goto("/?email=mary@imagey.cloud");

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
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(401);

  provider
    .addInteraction()
    .given("marys second device registered")
    .given("User has invalid token")
    .uponReceiving("a request for a challenge")
    .withRequest(
      "POST",
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/challenges`,
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
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/authentications`,
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
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/private-keys/0`,
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
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
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
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/public-keys/0`,
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
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) =>
      r.headers({ Accept: "application/json" }),
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
        "**/users/mary@imagey.cloud/devices/*/authentications*",
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
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(401);

  provider
    .addInteraction()
    .given("marys second device registered")
    .given("User has invalid token")
    .uponReceiving("a request for a challenge with keep me logged in")
    .withRequest(
      "POST",
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/challenges`,
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
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/authentications`,
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
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/recovery-key`,
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
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/private-keys/0`,
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
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
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
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/public-keys/0`,
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
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) =>
      r.headers({ Accept: "application/json" }),
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
        "**/users/mary@imagey.cloud/devices/*/authentications*",
      );
      const recoveryKeyResponse = page.waitForResponse(
        "**/users/mary@imagey.cloud/devices/*/recovery-key",
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
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(401);

  await provider
    .addInteraction()
    .given("marys second device registered")
    .given("User has invalid token")
    .uponReceiving("a request for a challenge with wrong password")
    .withRequest(
      "POST",
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/challenges`,
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
    .withRequest("GET", "/users/unknown@imagey.cloud/public-keys/0")
    .willRespondWith(404)
    .executeTest(async (mockServer) => {
      await setupMockServer(page, mockServer);
      await page.goto("/?email=unknown@imagey.cloud");

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
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));

  await builder.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    // Use an existing device (this sets localStorage with keys and deviceId)
    await setupMarysDevice(page);

    await page.goto("/?email=mary@imagey.cloud");

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
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));

  await provider
    .addInteraction()
    .given("marys second device registered with recovery key")
    .uponReceiving("a request to fetch recovery key for auto login")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/recovery-key`,
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
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/public-keys/0`,
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
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/private-keys/0`,
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
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));

  await provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request to fetch recovery key returning 404")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/recovery-key`,
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
