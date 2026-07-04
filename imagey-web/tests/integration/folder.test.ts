import { test, expect } from "./fixtures";

import {
  clearLocalStorage,
  loginAsMary,
  prepareMarysContactRequests,
  prepareMarysLogin,
  runningPactRequests,
  setupMockServer,
  TestData,
  provider,
} from "./setup";
import { MatchersV2 as Matchers, MatchersV3 } from "@pact-foundation/pact";

test.beforeEach("Clear local storage", async ({ page }) => {
  await clearLocalStorage(page);
});

test("create folder", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();

  // Mock public key for encryption
  provider
    .addInteraction()
    .uponReceiving("a request of mary to get public key for folder creation")
    .withRequest("GET", "/users/mary@imagey.cloud/public-keys/0", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(TestData.mary.publicMainKey));

  // Mock the POST request for folder creation
  provider
    .addInteraction()
    .uponReceiving("a request of mary to create a folder")
    .withRequest("POST", "/users/mary@imagey.cloud/documents", (r) => {
      r.headers({
        "Content-Type": Matchers.regex({
          matcher: "multipart/form-data; boundary=.*",
          generate: "multipart/form-data; boundary=----WebKitFormBoundary",
        }),
      });
      // We don't verify the body strictly here, just the request
    })
    .willRespondWith(201, (r) => {
      r.headers({
        Location: MatchersV3.string(
          "/users/mary@imagey.cloud/documents/new-folder-id",
        ),
      });
    });

  // Custom prepare for empty documents initially
  const configuredInteraction = provider
    .addInteraction()
    .given("mary has no documents")
    .uponReceiving("a request of mary to get empty documents for folder test")
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.headers({
        Accept: "application/json",
      }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  // When
  await configuredInteraction.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    page.on("requestfailed", (request) =>
      console.log(
        "FAILED REQUEST:",
        request.url(),
        request.failure()?.errorText,
      ),
    );
    page.on("console", (msg) => console.log("CONSOLE:", msg.text()));

    // Intercept dynamic GET requests for the newly created folder, AFTER setupMockServer so it takes precedence
    await page.route("**/keys/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          issuerType: "USER",
          issuer: "mary@imagey.cloud",
          kid: "0",
          sharedKey: fs
            .readFileSync(
              "./tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/mary@imagey.cloud/encrypted-shared.key",
              "utf8",
            )
            .trim(),
        }),
      });
    });
    await page.route("**/files/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: fs.readFileSync(
          "./tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/files/6e0835c4-ea9a-4259-a5ab-ce2fe88f2b0b",
        ),
      });
    });
    await loginAsMary(page);

    expect(await page.getByRole("link", { name: "Images" }).isVisible());
    await page.getByRole("link", { name: "Images" }).click();

    const addMenuButton = page.locator("*[aria-label='add-menu']");
    await expect(addMenuButton).toBeVisible();
    await addMenuButton.click();

    const createFolderButton = page.locator("text='Create Folder'");
    await createFolderButton.click();

    const folderNameInput = page.getByRole("textbox");
    await expect(folderNameInput).toBeVisible();
    await folderNameInput.fill("My Vacation");

    const createButton = page.getByRole("button", { name: "Create" });
    await createButton.click();

    // Then
    await expect(page.getByAltText("My Vacation")).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

import * as fs from "fs";

