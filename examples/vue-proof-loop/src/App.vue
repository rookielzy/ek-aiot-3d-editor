<template>
  <main v-if="!editor" class="showcase-loading" role="status">
    {{ loadingMessage }}
    <button v-if="failed" type="button" @click="attempt += 1">{{ locale === "zh-CN" ? "重试" : "Retry" }}</button>
  </main>
  <EditorWorkbench
    v-else
    :editor="editor"
    :loader="resolvedLoader"
    :renderer-factory="rendererFactory"
    :locale="locale"
    :interactions="showcaseInteractions"
    viewport-class-name="starter-viewport"
    @runtime-ready="handleRuntimeReady"
  />
</template>

<script setup lang="ts">
import {
  resolveDefaultPresentationView,
  type EditorRuntime,
  type EditorRuntimeOptions,
  type EditorWithGlbImport
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, type WorkbenchLocale } from "@ek-aiot/3d-editor-vue";
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { createShowcaseEditor, showcaseInteractions } from "../../showcase/showcase";
import { createDemoGltfLoader } from "./demo-gltf-loader";
import { fetchDataRequestExecutor } from "./demo-data-executor";

const props = defineProps<{
  locale?: WorkbenchLocale;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
}>();

const editor = shallowRef<EditorWithGlbImport | null>(null);
const failed = ref(false);
const attempt = ref(0);
const demoLoader = createDemoGltfLoader();
const resolvedLoader = computed(() => props.loader ?? demoLoader);
const loadingMessage = computed(() => {
  if (failed.value) {
    return props.locale === "zh-CN" ? "无法打开展示场景。" : "Unable to open the showcase.";
  }
  return props.locale === "zh-CN" ? "正在打开工作室…" : "Opening the studio…";
});
let controller: AbortController | null = null;

watch([resolvedLoader, attempt], async ([loader]) => {
  controller?.abort();
  controller = new AbortController();
  const current = controller;
  editor.value?.dispose();
  editor.value = null;
  failed.value = false;
  try {
    const created = await createShowcaseEditor(loader, current.signal, { executor: fetchDataRequestExecutor });
    if (current.signal.aborted) {
      created.dispose();
      return;
    }
    editor.value = created;
  } catch {
    if (!current.signal.aborted) {
      failed.value = true;
    }
  }
}, { immediate: true });

onBeforeUnmount(() => {
  controller?.abort();
  editor.value?.dispose();
});

function handleRuntimeReady(runtime: EditorRuntime | null): void {
  if (!runtime || !editor.value) {
    return;
  }
  const view = resolveDefaultPresentationView(editor.value.getSnapshot());
  if (view.status === "resolved") {
    runtime.applyCameraView(view.view);
  }
}
</script>
