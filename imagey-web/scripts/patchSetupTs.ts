import { readFileSync, writeFileSync } from "fs";

let content = readFileSync("tests/integration/setup.ts", "utf-8");

// Add import if not present
if (!content.includes("import { mockSettings }")) {
  content = content.replace(
    'import { mockDocuments } from "./mockDocuments";',
    'import { mockDocuments } from "./mockDocuments";\nimport { mockSettings } from "./mockSettings";',
  );
}

// Replace Mary's blocks
content = content.replace(
  /r\.jsonBody\(\{\s+documentId: "mary@imagey\.cloud",[\s\S]*?\}\),/g,
  "r.jsonBody(mockSettings.mary),",
);

// Replace Alice's block
content = content.replace(
  /builder\.jsonBody\(\{\s+documentId: "alice@imagey\.cloud",[\s\S]*?\}\),/g,
  "builder.jsonBody(mockSettings.alice),",
);

// Replace Bill's block
content = content.replace(
  /builder\.jsonBody\(\{\s+documentId: "bill@imagey\.cloud",[\s\S]*?\}\),/g,
  "builder.jsonBody(mockSettings.bill),",
);

// Replace Laura's block
content = content.replace(
  /builder\.jsonBody\(\{\s+documentId: "laura@imagey\.cloud",[\s\S]*?\}\),/g,
  "builder.jsonBody(mockSettings.laura),",
);

writeFileSync("tests/integration/setup.ts", content);
console.log("setup.ts patched!");
