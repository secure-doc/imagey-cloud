import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const PACT_FILE_NAME = "imagey-web-imagey-server.json";

export default async function globalTeardown() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const workersDir = path.join(__dirname, "../../target/pacts-workers");
  const pactFilePath = path.join(
    __dirname,
    "../../target/test-classes",
    PACT_FILE_NAME,
  );

  // Each worker wrote its own pact file (a shared one loses interactions to
  // concurrent read-merge-write cycles); merge them into the one Maven packages.
  const workerFiles = fs.existsSync(workersDir)
    ? fs
        .readdirSync(workersDir)
        .map((dir) => path.join(workersDir, dir, PACT_FILE_NAME))
        .filter((file) => fs.existsSync(file))
    : [];
  if (workerFiles.length === 0) {
    console.log(`No pact files found in ${workersDir}. Skipping merge.`);
    return;
  }

  try {
    const pacts = workerFiles.map((file) =>
      JSON.parse(fs.readFileSync(file, "utf-8")),
    );
    const pact = {
      ...pacts[0],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      interactions: pacts.flatMap((p: any) => p.interactions ?? []),
    };

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

    fs.mkdirSync(path.dirname(pactFilePath), { recursive: true });
    fs.writeFileSync(pactFilePath, JSON.stringify(pact, null, 2), "utf-8");
    console.log(
      `Merged ${workerFiles.length} pact file(s): ${originalCount} interactions, ${newCount} after deduplication.`,
    );
  } catch (error) {
    console.error("Error merging pacts:", error);
  }
}
