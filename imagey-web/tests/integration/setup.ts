import { expect, Page } from "@playwright/test";
import { PactV4, Matchers } from "@pact-foundation/pact";
import {
  marysPassword,
  marysDeviceId,
  marysPublicDeviceKey,
  marysEncryptedPrivateDeviceKey,
  marysEncryptedPrivateMainKey,
  marysPublicMainKey,
  marysUploadedDocumentId,
  marysSecondDeviceId,
  marysSecondEncryptedPrivateDeviceKey,
} from "./keys";

type ConfiguredInteraction = ReturnType<
  ReturnType<
    ReturnType<
      ReturnType<PactV4["addInteraction"]>["uponReceiving"]
    >["withRequest"]
  >["willRespondWith"]
>;

type MockServer = Parameters<
  Parameters<ConfiguredInteraction["executeTest"]>[0]
>[0];

export * from "./keys";

export const provider = new PactV4({
  dir: process.env.PWD + "/target/test-classes", // prepare for maven packaging
  consumer: "imagey-web",
  provider: "imagey-server",
});

export async function clearLocalStorage(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("imagey.user"));
  await page.evaluate(() =>
    localStorage.removeItem("imagey.deviceIds[mary@imagey.cloud]"),
  );
  await page.evaluate(() =>
    localStorage.removeItem("imagey.deviceIds[bob@imagey.cloud]"),
  );
  await page.evaluate(() =>
    localStorage.removeItem("imagey.deviceIds[chris@imagey.cloud]"),
  );
  await page.evaluate(() =>
    localStorage.removeItem("imagey.deviceIds[alice@imagey.cloud]"),
  );
  await page.evaluate(() =>
    localStorage.removeItem("imagey.devices[1234].key"),
  );
}

export async function loginAsMary(page: Page) {
  await page.goto("/");
  await inputMarysPassword(page);
}

export let runningPactRequests = 0;

export async function setupMockServer(page: Page, mockServer: MockServer) {
  const mockServerUrl = new URL(mockServer.url);

  await page.route("/users/**", async (route, request) => {
    runningPactRequests++;

    try {
      const requestUrl = new URL(request.url());
      requestUrl.port = mockServerUrl.port;
      requestUrl.hostname = mockServerUrl.hostname;

      const response = await route.fetch({
        url: requestUrl.href,
        method: request.method(),
        headers: request.headers(),
        postData: request.postData(),
      });

      await route.fulfill({ response });
    } finally {
      runningPactRequests--;
    }
  });
}

export async function prepareMarysLogin(page: Page) {
  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request of mary to get public key")
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(marysPublicMainKey));
  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request of mary to get public device key")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${marysDeviceId}/public-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) => r.jsonBody(marysPublicDeviceKey));

  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get encrypted private main key for device",
    )
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${marysDeviceId}/private-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        kid: "0",
        encryptingDeviceId: marysDeviceId,
        key: marysEncryptedPrivateMainKey,
      }),
    );
  await setupMarysDevice(page);
}

export async function prepareMarysDocuments() {
  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request of mary to get documents")
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        {
          documentId: "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
          name: "beach-1836467_1920.jpg",
          previewImageId: "6e0835c4-ea9a-4259-a5ab-ce2fe88f2b0b",
          size: 478098,
          smallImageId: "7468168e-b3a6-49bf-9d1d-4f3f7e1bfef0",
          type: "image/jpeg",
        },
        {
          documentId: "f9910aa7-4db6-4b02-b596-c3ccf872ae98",
          name: "beach-4524911_1920.jpg",
          previewImageId: "f232a44d-6396-42bb-9196-f0013d46ded5",
          size: 655269,
          smallImageId: "330e1a82-6626-4a4b-b1ca-9c8a59c859e4",
          type: "image/jpeg",
        },
      ]),
    );

  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get content with id 6e0835c4-ea9a-4259-a5ab-ce2fe88f2b0b of document with id bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
    )
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/contents/6e0835c4-ea9a-4259-a5ab-ce2fe88f2b0b",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "./tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/contents/6e0835c4-ea9a-4259-a5ab-ce2fe88f2b0b",
      ),
    );

  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get shared key for document with id bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
    )
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/encrypted-shared-keys/mary@imagey.cloud",
      (r) =>
        r.headers({
          Accept: "text/plain",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "text/plain",
        "./tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/shared-keys/mary@imagey.cloud/encrypted-shared.key",
      ),
    );

  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get content with id f232a44d-6396-42bb-9196-f0013d46ded5 of document with id f9910aa7-4db6-4b02-b596-c3ccf872ae98",
    )
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/f9910aa7-4db6-4b02-b596-c3ccf872ae98/contents/f232a44d-6396-42bb-9196-f0013d46ded5",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "./tests/images/encrypted/f9910aa7-4db6-4b02-b596-c3ccf872ae98/contents/f232a44d-6396-42bb-9196-f0013d46ded5",
      ),
    );

  return provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get shared key for document with id f9910aa7-4db6-4b02-b596-c3ccf872ae98",
    )
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/f9910aa7-4db6-4b02-b596-c3ccf872ae98/encrypted-shared-keys/mary@imagey.cloud",
      (r) =>
        r.headers({
          Accept: "text/plain",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "text/plain",
        "./tests/images/encrypted/f9910aa7-4db6-4b02-b596-c3ccf872ae98/shared-keys/mary@imagey.cloud/encrypted-shared.key",
      ),
    );
}

