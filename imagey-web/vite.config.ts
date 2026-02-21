import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import istanbul from "vite-plugin-istanbul";

export default defineConfig({
  build: {
    sourcemap: process?.env?.stage === "production" ? "hidden" : true,
  },
  server: {
    proxy: {
      "/users": "http://localhost:8080",
      "/authentications": "http://localhost:8080",
      "/registrations": "http://localhost:8080",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["tests/unit/setup.ts"],
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
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
