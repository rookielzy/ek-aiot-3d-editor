import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@ek-aiot/3d-editor-core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url))
    }
  }
});
