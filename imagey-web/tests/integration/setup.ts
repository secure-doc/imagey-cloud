import { expect, Page } from "@playwright/test";
import {
  PactV4,
  MatchersV3,
  MatchersV2 as Matchers,
} from "@pact-foundation/pact";
import * as fs from "fs";
import * as path from "path";
import { TestData, TestDataStructure, TestUser } from "./testdata";
import { mockDocuments } from "./mockDocuments";
import { mockSettings } from "./mockSettings";
import { extractMultipartPart } from "./multipartHelper";

let interceptedSettingsDocument: Buffer | null = null;
let interceptedSettingsKey: Buffer | null = null;
let interceptedSettingsDocumentId: string | null = null;
const interceptedDocuments = new Map<string, Buffer>();
const interceptedKeys = new Map<string, Buffer>();

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

export async function setupMockServer(
  page: Page,
  mockServer: MockServer,
  interceptDummyImages: boolean = true,
) {
  const mockServerUrl = new URL(mockServer.url);

  await page.route((url) => url.pathname.startsWith("/users"), async (route, request) => {
    runningPactRequests++;

    try {
      const requestUrl = new URL(request.url());
      requestUrl.port = mockServerUrl.port;
      requestUrl.hostname = mockServerUrl.hostname;

      let postData: Buffer | null = request.postDataBuffer();
      const headers = request.headers();
      console.log("INTERCEPTED", request.method(), requestUrl.pathname, "postData length:", postData?.length);

      if (
        //interceptDummyImages &&
        request.method() === "GET" &&
        /*
		requestUrl.pathname.includes("/files/") &&
        (requestUrl.pathname.includes("bb66aba3") ||
          requestUrl.pathname.includes("f9910aa7"))
      ) {
        const parts = requestUrl.pathname.split("/");
        const docId = parts[parts.length - 3];
        const fileId = parts[parts.length - 1];
        await route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: fs.readFileSync(
            path.resolve(
              process.cwd(),
              `tests/images/encrypted/${docId}/files/${fileId}`,
            ),
          ),
        });
        return provider;
      }

      if (
        request.method() === "GET" &&*/
        requestUrl.pathname === "/users/mary@imagey.cloud/profile"
      ) {
        await route.fulfill({ status: 404 });
        return provider;
      }

      if (
        (request.method() === "POST" || request.method() === "PUT") &&
        headers["content-type"]?.includes("multipart/form-data") /*&&
        requestUrl.pathname !== "/users" &&
        requestUrl.pathname !== "/users/"*/
      ) {
        // To bypass strict body matching of dynamically encrypted files, we send the mock payload expected by pact instead.
        const boundary = "----WebKitFormBoundary";
        headers["content-type"] = `multipart/form-data; boundary=${boundary}`;
        //delete headers["content-length"];

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

      /*delete headers["content-length"];

      if (
        request.method() === "POST" &&
        (requestUrl.pathname === "/users" || requestUrl.pathname === "/users/") &&
        headers["content-type"]?.includes("multipart/form-data") &&
        postData
      ) {
        const boundaryMatch = headers["content-type"].match(/boundary=(.*)/);
        if (boundaryMatch) {
          const boundary = boundaryMatch[1];
          const settingsBuffer = extractMultipartPart(postData, boundary, "settings");
          if (settingsBuffer) {
            interceptedSettingsDocument = settingsBuffer;
            // Hack to get the email since it's the settings document ID for new users
            interceptedSettingsDocumentId = requestUrl.pathname === "/users" ? "joe@imagey.cloud" : null; 
            interceptedDocuments.set("joe@imagey.cloud", settingsBuffer);
          }
          const settingsKeyBuffer = extractMultipartPart(postData, boundary, "settingsKey");
          if (settingsKeyBuffer) interceptedKeys.set("joe@imagey.cloud", settingsKeyBuffer);

          const docListIdBuf = extractMultipartPart(postData, boundary, "documentListId");
          const docListBuf = extractMultipartPart(postData, boundary, "documentList");
          const docListKeyBuf = extractMultipartPart(postData, boundary, "documentListKey");
          if (docListIdBuf && docListBuf && docListKeyBuf) {
            const id = docListIdBuf.toString();
            interceptedDocuments.set(id, docListBuf);
            interceptedKeys.set(id, docListKeyBuf);
          }

          const chatListIdBuf = extractMultipartPart(postData, boundary, "chatListId");
          const chatListBuf = extractMultipartPart(postData, boundary, "chatList");
          const chatListKeyBuf = extractMultipartPart(postData, boundary, "chatListKey");
          if (chatListIdBuf && chatListBuf && chatListKeyBuf) {
            const id = chatListIdBuf.toString();
            interceptedDocuments.set(id, chatListBuf);
            interceptedKeys.set(id, chatListKeyBuf);
          }

          const profileIdBuf = extractMultipartPart(postData, boundary, "profileId");
          const profileBuf = extractMultipartPart(postData, boundary, "profile");
          const profileKeyBuf = extractMultipartPart(postData, boundary, "profileKey");
          if (profileIdBuf && profileBuf && profileKeyBuf) {
            const id = profileIdBuf.toString();
            interceptedDocuments.set(id, profileBuf);
            interceptedKeys.set(id, profileKeyBuf);
          }
        }
      }
*/
      const response = await route.fetch({
        url: requestUrl.href,
        method: request.method(),
        headers: headers,
        postData: postData,
      });

      /*let body = await response.body();

      if (
        request.method() === "GET" &&
        requestUrl.pathname.match(/^\/users\/[^\/]+\/documents\/([^\/]+)$/)
      ) {
        const id = requestUrl.pathname.match(/^\/users\/[^\/]+\/documents\/([^\/]+)$/)![1];
        if (interceptedDocuments.has(id)) {
          console.log("REPLACING RESPONSE BODY WITH INTERCEPTED DOCUMENT", id);
          body = interceptedDocuments.get(id)!;
        }
      }

      if (
        request.method() === "GET" &&
        requestUrl.pathname.match(/^\/users\/[^\/]+\/documents\/([^\/]+)\/keys\/[^\/]+$/)
      ) {
        const id = requestUrl.pathname.match(/^\/users\/[^\/]+\/documents\/([^\/]+)\/keys\/[^\/]+$/)![1];
        if (interceptedKeys.has(id)) {
          console.log("REPLACING RESPONSE BODY WITH INTERCEPTED KEY", id);
          body = interceptedKeys.get(id)!;
        }
      }

      await route.fulfill({ response, body, headers: response.headers() });*/
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
	provider
	  .addInteraction()
	  .uponReceiving(
	    "a request of mary to get her settings",
	  )
	  .withRequest(
	    "GET",
	    `/users/mary@imagey.cloud/documents/mary@imagey.cloud`,
	    (r) =>
	      r.headers({
	        Accept: "application/octet-stream",
	      }),
	  )
		.willRespondWith(200, (r) =>
		  r.binaryFile(
		    "application/octet-stream",
		    "tests/images/encrypted/mary@imagey.cloud/document.enc",
		  ),
	  );
	  provider
	    .addInteraction()
	    .uponReceiving(
	      "a request of mary to get her settings key",
	    )
	    .withRequest(
	      "GET",
	      `/users/mary@imagey.cloud/documents/mary@imagey.cloud/keys/0`,
	      (r) =>
	        r.headers({
	          Accept: "application/json",
	        }),
	    )
	  	.willRespondWith(200, (r) =>
	  	  r.binaryFile(
	  	    "application/json",
	  	    "tests/images/encrypted/mary@imagey.cloud/keys/0.json",
	  	  ),
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
    .uponReceiving("a request of mary to get document f9910aa7-4db6-4b02-b596-c3ccf872ae98")
    .withRequest("GET", "/users/mary@imagey.cloud/documents/f9910aa7-4db6-4b02-b596-c3ccf872ae98", (r) =>
      r.headers({
        Accept: "application/octet-stream",
      }),
    )
    .willRespondWith(200, (r) =>
		r.binaryFile(
		  "application/octet-stream",
		  "tests/images/encrypted/f9910aa7-4db6-4b02-b596-c3ccf872ae98/document.enc",
		));
	provider
	  .addInteraction()
	  .uponReceiving("a request of mary to get document key for f9910aa7-4db6-4b02-b596-c3ccf872ae98")
	  .withRequest("GET", "/users/mary@imagey.cloud/documents/f9910aa7-4db6-4b02-b596-c3ccf872ae98/keys/68980188-577d-4d2f-9e36-a6b32b25cd3a", (r) =>
	    r.headers({
	      Accept: "application/json",
	    }),
	  )
	  .willRespondWith(200, (r) =>
		r.binaryFile(
		  "application/json",
		  "tests/images/encrypted/f9910aa7-4db6-4b02-b596-c3ccf872ae98/keys/68980188-577d-4d2f-9e36-a6b32b25cd3a.json",
		));
	provider
	  .addInteraction()
	  .uponReceiving("a request of mary to get document bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3")
	  .withRequest("GET", "/users/mary@imagey.cloud/documents/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3", (r) =>
	    r.headers({
	      Accept: "application/octet-stream",
	    }),
	  )
	  .willRespondWith(200, (r) =>
		r.binaryFile(
		  "application/octet-stream",
		  "tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/document.enc",
		));
	return	provider
	  .addInteraction()
	  .uponReceiving("a request of mary to get document key for bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3")
	  .withRequest("GET", "/users/mary@imagey.cloud/documents/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/68980188-577d-4d2f-9e36-a6b32b25cd3a", (r) =>
	    r.headers({
	      Accept: "application/json",
	    }),
	  )
	  .willRespondWith(200, (r) =>
		r.binaryFile(
		  "application/json",
		  "tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/68980188-577d-4d2f-9e36-a6b32b25cd3a.json",
		));
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
      "/users/mary@imagey.cloud/documents/3ae437c9-c71e-4cf0-b066-de34d75e1af3/files/3ae437c9-c71e-4cf0-b066-de34d75e1af3",
      (r) =>
        r.headers({
          Accept: "application/octet-stream",
        }),
    )
    .willRespondWith(200, (r) =>
      r.binaryFile(
        "application/octet-stream",
        "../imagey-server/src/test/resources/data/mary@imagey.cloud/documents/3ae437c9-c71e-4cf0-b066-de34d75e1af3/files/3ae437c9-c71e-4cf0-b066-de34d75e1af3",
      ),
    );
}

export async function prepareMarysRootFolder(
  chats: string[] = [],
  invalidKeyChats: string[] = [],
) {
  const documents: Record<string, unknown>[] = [
    {
      documentId: "bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3",
      metadata:
        "fMQ2kdjsS4jasN2_YaYEbSw7Kp5qC0Iz89LIv9s27FhUnMPnTJu2fWHCOsROc-t1J9Q4osXs4pfqm3xIEu0qrC15DLDPCzPB_gsyF7O3yx2wGkbZJxXn10DVd4m19KJAYpL0vyUxFaPK4NnC5En9NTujAuVONSYwF3txvXymyAEhles9c_NZ7k1v7NJk9PikSIcD-P1FabGnW7Gh9mmgdBXDRUosBEEu6r1aBPsRsx71uOgnQR165sLICsDcqFYJXduJRj8pabZFJ0-rvv3Y160piEWPmGOGUBKpl46hb9TRyzZW7Wpkmbg3AfuRNJZOEnJOQVveRF3m5qTLKqMCXo2U-_gax86PDQSpVmmrUuDiDefSKWAxarFsjDR9lMFohIkbm0rp9SciRtixpS3GZiZF3AGZTsWaLQ",
      sharedKey: {
        issuerType: "FOLDER",
        issuer: "68980188-577d-4d2f-9e36-a6b32b25cd3a",
        kid: "0",
        sharedKey: fs.readFileSync(
          path.resolve(
            process.cwd(),
            "tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/68980188-577d-4d2f-9e36-a6b32b25cd3a/encrypted-shared.key",
          ),
          "utf-8",
        ),
      },
    },
    {
      documentId: "f9910aa7-4db6-4b02-b596-c3ccf872ae98",
      metadata:
        "cbpwIZ-0KKwfFGKgr6yrJ62jBb82GZ0gH9qHlhqYR82umxEAlT2vQfIP2Cv81bQAYkhJbGIsEypkMfsCOkEApjHgI75IpYSuG6qtMmb-btqhgBjwxIqqvQe9nQBg5jCTY5V-Kg9nwiNuSkGub2lnIKboDCyLXqnaKb3uZsmpGmfA0y2gY4XmUXoYEP39xxx2jVnhDTnTnPL0T1HKHDNbHL8lxqHNoCn5EuLTkHAYzSId7_Hfi0X7z1r5ivY2kh8inVSVJjecNgKKFEt8LVcbBVKbJgeCy0phCp2WPveu6zIQOhmLLinwyoVv6Z1IxM3FUFtHae3Ik5mr8viqDNWZWoSkP8vaiyHkEdT-ShUXKP2qhddXONE0FEK-vmxZZbCV2P_F9mfZJ45FzJbYRTVBqbAd_u56y2U8nA",
      sharedKey: {
        issuerType: "FOLDER",
        issuer: "68980188-577d-4d2f-9e36-a6b32b25cd3a",
        kid: "0",
        sharedKey: fs.readFileSync(
          path.resolve(
            process.cwd(),
            "tests/images/encrypted/f9910aa7-4db6-4b02-b596-c3ccf872ae98/keys/68980188-577d-4d2f-9e36-a6b32b25cd3a/encrypted-shared.key",
          ),
          "utf-8",
        ),
      },
    },
    {
      documentId: "mary@imagey.cloud",
      metadata:
        "J6xHSoNOVLA+YEIPlbtbpj3HIzUE9Sqq0y6K87d0kKzCrOJM0IcmyHLIw93fbeV2PYHYEtsUUzb7B+xrYVhbkkigcJ7ePXCeZXq7u0NPZcNFG6/ZN83dWNb4u6SEcRjo607gMiSMCwKWdJcNgwwHgUgRme6p8kiz8yg279TNMknMTN9dYGYH2WdrzR0nIbr535KJiKn77U8=",
      sharedKey: {
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey:
          "Y9OiX5TpQKGrD3wI/7wHE+hA9x2xHRx6//VWnSGEUOvhAunrZxYUPYCVo/KcbjemPTdMVd78ABur1eFbMaCgyHHRirTZdh4Fc7gFABb8dPH6tPVyYVRBtArgMDu5fZsR5pP+hK10eAUCjBr6lApf/AuNlDmeve4QjoyCY0Om/PvU1xZbhWylpa7knm9iN83/3R3rdRa7",
      },
    },
    {
      documentId: "9b71fa98-8616-4222-b03e-d189289ccbd0",
      metadata: mockDocuments.mary.profile.metadata,
      sharedKey: {
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey: mockDocuments.mary.profile.sharedKey,
      },
    },
    {
      documentId: "3ae437c9-c71e-4cf0-b066-de34d75e1af3",
      metadata: mockDocuments.mary.profilePic.metadata,
      sharedKey: {
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey: mockDocuments.mary.profilePic.sharedKey,
      },
    },
    {
      documentId: "68980188-577d-4d2f-9e36-a6b32b25cd3a",
      metadata: mockDocuments.mary.rootFolder.metadata,
      sharedKey: {
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey: mockDocuments.mary.rootFolder.sharedKey,
      },
    },
  ];

  const chatDocuments = chats.map((chat) => {
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

    let documentId = `chat-${contactName}`;
    if (contactName === "laura")
      documentId = "9c09fbb6-aee3-4e8e-9779-2bcb69554a02";
    else if (contactName === "alice")
      documentId = "edc59f23-cbaa-4288-a3ad-a1008c654c88";

    return {
      documentId,
      name: chat,
      type: "Chat",
      ...(metadata ? { metadata } : {}),
      sharedKey: {
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey:
          chatData && !invalidKeyChats.includes(chat)
            ? chatData.encryptedSharedKey
            : "invalid-dummy-key",
      },
    };
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
      "a request of mary to get chat documents" +
        (chats.length ? " with chats " + chats.join("-") : ""),
    )
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.query({ folderId: "9c59a4f3-ae55-4c4b-9e4a-2079a2446738" }).headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody(chatDocuments));

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
    .willRespondWith(200, (r) => r.jsonBody(mockSettings.mary));
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

  provider
    .addInteraction()
    .given("mary has no documents")
    .uponReceiving(
      "a request of mary to get empty root documents" +
        (chats.length ? " with chats " + chats.join("-") : ""),
    )
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.query({ folderId: "68980188-577d-4d2f-9e36-a6b32b25cd3a" }).headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  return provider
    .addInteraction()
    .given("mary has no documents")
    .uponReceiving(
      "a request of mary to get empty chat documents" +
        (chats.length ? " with chats " + chats.join("-") : ""),
    )
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.query({ folderId: "9c59a4f3-ae55-4c4b-9e4a-2079a2446738" }).headers({
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
    .uponReceiving("a request to update root folder metadata with new document")
    .withRequest(
      "PUT",
      `/users/mary@imagey.cloud/documents/68980188-577d-4d2f-9e36-a6b32b25cd3a`,
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
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get her chats")
    .withRequest("GET", "/users/mary@imagey.cloud/documents/9c59a4f3-ae55-4c4b-9e4a-2079a2446738", (r) =>
      r.headers({
        Accept: "application/octet-stream",
      }),
    )
    .willRespondWith(200, (r) =>
		r.binaryFile(
		  "application/octet-stream",
		  "tests/images/encrypted/9c59a4f3-ae55-4c4b-9e4a-2079a2446738/document.enc",
		),
    );
	provider
	  .addInteraction()
	  .uponReceiving("a request of mary to get her chats key")
	  .withRequest("GET", "/users/mary@imagey.cloud/documents/9c59a4f3-ae55-4c4b-9e4a-2079a2446738/keys/mary@imagey.cloud", (r) =>
	    r.headers({
	      Accept: "application/json",
	    }),
	  )
	  .willRespondWith(200, (r) =>
		r.binaryFile(
		  "application/json",
		  "tests/images/encrypted/9c59a4f3-ae55-4c4b-9e4a-2079a2446738/keys/mary@imagey.cloud.json",
		),
	  );
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get her contact requests")
    .withRequest("GET", "/users/mary@imagey.cloud/contact-requests", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([
		{
			"inviter": "alice@imagey.cloud",
			"invitee": "mary@imagey.cloud",
			"status": "INVITED",
			"publicKey": TestData.alice.publicMainKey,
			"documentId": "",
			"sharedKey": ""
		}
	]));
	provider
	  .addInteraction()
	  .uponReceiving("a request of mary to get her documents")
	  .withRequest("GET", "/users/mary@imagey.cloud/documents/68980188-577d-4d2f-9e36-a6b32b25cd3a", (r) =>
	    r.headers({
	      Accept: "application/octet-stream",
	    }),
	  )
	  .willRespondWith(200, (r) =>
		r.binaryFile(
		  "application/octet-stream",
		  "tests/images/encrypted/68980188-577d-4d2f-9e36-a6b32b25cd3a/document.enc",
		),
	  );
	return 	provider
	  .addInteraction()
	  .uponReceiving("a request of mary to get her documents key")
	  .withRequest("GET", "/users/mary@imagey.cloud/documents/68980188-577d-4d2f-9e36-a6b32b25cd3a/keys/mary@imagey.cloud", (r) =>
	    r.headers({
	      Accept: "application/json",
	    }),
	  )
	  .willRespondWith(200, (r) =>
		r.binaryFile(
		  "application/json",
		  "tests/images/encrypted/9c59a4f3-ae55-4c4b-9e4a-2079a2446738/keys/mary@imagey.cloud.json",
		),
	  );

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
    .willRespondWith(200, (builder) => builder.jsonBody(mockSettings.alice));

  getState()
    .uponReceiving("a request to get Alices documents in root folder")
    .withRequest("GET", "/users/alice@imagey.cloud/documents", (r) =>
      r.query({ folderId: "68980188-577d-4d2f-9e36-a6b32b25cd3a" }).headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (builder) => builder.jsonBody([]));

  getState()
    .uponReceiving("a request to get Alices documents")
    .withRequest("GET", "/users/alice@imagey.cloud/documents", (r) =>
      r.query({ folderId: "9c59a4f3-ae55-4c4b-9e4a-2079a2446738" }).headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (builder) => builder.jsonBody(documents));
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
