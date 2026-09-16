import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [react(), vue()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["packages/**/*.{test,integration.test}.{ts,tsx}", "packages/**/*.test.tsx"],
    exclude: ["packages/**/*.browser.test.{ts,tsx}", "**/node_modules/**", "**/dist/**"],
    pool: "threads",
    testTimeout: 10000
  },
  resolve: {
    alias: {
      "@ek-aiot/3d-editor-core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@ek-aiot/3d-editor-vue": new URL("./packages/vue/src/index.ts", import.meta.url).pathname,
      "@ek-aiot/3d-editor-react": new URL("./packages/react/src/index.ts", import.meta.url).pathname
    }
  }
});
