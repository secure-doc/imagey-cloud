import { defineConfig, transformWithOxc, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { createInstrumenter } from "istanbul-lib-instrument";

// Code-coverage instrumentation for the Playwright suite, which runs against
// `npm run dev`.
//
// We lower each `src` file (TS + JSX -> JS) ourselves and then run a single
// istanbul-lib-instrument pass over the result, rather than using
// vite-plugin-istanbul. That plugin instruments at the very end of the
// pipeline - after React Fast Refresh has wrapped the module - and leans on
// the accumulated source map to get `nyc report` back to the original
// lines. With Vite 8 / oxc that combined map is too lossy for small
// components (Panel, Person, ImagePanel, ...): nyc's remap dropped every
// statement and reported those files as 0%. Lowering here, with oxc's own
// (complete) source map handed straight to istanbul, keeps the mapping
// intact - and lowering first means TS enums get instrumented too.
function coverageInstrument(): Plugin {
  const srcDir = fileURLToPath(new URL("./src/", import.meta.url));
  const instrumentable = /\.[cm]?[jt]sx?$/;
  const typeOnly = /\.d\.[cm]?ts$/;
  const instrumenter = createInstrumenter({
    produceSourceMap: true,
    esModules: true,
  });

  return {
    name: "imagey:coverage-instrument",
    apply: (_config, { command }) => command === "serve",
    enforce: "pre",
    async transform(code, id) {
      const file = id.split("?", 1)[0];
      if (
        !file.startsWith(srcDir) ||
        !instrumentable.test(file) ||
        typeOnly.test(file)
      ) {
        return null;
      }
      const lowered = await transformWithOxc(code, file);
      // oxc's own source map (complete, unlike the pipeline's combined one)
      // lets istanbul's statement locations remap cleanly back to source.
      // istanbul-lib-instrument and Vite disagree only on the source map
      // `version` field type (string vs number); the shapes are compatible.
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const instrumented = instrumenter.instrumentSync(
        lowered.code,
        file,
        lowered.map as any,
      );
      return { code: instrumented, map: instrumenter.lastSourceMap() as any };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    },
  };
}

export default defineConfig({
  build: {
    sourcemap: process?.env?.stage === "production" ? "hidden" : true,
  },
  server: {
    proxy: {
      "/users": {
        target: "http://localhost:8080",
        configure: (proxy) => {
          proxy.on("error", (err) => {
            console.log("proxy error ignored", err.message);
          });
        },
      },
      "/authentications": {
        target: "http://localhost:8080",
        configure: (proxy) => {
          proxy.on("error", (err) => {
            console.log("proxy error ignored", err.message);
          });
        },
      },
      "/registrations": {
        target: "http://localhost:8080",
        configure: (proxy) => {
          proxy.on("error", (err) => {
            console.log("proxy error ignored", err.message);
          });
        },
      },
    },
  },
  plugins: [coverageInstrument(), react()],
});