test("navigate into folder and upload image", async ({ page }) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();

  const folderId = "folder-uuid-1234";

  const validSharedKey = fs
    .readFileSync(
      `./tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/mary@imagey.cloud/encrypted-shared.key`,
      "utf8",
    )
    .trim();

  // Initially we have a folder
  const emptyFolderDocuments = [
    {
      documentId: folderId,
      metadata:
        "9rqYm7w6z5rfLM7bvp9qU1uFNQfLzcO0OPAz39BJFvLcx+1KdPuRs+ZVQCgQHdU+B6YbHY4lHAlmLGLsx6xm9t7psn+LXqGfuNAZKhQUDG4XxWHFrMg1eB5JyKeM8GQYzysFgWo7gz1U+Ly+2D6XSxCaFmmuBQ29zD9U0P8TO38KpXWX",
      sharedKey: {
        issuerType: "USER",
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey: validSharedKey,
      },
    },
  ];

  provider
    .addInteraction()
    .given("mary has a folder")
    .uponReceiving("a request to get documents containing a folder")
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(emptyFolderDocuments));

  // Request to get documents inside the folder
  provider
    .addInteraction()
    .given("mary has a folder")
    .uponReceiving("a request to get documents inside the folder")
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.query({ folderId: folderId }).headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  // Upload image interactions
  provider
    .addInteraction()
    .given("mary has a folder")
    .uponReceiving("a request to upload image in folder")
    .withRequest("POST", "/users/mary@imagey.cloud/documents", (r) => {
      r.headers({
        "Content-Type": Matchers.regex({
          matcher: "multipart/form-data; boundary=.*",
          generate: "multipart/form-data; boundary=----WebKitFormBoundary",
        }),
      });
    })
    .willRespondWith(201, (r) =>
      r.headers({
        Location: MatchersV3.string(
          "/users/mary@imagey.cloud/documents/new-uploaded-doc",
        ),
      }),
    );

  const configuredInteraction = provider
    .addInteraction()
    .given("mary has a folder")
    .uponReceiving("a request to get folder metadata to update")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/documents/${folderId}`,
      (r) => {
        r.query({ folderId: folderId }).headers({ Accept: "application/json" });
      },
    )
    .willRespondWith(200, (r) => {
      r.headers({ ETag: "123456789" });
      r.jsonBody(emptyFolderDocuments[0]);
    });

  provider
    .addInteraction()
    .given("mary has a folder")
    .uponReceiving("a request to update folder metadata")
    .withRequest(
      "PUT",
      `/users/mary@imagey.cloud/documents/${folderId}`,
      (r) => {
        r.headers({
          "If-Match": "123456789",
          "Content-Type": "application/octet-stream",
        });
      },
    )
    .willRespondWith(200);

  // When
  await configuredInteraction.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    page.on("requestfailed", (request) =>
      console.log(
        "FAILED REQUEST:",
        request.url(),
        request.failure()?.errorText,
      ),
    );
    page.on("console", (msg) => console.log("CONSOLE:", msg.text()));

    // Intercept dynamic GET requests for the newly uploaded document
    await page.route("**/keys/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          issuerType: "USER",
          issuer: "mary@imagey.cloud",
          kid: "0",
          sharedKey: validSharedKey,
        }),
      });
    });
    await page.route("**/files/**", async (route, request) => {
      if (request.method() === "GET" && !request.url().includes(folderId)) {
        await route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: fs.readFileSync(
            "./tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/files/6e0835c4-ea9a-4259-a5ab-ce2fe88f2b0b",
          ),
        });
      } else {
        await route.fallback();
      }
    });

    await loginAsMary(page);

    await page.getByRole("link", { name: "Images" }).click();

    // Wait for the folder to be visible and click it
    const folderElem = page.getByAltText("My Vacation");
    await expect(folderElem).toBeVisible();
    await folderElem.click({ force: true });

    // Wait for the folder documents to load
    const uploadPanelButton = page.locator("button.circle.extra");
    await expect(uploadPanelButton).toBeVisible();

    const backButton = page
      .getByRole("button")
      .filter({ hasText: "arrow_back" });
    if (await backButton.isVisible()) {
      await backButton.click();
      await expect(page.getByAltText("My Vacation")).toBeVisible();
      await folderElem.click({ force: true });
      await expect(uploadPanelButton).toBeVisible();
    }
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      uploadPanelButton.click(),
    ]);

    await fileChooser.setFiles("tests/images/beach-1836467_1920.jpg");

    // Then
    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});

test("retry on HTTP 412 Precondition Failed during folder upload", async ({
  page,
}) => {
  // Given
  await prepareMarysLogin(page);
  await prepareMarysContactRequests();

  const folderId = "folder-uuid-1234";

  const validSharedKey = fs
    .readFileSync(
      `./tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/mary@imagey.cloud/encrypted-shared.key`,
      "utf8",
    )
    .trim();

  // Initially we have a folder
  const emptyFolderDocuments = [
    {
      documentId: folderId,
      metadata:
        "9rqYm7w6z5rfLM7bvp9qU1uFNQfLzcO0OPAz39BJFvLcx+1KdPuRs+ZVQCgQHdU+B6YbHY4lHAlmLGLsx6xm9t7psn+LXqGfuNAZKhQUDG4XxWHFrMg1eB5JyKeM8GQYzysFgWo7gz1U+Ly+2D6XSxCaFmmuBQ29zD9U0P8TO38KpXWX",
      sharedKey: {
        issuerType: "USER",
        issuer: "mary@imagey.cloud",
        kid: "0",
        sharedKey: validSharedKey,
      },
    },
  ];

  provider
    .addInteraction()
    .given("mary has a folder")
    .uponReceiving("a request to get documents containing a folder")
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody(emptyFolderDocuments));

  // Request to get documents inside the folder
  provider
    .addInteraction()
    .given("mary has a folder")
    .uponReceiving("a request to get documents inside the folder")
    .withRequest("GET", "/users/mary@imagey.cloud/documents", (r) =>
      r.query({ folderId: folderId }).headers({ Accept: "application/json" }),
    )
    .willRespondWith(200, (r) => r.jsonBody([]));

  // Upload image interactions
  provider
    .addInteraction()
    .given("mary has a folder")
    .uponReceiving("a request to upload image in folder")
    .withRequest("POST", "/users/mary@imagey.cloud/documents", (r) => {
      r.headers({
        "Content-Type": Matchers.regex({
          matcher: "multipart/form-data; boundary=.*",
          generate: "multipart/form-data; boundary=----WebKitFormBoundary",
        }),
      });
    })
    .willRespondWith(201, (r) =>
      r.headers({
        Location: MatchersV3.string(
          "/users/mary@imagey.cloud/documents/new-uploaded-doc",
        ),
      }),
    );

  const configuredInteraction = provider
    .addInteraction()
    .given("mary has a folder")
    .uponReceiving("a request to get folder metadata to update")
    .withRequest(
      "GET",
      `/users/mary@imagey.cloud/documents/${folderId}`,
      (r) => {
        r.query({ folderId: folderId }).headers({ Accept: "application/json" });
      },
    )
    .willRespondWith(200, (r) => {
      r.headers({ ETag: "123456789" });
      r.jsonBody(emptyFolderDocuments[0]);
    });

  provider
    .addInteraction()
    .given("mary has a folder")
    .uponReceiving("a request to update folder metadata")
    .withRequest(
      "PUT",
      `/users/mary@imagey.cloud/documents/${folderId}`,
      (r) => {
        r.headers({
          "If-Match": "123456789",
          "Content-Type": "application/octet-stream",
        });
      },
    )
    .willRespondWith(200);

  // When
  await configuredInteraction.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);
    page.on("requestfailed", (request) =>
      console.log(
        "FAILED REQUEST:",
        request.url(),
        request.failure()?.errorText,
      ),
    );
    page.on("console", (msg) => console.log("CONSOLE:", msg.text()));

    // Intercept dynamic GET requests for the newly uploaded document
    await page.route("**/keys/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          issuerType: "USER",
          issuer: "mary@imagey.cloud",
          kid: "0",
          sharedKey: validSharedKey,
        }),
      });
    });
    await page.route("**/files/**", async (route, request) => {
      if (request.method() === "GET" && !request.url().includes(folderId)) {
        await route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: fs.readFileSync(
            "./tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/files/6e0835c4-ea9a-4259-a5ab-ce2fe88f2b0b",
          ),
        });
      } else {
        await route.fallback();
      }
    });

    let putCount = 0;
    await page.route(`**/documents/${folderId}`, async (route, request) => {
      if (request.method() === "PUT") {
        putCount++;
        if (putCount === 1) {
          await route.fulfill({
            status: 412,
            body: "Precondition Failed",
            contentType: "text/plain",
          });
        } else {
          await route.fallback();
        }
      } else {
        await route.fallback();
      }
    });

    await loginAsMary(page);

    await page.getByRole("link", { name: "Images" }).click();

    // Wait for the folder to be visible and click it
    const folderElem = page.getByAltText("My Vacation");
    await expect(folderElem).toBeVisible();
    await folderElem.click({ force: true });

    // Wait for the folder documents to load
    const uploadPanelButton = page.locator("button.circle.extra");
    await expect(uploadPanelButton).toBeVisible();
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      uploadPanelButton.click(),
    ]);

    await fileChooser.setFiles("tests/images/beach-1836467_1920.jpg");

    // Then
    await expect(page.getByAltText("beach-1836467_1920.jpg")).toBeVisible();
    await expect.poll(() => runningPactRequests).toBe(0);
    expect(putCount).toBe(2);
  });
});

test.skip("folder items are sorted according to folder metadata documents array", async ({
  page,
}) => {
  await prepareMarysLogin(page);
  const provider = await prepareMarysContactRequests();

  const folderId = "folder-uuid-1234";
  const doc1Id = "doc1-uuid";
  const doc2Id = "doc2-uuid";

  const validSharedKey = fs
    .readFileSync(
      `./tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/mary@imagey.cloud/encrypted-shared.key`,
      "utf8",
    )
    .trim();

  // Folder with documents array: [doc2Id, doc1Id] (reverse order)
  /*  const emptyFolderDocuments = [
    {
      documentId: folderId,
      metadata:
        "9rqYm7w6z5rfLM7bvp9qU1uFNQfLzcO0OPAz39BJFvLcx+1KdPuRs+ZVQCgQHdU+B6YbHY4lHAlmLGLsx6xm9t7psn+LXqGfuNAZKhQUDG4XxWHFrMg1eB5JyKeM8GQYzysFgWo7gz1U+Ly+2D6XSxCaFmmuBQ29zD9U0P8TO38KpXWX", // This represents an empty folder. Wait, I can just return a custom mock without going through pact verification. Wait, I should mock it on the page directly instead of pact provider, because we want to test custom JSON.
    },
  ];*/

  await provider.executeTest(async (mockServer) => {
    await setupMockServer(page, mockServer);

    await page.route("**/users/mary@imagey.cloud/documents", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has("folderId")) {
        // Return doc1 and doc2
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              documentId: doc1Id,
              metadata: "doc1-metadata",
              sharedKey: {
                issuerType: "USER",
                issuer: "mary",
                kid: "0",
                sharedKey: validSharedKey,
              },
            },
            {
              documentId: doc2Id,
              metadata: "doc2-metadata",
              sharedKey: {
                issuerType: "USER",
                issuer: "mary",
                kid: "0",
                sharedKey: validSharedKey,
              },
            },
          ]),
        });
      } else {
        // Return folder
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              documentId: folderId,
              metadata: "folder-metadata",
              sharedKey: {
                issuerType: "USER",
                issuer: "mary",
                kid: "0",
                sharedKey: validSharedKey,
              },
            },
          ]),
        });
      }
    });

    // Mock document content to decrypt to specific JSON
    // We mock the cryptoService directly, or we can mock the fetch and return properly encrypted data.
    // It's easier to mock the fetch and return actual encrypted data that we generated.
  });
});
