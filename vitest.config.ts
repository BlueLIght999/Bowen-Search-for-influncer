import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", ".external/**"],
    environmentMatchGlobs: [
      ["tests/**/*.tsx", "jsdom"],
      ["tests/**/*.test.ts", "node"]
    ],
    setupFiles: ["./tests/setup.ts"]
  }
});
