import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { threeDecoderAssetsPlugin } from "../../scripts/vite-three-decoder-assets";

export default defineConfig({
  plugins: [vue(), tailwindcss(), threeDecoderAssetsPlugin()],
  resolve: {
    alias: [
      {
        find: "@ek-aiot/3d-editor-vue/styles.css",
        replacement: fileURLToPath(new URL("../../packages/vue/src/styles.css", import.meta.url))
      },
      {
        find: "@ek-aiot/3d-editor-core",
        replacement: fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url))
      },
      {
        find: "@ek-aiot/3d-editor-vue",
        replacement: fileURLToPath(new URL("../../packages/vue/src/index.ts", import.meta.url))
      }
    ]
  }
});
