import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const files = [
  "tests/images/encrypted/bb66aba3-8338-4ef4-a6f8-43ed0b39ecd3/keys/68980188-577d-4d2f-9e36-a6b32b25cd3a/encrypted-shared.key",
  "tests/images/encrypted/f9910aa7-4db6-4b02-b596-c3ccf872ae98/keys/68980188-577d-4d2f-9e36-a6b32b25cd3a/encrypted-shared.key",
  "tests/images/encrypted/9b71fa98-8616-4222-b03e-d189289ccbd0/keys/68980188-577d-4d2f-9e36-a6b32b25cd3a/encrypted-shared.key",
  "tests/images/encrypted/3ae437c9-c71e-4cf0-b066-de34d75e1af3/keys/68980188-577d-4d2f-9e36-a6b32b25cd3a/encrypted-shared.key",
];

for (const file of files) {
  try {
    const path = resolve(process.cwd(), file);
    let content = readFileSync(path, "utf-8");
    // Replace URL-safe base64 characters
    content = content.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if missing
    while (content.length % 4) {
      content += "=";
    }
    writeFileSync(path, content, "utf-8");
    console.log("Fixed", file);
  } catch (e) {
    console.log("Skipped", file);
  }
}
