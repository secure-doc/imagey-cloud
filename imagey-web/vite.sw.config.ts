import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Builds the service worker (src/sw.ts) as its own classic (non-module)
// script, `dist/sw.js`, alongside the main `vite build` output (package.json
// "build" runs both). Classic rather than a module worker: Firefox and older
// Safari versions do not reliably support module service workers yet.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL("./src/sw.ts", import.meta.url)),
      formats: ["iife"],
      name: "imageyServiceWorker",
      fileName: () => "sw.js",
    },
  },
});
