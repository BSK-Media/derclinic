import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", ".next/**"],
    // Klucz wyłącznie do testów — w aplikacji pochodzi ze zmiennych środowiskowych.
    env: { AUTH_SECRET: "test-only-secret-not-used-anywhere-else-0123456789" },
  },
});
