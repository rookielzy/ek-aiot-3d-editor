import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
      cssFileName: "index"
    },
    rollupOptions: {
      external: ["vue", "@ek-aiot/3d-editor-core"]
    }
  }
});
