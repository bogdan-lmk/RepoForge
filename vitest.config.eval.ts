import { defineConfig } from "vitest/config";
import path from "path";
import { readFileSync } from "fs";

// Manually parse .env so real credentials reach the eval tests
// (src/__tests__/setup.ts mocks @/env with localhost values for unit tests)
function parseEnvFile(filePath: string): Record<string, string> {
  try {
    const content = readFileSync(filePath, "utf8");
    return Object.fromEntries(
      content
        .split("\n")
        .filter((line) => line.trim() && !line.startsWith("#"))
        .map((line) => {
          const eq = line.indexOf("=");
          return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()];
        })
        .filter(([k]) => k),
    );
  } catch {
    return {};
  }
}

const envVars = parseEnvFile(path.resolve(__dirname, ".env"));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/eval/**/*.test.ts"],
    // No setupFiles — real env only, no mock from src/__tests__/setup.ts
    testTimeout: 30_000,
    env: envVars,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "#": path.resolve(__dirname, "."),
    },
  },
});
