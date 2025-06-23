import test, { expect } from "@playwright/test";
import {
  clearLocalStorage,
  inputMarysPassword,
  marysDeviceId,
  marysEncryptedDeviceKey,
  marysPassword,
  marysPublicKey,
  provider,
  setupMarysDevice,
  setupMockServer,
} from "./setup";
import { MatchersV3 } from "@pact-foundation/pact";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("new user enters wrong email", async ({ page }) => {
  // Given
  await page.goto("/");

  // When
  const emailInput = page.getByPlaceholder("email@imagey.cloud");
  await expect(emailInput).toBeVisible();
  emailInput.fill("joe(at)imagey.cloud");
  page.getByText("OK").click();

  // Then
  await expect(
    page.getByText("Please enter a valid email address."),
  ).toBeVisible();
});

test("new user visits page", async ({ page }) => {
  // Given
  provider
    .given("default")
    .uponReceiving("a request of joe to verify his email")
    .withRequest({
      method: "POST",
      path: "/users/joe@imagey.cloud/verifications/",
      headers: { "Content-Type": "application/json" },
    })
    .willRespondWith({
      status: 201,
    });
  provider
    .given("default")
    .uponReceiving("a request of joe to get public key")
    .withRequest({
      method: "GET",
      path: "/users/joe@imagey.cloud/public-keys/0",
      headers: { "Content-Type": "application/json" },
    })
    .willRespondWith({
      status: 401,
    });

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.goto("/");
    const emailInput = page.getByPlaceholder("email@imagey.cloud");
    await expect(emailInput).toBeVisible();

    emailInput.fill("joe@imagey.cloud");
    page.getByText("OK").click();

    // Then
    await expect(page.getByText(/verification link/)).toBeVisible();
  });
});

test("existing user visits page with new device", async ({ page }) => {
  // Given
  provider
    .given("default")
    .uponReceiving("a request of mary to get public key")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/public-keys/0",
      headers: { "Content-Type": "application/json" },
    })
    .willRespondWith({
      status: 401,
    });
  provider
    .given("default")
    .uponReceiving("a request of mary to login")
    .withRequest({
      method: "POST",
      path: "/users/mary@imagey.cloud/verifications/",
    })
    .willRespondWith({
      status: 202,
    });

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.goto("/");
    const emailInput = page.getByPlaceholder("email@imagey.cloud");
    await expect(emailInput).toBeVisible();

    emailInput.fill("mary@imagey.cloud");
    page.getByText("OK").click();

    // Then
    await expect(page.getByText(/login link/)).toBeVisible();
  });
});

test.skip("existing user visits page with invalid token", async ({ page }) => {
  // Given
  provider
    .given("Marys token is invalid")
    .uponReceiving("a request of mary to get symmetric key")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/symmetric-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 403,
    });
  provider
    .given("default")
    .uponReceiving("a request of mary to register account")
    .withRequest({
      method: "POST",
      path: "/users/",
      headers: { "Content-Type": "application/json" },
      body: {
        email: "mary@imagey.cloud",
      },
    })
    .willRespondWith({
      status: 409,
    });

  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.evaluate(() =>
      localStorage.setItem("imagey.user", "mary@imagey.cloud"),
    );
    await page.evaluate(
      (deviceId) =>
        localStorage.setItem("imagey.deviceIds[mary@imagey.cloud]", deviceId),
      marysDeviceId,
    );
    await page.goto("/");
    const emailInput = page.getByPlaceholder("email@imagey.cloud");
    await expect(emailInput).toBeVisible();

    emailInput.fill("mary@imagey.cloud");
    page.getByText("OK").click();

    // Then
    await expect(page.getByText(/login link/)).toBeVisible();
  });
});

