import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { dataSourceHttpFixturePlugin } from "./scripts/vite-data-source-fixture";

export default defineConfig({
  plugins: [react(), vue(), tailwindcss(), dataSourceHttpFixturePlugin()],
  test: {
    globals: true,
    // Real GLB/PMREM suites share the software GPU in headless environments.
    // Serialize files instead of starving interaction tests and raising timeouts.
    fileParallelism: false,
    include: ["packages/**/*.browser.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    browser: {
      enabled: true,
      api: { host: "127.0.0.1" },
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
        },
        // Acceptance sizes from .scratch/workbench-shadcn-ui/spec.md (Testing Decisions).
        // Kept last so the existing instances keep their ordering and coverage.
        {
          browser: "chromium",
          name: "chromium-1440",
          sequence: { groupOrder: 3 },
          viewport: { width: 1440, height: 900 }
        },
        {
          browser: "chromium",
          name: "chromium-1920",
          sequence: { groupOrder: 4 },
          viewport: { width: 1920, height: 1080 }
        },
        {
          browser: "chromium",
          name: "chromium-1100",
          sequence: { groupOrder: 5 },
          viewport: { width: 1100, height: 800 }
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
