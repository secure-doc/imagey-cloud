import { test, expect } from "./fixtures";
import { provider, runningPactRequests } from "./setup";

test("loads app name from manifest and updates title", async ({ page }) => {
  // Define Pact interaction for /manifest.json
  const given = provider
    .addInteraction()
    .uponReceiving("a request to get the manifest")
    .withRequest("GET", "/manifest.json", (r) =>
      r.headers({
        Accept: "*/*",
      }),
    )
    .willRespondWith(200, (r) =>
      r.jsonBody({
        id: "secure-doc",
        name: "Secure Doc - Your image vault",
        short_name: "Secure Doc",
        start_url: "https://secure-doc.store",
        display: "fullscreen",
      }),
    );

  await given.executeTest(async (mockServer) => {
    const mockServerUrl = new URL(mockServer.url);

    // Route /manifest.json to the Pact mock server
    await page.route("/manifest.json", async (route, request) => {
      const requestUrl = new URL(request.url());
      requestUrl.port = mockServerUrl.port;
      requestUrl.hostname = mockServerUrl.hostname;

      const response = await route.fetch({
        url: requestUrl.href,
        method: request.method(),
        headers: request.headers(),
      });
      await route.fulfill({ response });
    });

    // Go to root
    await page.goto("/");

    // Verify the document title is updated
    await expect(page).toHaveTitle("Secure Doc");

    // Verify the app name is used in the UI
    await expect(
      page.getByText(/Please enter your email to use Secure Doc/),
    ).toBeVisible();

    // Verify all pact requests finished
    await expect.poll(() => runningPactRequests).toBe(0);
  });
});
