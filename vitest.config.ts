import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit + integration tests. Security-sensitive and multi-tenant isolation
 * tests live beside their domains (src/domains/**\/*.test.ts). DB integration
 * tests spin up a disposable schema — see docs/testing-guide.md.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domains/**", "src/lib/**"],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
