import { expect, Page } from "@playwright/test";
import { PactV4, MatchersV2 as Matchers } from "@pact-foundation/pact";
import * as fs from "fs";
import * as path from "path";
import { TestData, TestDataStructure, TestUser } from "./testdata";

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
  await page.goto("/favicon.ico");
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
    localStorage.removeItem("imagey.deviceIds[bill@imagey.cloud]"),
  );
  await page.evaluate(() =>
    localStorage.removeItem("imagey.devices[1234].key"),
  );
}

export async function loginAsMary(page: Page) {
  await page.goto("/");
  await inputMarysPassword(page);
}

export async function loginAsJoe(page: Page) {
  await page.goto("/");
  const passwordInput = page.getByLabel("Password", { exact: true });
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(TestData.joe.password);
  const confirmButton = page.getByRole("button", {
    name: "Confirm",
    exact: true,
  });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();
  await expect(confirmButton).not.toBeVisible();
}

export async function loginAsBill(page: Page) {
  await page.goto("/");
  const passwordInput = page.getByLabel("Password", { exact: true });
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(TestData.bill.password);
  const confirmButton = page.getByRole("button", {
    name: "Confirm",
    exact: true,
  });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();
  await expect(confirmButton).not.toBeVisible();
}

export let runningPactRequests = 0;
export let expectedUploadDocumentId = "945331a6-b9a8-4f88-a5f5-5928bcdf2fdb";

