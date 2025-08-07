import { MatchersV3, PactV3, V3MockServer } from "@pact-foundation/pact";
import { expect, Page } from "@playwright/test";

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

export async function setupMockServer(page: Page, mockServer: V3MockServer) {
  const mockServerUrl = new URL(mockServer.url);
  await page.route("/users/**", async (route, request) => {
    const requestUrl = new URL(request.url());
    //requestUrl.hostname = mockServerUrl.hostname;
    requestUrl.port = mockServerUrl.port;
    const response = await route.fetch({
      headers: request.headers(),
      method: request.method(),
      postData: request.postData(),
      url: requestUrl.href,
    });
    await route.fulfill({ response });
  });
}

export async function prepareMarysLogin(page: Page) {
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
      body: marysPublicMainKey,
    });
  provider
    .given("default")
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
    .given("default")
    .uponReceiving("a request of mary to get private device key")
    .withRequest({
      method: "GET",
      path: `/users/mary@imagey.cloud/devices/${marysDeviceId}/private-keys/0`,
      headers: {
        Accept: "text/plain",
      },
    })
    .willRespondWith({
      status: 200,
      contentType: "text/plain",
      body: marysEncryptedPrivateMainKey,
    });
  await setupMarysDevice(page);
}

export async function prepareMarysDocuments() {
  provider
    .given("default")
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
          smallImageId: "ec945593-bca0-4fd1-bb03-c4cfcd02d7ba",
          type: "image/jpeg",
        },
      ],
    });
  provider
    .given("default")
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
    .given("default")
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
    .willRespondWith({
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
      contentType: "text/plain",
      body: "8349905db928f7aef27470a6995a83c1bcd99986c44d5652f791f6475853ac8fa264ff956f99909f9fdef17b20298c1fd891c178431b5daf8dd8248c0c33c870554a4ddd815d295ad6d5eef09ab42fc9291caa88272c83f2e5728b09628d61e9fd4458be3d2e0cf0a9ff13d1848c60ed5056cab9d1c97d6faff5",
    });
  provider
    .given("default")
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
    .given("default")
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
    .willRespondWith({
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
      contentType: "text/plain",
      body: "8349905db928f7aef27470a6995a83c1bcd99986c44d5652f791f6475853ac8fa276ddcf58abb1bb97fbf8672a30f719eb9fdb706d0d559c83dd38964f11947e213233aeb7623223f1e382f09ab42fc9291caa88272c83f2e5728b09628d61e9fd4458be3d2e0cf0a9ff13d1848c60ed5056cab9d1c97d6faff5",
    });
}

