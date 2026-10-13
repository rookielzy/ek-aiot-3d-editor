<template>
  <div ref="container" data-ek-discard-draft class="ek-editor-viewport">
    <div
      v-if="marquee.status === 'dragging' && marquee.rect"
      class="ek-editor-viewport__marquee"
      aria-hidden="true"
      :style="marqueeStyle"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, unref, watch } from "vue";
import { IDLE_MARQUEE_SELECTION_STATE, type AssetResolverBridge, type Editor, type EditorMarqueeSelectionStateSnapshot, type EditorRuntime, type EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";

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
const marquee = shallowRef<EditorMarqueeSelectionStateSnapshot>(getMarqueeSnapshot());
let unsubscribeMarquee: (() => void) | null = null;
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

function subscribeMarquee() {
  unsubscribeMarquee?.();
  const editor = toRaw(props.editor);
  marquee.value = getMarqueeSnapshot(editor);
  unsubscribeMarquee = editor.subscribeMarqueeSelection?.((state) => {
    marquee.value = state;
  }) ?? null;
}

onMounted(() => {
  subscribeMarquee();
  mountRuntime();
});
watch(() => [
  toRaw(props.editor),
  resolveRuntimeOption(props.resolver),
  resolveRuntimeOption(props.loader),
  resolveRuntimeOption(props.rendererFactory),
  resolveRuntimeOption(props.interactions)
], () => {
  subscribeMarquee();
  mountRuntime();
});

onBeforeUnmount(() => {
  unsubscribeMarquee?.();
  unsubscribeMarquee = null;
  runtime?.dispose();
  runtime = null;
  emit("runtimeReady", null);
});

const marqueeStyle = computed(() => {
  const rect = marquee.value.rect;
  if (!rect) {
    return {};
  }
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  };
});

function resolveRuntimeOption<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : toRaw(unref(value));
}

function getMarqueeSnapshot(editor: Editor = toRaw(props.editor)): EditorMarqueeSelectionStateSnapshot {
  return editor.marqueeSelection?.get() ?? IDLE_MARQUEE_SELECTION_STATE;
}
</script>

<style scoped>
.ek-editor-viewport {
  position: relative;
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

.ek-editor-viewport__marquee {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  border: 1px solid rgba(20, 110, 180, 0.95);
  background: rgba(20, 110, 180, 0.14);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);
}
</style>
