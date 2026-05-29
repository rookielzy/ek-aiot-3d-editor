<template>
  <main class="workbench">
    <section class="viewport-shell" aria-label="3D viewport">
      <EditorViewport :editor="editor" :resolver="resolver" class="viewport" />
    </section>
    <InspectorPanel :editor="editor" />
  </main>
</template>

<script setup lang="ts">
import { AssetResolverBridge } from "@ek-aiot/3d-editor-core";
import { EditorViewport, InspectorPanel, useEditor } from "@ek-aiot/3d-editor-vue";

const { editor } = useEditor();
const resolver = new AssetResolverBridge((asset) => ({ uri: `/assets/${asset.id}.glb` }));

if (!editor.getSnapshot().objects.box) {
  editor.dispatch({ type: "import-glb", objectId: "box", asset: { id: "simple-box", label: "Simple box" } });
  editor.dispatch({ type: "select-object", objectId: "box" });
  editor.dispatch({ type: "register-asset", asset: { id: "studio-hdr", kind: "hdr", label: "Studio HDR" } });
  editor.dispatch({
    type: "set-environment",
    environment: {
      mode: "solid",
      background: { mode: "solid", color: "#eef3f8" }
    }
  });
  editor.dispatch({ type: "add-light", light: { id: "fill", kind: "ambient", intensity: 0.6 } });
}
</script>