test("new user clicks registration link", async ({ page }) => {
  // Given
  provider
    .given("Joe has registration token")
    .uponReceiving("a request of joe to get public key")
    .withRequest({
      method: "GET",
      path: "/users/joe@imagey.cloud/public-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 404,
    });
  provider
    .given("Joe has registration token")
    .uponReceiving("a request to register joe")
    .withRequest({
      method: "POST",
      path: "/users/",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        email: "joe@imagey.cloud",
        deviceId: MatchersV3.string("ab85c7ca-8288-4a67-9d7a-15b82e22e75b"),
        devicePublicKey: {
          crv: "P-256",
          ext: true,
          key_ops: [],
          kty: "EC",
          x: MatchersV3.string("I_VS7DvICMehgUF2rA4llF0mjZOSs6vgO_A5PLobUmc"),
          y: MatchersV3.string("Z4astOZHg9NfhoAldwMZhC34UQsRU7CflGn8JpNGtAg"),
        },
        mainPublicKey: {
          crv: "P-256",
          ext: true,
          key_ops: [],
          kty: "EC",
          x: MatchersV3.string("I_VS7DvICMehgUF2rA4llF0mjZOSs6vgO_A5PLobUmc"),
          y: MatchersV3.string("Z4astOZHg9NfhoAldwMZhC34UQsRU7CflGn8JpNGtAg"),
        },
        encryptedPrivateKey: MatchersV3.string(
          "ca714722798563b39d9a75bd8d58e79cb81b78b7601d99d1725de64c437a551ffbf3b7dbb03babaeb58bf59305ad6674f91d0eccee6b73210d2d3134165530d0d512c40ae9a2a6c27829b5a5863d10591da8ee7032bbf2490c8f9b194cddc5537f3c2e1c0e0ba6bbce3f692103db085961cfcac38a87ef29b4340c69355f73d7ae527821478eff2e421d8693d50aae5ec253be5675796f9660984945d297500aca8108694b1cf2af4554670f88edb7f8de9c19ce48b254839bc9822456f949ee23718ac369102c70c994826827e36470c237cb",
        ),
      },
    })
    .willRespondWith({
      status: 200,
    });
  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.goto("/?email=joe@imagey.cloud");

    const passwordInput = page.getByLabel("password");
    await expect(passwordInput).toBeVisible();
    passwordInput.fill(marysPassword);
    page.getByText("OK").click();

    // Then
    await expect(page.getByText(/Keine Bilder vorhanden/)).toBeVisible();
  });
});

test("existing user clicks login link for new device", async ({ page }) => {
  // Given
  provider
    .given("default")
    .uponReceiving("a request of mary to get public key")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/public-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysPublicKey,
    });
  provider
    .given("default")
    .uponReceiving("a request of mary to store public key for device")
    .withRequest({
      method: "POST",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/devices/.+/public-keys/",
        "/users/mary@imagey.cloud/devices/123e4567-e89b-12d3-a456-426655440000/public-keys/",
      ),
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        crv: "P-256",
        ext: true,
        key_ops: [],
        kty: "EC",
        x: MatchersV3.string("I_VS7DvICMehgUF2rA4llF0mjZOSs6vgO_A5PLobUmc"),
        y: MatchersV3.string("Z4astOZHg9NfhoAldwMZhC34UQsRU7CflGn8JpNGtAg"),
      },
    })
    .willRespondWith({
      status: 200,
    });
  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.goto("/?email=mary@imagey.cloud");

    const passwordInput = page.getByLabel("password");
    await expect(passwordInput).toBeVisible();
    passwordInput.fill(marysPassword);
    page.getByText("OK").click();

    // Then
    await expect(
      page.getByText(
        /Device registered, you can now activate it with another device/,
      ),
    ).toBeVisible();
  });
});

test("existing user clicks login link on existing device", async ({ page }) => {
  // Given
  provider
    .given("default")
    .uponReceiving("a request of mary to get public key")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/public-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysPublicKey,
    });
  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.evaluate(() =>
      localStorage.setItem("imagey.user", "bob@imagey.cloud"),
    );
    await page.evaluate(
      (deviceId) =>
        localStorage.setItem("imagey.deviceIds[mary@imagey.cloud]", deviceId),
      marysDeviceId,
    );
    await page.evaluate(
      ({ deviceId, key }) => {
        localStorage.setItem("imagey.devices[" + deviceId + "].key", key);
      },
      { deviceId: marysDeviceId, key: marysEncryptedDeviceKey },
    );
    await page.goto("/?email=mary@imagey.cloud");

    const passwordInput = page.getByLabel("password");
    await expect(passwordInput).toBeVisible();
    passwordInput.fill(marysPassword);
    page.getByText("OK").click();

    // Then
    await expect(page.getByText(/Keine Bilder vorhanden/)).toBeVisible();
  });
});

