import { PactV3, V3MockServer } from "@pact-foundation/pact";
import { Page } from "@playwright/test";

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
  await page.evaluate(
    ({ marysEmail }) => localStorage.setItem("imagey.user", marysEmail),
    { marysEmail },
  );
  await page.evaluate(
    ({ marysDeviceId }) =>
      localStorage.setItem(
        "imagey.deviceIds[mary@imagey.cloud]",
        marysDeviceId,
      ),
    { marysDeviceId },
  );
  await page.evaluate(
    ({ marysDeviceId, marysPrivateKey }) =>
      localStorage.setItem(
        "imagey.devices[" + marysDeviceId + "].key",
        JSON.stringify(marysPrivateKey),
      ),
    { marysDeviceId, marysPrivateKey },
  );
}

export async function setupMockServer(page: Page, mockServer: V3MockServer) {
  const mockServerUrl = new URL(mockServer.url);
  await page.route("/users/**", async (route, request) => {
    const requestUrl = new URL(request.url());
    requestUrl.hostname = mockServerUrl.hostname;
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

export const marysEmail = "mary@imagey.cloud";
export const joesToken =
  "eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2ltYWdleS5jbG91ZCIsInN1YiI6ImpvZUBpbWFnZXkuY2xvdWQiLCJleHAiOi05MjIzMzcwMzA1NjkxNjk4fQ._O3_-Z5ivyd-gr7FOG459m2OGpooHTVFOv0Q0jWEDoc";
export const marysToken =
  "eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2ltYWdleS5jbG91ZCIsInN1YiI6Im1hcnlAaW1hZ2V5LmNsb3VkIiwiZXhwIjotOTIyMzM3MDMwODA4OTk4OX0.kj1Q4DV6wnlMQtKQZPVbaTUb0SRSu6XjKHjQmR-KFwU";
export const marysSymmetricKey = `{
    alg: "A256CTR",
    ext: true,
    k: "3--L_Xfr9Tmh5l6vI9KEp6qbdrEdq2FhPBVMi9Tkq2c",
    key_ops: ["encrypt", "decrypt"],
    kty: "oct",
}`;
export const marysDeviceId = "1fd4f9f5-4b06-4cf3-8e86-a2e609a8e30c";
export const marysEncryptedPrivateKey =
  "96c89d696e663c0b187a4376a483bc60ec042fb45b0300b8ea149240202d09a1dc5073954c47df83954eaa56d6485fe64720875fda3108d8f768c520ca81a2bf906159761563ad18e6f440089744cb79b2fdf7bf1f1cfa08348bbade72362f97f08d3a40d4fd72b4319b75a07f309b0bb1b233e0a57a176f63b4e4b420b1a94c8ae579ac4ccabfb4b8cb51ed4da6a95d2f43d2d66cee568c477efee51e751cbd188c3de2f6f0adee04c14d812ecd0a6c7ddf180e181c31b1ea46f81a0b6ac72b390c086a544667a09dc1391bab09db003c0a05";
export const marysPrivateKey = {
  crv: "P-256",
  d: "jSVu1rw91H2Qvi_p4njJiKzjj-zOeZ4Dfrr4FvBfRIY",
  ext: true,
  key_ops: ["deriveKey"],
  kty: "EC",
  x: "cFKXTdj4LZ22pGln2fqqW_bdiNEz8UF7QySxkq5eyzg",
  y: "QktvEbG3G15ale6kn36OFS65WN_QKy4iL-San3HCVo0",
};
