<template>
  <EditorWorkbench
    :editor="editor"
    :resolver="resolver"
    :loader="demoLoader"
    :renderer-factory="rendererFactory"
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
import { BoxGeometry, Mesh, MeshStandardMaterial } from "three";
import {
  AssetResolverBridge,
  type EditorRuntimeOptions,
  type Problem,
  type WorkbenchModel
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor } from "@ek-aiot/3d-editor-vue";
import { ref } from "vue";

const RECOVERABLE_ASSET_ID = "recoverable-box";

defineProps<{
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
}>();

const { editor } = useEditor();
const runtimeReady = ref(false);
const resolver = new AssetResolverBridge((asset) => {
  if (asset.kind !== "glb" || asset.id === RECOVERABLE_ASSET_ID) {
    return null;
  }
  return { uri: `/assets/${asset.id}.glb`, metadata: { assetId: asset.id, ...(asset.label ? { label: asset.label } : {}) } };
});
const demoLoader: EditorRuntimeOptions["loader"] = {
  async load(resolved) {
    const assetId = typeof resolved.metadata?.assetId === "string" ? resolved.metadata.assetId : undefined;
    const label = typeof resolved.metadata?.label === "string" ? resolved.metadata.label : undefined;
    const color = assetId === RECOVERABLE_ASSET_ID ? "#f59e0b" : "#3b82f6";
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color }));
    mesh.name = label ?? assetId ?? "Demo mesh";
    return mesh;
  }
};

if (!editor.getSnapshot().objects.box) {
  editor.dispatch({ type: "import-glb", objectId: "box", name: "Simple box", asset: { id: "simple-box", label: "Simple box" } });
  editor.dispatch({
    type: "import-glb",
    objectId: "detail",
    name: "Detail block",
    asset: { id: "detail-box", label: "Detail block" },
    transform: { position: [-1.35, 0, 0] }
  });
  editor.dispatch({
    type: "import-glb",
    objectId: "recoverable",
    name: "Recoverable asset",
    asset: { id: RECOVERABLE_ASSET_ID, label: "Recoverable asset" },
    transform: { position: [1.35, 0, 0] }
  });
  editor.dispatch({ type: "select-object", objectId: "box" });
  editor.dispatch({
    type: "set-environment",
    environment: {
      mode: "none",
      background: { mode: "solid", color: "#eef3f8" }
    }
  });
  editor.dispatch({ type: "add-light", light: { id: "fill", kind: "ambient", intensity: 0.6 } });
  editor.restore(editor.serialize());
}

function formatProblems(runtimeProblems: readonly Problem[], model: WorkbenchModel): string {
  if (model.problems.totalCount === 0) {
    return "no problems";
  }
  return `${model.problems.totalCount} problems, ${runtimeProblems.length} runtime`;
}
</script>