export async function prepareDocumentUpload() {
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
      body: marysPublicMainKey,
    });
  provider
    .given("default")
    .uponReceiving("a request of mary to upload document key")
    .withRequest({
      method: "PUT",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/documents/.+/encrypted-shared-keys/mary@imagey\\.cloud",
        "/users/mary@imagey.cloud/documents/1904a8b5-d0c7-4151-af13-0e6ac04ee1bd/encrypted-shared-keys/mary@imagey.cloud",
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
    .given("default")
    .uponReceiving("a request of mary to upload document metadata")
    .withRequest({
      method: "PUT",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/documents/.+/meta-data",
        "/users/mary@imagey.cloud/documents/" +
          marysUploadedDocumentId +
          "/meta-data",
      ),
      headers: {
        "Content-Type": "application/json",
      },
      contentType: "application/json",
      body: {
        documentId: MatchersV3.string(marysUploadedDocumentId),
        previewImageId: MatchersV3.string(marysUploadedDocumentId),
        smallImageId: MatchersV3.string(marysUploadedDocumentId),
        name: marysUploadedDocumentName,
        size: MatchersV3.number(8000),
        type: "image/jpeg",
      },
    })
    .willRespondWith({
      status: 200,
    });
  provider
    .given("default")
    .uponReceiving("a request of mary to upload document content")
    .withRequest({
      method: "PUT",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/documents/.+/contents/.+",
        "/users/mary@imagey.cloud/documents/945331a6-b9a8-4f88-a5f5-5928bcdf2fdb/contents/945331a6-b9a8-4f88-a5f5-5928bcdf2fdb",
      ),
      contentType: "application/octet-stream",
      // body not matched
    })
    .willRespondWith({
      status: 200,
    });
  provider
    .given("Mary has uploaded document")
    .uponReceiving("a request of mary to load document content")
    .withRequest({
      method: "GET",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/documents/(?!(bb66|f991)).+/contents/.+",
        "/users/mary@imagey.cloud/documents/945331a6-b9a8-4f88-a5f5-5928bcdf2fdb/contents/945331a6-b9a8-4f88-a5f5-5928bcdf2fdb",
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
      "./tests/images/encrypted/945331a6-b9a8-4f88-a5f5-5928bcdf2fdb/contents/945331a6-b9a8-4f88-a5f5-5928bcdf2fdb",
    );
  provider
    .given("Mary has uploaded document")
    .uponReceiving(
      "a request of mary to get shared key for document with id 945331a6-b9a8-4f88-a5f5-5928bcdf2fdb",
    )
    .withRequest({
      method: "GET",
      path: MatchersV3.regex(
        "/users/mary@imagey\\.cloud/documents/(?!(bb66|f991)).+/encrypted-shared-keys/mary@imagey\\.cloud",
        "/users/mary@imagey.cloud/documents/945331a6-b9a8-4f88-a5f5-5928bcdf2fdb/encrypted-shared-keys/mary@imagey.cloud",
      ),
      headers: {
        Accept: "text/plain",
      },
    })
    .willRespondWith({
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
      contentType: "text/plain",
      body: "8349905db928f7aef27470a6995a83c1bcd99986c44d5652f791f6475853ac8fa242d7851fdd9e868acafd5b7c258527e6cbea614a6073a290ee59a53235927323556f9d994a27568ae0de859ab42fc9291caa88272c83f2e5728b09628d61e9fd4458be3d2e0cf0a9ff13d1848c60ed5056cab9d1c97d6faff5",
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

export async function inputMarysPassword(page: Page) {
  const passwordInput = page.getByLabel("password");
  await expect(passwordInput).toBeVisible();
  passwordInput.fill(marysPassword);
  const okButton = page.getByText("OK");
  await expect(okButton).toBeVisible();
  okButton.click();
  await expect(okButton).not.toBeVisible();
}

export const marysEmail = "mary@imagey.cloud";
export const marysPassword = "MarysPassword123";
export const marysToken =
  "eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2ltYWdleS5jbG91ZCIsInN1YiI6Im1hcnlAaW1hZ2V5LmNsb3VkIiwiZXhwIjotOTIyMzM3MDMwODA4OTk4OX0.kj1Q4DV6wnlMQtKQZPVbaTUb0SRSu6XjKHjQmR-KFwU";
export const marysDeviceId = "1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c";
export const marysPublicDeviceKey = {
  crv: "P-256",
  ext: true,
  key_ops: [],
  kty: "EC",
  x: "O1aGIpmfLo-SOJDBwBW1zyKJDUdIxpmYjg-vC8UTim4",
  y: "ySJAF_0XeBWOrL-jboQvxy644ViTd0FDgp-pSCP3ONU",
};
export const marysPrivateDeviceKey = {
  crv: "P-256",
  d: "MqydykBULsorDlkHSI8uiydpJ8CBt9dmZcQsWBVPlLo",
  ext: true,
  key_ops: ["deriveKey"],
  kty: "EC",
  x: "O1aGIpmfLo-SOJDBwBW1zyKJDUdIxpmYjg-vC8UTim4",
  y: "ySJAF_0XeBWOrL-jboQvxy644ViTd0FDgp-pSCP3ONU",
};
export const marysEncryptedPrivateDeviceKey =
  "65a9b6a4d7c9bd5f82aeaff02b2c1c46d8ed360bbf5f8ab28ee48b5a5ee3eace262324f5dffd4ae49414cd49281752a6bd84e33c3ea80d832654317c0a99c379f33de3721836dd1c6bba7f6cbda51aa09c8b0b81eb5a96a73b5ec78de4a5d32ee8feed084830d111525902c8cf1079538f264c6bf18128c1b69a0521c20840ecb674947f8f171fda4117d7096b1a96c40b26c52f97e2690236d53fd7b95efa4e7b3e647e90e0676b7ad6fdd1e31c664a3316016e1e0c1ced1300bba5b6e873991d201b375936aca60543ce8ef2674a205938329143c450f6ec6e24298d2332afd79b3adfa28ef113aef2b348d99cbb4d06708596521f22946e2e197eee02ee";
export const marysEncryptedPrivateMainKey =
  "af0479021bae094dd146c98500380f30aad014b9bedaae07e7fbe4d8bc0fa3a70724b573c99edea9d7aa432bb1d3c9b8df289fd1c42ec820683db4cfdaba52919b25bc4c118b89310182b8b315adf72578f1fff343d41e381026e67c36de9d0d5b2e35400c772c0682ff877ff91d6769b6d732c46103bd996bb0c24bff42954367e562f66cdbd73a30b1ff9cee68f7c5cfca0a0dc342ea0452f5d69f18de6c8809f920217e908fd0371a036f59834ee2962cad3f57956727186e64d6c4a50b9b8d1de07d36b1fa375c453bb0c7230f377b4384";
export const marysPublicMainKey = {
  crv: "P-256",
  ext: true,
  key_ops: [],
  kty: "EC",
  x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
  y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
};
export const marysPrivateMainKey = {
  crv: "P-256",
  d: "9of9zCwj6wFarMtSDdsp_4K_q2g2g_nv2jQgrTBQ4fw",
  ext: true,
  key_ops: ["deriveKey"],
  kty: "EC",
  x: "OT9blIwjsWgWB3QjXX8wl443BWanoPRvhn546qiw3rY",
  y: "D9imFHRhbrBGPyC_QPTjZBf-SVbF5a6lvVb-JczKUCM",
};
export const marysUploadedDocumentId = "945331a6-b9a8-4f88-a5f5-5928bcdf2fdb";
export const marysUploadedDocumentName = "child-355176_1920.jpg";
export const joesToken =
  "eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2ltYWdleS5jbG91ZCIsInN1YiI6ImpvZUBpbWFnZXkuY2xvdWQiLCJleHAiOi05MjIzMzcwMzA1NjkxNjk4fQ._O3_-Z5ivyd-gr7FOG459m2OGpooHTVFOv0Q0jWEDoc";
