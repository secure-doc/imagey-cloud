import fs from "fs";

// Every Playwright worker writes its Pact interactions into its own directory
// (see setup.ts); drop what an earlier run left behind so global-teardown.ts
// only merges this run's interactions.
export default async function globalSetup() {
  fs.rmSync("target/pacts-workers", { recursive: true, force: true });
}
