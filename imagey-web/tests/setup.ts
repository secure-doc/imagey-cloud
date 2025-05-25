import { PactV3, V3MockServer } from "@pact-foundation/pact";
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
    console.log("route: " + request.url());
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
      body: marysPublicKey,
    });
  await setupMarysDevice(page);
}

export async function setupMarysDevice(page: Page) {
  await page.evaluate(() =>
    localStorage.setItem("imagey.user", "mary@imagey.cloud"),
  );
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
}

export async function inputMarysPassword(page: Page) {
  const passwordInput = page.getByLabel("password");
  await expect(passwordInput).toBeVisible();
  passwordInput.fill(marysPassword);
  page.getByText("OK").click();
}

export const marysEmail = "mary@imagey.cloud";
export const marysPassword = "MarysPassword123";
export const marysToken =
  "eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2ltYWdleS5jbG91ZCIsInN1YiI6Im1hcnlAaW1hZ2V5LmNsb3VkIiwiZXhwIjotOTIyMzM3MDMwODA4OTk4OX0.kj1Q4DV6wnlMQtKQZPVbaTUb0SRSu6XjKHjQmR-KFwU";
export const marysDeviceId = "1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c";
export const marysEncryptedDeviceKey =
  "313a26339214d0c7eb0b2bd476bfaece04e2c1434d1f3db3d707f1eb1912e9b4cd83dad11a1211deb5e84deb4fa3a0b3145d6018a5a5583f71758c4980d71fb290d5346f16ad1237fe65a976a3d8713e16a52e1dd6c3ed5c7bde67bacc172597321bf9a8c2e3ee9764f73b2aba11fbc0ce5af428bd920281934695b8adeb8799f7cc44504cd54209931a74790071f2fd30aab0a62b5a3aa6103746e6f2e569d3ae287c048a9190b9f75dcb3cc58a31b2bcc6cfe5b728ec9ee0c493b7aabda93008b46d479bb3a7c016a41f9f00ac33f497f36803e7608838eb023726bd10929f8b630c92d7dacd6a295b50a753af4885d2748b39164bd06feea6a75b9eaf10";
export const marysEncryptedPrivateKey =
  "96c89d696e663c0b187a4376a483bc60ec042fb45b0300b8ea149240202d09a1dc5073954c47df83954eaa56d6485fe64720875fda3108d8f768c520ca81a2bf906159761563ad18e6f440089744cb79b2fdf7bf1f1cfa08348bbade72362f97f08d3a40d4fd72b4319b75a07f309b0bb1b233e0a57a176f63b4e4b420b1a94c8ae579ac4ccabfb4b8cb51ed4da6a95d2f43d2d66cee568c477efee51e751cbd188c3de2f6f0adee04c14d812ecd0a6c7ddf180e181c31b1ea46f81a0b6ac72b390c086a544667a09dc1391bab09db003c0a05";
export const marysPublicKey = `{
      "alg": "A256CTR",
      "ext": true,
      "k": "3--L_Xfr9Tmh5l6vI9KEp6qbdrEdq2FhPBVMi9Tkq2c",
      "key_ops": ["encrypt", "decrypt"],
      "kty": "oct"
  }`;
export const marysPrivateKey = {
  crv: "P-256",
  d: "jSVu1rw91H2Qvi_p4njJiKzjj-zOeZ4Dfrr4FvBfRIY",
  ext: true,
  key_ops: ["deriveKey"],
  kty: "EC",
  x: "cFKXTdj4LZ22pGln2fqqW_bdiNEz8UF7QySxkq5eyzg",
  y: "QktvEbG3G15ale6kn36OFS65WN_QKy4iL-San3HCVo0",
};
export const joesToken =
  "eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2ltYWdleS5jbG91ZCIsInN1YiI6ImpvZUBpbWFnZXkuY2xvdWQiLCJleHAiOi05MjIzMzcwMzA1NjkxNjk4fQ._O3_-Z5ivyd-gr7FOG459m2OGpooHTVFOv0Q0jWEDoc";
