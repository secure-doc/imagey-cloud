import { readFileSync, writeFileSync } from "fs";

let content = readFileSync("tests/integration/mockDocuments.ts", "utf-8");

// Regex to find all base64 strings in mockDocuments.ts
// We'll just find all strings that look like URL-safe base64
content = content.replace(/"([A-Za-z0-9\-_]{20,})"/g, (match, p1) => {
  let standardBase64 = p1.replace(/-/g, "+").replace(/_/g, "/");
  while (standardBase64.length % 4) {
    standardBase64 += "=";
  }
  return `"${standardBase64}"`;
});

writeFileSync("tests/integration/mockDocuments.ts", content, "utf-8");
console.log("Fixed mockDocuments.ts");
