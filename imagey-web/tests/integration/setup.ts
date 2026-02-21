import { expect, Page } from "@playwright/test";
import { PactV4, Matchers } from "@pact-foundation/pact";
import * as fs from "fs";
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

function createMultipartPayload(documentId: string): Buffer {
  const boundary = "----WebKitFormBoundary";
  const metadata = fs.readFileSync("./tests/images/metadata.json");
  const sharedKey = fs.readFileSync(
    `./tests/images/encrypted/${documentId}/shared-keys/mary@imagey.cloud/encrypted-shared.key`,
  );
  const content = fs.readFileSync(
    `./tests/images/encrypted/${documentId}/contents/${documentId}`,
  );

  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"; filename="metadata.json"\r\nContent-Type: application/json\r\n\r\n`,
    ),
    metadata,
    Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="sharedKey"; filename="encrypted-shared.key"\r\nContent-Type: text/plain\r\n\r\n`,
    ),
    sharedKey,
    Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="content"; filename="${documentId}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

export async function setupMockServer(page: Page, mockServer: MockServer) {
  const mockServerUrl = new URL(mockServer.url);

  await page.route("/users/**", async (route, request) => {
    runningPactRequests++;

    try {
      const requestUrl = new URL(request.url());
      requestUrl.port = mockServerUrl.port;
      requestUrl.hostname = mockServerUrl.hostname;

      let postData: Buffer | null = request.postDataBuffer();
      const headers = request.headers();

      if (
        request.method() === "POST" &&
        headers["content-type"]?.includes("multipart/form-data")
      ) {
        const originalPostDataSize = postData ? postData.length : 0;
        let documentId = "945331a6-b9a8-4f88-a5f5-5928bcdf2fdb"; // Default to large image
        // The original small image payload is ~714KB, the large is ~4.5MB.
        if (originalPostDataSize < 2000000) {
          documentId = "78d1b093-45ec-4a25-9594-615ca2d70ba2"; // Small image
        }

        // To bypass strict body matching of dynamically encrypted files, we send the mock payload expected by pact instead.
        const boundary = "----WebKitFormBoundary";
        headers["content-type"] = `multipart/form-data; boundary=${boundary}`;

        postData = createMultipartPayload(documentId);
      }

      const response = await route.fetch({
        url: requestUrl.href,
        method: request.method(),
        headers: headers,
        postData: postData,
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
  /*
const smallImageId =
documentId === marysUploadedDocumentId
  ? "d09630e2-437e-40ff-8da1-753a0e05caad"
  : "01e9b15b-655c-4baf-8fd3-78c23df70a67";
  */
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
    .uponReceiving("a request of mary to upload a document")
    .withRequest("POST", "/users/mary@imagey.cloud/documents", (r) => {
      const payload = createMultipartPayload(documentId);
      r.headers({
        "Content-Type": "multipart/form-data; boundary=----WebKitFormBoundary",
      }).body("multipart/form-data; boundary=----WebKitFormBoundary", payload);
    })
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

export async function inputMarysPassword(page: Page) {
  const passwordInput = page.getByLabel("password");
  await expect(passwordInput).toBeVisible();
  passwordInput.fill(marysPassword);
  const confirmButton = page.getByText("Confirm");
  await expect(confirmButton).toBeVisible();
  confirmButton.click();
  await expect(confirmButton).not.toBeVisible();
}
