import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  plugins: [react(), vue()],
  test: {
    globals: true,
    // Real GLB/PMREM suites share the software GPU in headless environments.
    // Serialize files instead of starving interaction tests and raising timeouts.
    fileParallelism: false,
    include: ["packages/**/*.browser.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [
        {
          browser: "chromium",
          sequence: { groupOrder: 0 },
          viewport: { width: 1280, height: 900 }
        },
        {
          browser: "chromium",
          name: "chromium-desktop-boundary",
          sequence: { groupOrder: 1 },
          viewport: { width: 1024, height: 900 }
        },
        {
          browser: "chromium",
          name: "chromium-mobile",
          sequence: { groupOrder: 2 },
          viewport: { width: 390, height: 900 }
        }
      ]
    }
  },
  resolve: {
    alias: {
      "@ek-aiot/3d-editor-core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@ek-aiot/3d-editor-vue": new URL("./packages/vue/src/index.ts", import.meta.url).pathname,
      "@ek-aiot/3d-editor-react": new URL("./packages/react/src/index.ts", import.meta.url).pathname
    }
  }
});
