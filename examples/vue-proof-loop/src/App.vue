<template>
  <EditorWorkbench :editor="editor" :resolver="resolver" :loader="demoLoader">
    <template #toolbar="{ dispatch, editor: workbenchEditor }">
      <button
        type="button"
        @click="dispatch({ type: 'set-transform', objectId: 'box', transform: { position: [1.5, 0, 0] } })"
      >
        Move box
      </button>
      <button type="button" @click="saveRestore(workbenchEditor)">
        Save / restore
      </button>
      <button type="button" @click="exportProject(workbenchEditor)">
        Export project
      </button>
      <button type="button" @click="reopenProject(workbenchEditor)">
        Reopen package
      </button>
    </template>

    <template #sidePanel="{ snapshot, inspector }">
      <dl class="proof-summary">
        <div>
          <dt>Objects</dt>
          <dd>{{ Object.keys(snapshot.objects).length }}</dd>
        </div>
        <div>
          <dt>Selection</dt>
          <dd>{{ inspector.selection.objectId ?? "None" }}</dd>
        </div>
      </dl>
    </template>

    <template #viewportOverlay="{ runtimeProblems }">
      <span class="proof-overlay">{{ runtimeProblems.length }} runtime problems</span>
    </template>

    <template #status="{ snapshot, runtimeProblems }">
      <span>Snapshot v{{ snapshot.version }} · {{ runtimeProblems.length }} runtime problems · {{ status }}</span>
    </template>
  </EditorWorkbench>
</template>

<script setup lang="ts">
import { BoxGeometry, Mesh, MeshBasicMaterial } from "three";
import { ref } from "vue";
import { AssetResolverBridge, type Editor, type EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor } from "@ek-aiot/3d-editor-vue";

const { editor } = useEditor();
const resolver = new AssetResolverBridge((asset) => asset.kind === "glb" ? { uri: `/assets/${asset.id}.glb` } : null);
const status = ref("Project controls ready");
const demoLoader: EditorRuntimeOptions["loader"] = {
  async load() {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: "#3b82f6" }));
    mesh.name = "Simple box";
    return mesh;
  }
};

if (!editor.getSnapshot().objects.box) {
  editor.dispatch({ type: "import-glb", objectId: "box", asset: { id: "simple-box", label: "Simple box" } });
  editor.dispatch({ type: "select-object", objectId: "box" });
  editor.dispatch({ type: "register-asset", asset: { id: "studio-hdr", kind: "hdr", label: "Studio HDR" } });
  editor.dispatch({
    type: "set-environment",
    environment: {
      mode: "hdr",
      environment: { assetId: "studio-hdr", intensity: 1, rotation: { x: 0, y: 0, z: 0 } },
      background: { mode: "solid", color: "#eef3f8" }
    }
  });
  editor.dispatch({ type: "add-light", light: { id: "fill", kind: "ambient", intensity: 0.6 } });
}

function saveRestore(workbenchEditor: Editor): void {
  const saved = workbenchEditor.serialize();
  workbenchEditor.dispatch({ type: "set-transform", objectId: "box", transform: { position: [3, 0, 0] } });
  workbenchEditor.restore(saved);
}

function exportProject(workbenchEditor: Editor): void {
  const result = workbenchEditor.exportProject({ partial: true });
  status.value = result.packageBytes ? "Exported .ek3d project package" : result.problems[0]?.message ?? "Export failed";
}

function reopenProject(workbenchEditor: Editor): void {
  const result = workbenchEditor.exportProject({ partial: true });
  if (!(result.packageBytes instanceof Uint8Array)) {
    status.value = "Project contains async browser file payloads";
    return;
  }
  const imported = workbenchEditor.importProject(result.packageBytes);
  status.value = imported.ok ? "Imported .ek3d project package" : imported.problems[0]?.message ?? "Import failed";
}
</script>
