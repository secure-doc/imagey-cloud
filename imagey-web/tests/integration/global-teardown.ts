import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export default async function globalTeardown() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const pactFilePath = path.join(
    __dirname,
    "../../target/test-classes/imagey-web-imagey-server.json",
  );

  if (!fs.existsSync(pactFilePath)) {
    console.log(
      `Pact file not found at ${pactFilePath}. Skipping deduplication.`,
    );
    return;
  }

  try {
    const fileContent = fs.readFileSync(pactFilePath, "utf-8");
    const pact = JSON.parse(fileContent);

    if (!pact.interactions || !Array.isArray(pact.interactions)) {
      console.log(
        "No interactions found in the pact file. Skipping deduplication.",
      );
      return;
    }

    const originalCount = pact.interactions.length;
    const uniqueInteractions = new Map();

    pact.interactions.forEach(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (interaction: any) => {
        // A unique key based on description and provider states.
        // This safely deduplicates identical interactions appended by parallel test runs.
        const key = JSON.stringify({
          description: interaction.description,
          providerStates: interaction.providerStates || [],
        });

        uniqueInteractions.set(key, interaction);
      },
    );

    pact.interactions = Array.from(uniqueInteractions.values());
    const newCount = pact.interactions.length;

    if (originalCount !== newCount) {
      fs.writeFileSync(pactFilePath, JSON.stringify(pact, null, 2), "utf-8");
      console.log(
        `Deduplicated pact interactions: reduced from ${originalCount} to ${newCount}.`,
      );
    } else {
      console.log(
        `No duplicate pact interactions found (count: ${originalCount}).`,
      );
    }
  } catch (error) {
    console.error("Error deduplicating pacts:", error);
  }
}
