// GreenMail creates the SMTP login on its first AUTH. Two servers (or two workers) sending their
// first mail at the same moment race on that and one of them answers "Mail server is currently
// unavailable" (seen in CI). Sending the first mails one after the other, before any test runs,
// takes the race away.
export default async function globalSetup(): Promise<void> {
  const origins = [
    process.env.E2E_BASE_URL ?? "http://imagey.localhost:8080",
    process.env.E2E_BASE_URL_B ?? "http://securedoc.localhost:8081",
  ];
  for (const origin of origins) {
    const response = await fetch(`${origin}/users/verifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "warm-up@e2e.test" }),
    });
    if (!response.ok) {
      throw new Error(`Warm-up mail via ${origin} failed: ${response.status}`);
    }
  }
}
