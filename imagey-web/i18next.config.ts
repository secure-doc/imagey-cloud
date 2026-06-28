import { defineConfig } from "i18next-cli";

export default defineConfig({
  locales: ["en", "de"],
  extract: {
    input: "src/**/*.{js,jsx,ts,tsx}",
    output: "src/translation/locales/{{language}}.json",
    defaultNS: "translation",
    functions: ["t", "*.t"],
    transComponents: ["Trans"],
  },
  types: {
    input: ["src/translation/locales/{{language}}.json"],
    output: "src/types/i18next.d.ts",
  },
});
