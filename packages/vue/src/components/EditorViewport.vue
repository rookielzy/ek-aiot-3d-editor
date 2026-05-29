<template>
  <div ref="container" class="ek-editor-viewport" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, toRaw, watch } from "vue";
import type { AssetResolverBridge, Editor, EditorRuntime, EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";

const props = defineProps<{
  editor: Editor;
  resolver?: AssetResolverBridge;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
}>();

const container = ref<HTMLElement | null>(null);
let runtime: EditorRuntime | null = null;

function mountRuntime() {
  if (!container.value) {
    return;
  }

  runtime?.dispose();
  const editor = toRaw(props.editor);
  runtime = editor.mountRuntime({
    container: container.value,
    resolver: props.resolver,
    loader: props.loader,
    rendererFactory: props.rendererFactory
  });
}

onMounted(mountRuntime);
watch(() => props.editor, mountRuntime);

onBeforeUnmount(() => {
  runtime?.dispose();
  runtime = null;
});
</script>

<style scoped>
.ek-editor-viewport {
  width: 100%;
  height: 100%;
  min-height: 240px;
  overflow: hidden;
}

.ek-editor-viewport :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
