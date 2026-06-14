import { MatchersV2 as Matchers } from "@pact-foundation/pact";
import { test, expect } from "./fixtures";
import {
  clearLocalStorage,
  inputMarysPassword,
  prepareMarysContactRequests,
  prepareMarysDocuments,
  prepareMarysLogin,
  provider,
  setupMarysDevice,
  setupMockServer,
  TestData,
  runningPactRequests,
} from "./setup";

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

  provider
    .addInteraction()
    .uponReceiving("a request to register joe")
    .withRequest("POST", "/users/", (r) =>
      r
        .headers({
          "Content-Type": "application/json",
        })
        .jsonBody({
          email: "joe@imagey.cloud",
          deviceId: Matchers.string("ab85c7ca-8288-4a67-9d7a-15b82e22e75b"),
          devicePublicKey: {
            crv: "P-256",
            ext: true,
            key_ops: [],
            kty: "EC",
            x: Matchers.string("I_VS7DvICMehgUF2rA4llF0mjZOSs6vgO_A5PLobUmc"),
            y: Matchers.string("Z4astOZHg9NfhoAldwMZhC34UQsRU7CflGn8JpNGtAg"),
          },
          mainPublicKey: {
            crv: "P-256",
            ext: true,
            key_ops: [],
            kty: "EC",
            x: Matchers.string("I_VS7DvICMehgUF2rA4llF0mjZOSs6vgO_A5PLobUmc"),
            y: Matchers.string("Z4astOZHg9NfhoAldwMZhC34UQsRU7CflGn8JpNGtAg"),
          },
          encryptedPrivateKey: Matchers.string(
            "ca714722798563b39d9a75bd8d58e79cb81b78b7601d99d1725de64c437a551ffbf3b7dbb03babaeb58bf59305ad6674f91d0eccee6b73210d2d3134165530d0d512c40ae9a2a6c27829b5a5863d10591da8ee7032bbf2490c8f9b194cddc5537f3c2e1c0e0ba6bbce3f692103db085961cfcac38a87ef29b4340c69355f73d7ae527821478eff2e421d8693d50aae5ec253be5675796f9660984945d297500aca8108694b1cf2af4554670f88edb7f8de9c19ce48b254839bc9822456f949ee23718ac369102c70c994826827e36470c237cb",
          ),
        }),
    )
    .willRespondWith(200);

  provider
    .addInteraction()
    .uponReceiving("a request of joe to get contacts")
    .withRequest("GET", "/users/joe@imagey.cloud/contacts", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  provider
    .addInteraction()
    .uponReceiving("a request of joe to get documents")
    .withRequest("GET", "/users/joe@imagey.cloud/documents", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  await provider
    .addInteraction()
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
      await page.goto("/?email=joe@imagey.cloud");

      const passwordInput = page.getByLabel("Password", { exact: true });
      await expect(passwordInput).toBeVisible();
      await passwordInput.fill(TestData.mary.password);

      const contactsResponse = page.waitForResponse(
        "**/users/joe@imagey.cloud/contacts",
      );
      const documentsResponse = page.waitForResponse(
        "**/users/joe@imagey.cloud/documents",
      );
      const contactRequestsResponse = page.waitForResponse(
        "**/users/joe@imagey.cloud/contact-requests",
      );

      await page.getByLabel("Confirm Password").fill(TestData.mary.password);
      await page.getByRole("button", { name: "Confirm", exact: true }).click();

      await Promise.all([
        contactsResponse,
        documentsResponse,
        contactRequestsResponse,
      ]);

      // Then
      await expect(page.getByText(/Upload Images/)).toBeVisible();
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
    await page.reload();
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
