<template>
  <EditorViewport :editor="editor" :resolver="resolver" class="viewport" />
</template>

<script setup lang="ts">
import { AssetResolverBridge } from "@ek-aiot/3d-editor-core";
import { EditorViewport, useEditor } from "@ek-aiot/3d-editor-vue";

const { editor } = useEditor();
const resolver = new AssetResolverBridge((asset) => ({ uri: `/assets/${asset.id}.glb` }));

editor.dispatch({ type: "import-glb", objectId: "box", asset: { id: "simple-box", label: "Simple box" } });
editor.dispatch({ type: "add-light", light: { id: "fill", kind: "ambient", intensity: 0.6 } });
</script>

<style scoped>
.viewport {
  width: 100vw;
  height: 100vh;
}
</style>