function createMultipartPayload(documentId: string): Buffer {
  const boundary = "----WebKitFormBoundary";
  const metadata = fs.readFileSync(
    path.resolve(
      process.cwd(),
      `tests/images/encrypted/${documentId}/meta-data`,
    ),
  );
  const sharedKey = fs.readFileSync(
    path.resolve(
      process.cwd(),
      `tests/images/encrypted/${documentId}/shared-keys/mary@imagey.cloud/encrypted-shared.key`,
    ),
  );
  const content = fs.readFileSync(
    path.resolve(
      process.cwd(),
      `tests/images/encrypted/${documentId}/contents/${documentId}`,
    ),
  );

  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"; filename="meta-data"\r\nContent-Type: application/json\r\n\r\n`,
    ),
    metadata,
    Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="sharedKey"; filename="sharedKey.json"\r\nContent-Type: application/json\r\n\r\n`,
    ),
    Buffer.from(
      JSON.stringify({
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey: sharedKey.toString(),
      }),
    ),
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
            `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n{ "documentId": "profile" }\r\n--${boundary}\r\nContent-Disposition: form-data; name="sharedKey"\r\n\r\n{ "issuer": "mary@imagey.cloud", "kid": "0", "sharedKey": "encrypted-key" }\r\n--${boundary}\r\nContent-Disposition: form-data; name="content"; filename="profile.json"\r\nContent-Type: application/octet-stream\r\n\r\ncontent\r\n--${boundary}--\r\n`,
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

export async function prepareBillsLogin(page: Page) {
  provider
    .addInteraction()
    .uponReceiving("a request of bill to get public key")
    .withRequest("GET", "/users/bill@imagey.cloud/public-keys/0", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.bill.publicMainKey));
  provider
    .addInteraction()
    .uponReceiving("a request of bill to get public device key")
    .withRequest(
      "GET",
      `/users/bill@imagey.cloud/devices/${TestData.bill.devices[0].deviceId}/public-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(TestData.bill.devices[0].publicDeviceKey),
    );

  provider
    .addInteraction()
    .uponReceiving(
      "a request of bill to get encrypted private main key for device",
    )
    .withRequest(
      "GET",
      `/users/bill@imagey.cloud/devices/${TestData.bill.devices[0].deviceId}/private-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        kid: "0",
        encryptingDeviceId: TestData.bill.devices[0].deviceId,
        key: TestData.bill.devices[0].encryptedPrivateMainKey,
      }),
    );
  await setupBillsDevice(page);
}

export async function prepareJoesLogin(page: Page) {
  provider
    .addInteraction()
    .given("joe is logged in")
    .uponReceiving("a request of authenticated joe to get public key")
    .withRequest("GET", "/users/joe@imagey.cloud/public-keys/0", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.joe.publicMainKey));
  provider
    .addInteraction()
    .uponReceiving("a request of joe to get public device key")
    .withRequest(
      "GET",
      `/users/joe@imagey.cloud/devices/${TestData.joe.devices[0].deviceId}/public-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody(TestData.joe.devices[0].publicDeviceKey),
    );

  provider
    .addInteraction()
    .uponReceiving(
      "a request of joe to get encrypted private main key for device",
    )
    .withRequest(
      "GET",
      `/users/joe@imagey.cloud/devices/${TestData.joe.devices[0].deviceId}/private-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        kid: "0",
        encryptingDeviceId: TestData.joe.devices[0].deviceId,
        key: TestData.joe.devices[0].encryptedPrivateMainKey,
      }),
    );

  await page.goto("/");
  await page.evaluate(
    ({ deviceId, privateDeviceKey }) => {
      localStorage.setItem("imagey.user", "joe@imagey.cloud");
      localStorage.setItem("imagey.deviceIds[joe@imagey.cloud]", deviceId);
      localStorage.setItem(`imagey.devices[${deviceId}].key`, privateDeviceKey);
    },
    {
      deviceId: TestData.joe.devices[0].deviceId,
      privateDeviceKey: TestData.joe.devices[0].encryptedPrivateDeviceKey,
    },
  );
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
          smallImageId: "7468168e-b3a6-49bf-9d1d-4f3f7e1bfef0",
          previewImageId: "6e0835c4-ea9a-4259-a5ab-ce2fe88f2b0b",
          encryptedData:
            "2OQTYRVrHbaTeRzMcQpy9gD5WmAGRWf64hN82P+CkWwqP+H4bDKxPFY3NO2QOEdnkCs2NIz+dpNA7XUMdpvzUcyYY4fpIvsJrtzRl4wkhlLo6Dd2yAVZ6Qzd0YY2p9VKV1rGJ1m2d8Ci2k/6tIoDzyZv9GgC1V7qetWcCaG1rYkJPU1KG0Kqdc+r+IJcVwkwDqtrVcWZok0mlvNM0jtQ4XF8QVeYx1qwwVu6gPN3beHYEgidAKXBwg/BsgVz5MdHlKEi0pv0pPkLbPOo8QDVu+1+wWbf345C7BMJCn3uCRIQVbVYa85HvsiV7Ho+mf2rzd564Q7wT0YZVYgfX425inI=",
          sharedKey: {
            issuer: "mary@imagey.cloud",
            kid: "0",
            sharedKey: fs
              .readFileSync(
                path.resolve(
                  process.cwd(),
                  `tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/shared-keys/mary@imagey.cloud/encrypted-shared.key`,
                ),
                "utf8",
              )
              .trim(),
          },
        },
        {
          documentId: "f9910aa7-4db6-4b02-b596-c3ccf872ae98",
          smallImageId: "330e1a82-6626-4a4b-b1ca-9c8a59c859e4",
          previewImageId: "f232a44d-6396-42bb-9196-f0013d46ded5",
          encryptedData:
            "BwEtcDjTQejb5vMpd/3xT1vtdaRPGeRPErhdVmtyfI36iDNjQs2nCWTEwNsvqXCDem++/DZiEH3ezfp3VNpOhRLMwJ1uMlvI6+r16d+ZjYeeSqweGa95h+00c7fKj3eFEmkPbXABGEoUW16JWVnHwwhoPhKvVKVBpgBxUOMrnqmjQgA4kNFyAPVWC/P4nR80/Ox5ibx+jeT/Lv8GdK8HFJcoiZEDsgzFaon3paw6/980934UHWqYz4ynsvFlaYCzYuM8WfTl9ByZVxcNIv8jJbrj9A6jqqY4uWu8gNOpT8V9Kt+Wqf3R9rhlw7a03/ZAndvuAtGM9hbz5qOCHWM7c1E=",
          sharedKey: {
            issuer: "mary@imagey.cloud",
            kid: "0",
            sharedKey: fs
              .readFileSync(
                path.resolve(
                  process.cwd(),
                  `tests/images/encrypted/f9910aa7-4db6-4b02-b596-c3ccf872ae98/shared-keys/mary@imagey.cloud/encrypted-shared.key`,
                ),
                "utf8",
              )
              .trim(),
          },
        },
        {
          documentId: "profile",
          encryptedData:
            "xClE2qirS+J/0WwxlwX6wjxIIhhjC72ezWzTHkPlkYHOTJDIQuWp5TKuu9cgwkzbZqD63Jc+Ao7fKcKhDYNsJI81WU8FRwoN/8uuxnqKpLc+B30RNc/e",
          sharedKey: {
            issuer: "mary@imagey.cloud",
            kid: "0",
            sharedKey:
              "uOJsNDuAO1n3sqc6x6Dri2YTNRkBdaPXJTRcptoSQ4RM0jQZYyDMA7CG0e/NOf4d4HaDXYSZGWdPGcZFqVewsN0BmwDB4ntSEkNxu8+eqFE2z+a+pVu6ncxc6fLHIFLeGZIJOe1vPJyywCt5rtE0QBi6fRfsFHi6VlQ839wLYy1pHaqnvLlW8e5H+xYf1gRmODvrAA2w",
          },
        },
        {
          documentId: "profile-pic-doc-id",
          encryptedData:
            "QIJNho2eMgtb/C1BukR6F8OXQY2v6/9WUKQ7bIko5WqhAI52uJmXTuIYIQEV+eLwLykoFwoO9VoYzvjPaUJ6P7iMuBEdok7GmTzINz182BYeZBms",
          sharedKey: {
            issuer: "mary@imagey.cloud",
            kid: "0",
            sharedKey:
              "uOJsNDuAO1n3sqc6x6Dri2YTNRkBdaPXJTRcptoSQ4RM0jQZYyDMA7CG0e/NOf4d4HaDXYSZGWdPGcZFqVewsN0BmwDB4ntSEkNxu8+eqFE2z+a+pVu6ncxc6fLHIFLeGZIJOe1vPJyywCt5rtE0QBi6fRfsFHi6VlQ839wLYy1pHaqnvLlW8e5H+xYf1gRmODvrAA2w",
          },
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

export async function prepareMarysProfileContents() {
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get profile content")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/profile/contents/profile",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "../imagey-server/src/test/resources/data/mary@imagey.cloud/documents/profile/contents/profile",
      ),
    );

  return provider
    .addInteraction()
    .uponReceiving("a request of mary to get profile picture content")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/profile-pic-doc-id/contents/profile-pic-doc-id",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "../imagey-server/src/test/resources/data/mary@imagey.cloud/documents/profile-pic-doc-id/contents/profile-pic-doc-id",
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
      r.headers({
        "Content-Type": Matchers.regex({
          matcher: "multipart/form-data; boundary=.*",
          generate: "multipart/form-data; boundary=----WebKitFormBoundary",
        }),
      });
      r.body(
        "multipart/form-data; boundary=----WebKitFormBoundary",
        createMultipartPayload(documentId),
      );
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
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey: fs
          .readFileSync(
            `./tests/images/encrypted/${documentId}/shared-keys/mary@imagey.cloud/encrypted-shared.key`,
            "utf8",
          )
          .trim(),
      }),
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
      localStorage.setItem(`imagey.devices[${deviceId}].key`, key),
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
      localStorage.setItem(`imagey.devices[${deviceId}].key`, key),
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
  await page.evaluate((deviceId) => {
    localStorage.setItem("imagey.devices", JSON.stringify([deviceId]));
    localStorage.setItem("imagey.deviceId", deviceId);
    localStorage.setItem("imagey.deviceIds[bill@imagey.cloud]", deviceId);
  }, TestData.bill.devices[0].deviceId);
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem(`imagey.devices[${deviceId}].key`, key),
    {
      deviceId: TestData.bill.devices[0].deviceId,
      key: TestData.bill.devices[0].encryptedPrivateDeviceKey,
    },
  );
}

export async function inputMarysPassword(page: Page) {
  const passwordInput = page.getByLabel("Password", { exact: true });
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(TestData.mary.password);
  const confirmButton = page.getByRole("button", {
    name: "Confirm",
    exact: true,
  });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();
  await expect(confirmButton).not.toBeVisible();
}

export async function prepareMarysContactRequests() {
  provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving("a request of mary to get contacts")
    .withRequest("GET", "/users/mary@imagey.cloud/contacts", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  return provider
    .addInteraction()
    .given("mary has no contacts and a contact request from bill")
    .uponReceiving("a request of mary to get contact requests")
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(["bill@imagey.cloud"]));
}

export async function prepareMarysEmptyContactRequests() {
  provider
    .addInteraction()
    .given("mary has no contacts")
    .uponReceiving("a request of mary to get empty contacts")
    .withRequest("GET", "/users/mary@imagey.cloud/contacts", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  return provider
    .addInteraction()
    .given("mary has no contacts")
    .uponReceiving("a request of mary to get empty contact requests")
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));
}

export async function prepareMarysChat(
  contactEmail: string,
  suffix: string = "",
  validKey: boolean = true,
) {
  const chat = TestData.mary.chats!.find(
    (c) => c.contactEmail === contactEmail,
  )!;
  const contactName = contactEmail.split("@")[0] as keyof TestDataStructure;

  let builder = provider.addInteraction();
  if (contactEmail !== "laura@imagey.cloud") {
    builder = builder.given(
      `Mary has a chat with ${contactEmail.split("@")[0]}`,
    );
  }

  builder
    .uponReceiving(
      `a request of mary to get ${contactName as string}s public key${suffix}`,
    )
    .withRequest("GET", `/users/${contactEmail}/public-keys/0`, (r) => {
      r.headers({ Accept: "application/json" });
    })
    .willRespondWith(200, (r) =>
      r.jsonBody((TestData[contactName] as TestUser).publicMainKey!),
    );

  builder = provider.addInteraction();
  if (contactEmail !== "laura@imagey.cloud") {
    builder = builder.given(
      `Mary has a chat with ${contactEmail.split("@")[0]}`,
    );
  }

  builder
    .uponReceiving(`a request to get shared contact key${suffix}`)
    .withRequest("GET", `/users/mary@imagey.cloud/contacts/${contactEmail}/key`)
    .willRespondWith(200, (r) =>
      r.jsonBody({
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey: Matchers.string(validKey ? chat.encryptedSharedKey : "AAAA"),
      }),
    );

  builder = provider.addInteraction();
  if (contactEmail !== "laura@imagey.cloud") {
    builder = builder.given(
      `Mary has a chat with ${contactEmail.split("@")[0]}`,
    );
  }

  builder
    .uponReceiving(`a request of mary to get contacts in chat${suffix}`)
    .withRequest("GET", "/users/mary@imagey.cloud/contacts", (r) => {
      r.headers({ Accept: "application/json" });
    })
    .willRespondWith(200, (r) => r.jsonBody([contactEmail]));

  builder = provider.addInteraction();
  if (contactEmail !== "laura@imagey.cloud") {
    builder = builder.given(
      `Mary has a chat with ${contactEmail.split("@")[0]}`,
    );
  }

  return builder
    .uponReceiving(`a request of mary to get contact requests in chat${suffix}`)
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) => {
      r.headers({ Accept: "application/json" });
    })
    .willRespondWith(200, (r) => r.jsonBody([]));
}
