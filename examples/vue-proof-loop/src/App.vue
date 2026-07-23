<template>
  <EditorWorkbench
    :editor="editor"
    :loader="loader ?? demoLoader"
    :renderer-factory="rendererFactory"
    :locale="locale"
    viewport-class-name="starter-viewport"
    @runtime-ready="runtimeReady = Boolean($event)"
  >
    <template #viewportOverlay="context">
      <aside class="starter-overlay" data-testid="starter-overlay" aria-label="Starter host status">
        <span>Host starter</span>
        <strong>{{ context.model.project.sceneName }}</strong>
        <small>
          {{ context.model.project.objectCount }} objects · {{ context.model.project.assetCount }} assets · {{ formatProblems(context.runtimeProblems, context.model) }}
        </small>
        <small>Runtime {{ runtimeReady ? "ready" : "mounting" }} · Selection {{ context.model.selection.label }}</small>
      </aside>
    </template>
  </EditorWorkbench>
</template>

<script setup lang="ts">
import {
  type EditorRuntimeOptions,
  type Problem,
  type WorkbenchModel
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor, type WorkbenchLocale } from "@ek-aiot/3d-editor-vue";
import { ref } from "vue";
import { createDemoGltfLoader } from "./demo-gltf-loader";

defineProps<{
  locale?: WorkbenchLocale;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
}>();

const { editor } = useEditor();
const runtimeReady = ref(false);
const demoLoader = createDemoGltfLoader();

function formatProblems(runtimeProblems: readonly Problem[], model: WorkbenchModel): string {
  if (model.problems.totalCount === 0) {
    return "no problems";
  }
  return `${model.problems.totalCount} problems, ${runtimeProblems.length} runtime`;
}
</script>
