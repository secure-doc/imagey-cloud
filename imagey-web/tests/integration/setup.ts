import { expect, Page } from "@playwright/test";
import {
  PactV4,
  MatchersV3,
  MatchersV2 as Matchers,
} from "@pact-foundation/pact";
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
  // Navigate to an empty HTML page on the same origin to clear storage/IndexedDB without opaque origin restrictions
  await page.goto("/index.html?empty");
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
export let expectedUploadSmallImageId: string | undefined = undefined;
export let expectedUploadPreviewImageId: string | undefined = undefined;

export function createMultipartPayload(documentId: string): Buffer {
  const boundary = "----WebKitFormBoundary";

  // Use dummy text instead of real binary files to prevent pact-js binary payload tokio panics
  const metadataStr = `{"documentId":"${documentId}"}`;
  const keyStr = "dummy-base64-key-bytes";
  const contentStr = "dummy-file-content";

  let body = `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="metadata"; filename="meta-data"\r\n`;
  body += `Content-Type: application/json\r\n\r\n`;
  body += `${metadataStr}\r\n`;

  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="key"; filename="key"\r\n`;
  body += `Content-Type: application/octet-stream\r\n\r\n`;
  body += `${keyStr}\r\n`;

  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="issuer"\r\nContent-Type: text/plain\r\n\r\n`;
  body += `mary@imagey.cloud\r\n`;

  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="content"; filename="blob"\r\n`;
  body += `Content-Type: application/octet-stream\r\n\r\n`;
  body += `${contentStr}\r\n`;

  if (expectedUploadSmallImageId) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="smallImage"; filename="blob"\r\n`;
    body += `Content-Type: application/octet-stream\r\n\r\n`;
    body += `small-image-content\r\n`;
  }

  if (expectedUploadPreviewImageId) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="previewImage"; filename="blob"\r\n`;
    body += `Content-Type: application/octet-stream\r\n\r\n`;
    body += `preview-image-content\r\n`;
  }

  body += `--${boundary}--\r\n`;

  return Buffer.from(body, "utf-8");
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
        return provider;
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

export async function prepareMarysDocuments(chats: string[] = []) {
  await prepareMarysRootFolder(chats);
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get documents")
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.query({ folderId: "root-folder-id" }).headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody([
        ...chats.map((chatEmail) => {
          const contactName = chatEmail.split(
            "@",
          )[0] as keyof TestDataStructure;
          const chatData = TestData.mary.chats?.find(
            (c) => c.contactEmail === chatEmail,
          );
          return {
            documentId: `chat-${contactName}`,
            name: chatEmail,
            type: "Chat",
            sharedKey: {
              issuer: "mary@imagey.cloud",
              kid: "0",
              sharedKey: chatData ? chatData.encryptedSharedKey : "AAAA",
            },
          };
        }),
      ]),
    );

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get root folder document metadata")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/root-folder-id",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        documentId: "root-folder-id",
        metadata: fs.readFileSync(
          path.resolve(
            process.cwd(),
            "tests/images/encrypted/root-folder-id/metadata",
          ),
          "base64",
        ),
        sharedKey: {
          issuer: "mary@imagey.cloud",
          kid: "0",
          sharedKey: fs.readFileSync(
            path.resolve(
              process.cwd(),
              "tests/images/encrypted/root-folder-id/keys/mary@imagey.cloud/encrypted-shared.key",
            ),
            "base64",
          ),
        },
      }),
    );

  provider
    .addInteraction()
    .uponReceiving("a request of mary to get settings document metadata")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/mary@imagey.cloud",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        documentId: "mary@imagey.cloud",
        metadata: fs.readFileSync(
          path.resolve(
            process.cwd(),
            "tests/images/encrypted/mary@imagey.cloud/metadata",
          ),
          "base64",
        ),
        sharedKey: {
          issuer: "mary@imagey.cloud",
          kid: "0",
          sharedKey: fs.readFileSync(
            path.resolve(
              process.cwd(),
              "tests/images/encrypted/mary@imagey.cloud/keys/mary@imagey.cloud/encrypted-shared.key",
            ),
            "base64",
          ),
        },
      }),
    );

  return provider;
}

export async function prepareMarysProfileContents() {
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get profile content")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/profile/files/profile",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "../imagey-server/src/test/resources/data/mary@imagey.cloud/documents/profile/files/profile",
      ),
    );

  return provider
    .addInteraction()
    .uponReceiving("a request of mary to get profile picture content")
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/profile-pic-doc-id/files/profile-pic-doc-id",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "../imagey-server/src/test/resources/data/mary@imagey.cloud/documents/profile-pic-doc-id/files/profile-pic-doc-id",
      ),
    );
}

export async function prepareMarysRootFolder(
  chats: string[] = [],
  invalidKeyChats: string[] = [],
) {
  const documents: Record<string, unknown>[] = [
    {
      documentId: "mary@imagey.cloud",
      metadata:
        "ha98ll38YW1LOvkWzjoBhu23W2LGxFWY27WtOBlkN1XYG0Wppxv9dlgSLV+EmvK7rPJM/nMRkRvdIw==",
      sharedKey: {
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey:
          "Y9OiX5TpQKGrD3wI/7wHE+hA9x2xHRx6//VWnSGEUOvhAunrZxYUPYCVo/KcbjemPTdMVd78ABur1eFbMaCgyHHRirTZdh4Fc7gFABb8dPH6tPVyYVRBtArgMDu5fZsR5pP+hK10eAUCjBr6lApf/AuNlDmeve4QjoyCY0Om/PvU1xZbhWylpa7knm9iN83/3R3rdRa7",
      },
    },
    {
      documentId: "profile",
      metadata:
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
      metadata:
        "QIJNho2eMgtb/C1BukR6F8OXQY2v6/9WUKQ7bIko5WqhAI52uJmXTuIYIQEV+eLwLykoFwoO9VoYzvjPaUJ6P7iMuBEdok7GmTzINz182BYeZBms",
      sharedKey: {
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey:
          "uOJsNDuAO1n3sqc6x6Dri2YTNRkBdaPXJTRcptoSQ4RM0jQZYyDMA7CG0e/NOf4d4HaDXYSZGWdPGcZFqVewsN0BmwDB4ntSEkNxu8+eqFE2z+a+pVu6ncxc6fLHIFLeGZIJOe1vPJyywCt5rtE0QBi6fRfsFHi6VlQ839wLYy1pHaqnvLlW8e5H+xYf1gRmODvrAA2w",
      },
    },
    {
      documentId: "root-folder-id",
      sharedKey: {
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey: fs.readFileSync(
          path.resolve(
            process.cwd(),
            "tests/images/encrypted/root-folder-id/keys/mary@imagey.cloud/encrypted-shared.key",
          ),
          "base64",
        ),
      },
    },
  ];

  chats.forEach((chat) => {
    const contactName = chat.split("@")[0] as keyof TestDataStructure;
    const chatData = TestData.mary.chats?.find((c) => c.contactEmail === chat);
    let metadata: string | undefined;
    if (chat === "laura@imagey.cloud") {
      metadata =
        "+2lw6hmPx/N/djM8ASn+kG5CI5TaL2nXMQZXO1mF6HXgZKobzxIi+eGIh96Hyw2tIaawc48GL69wePVfXDEl0o8BMmpdgHQ=";
    } else if (chat === "alice@imagey.cloud") {
      metadata =
        "SvwyuvGK490PcZkvPvA3AiKeIehXCWjrEDomT57qgNdEVzRexUtOi7EpvekQPmQJSVIjBp/3A6fUXLYIvlOElC326VhFbiA=";
    }

    documents.push({
      documentId: `chat-${contactName}`,
      ...(metadata ? { metadata } : {}),
      sharedKey: {
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey:
          chatData && !invalidKeyChats.includes(chat)
            ? chatData.encryptedSharedKey
            : "invalid-dummy-key",
      },
    });
  });

  documents.sort((a, b) =>
    (a.documentId as string).localeCompare(b.documentId as string),
  );

  const getState = () => {
    let interaction = provider
      .addInteraction()
      .given("marys second device registered");
    chats.forEach((chat) => {
      interaction = interaction.given(
        `Mary has a chat with ${chat.split("@")[0]}`,
      );
    });
    return interaction;
  };

  getState()
    .uponReceiving(
      "a request of mary to get root documents" +
        (chats.length ? " with chats " + chats.join("-") : ""),
    )
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(documents));
  getState()
    .uponReceiving(
      "a request of mary to get root folder document metadata for empty folder",
    )
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/root-folder-id",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        documentId: "root-folder-id",
        metadata: fs.readFileSync(
          path.resolve(
            process.cwd(),
            "tests/images/encrypted/root-folder-id/metadata",
          ),
          "base64",
        ),
        sharedKey: {
          issuer: "mary@imagey.cloud",
          kid: "0",
          sharedKey: fs.readFileSync(
            path.resolve(
              process.cwd(),
              "tests/images/encrypted/root-folder-id/keys/mary@imagey.cloud/encrypted-shared.key",
            ),
            "base64",
          ),
        },
      }),
    );

  provider
    .addInteraction()
    .uponReceiving(
      "a request of mary to get settings document metadata for empty folder",
    )
    .withRequest(
      "GET",
      "/users/mary@imagey.cloud/documents/mary@imagey.cloud",
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        documentId: "mary@imagey.cloud",
        metadata: fs.readFileSync(
          path.resolve(
            process.cwd(),
            "tests/images/encrypted/mary@imagey.cloud/metadata",
          ),
          "base64",
        ),
        sharedKey: {
          issuer: "mary@imagey.cloud",
          kid: "0",
          sharedKey: fs.readFileSync(
            path.resolve(
              process.cwd(),
              "tests/images/encrypted/mary@imagey.cloud/keys/mary@imagey.cloud/encrypted-shared.key",
            ),
            "base64",
          ),
        },
      }),
    );
}

export async function prepareEmptyMarysDocuments(
  chats: string[] = [],
  invalidKeyChats: string[] = [],
) {
  await prepareMarysRootFolder(chats, invalidKeyChats);

  const documents: Record<string, unknown>[] = [];
  chats.forEach((chatEmail) => {
    const contactName = chatEmail.split("@")[0] as keyof TestDataStructure;
    const chatData = TestData.mary.chats?.find(
      (c) => c.contactEmail === chatEmail,
    );
    const encryptedSharedKey =
      chatData && !invalidKeyChats.includes(chatEmail)
        ? chatData.encryptedSharedKey
        : "invalid-dummy-key";

    documents.push({
      documentId: `chat-${contactName}`,
      sharedKey: {
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey: encryptedSharedKey,
      },
    });
  });

  return provider
    .addInteraction()
    .given("mary has no documents")
    .uponReceiving(
      "a request of mary to get empty documents" +
        (chats.length ? " with chats " + chats.join("-") : ""),
    )
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.query({ folderId: "root-folder-id" }).headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(documents));
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

  const smallImageId =
    documentId === TestData.mary.documents[0].documentId
      ? "d09630e2-437e-40ff-8da1-753a0e05caad"
      : "01e9b15b-655c-4baf-8fd3-78c23df70a67";

  expectedUploadSmallImageId = smallImageId;
  expectedUploadPreviewImageId = previewImageId;

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
    .uponReceiving(`a request of mary to upload a document`)
    .withRequest("POST", "/users/mary@imagey.cloud/documents", (r) => {
      r.headers({
        "Content-Type": MatchersV3.regex(
          "multipart/form-data.*",
          "multipart/form-data; boundary=----WebKitFormBoundary",
        ),
      });
    })
    .willRespondWith(201, (r) =>
      r.headers({
        Location: MatchersV3.string(
          `/users/mary@imagey.cloud/documents/${documentId}`,
        ),
        "Access-Control-Expose-Headers": "Location",
      }),
    );

  provider
    .addInteraction()
    .given("Mary has uploaded document")
    .uponReceiving("a request to get root folder metadata to update")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/documents/root-folder-id`,
      (r) => {
        r.headers({
          Accept: "application/json",
        });
      },
    )
    .willRespondWith(200, (r) => {
      r.headers({ ETag: MatchersV3.string("123456789") });
      r.jsonBody({
        documentId: "root-folder-id",
        metadata: fs.readFileSync(
          path.resolve(
            process.cwd(),
            "tests/images/encrypted/root-folder-id/metadata",
          ),
          "base64",
        ),
        sharedKey: {
          issuer: "mary@imagey.cloud",
          kid: "0",
          sharedKey: fs.readFileSync(
            path.resolve(
              process.cwd(),
              "tests/images/encrypted/root-folder-id/keys/mary@imagey.cloud/encrypted-shared.key",
            ),
            "base64",
          ),
        },
      });
    });

  provider
    .addInteraction()
    .given("Mary has uploaded document")
    .uponReceiving("a request to update root folder metadata with new document")
    .withRequest(
      "PUT",
      `/users/mary@imagey.cloud/documents/root-folder-id`,
      (r) => {
        r.headers({
          "Content-Type": "application/octet-stream",
        });
      },
    )
    .willRespondWith(200);

  return provider
    .addInteraction()
    .given("Mary has uploaded document")
    .uponReceiving(
      "a request of mary to load document content of " + documentId,
    )
    .withRequest(
      "GET",
      Matchers.regex({
        matcher:
          "/users/mary@imagey\\.cloud/documents/(?!(bb66|f991)).+/files/.+",
        generate: `/users/mary@imagey.cloud/documents/${documentId}/files/${previewImageId}`,
      }),
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        `./tests/images/encrypted/${documentId}/files/${previewImageId}`,
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

export async function prepareMarysEmptyDocuments() {
  return provider
    .addInteraction()
    .given("mary has no documents")
    .uponReceiving("a request of mary to get empty documents")
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
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
  const contactName = contactEmail.split("@")[0] as keyof TestDataStructure;

  let builder = provider.addInteraction();
  if (contactEmail !== "laura@imagey.cloud") {
    builder = builder.given(
      `Mary has a chat with ${contactEmail.split("@")[0]}`,
    );
  }

  if (!validKey) {
    // Add it twice because React StrictMode fetches it twice
    for (let i = 0; i < 2; i++) {
      builder
        .uponReceiving(
          `a request of mary to get ${contactName as string}s public key${suffix} (${i})`,
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
    }
  }

  return builder
    .uponReceiving(`a request of mary to get contact requests in chat${suffix}`)
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) => {
      r.headers({ Accept: "application/json" });
    })
    .willRespondWith(200, (r) => r.jsonBody([]));
}

