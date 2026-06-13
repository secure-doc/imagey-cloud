import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import istanbul from "vite-plugin-istanbul";

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
  plugins: [
    react(),
    istanbul({
      include: "src/**/*",
      exclude: ["node_modules"], // files to NOT track coverage on
      extension: [".js", ".ts", ".jsx", ".tsx"],
      requireEnv: false,
    }),
  ],
});
