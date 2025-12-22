import { MatchersV3, PactV3, V3MockServer } from "@pact-foundation/pact";
import { expect, Page } from "@playwright/test";

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

export * from "./keys";

export const provider = new PactV3({
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

export async function setupMockServer(page: Page, mockServer: V3MockServer) {
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
    .given("marys second device registered")
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
      body: marysPublicMainKey,
    });
  provider
    .given("marys second device registered")
    .uponReceiving("a request of mary to get public device key")
    .withRequest({
      method: "GET",
      path: `/users/mary@imagey.cloud/devices/${marysDeviceId}/public-keys/0`,
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: marysPublicDeviceKey,
    });
  provider
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get encrypted private main key for device",
    )
    .withRequest({
      method: "GET",
      path: `/users/mary@imagey.cloud/devices/${marysDeviceId}/private-keys/0`,
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: {
        kid: "0",
        encryptingDeviceId: marysDeviceId,
        key: marysEncryptedPrivateMainKey,
      },
    });
  await setupMarysDevice(page);
}

export async function prepareMarysDocuments() {
  provider
    .given("marys second device registered")
    .uponReceiving("a request of mary to get documents")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/documents",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: [
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
      ],
    });
  provider
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get content with id 6e0835c4-ea9a-4259-a5ab-ce2fe88f2b0b of document with id bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
    )
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/documents/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/contents/6e0835c4-ea9a-4259-a5ab-ce2fe88f2b0b",
      headers: {
        Accept: "application/octet-stream",
      },
    })
    .withResponseBinaryFile(
      {
        status: 200,
      },
      "application/octet-stream",
      "./tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/contents/6e0835c4-ea9a-4259-a5ab-ce2fe88f2b0b",
    );
  provider
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get shared key for document with id bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
    )
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/documents/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/encrypted-shared-keys/mary@imagey.cloud",
      headers: {
        Accept: "text/plain",
      },
    })
    .withResponseBinaryFile(
      {
        status: 200,
      },
      "text/plain",
      "./tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/shared-keys/mary@imagey.cloud/encrypted-shared.key",
    );
  provider
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get content with id f232a44d-6396-42bb-9196-f0013d46ded5 of document with id f9910aa7-4db6-4b02-b596-c3ccf872ae98",
    )
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/documents/f9910aa7-4db6-4b02-b596-c3ccf872ae98/contents/f232a44d-6396-42bb-9196-f0013d46ded5",
      headers: {
        Accept: "application/octet-stream",
      },
    })
    .withResponseBinaryFile(
      {
        status: 200,
      },
      "application/octet-stream",
      "./tests/images/encrypted/f9910aa7-4db6-4b02-b596-c3ccf872ae98/contents/f232a44d-6396-42bb-9196-f0013d46ded5",
    );
  provider
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get shared key for document with id f9910aa7-4db6-4b02-b596-c3ccf872ae98",
    )
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/documents/f9910aa7-4db6-4b02-b596-c3ccf872ae98/encrypted-shared-keys/mary@imagey.cloud",
      headers: {
        Accept: "text/plain",
      },
    })
    .withResponseBinaryFile(
      {
        status: 200,
      },
      "text/plain",
      "./tests/images/encrypted/f9910aa7-4db6-4b02-b596-c3ccf872ae98/shared-keys/mary@imagey.cloud/encrypted-shared.key",
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
    .given("marys second device registered")
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
      body: marysPublicMainKey,
    });
  provider
    .given("marys second device registered")
    .uponReceiving("a request of mary to upload document key")
    .withRequest({
      method: "PUT",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/documents/.+/encrypted-shared-keys/mary@imagey\\.cloud",
        "/users/mary@imagey.cloud/documents/" +
          documentId +
          "/encrypted-shared-keys/mary@imagey.cloud",
      ),
      headers: {
        "Content-Type": "text/plain",
      },
      contentType: "text/plain",
      // body is not matched
    })
    .willRespondWith({
      status: 200,
    });
  provider
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to upload document metadata for " + documentId,
    )
    .withRequest({
      method: "PUT",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/documents/.+/meta-data",
        "/users/mary@imagey.cloud/documents/" + documentId + "/meta-data",
      ),
      headers: {
        "Content-Type": "application/json",
      },
      contentType: "application/json",
      body: {
        documentId: MatchersV3.string(documentId),
        previewImageId: MatchersV3.string(previewImageId),
        smallImageId: MatchersV3.string(smallImageId),
        name: documentName,
        size: MatchersV3.number(8000),
        type: "image/jpeg",
      },
    })
    .willRespondWith({
      status: 200,
    });
  provider
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to upload document content for " + documentId,
    )
    .withRequest({
      method: "PUT",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/documents/.+/contents/.+",
        "/users/mary@imagey.cloud/documents/" +
          documentId +
          "/contents/" +
          documentId,
      ),
      contentType: "application/octet-stream",
      // body not matched
    })
    .willRespondWith({
      status: 200,
    });
  provider
    .given("Mary has uploaded document")
    .uponReceiving(
      "a request of mary to load document content of " + documentId,
    )
    .withRequest({
      method: "GET",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/documents/(?!(bb66|f991)).+/contents/.+",
        "/users/mary@imagey.cloud/documents/" +
          documentId +
          "/contents/" +
          previewImageId,
      ),
      headers: {
        Accept: "application/octet-stream",
      },
    })
    .withResponseBinaryFile(
      {
        status: 200,
      },
      "application/octet-stream",
      "./tests/images/encrypted/" + documentId + "/contents/" + previewImageId,
    );
  provider
    .given("Mary has uploaded document")
    .uponReceiving(
      "a request of mary to get shared key for document with id " + documentId,
    )
    .withRequest({
      method: "GET",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/documents/(?!(bb66|f991)).+/encrypted-shared-keys/mary@imagey\\.cloud",
        "/users/mary@imagey.cloud/documents/" +
          documentId +
          "/encrypted-shared-keys/mary@imagey.cloud",
      ),
      headers: {
        Accept: "text/plain",
      },
    })
    .withResponseBinaryFile(
      {
        status: 200,
      },
      "text/plain",
      "./tests/images/encrypted/" +
        documentId +
        "/shared-keys/mary@imagey.cloud/encrypted-shared.key",
    );
}

export async function prepareMarysDevices() {
  provider
    .given("marys second device registered")
    .uponReceiving("a request of mary to get devices")
    .withRequest({
      method: "GET",
      path: "/users/mary@imagey.cloud/devices",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: [marysSecondDeviceId, marysDeviceId],
    });
}

export async function prepareMarysDeviceActivation() {
  provider
    .given("marys second device registered")
    .uponReceiving(
      "a request of mary to get the public key of the second device",
    )
    .withRequest({
      method: "GET",
      path:
        "/users/mary@imagey.cloud/devices/" +
        marysSecondDeviceId +
        "/public-keys/0",
      headers: {
        Accept: "application/json",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "application/json",
      body: {
        kty: "EC",
        crv: "P-256",
        x: "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4",
        y: "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM",
        key_ops: ["encrypt"],
        ext: true,
      },
    });
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
    .given("marys second device registered")
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
      body: marysPublicMainKey,
    });
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
