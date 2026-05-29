import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ek-aiot/3d-editor-core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      "@ek-aiot/3d-editor-react": fileURLToPath(new URL("../../packages/react/src/index.ts", import.meta.url))
    }
  }
});