test("visit page on existing device", async ({ page }) => {
  // Given
  provider
    .given("default")
    .uponReceiving("a request of mary to get public key")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/public-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysPublicKey,
    });
  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await setupMarysDevice(page);
    await page.goto("/");

    const passwordInput = page.getByLabel("password");
    await expect(passwordInput).toBeVisible();
    passwordInput.fill("MarysPassword123");
    page.getByText("OK").click();

    // Then
    await expect(page.getByText(/Keine Bilder vorhanden/)).toBeVisible();
  });
});

test("visit page on existing device with wrong password", async ({ page }) => {
  // Given
  provider
    .given("default")
    .uponReceiving("a request of mary to get public key")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/public-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysPublicKey,
    });
  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await setupMarysDevice(page);
    await page.goto("/");

    const passwordInput = page.getByLabel("password");
    await expect(passwordInput).toBeVisible();
    passwordInput.fill("wrongPassword");
    page.getByText("OK").click();

    // Then
    await expect(page.getByText(/Wrong password/)).toBeVisible();
  });
});

test("login with missing email", async ({ page }) => {
  // Given
  provider
    .given("default")
    .uponReceiving("a request of mary to get public key")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/public-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysPublicKey,
    });
  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.evaluate(
      (deviceId) =>
        localStorage.setItem("imagey.deviceIds[mary@imagey.cloud]", deviceId),
      marysDeviceId,
    );
    await page.evaluate(
      ({ deviceId, key }) =>
        localStorage.setItem("imagey.devices[" + deviceId + "].key", key),
      { deviceId: marysDeviceId, key: marysEncryptedDeviceKey },
    );
    await page.goto("/");
    const emailInput = page.getByPlaceholder("email@imagey.cloud");
    await expect(emailInput).toBeVisible();

    emailInput.fill("mary@imagey.cloud");
    page.getByText("OK").click();

    await inputMarysPassword(page);

    // Then
    await expect(page.getByText(/Keine Bilder vorhanden/)).toBeVisible();
  });
});

test.skip("login with lost private key", async ({ page }) => {
  // Given
  provider
    .given("default")
    .uponReceiving("a request of mary to get public key")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/public-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysPublicKey,
    });
  provider
    .given("default")
    .uponReceiving("a request of mary to store public key for device")
    .withRequest({
      method: "PUT",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/public-keys/.+",
        "/users/mary@imagey.cloud/public-keys/123e4567-e89b-12d3-a456-426655440000",
      ),
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        crv: "P-256",
        ext: true,
        key_ops: [],
        kty: "EC",
        x: MatchersV3.string("I_VS7DvICMehgUF2rA4llF0mjZOSs6vgO_A5PLobUmc"),
        y: MatchersV3.string("Z4astOZHg9NfhoAldwMZhC34UQsRU7CflGn8JpNGtAg"),
      },
    })
    .willRespondWith({
      status: 200,
    });
  await provider.executeTest(async (mockServer) => {
    // When
    await setupMockServer(page, mockServer);
    await page.evaluate(() =>
      localStorage.setItem("imagey.user", "mary@imagey.cloud"),
    );
    await page.evaluate(
      (deviceId) =>
        localStorage.setItem("imagey.deviceIds[mary@imagey.cloud]", deviceId),
      marysDeviceId,
    );
    await page.goto("/");

    // Then
    const passwordInput = page.getByLabel("password");
    await expect(passwordInput).toBeVisible();
    passwordInput.fill("MarysPassword123");
    page.getByText("OK").click();

    const newPasswordInput = page.getByLabel(/Private key missing/);
    await expect(newPasswordInput).toBeVisible();
    newPasswordInput.fill("MarysPassword123");
    page.getByText("OK").click();
    await expect(page.getByText(/Keine Bilder vorhanden/)).toBeVisible();
  });
});
