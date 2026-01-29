import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Longer timeout for integration tests (spawning processes takes time)
    testTimeout: 30000,
    // Hook timeout
    hookTimeout: 30000,
  },
});
