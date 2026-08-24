import { writeFileSync } from "fs";
import { generateSymmetricKey } from "./cryptoHelper.ts";

async function main() {
  const [, , outputFile] = process.argv;
  if (!outputFile) {
    console.error(
      "Usage: node --experimental-strip-types createSymmetric.ts <outputFile>",
    );
    process.exit(1);
  }
  const key = await generateSymmetricKey();
  writeFileSync(outputFile, JSON.stringify(key));
}

main().catch(console.error);
