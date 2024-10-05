import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import istanbul from "vite-plugin-istanbul";

export default defineConfig({
  plugins: [
    react(),
    istanbul({
      include: ["src/**/*"], // files to track coverage on
      exclude: ["node_modules"], // files to NOT track coverage on
      requireEnv: false,
    }),
  ],
});