export async function setupAlicesDevice(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem("i18nextLng", "en");
    localStorage.setItem("imagey.user", "alice@imagey.cloud");
  });
  await page.evaluate((deviceId) => {
    localStorage.setItem("imagey.devices", JSON.stringify([deviceId]));
    localStorage.setItem("imagey.deviceId", deviceId);
    localStorage.setItem("imagey.deviceIds[alice@imagey.cloud]", deviceId);
  }, TestData.alice.devices[0].deviceId);
  await page.evaluate(
    ({ deviceId, key }) =>
      localStorage.setItem(`imagey.devices[${deviceId}].key`, key),
    {
      deviceId: TestData.alice.devices[0].deviceId,
      key: TestData.alice.devices[0].encryptedPrivateDeviceKey,
    },
  );
}

export async function loginAsAlice(page: Page) {
  await setupAlicesDevice(page);
  await page.goto("/");
  const passwordInput = page.getByLabel("Password", { exact: true });
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(TestData.alice.password);
  const confirmButton = page.getByRole("button", {
    name: "Confirm",
    exact: true,
  });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();

  // ensure login completes
  const homeLink = page.getByRole("link", { name: "Home" }).first();
  await expect(homeLink).toBeVisible();
}

export async function prepareAlicesLogin(chats: string[] = []) {
  const documents: Record<string, unknown>[] = [];
  chats.forEach((chatEmail) => {
    const contactName = chatEmail.split("@")[0] as keyof TestDataStructure;
    const chatData = TestData.mary.chats?.find(
      (c) => c.contactEmail === "alice@imagey.cloud",
    );
    const encryptedSharedKey = chatData ? chatData.encryptedSharedKey : "AAAA";
    let metadata: string | undefined;
    if (chatEmail === "mary@imagey.cloud") {
      metadata =
        "3JS7BGWaI//XsrMv2abdE+Sx+sGGG8dthuI2NlfqoTx66dyvSXt6ahEw3aCMl5cs+POVLyZBA8NzjzNqpqrD7r9Weyo3MA==";
    }

    documents.push({
      documentId: `chat-${contactName}`,
      ...(metadata ? { metadata } : {}),
      sharedKey: {
        issuer: "alice@imagey.cloud",
        kid: "0",
        sharedKey: encryptedSharedKey,
      },
    });
  });

  const getState = () => {
    let interaction = provider.addInteraction().given("Alice exists");
    if (chats.includes("mary@imagey.cloud")) {
      interaction = interaction.given("Alice has a chat with mary");
    }
    return interaction;
  };

  getState()
    .uponReceiving("a request to get Alices public main key")
    .withRequest("GET", "/users/alice@imagey.cloud/public-keys/0", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (builder) =>
      builder.jsonBody(TestData.alice.publicMainKey),
    );

  getState()
    .uponReceiving("a request to get Alices public device key")
    .withRequest(
      "GET",
      `/users/alice@imagey.cloud/devices/${TestData.alice.devices[0].deviceId}/public-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (builder) =>
      builder.jsonBody(TestData.alice.devices[0].publicDeviceKey),
    );

  getState()
    .uponReceiving("a request to get Alices encrypted private device key")
    .withRequest(
      "GET",
      `/users/alice@imagey.cloud/devices/${TestData.alice.devices[0].deviceId}/private-keys/0`,
      (r) =>
        r.headers({
          Accept: "application/json",
        }),
    )
    .willRespondWith(200, (builder) =>
      builder.jsonBody({
        kid: "0",
        encryptingDeviceId: TestData.alice.devices[0].deviceId,
        key: TestData.alice.devices[0].encryptedPrivateMainKey,
      }),
    );

  getState()
    .uponReceiving("a request to get Alices contact requests")
    .withRequest("GET", "/users/alice@imagey.cloud/contact-requests")
    .willRespondWith(200, (builder) => builder.jsonBody([]));

  getState()
    .uponReceiving("a request to get Alices settings document")
    .withRequest(
      "GET",
      "/users/alice@imagey.cloud/documents/alice@imagey.cloud",
    )
    .willRespondWith(404);

  getState()
    .uponReceiving("a request to create Alices documents")
    .withRequest(
      "PUT",
      Matchers.regex({
        matcher: "/users/alice@imagey\\.cloud/documents/.*",
        generate: "/users/alice@imagey.cloud/documents/some-uuid",
      }),
    )
    .willRespondWith(200);

  getState()
    .uponReceiving("a request to get Alices root documents")
    .withRequest("GET", "/users/alice@imagey.cloud/documents")
    .willRespondWith(200, (builder) => builder.jsonBody(documents));

  getState()
    .uponReceiving("a request to get Alices documents")
    .withRequest("GET", "/users/alice@imagey.cloud/documents", (r) =>
      r.query({ folderId: Matchers.string("some-uuid") }),
    )
    .willRespondWith(200, (builder) => builder.jsonBody([]));
}

export async function prepareAlicesChat(
  contact: string,
  suffix: string = "",
  returnValidKey: boolean = true,
) {
  if (!returnValidKey) {
    provider
      .addInteraction()
      .given(`Alice has a chat with ${contact}`)
      .uponReceiving("a request to get contact public key" + suffix)
      .withRequest("GET", `/users/${contact}/public-keys/0`)
      .willRespondWith(200, (builder) =>
        builder.jsonBody(TestData.mary.publicMainKey),
      );
  }

  return provider;
}
