// vitest.config.ts
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Load env files for this mode (test) so APP_URL is available
  const env = loadEnv(mode, process.cwd(), ""); // no prefix filter so APP_URL is included
  if (!process.env.APP_URL && env.APP_URL) {
    process.env.APP_URL = env.APP_URL;
  }

  return {
    test: {
      environment: "node",
      globals: true,
      include: ["tests/**/*.spec.ts"],
      coverage: {
        enabled: true,
        reporter: ["text", "lcov"],
      },
    },
  };
});
