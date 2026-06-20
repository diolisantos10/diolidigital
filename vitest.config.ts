import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Minimal vitest setup for Dioli Brain unit tests.
// Resolves the "@/..." alias to the repo root so imports match the app.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    globals: true,
  },
});