export async function prepareDocumentUpload(
  documentName: string,
  documentId: string,
) {
  const previewImageId =
    documentId === marysUploadedDocumentId
      ? "9e4742c8-b3b8-44b9-ab83-8e4912271dee"
      : "2211b759-744c-40f3-aec2-10c8d549a49e";
  const smallImageId =
    documentId === marysUploadedDocumentId
      ? "d09630e2-437e-40ff-8da1-753a0e05caad"
      : "01e9b15b-655c-4baf-8fd3-78c23df70a67";
  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request of mary to get public key")
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(marysPublicMainKey));

  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request of mary to upload document key")
    .withRequest(
      "PUT",
      Matchers.regex({
        matcher:
          "/users/mary@imagey\\.cloud/documents/.+/encrypted-shared-keys/mary@imagey\\.cloud",
        generate: `/users/mary@imagey.cloud/documents/${documentId}/encrypted-shared-keys/mary@imagey.cloud`,
      }),
      (r) =>
        r.headers({
          "Content-Type": "text/plain",
        }),
      // body wird nicht geprüft
    )
    .willRespondWith(200);

  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to upload document metadata for " + documentId,
    )
    .withRequest(
      "PUT",
      Matchers.regex({
        matcher: "/users/mary@imagey\\.cloud/documents/.+/meta-data",
        generate: `/users/mary@imagey.cloud/documents/${documentId}/meta-data`,
      }),
      (r) =>
        r
          .headers({
            "Content-Type": "application/json",
          })
          .jsonBody({
            documentId: Matchers.string(documentId),
            previewImageId: Matchers.string(previewImageId),
            smallImageId: Matchers.string(smallImageId),
            name: documentName,
            size: Matchers.integer(8000),
            type: "image/jpeg",
          }),
    )
    .willRespondWith(200);

  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to upload document content for " + documentId,
    )
    .withRequest(
      "PUT",
      Matchers.regex({
        matcher: "/users/mary@imagey\\.cloud/documents/.+/contents/.+",
        generate: `/users/mary@imagey.cloud/documents/${documentId}/contents/${documentId}`,
      }),
      (r) => r.headers({ "Content-Type": "application/octet-stream" }), // body is not checked
    )
    .willRespondWith(200);

  provider
    .addInteraction()
    .given("Mary has uploaded document")
    .uponReceiving(
      "a request of mary to load document content of " + documentId,
    )
    .withRequest(
      "GET",
      Matchers.regex({
        matcher:
          "/users/mary@imagey\\.cloud/documents/(?!(bb66|f991)).+/contents/.+",
        generate: `/users/mary@imagey.cloud/documents/${documentId}/contents/${previewImageId}`,
      }),
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `./tests/images/encrypted/${documentId}/contents/${previewImageId}`,
      ),
    );

  provider
    .addInteraction()
    .given("Mary has uploaded document")
    .uponReceiving(
      "a request of mary to get shared key for document with id " + documentId,
    )
    .withRequest(
      "GET",
      Matchers.regex({
        matcher:
          "/users/mary@imagey\\.cloud/documents/(?!(bb66|f991)).+/encrypted-shared-keys/mary@imagey\\.cloud",
        generate: `/users/mary@imagey.cloud/documents/${documentId}/encrypted-shared-keys/mary@imagey.cloud`,
      }),
      (r) =>
        r.headers({
          Accept: "text/plain",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "text/plain",
        `./tests/images/encrypted/${documentId}/shared-keys/mary@imagey.cloud/encrypted-shared.key`,
      ),
    );
}

export async function prepareMarysDevices() {
  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request of mary to get devices")
    .withRequest("GET", "/users/mary@imagey.cloud/devices", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([marysSecondDeviceId, marysDeviceId]),
    );
}

export async function prepareMarysDeviceActivation() {
  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get the public key of the second device",
    )
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${marysSecondDeviceId}/public-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        kty: "EC",
        crv: "P-256",
        x: "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4",
        y: "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM",
        key_ops: ["encrypt"],
        ext: true,
      }),
    );
}

export async function setupMarysDevice(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem("i18nextLng", "en");
    localStorage.setItem("imagey.user", "mary@imagey.cloud");
  });
  await page.evaluate(
    (deviceId) =>
      localStorage.setItem("imagey.deviceIds[mary@imagey.cloud]", deviceId),
    marysDeviceId,
  );
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem("imagey.devices[" + deviceId + "].key", key),
    { deviceId: marysDeviceId, key: marysEncryptedPrivateDeviceKey },
  );
}

export async function setupMarysSecondDevice(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem("i18nextLng", "en");
    localStorage.setItem("imagey.user", "mary@imagey.cloud");
  });
  await page.evaluate(
    (deviceId) =>
      localStorage.setItem("imagey.deviceIds[mary@imagey.cloud]", deviceId),
    marysSecondDeviceId,
  );
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem("imagey.devices[" + deviceId + "].key", key),
    {
      deviceId: marysSecondDeviceId,
      key: marysSecondEncryptedPrivateDeviceKey,
    },
  );
}

export async function prepareMarysSecondDevice() {
  provider
    .addInteraction()
    .given("marys second device registered")
    .uponReceiving("a request of mary to get public key")
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(marysPublicMainKey));
}

export async function inputMarysPassword(page: Page) {
  const passwordInput = page.getByLabel("password");
  await expect(passwordInput).toBeVisible();
  passwordInput.fill(marysPassword);
  const confirmButton = page.getByText("Confirm");
  await expect(confirmButton).toBeVisible();
  confirmButton.click();
  await expect(confirmButton).not.toBeVisible();
}
