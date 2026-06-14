<template>
  <div ref="container" class="ek-editor-viewport" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, toRaw, unref, watch } from "vue";
import type { AssetResolverBridge, Editor, EditorRuntime, EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";

const props = defineProps<{
  editor: Editor;
  resolver?: AssetResolverBridge;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
  interactions?: EditorRuntimeOptions["interactions"];
}>();

const emit = defineEmits<{
  runtimeReady: [runtime: EditorRuntime | null];
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
    resolver: resolveRuntimeOption(props.resolver),
    loader: resolveRuntimeOption(props.loader),
    rendererFactory: resolveRuntimeOption(props.rendererFactory),
    interactions: resolveRuntimeOption(props.interactions)
  });
  emit("runtimeReady", runtime);
}

onMounted(mountRuntime);
watch(() => [
  toRaw(props.editor),
  resolveRuntimeOption(props.resolver),
  resolveRuntimeOption(props.loader),
  resolveRuntimeOption(props.rendererFactory),
  resolveRuntimeOption(props.interactions)
], mountRuntime);

onBeforeUnmount(() => {
  runtime?.dispose();
  runtime = null;
  emit("runtimeReady", null);
});

function resolveRuntimeOption<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : toRaw(unref(value));
}
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
