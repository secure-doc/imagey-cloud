import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import istanbul from "vite-plugin-istanbul";

export default defineConfig({
  build: {
    sourcemap: process.env.stage === "production" ? "hidden" : true,
  },
  server: {
    proxy: {
      "/users": "http://localhost:8080",
      "/authentications": "http://localhost:8080",
      "/registrations": "http://localhost:8080",
    },
  },
  plugins: [
    react(),
    istanbul({
      include: "src/**/*",
      exclude: ["node_modules", "src/authentication/ConversionService.ts"], // files to NOT track coverage on
      extension: [".js", ".ts", ".jsx", ".tsx"],
      requireEnv: false,
    }),
  ],
});
