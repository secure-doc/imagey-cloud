import { expect, Page } from "@playwright/test";
import { PactV4, Matchers } from "@pact-foundation/pact";
import * as fs from "fs";
import { TestData } from "./testdata";

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

export * from "./testdata";

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
export let expectedUploadDocumentId = "945331a6-b9a8-4f88-a5f5-5928bcdf2fdb";

function createMultipartPayload(documentId: string): Buffer {
  const boundary = "----WebKitFormBoundary";
  const metadata = fs.readFileSync(
    `./tests/images/encrypted/${documentId}/meta-data`,
  );
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
        request.method() === "GET" &&
        requestUrl.pathname === "/users/mary@imagey.cloud/profile"
      ) {
        await route.fulfill({ status: 404 });
        return;
      }

      if (
        (request.method() === "POST" || request.method() === "PUT") &&
        headers["content-type"]?.includes("multipart/form-data")
      ) {
        // To bypass strict body matching of dynamically encrypted files, we send the mock payload expected by pact instead.
        const boundary = "----WebKitFormBoundary";
        headers["content-type"] = `multipart/form-data; boundary=${boundary}`;

        if (request.method() === "POST") {
          const documentId = expectedUploadDocumentId;
          postData = createMultipartPayload(documentId);
        } else {
          // For PUT (profile update), we just use a static mock payload because the actual payload is dynamically encrypted
          postData = Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n{ "documentId": "profile" }\r\n--${boundary}\r\nContent-Disposition: form-data; name="sharedKey"\r\n\r\nencrypted-key\r\n--${boundary}\r\nContent-Disposition: form-data; name="content"; filename="profile.json"\r\nContent-Type: application/octet-stream\r\n\r\ncontent\r\n--${boundary}--\r\n`,
          );
        }
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
    .uponReceiving("a request of mary to get public key")
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get public device key")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/public-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(TestData.mary.devices[0].publicDeviceKey),
    );

  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get encrypted private main key for device",
    )
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/devices/${TestData.mary.devices[0].deviceId}/private-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        kid: "0",
        encryptingDeviceId: TestData.mary.devices[0].deviceId,
        key: TestData.mary.devices[0].encryptedPrivateMainKey,
      }),
    );
  await setupMarysDevice(page);
}

export async function prepareMarysDocuments() {
  provider
    .addInteraction()
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
          encryptedData:
            "2OQTYRVrHbaTeRzMcQpy9gD5WmAGRWf64hN82P+CkWwqP+H4bDKxPFY3NO2QOEdnkCs2NIz+dpNA7XUMdpvzUcyYY4fpIvsJrtzRl4wkhlLo6Dd2yAVZ6Qzd0YY2p9VKV1rGJ1m2d8Ci2k/6tIoDzyZv9GgC1V7qetWcCaG1rYkJPU1KG0Kqdc+r+IJcVwkwDqtrVcWZok0mlvNM0jtQ4XF8QVeYx1qwwVu6gPN3beHYEgidAKXBwg/BsgVz5MdHlKEi0pv0pPkLbPOo8QDVu+1+wWbf345C7BMJCn3uCRIQVbVYa85HvsiV7Ho+mf2rzd564Q7wT0YZVYgfX425inI=",
          sharedKey: fs.readFileSync(
            "./tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/shared-keys/mary@imagey.cloud/encrypted-shared.key",
            "utf8",
          ),
        },
        {
          documentId: "f9910aa7-4db6-4b02-b596-c3ccf872ae98",
          encryptedData:
            "BwEtcDjTQejb5vMpd/3xT1vtdaRPGeRPErhdVmtyfI36iDNjQs2nCWTEwNsvqXCDem++/DZiEH3ezfp3VNpOhRLMwJ1uMlvI6+r16d+ZjYeeSqweGa95h+00c7fKj3eFEmkPbXABGEoUW16JWVnHwwhoPhKvVKVBpgBxUOMrnqmjQgA4kNFyAPVWC/P4nR80/Ox5ibx+jeT/Lv8GdK8HFJcoiZEDsgzFaon3paw6/980934UHWqYz4ynsvFlaYCzYuM8WfTl9ByZVxcNIv8jJbrj9A6jqqY4uWu8gNOpT8V9Kt+Wqf3R9rhlw7a03/ZAndvuAtGM9hbz5qOCHWM7c1E=",
          sharedKey: fs.readFileSync(
            "./tests/images/encrypted/f9910aa7-4db6-4b02-b596-c3ccf872ae98/shared-keys/mary@imagey.cloud/encrypted-shared.key",
            "utf8",
          ),
        },
      ]),
    );

  provider
    .addInteraction()
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

  return provider
    .addInteraction()
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
}

export async function prepareDocumentUpload(
  documentName: string,
  documentId: string,
) {
  expectedUploadDocumentId = documentId;
  const previewImageId =
    documentId === TestData.mary.documents[0].documentId
      ? "9e4742c8-b3b8-44b9-ab83-8e4912271dee"
      : "2211b759-744c-40f3-aec2-10c8d549a49e";
  /*
const smallImageId =
documentId === TestData.mary.documents[0].documentId
  ? "d09630e2-437e-40ff-8da1-753a0e05caad"
  : "01e9b15b-655c-4baf-8fd3-78c23df70a67";
  */
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get public key")
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));

  provider
    .addInteraction()
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

  return provider
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
      r.jsonBody([
        TestData.mary.devices[1].deviceId,
        TestData.mary.devices[0].deviceId,
      ]),
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
    TestData.mary.devices[0].deviceId,
  );
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem("imagey.devices[" + deviceId + "].key", key),
    {
      deviceId: TestData.mary.devices[0].deviceId,
      key: TestData.mary.devices[0].encryptedPrivateDeviceKey,
    },
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
    TestData.mary.devices[1].deviceId,
  );
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem("imagey.devices[" + deviceId + "].key", key),
    {
      deviceId: TestData.mary.devices[1].deviceId,
      key: TestData.mary.devices[1].encryptedPrivateDeviceKey,
    },
  );
}

export async function setupBillsDevice(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem("i18nextLng", "en");
    localStorage.setItem("imagey.user", "bill@imagey.cloud");
  });
  await page.evaluate(
    (deviceId) =>
      localStorage.setItem("imagey.deviceIds[bill@imagey.cloud]", deviceId),
    TestData.bill.devices[0].deviceId,
  );
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem("imagey.devices[" + deviceId + "].key", key),
    {
      deviceId: TestData.bill.devices[0].deviceId,
      key: TestData.bill.devices[0].encryptedPrivateDeviceKey,
    },
  );
}

export async function inputMarysPassword(page: Page) {
  const passwordInput = page.getByLabel("password");
  await expect(passwordInput).toBeVisible();
  passwordInput.fill(TestData.mary.password);
  const confirmButton = page.getByText("Confirm");
  await expect(confirmButton).toBeVisible();
  confirmButton.click();
  await expect(confirmButton).not.toBeVisible();
}

export async function prepareMarysContactRequests() {
  return provider
    .addInteraction()
    .uponReceiving("a request of mary to get contact requests")
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(["laura@imagey.cloud"]));
}

export async function prepareMarysContacts() {
  return provider
    .addInteraction()
    .uponReceiving("a request of mary to get contacts")
    .withRequest("GET", "/users/mary@imagey.cloud/contacts", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));
}
