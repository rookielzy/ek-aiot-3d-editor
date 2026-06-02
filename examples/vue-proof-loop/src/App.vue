<template>
  <EditorWorkbench
    :editor="editor"
    :resolver="resolver"
    :loader="demoLoader"
    :renderer-factory="rendererFactory"
    :show-default-toolbar="false"
  >
    <template #toolbar="context">
      <div class="demo-toolbar" aria-label="Demo validation controls">
        <button
          type="button"
          :aria-pressed="context.transformMode === 'translate'"
          @click="() => {
            context.runAction('transform-translate');
            status = 'Transform mode set to translate';
          }"
        >
          Move mode
        </button>
        <button
          type="button"
          :aria-pressed="context.transformMode === 'rotate'"
          @click="() => {
            context.runAction('transform-rotate');
            status = 'Transform mode set to rotate';
          }"
        >
          Rotate mode
        </button>
        <button
          type="button"
          :aria-pressed="context.transformMode === 'scale'"
          @click="() => {
            context.runAction('transform-scale');
            status = 'Transform mode set to scale';
          }"
        >
          Scale mode
        </button>
        <button
          type="button"
          :aria-pressed="isSnapEnabled(context.snap.translate)"
          @click="() => {
            context.runAction('toggle-translate-snap');
            status = 'Translate snap toggled';
          }"
        >
          Snap move
        </button>
        <button
          type="button"
          :disabled="!context.runtimeReady || context.selectionCount === 0"
          @click="() => {
            context.frameSelected();
            markSession('camera');
            status = 'Framed selected object';
          }"
        >
          Frame selected
        </button>
        <button
          type="button"
          :disabled="!context.runtimeReady"
          @click="() => {
            context.resetCamera();
            markSession('camera');
            status = 'Camera reset';
          }"
        >
          Reset camera
        </button>
        <button
          type="button"
          :disabled="context.selectionCount === 0"
          @click="() => {
            movePrimary(context);
            status = 'Moved primary object through core command';
          }"
        >
          Nudge primary
        </button>
        <button
          type="button"
          :disabled="context.historyState.undoCount === 0"
          @click="() => {
            context.runAction('undo');
            status = 'Undo applied';
          }"
        >
          Undo
        </button>
        <button
          type="button"
          :disabled="context.historyState.redoCount === 0"
          @click="() => {
            context.runAction('redo');
            status = 'Redo applied';
          }"
        >
          Redo
        </button>
        <button type="button" @click="exportProject(context)">
          Export project
        </button>
        <button type="button" @click="reopenProject(context)">
          Reopen package
        </button>
        <span class="demo-toolbar__status" data-testid="demo-toolbar-state">
          {{ context.transformMode }} · {{ formatSnapSummary(context.snap) }} · {{ session.reopened ? "Restored" : "Live" }}
        </span>
      </div>
    </template>

    <template #sidePanel="context">
      <DemoSidePanel
        :context="context"
        :session="session"
        @status="status = $event"
        @mark-session="markSession"
      />
    </template>

    <template #viewportOverlay="{ runtimeProblems, inspector, transformMode, snap }">
      <div class="proof-overlay" data-testid="demo-viewport-overlay">
        <span>{{ runtimeProblems.length }} runtime problems</span>
        <span>Primary {{ inspector.selection.objectId ?? "None" }}</span>
        <span>{{ transformMode }} · {{ formatSnapSummary(snap) }}</span>
      </div>
    </template>

    <template #status="{ snapshot, runtimeProblems, historyState, transformMode, snap }">
      <span data-testid="demo-status">
        Snapshot v{{ snapshot.version }} · {{ Object.keys(snapshot.objects).length }} objects · {{ runtimeProblems.length }} runtime problems · Undo {{ historyState.undoCount }} / Redo {{ historyState.redoCount }} · {{ transformMode }} · {{ formatSnapSummary(snap) }} · {{ status }}
      </span>
    </template>
  </EditorWorkbench>
</template>

<script setup lang="ts">
import { BoxGeometry, Mesh, MeshBasicMaterial } from "three";
import { computed, defineComponent, h, reactive, ref, watch, type PropType } from "vue";
import {
  AssetResolverBridge,
  type EditorRuntimeOptions,
  type SceneObject,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor, type WorkbenchContext } from "@ek-aiot/3d-editor-vue";

const RECOVERABLE_ASSET_ID = "recoverable-box";
const DEMO_ASSET_BYTES = new Uint8Array([1, 2, 3, 4]);

defineProps<{
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
}>();

interface DemoSessionState {
  camera: boolean;
  copied: boolean;
  pasted: boolean;
  duplicated: boolean;
  deleted: boolean;
  grouped: boolean;
  ungrouped: boolean;
  exported: boolean;
  reopened: boolean;
  missingAssetSeen: boolean;
  missingAssetRecovered: boolean;
}

type DemoSessionKey = keyof DemoSessionState;

interface HierarchyNodeModel {
  object: SceneObject;
  depth: number;
  children: HierarchyNodeModel[];
}

const { editor } = useEditor();
const status = ref("Project controls ready");
const session = reactive<DemoSessionState>({
  camera: false,
  copied: false,
  pasted: false,
  duplicated: false,
  deleted: false,
  grouped: false,
  ungrouped: false,
  exported: false,
  reopened: false,
  missingAssetSeen: false,
  missingAssetRecovered: false
});
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
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color }));
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

function markSession(key: DemoSessionKey, value = true): void {
  session[key] = value;
}

function movePrimary(context: WorkbenchContext): void {
  const objectId = context.snapshot.selection.objectId;
  if (!objectId) {
    return;
  }
  const object = context.snapshot.objects[objectId];
  context.dispatch({
    type: "set-transform",
    objectId,
    transform: {
      position: [object.transform.position[0] + 0.5, object.transform.position[1], object.transform.position[2]]
    }
  });
}

function exportProject(context: WorkbenchContext): void {
  const result = context.exportProject({ partial: true });
  if (result.packageBytes instanceof Uint8Array) {
    markSession("exported");
    status.value = "Exported .ek3d project package";
    return;
  }
  status.value = result.problems[0]?.message ?? "Export failed";
}

function reopenProject(context: WorkbenchContext): void {
  const result = context.exportProject({ partial: true });
  if (!(result.packageBytes instanceof Uint8Array)) {
    status.value = "Project contains async browser file payloads";
    return;
  }
  const imported = context.importProject(result.packageBytes);
  if (imported.ok) {
    markSession("exported");
    markSession("reopened");
    status.value = "Imported .ek3d project package";
  } else {
    status.value = imported.problems[0]?.message ?? "Import failed";
  }
}

function deriveDemoState(context: WorkbenchContext, session: DemoSessionState) {
  const snapshot = context.snapshot;
  const objectCount = Object.keys(snapshot.objects).length;
  const selectedObject = snapshot.selection.objectId ? snapshot.objects[snapshot.selection.objectId] : undefined;
  const transformMoved = Boolean(selectedObject && selectedObject.transform.position[0] > 0);
  const problemObjectIds = new Set(context.runtimeProblems.map((problem) => problem.objectId).filter((objectId): objectId is string => Boolean(objectId)));
  const checklist = [
    { label: "Hierarchy lists seeded scene", complete: objectCount >= 3 },
    { label: "Selection is visible", complete: context.selectionCount > 0 },
    { label: "Camera helper used", complete: session.camera },
    { label: "Transform command changed history", complete: transformMoved && context.historyState.undoCount > 0 },
    { label: "Undo is available", complete: context.historyState.undoCount > 0 },
    { label: "Redo is available", complete: context.historyState.redoCount > 0 },
    { label: "Hierarchy operation changed nesting", complete: session.grouped || Object.values(snapshot.objects).some((object) => object.children.length > 0) },
    { label: "Copy/paste or duplicate ran", complete: session.pasted || session.duplicated },
    { label: "Project exported", complete: session.exported },
    { label: "Project reopened", complete: session.reopened },
    { label: "Missing asset surfaced", complete: session.missingAssetSeen || context.runtimeProblems.some((problem) => problem.assetId === RECOVERABLE_ASSET_ID) },
    { label: "Missing asset recovered", complete: session.missingAssetRecovered && context.runtimeProblems.every((problem) => problem.assetId !== RECOVERABLE_ASSET_ID) },
    { label: "Snap/mode status visible", complete: isSnapEnabled(context.snap.translate) || context.transformMode !== "translate" }
  ];

  return {
    hierarchy: buildHierarchy(snapshot),
    assets: Object.values(snapshot.assets),
    checklist,
    completedCount: checklist.filter((item) => item.complete).length,
    problemCount: context.runtimeProblems.length,
    problemObjectIds,
    selectionLabel: selectedObject ? `${selectedObject.name} (${context.selectionCount})` : `None (${context.selectionCount})`
  };
}

function buildHierarchy(snapshot: SceneSnapshot): HierarchyNodeModel[] {
  const visit = (objectId: string, depth: number): HierarchyNodeModel | null => {
    const object = snapshot.objects[objectId];
    if (!object) {
      return null;
    }

    return {
      object,
      depth,
      children: object.children.map((childId) => visit(childId, depth + 1)).filter((node): node is HierarchyNodeModel => Boolean(node))
    };
  };

  return snapshot.rootObjectIds.map((objectId) => visit(objectId, 0)).filter((node): node is HierarchyNodeModel => Boolean(node));
}

function formatSnapSummary(snap: WorkbenchContext["snap"]): string {
  return `snap ${isSnapEnabled(snap.translate) ? "move" : "off"}`;
}

function isSnapEnabled(value: number | null | undefined): boolean {
  return value !== null && value !== undefined;
}

const DemoSidePanel = defineComponent({
  props: {
    context: {
      type: Object as PropType<WorkbenchContext>,
      required: true
    },
    session: {
      type: Object as PropType<DemoSessionState>,
      required: true
    }
  },
  emits: {
    status: (_value: string) => true,
    markSession: (_key: DemoSessionKey, _value?: boolean) => true
  },
  setup(props, { emit }) {
    const state = computed(() => deriveDemoState(props.context, props.session));
    watch(() => state.value.problemCount, (problemCount) => {
      if (problemCount > 0) {
        emit("markSession", "missingAssetSeen");
      }
    }, { immediate: true });

    return () => h("div", { class: "demo-panel-grid" }, [
      h("section", { class: "demo-panel", "aria-labelledby": "demo-hierarchy-title" }, [
        h("div", { class: "demo-panel__header" }, [
          h("h2", { id: "demo-hierarchy-title" }, "Scene hierarchy"),
          h("span", { "data-testid": "demo-selection-count" }, state.value.selectionLabel)
        ]),
        state.value.hierarchy.length > 0
          ? h("ul", { class: "demo-hierarchy", "data-testid": "demo-hierarchy" }, state.value.hierarchy.map((node) =>
              renderHierarchyNode(node, props.context, state.value.problemObjectIds, (objectId) => {
                props.context.dispatch({ type: "select-object", objectId });
                emit("status", `Selected ${objectId} from hierarchy`);
              })
            ))
          : h("p", { class: "demo-empty" }, "No scene objects")
      ]),
      h("section", { class: "demo-panel", "aria-labelledby": "demo-operations-title" }, [
        h("div", { class: "demo-panel__header" }, [
          h("h2", { id: "demo-operations-title" }, "Object operations"),
          h("span", props.context.operations.canPaste() ? "Clipboard ready" : "Clipboard empty")
        ]),
        h("div", { class: "demo-command-grid" }, [
          h("button", { type: "button", onClick: () => {
            props.context.runAction("select-all");
            emit("status", "Selected all objects");
          } }, "Select all"),
          h("button", { type: "button", disabled: props.context.selectionCount === 0, onClick: () => {
            const payload = props.context.operations.copy();
            emit("markSession", "copied", Boolean(payload));
            emit("status", payload ? "Copied selection" : "Nothing to copy");
          } }, "Copy"),
          h("button", { type: "button", disabled: !props.context.operations.canPaste(), onClick: () => {
            const result = props.context.operations.paste();
            emit("markSession", "pasted", result.ok);
            emit("status", result.ok ? "Pasted clipboard objects" : result.error ?? "Paste failed");
          } }, "Paste"),
          h("button", { type: "button", disabled: props.context.selectionCount === 0, onClick: () => {
            const result = props.context.operations.duplicate();
            emit("markSession", "duplicated", result.ok);
            emit("status", result.ok ? "Duplicated selection" : result.error ?? "Duplicate failed");
          } }, "Duplicate"),
          h("button", { type: "button", disabled: props.context.selectionCount === 0, onClick: () => {
            const result = props.context.operations.delete();
            emit("markSession", "deleted", result.ok);
            emit("status", result.ok ? "Deleted selection" : result.error ?? "Delete failed");
          } }, "Delete"),
          h("button", { type: "button", disabled: !props.context.snapshot.objects.box || !props.context.snapshot.objects.detail, onClick: () => {
            props.context.dispatch({ type: "select-objects", mode: "replace", objectIds: ["box", "detail"], primaryObjectId: "box" });
            const result = props.context.operations.group(["box", "detail"]);
            emit("markSession", "grouped", result.ok);
            emit("status", result.ok ? "Grouped detail under Simple box" : result.error ?? "Group failed");
          } }, "Group demo"),
          h("button", { type: "button", disabled: !props.context.snapshot.objects.box?.children.length, onClick: () => {
            const result = props.context.operations.ungroup("box");
            emit("markSession", "ungrouped", result.ok);
            emit("status", result.ok ? "Ungrouped Simple box children" : result.error ?? "Ungroup failed");
          } }, "Ungroup")
        ])
      ]),
      h("section", { class: "demo-panel", "aria-labelledby": "demo-assets-title" }, [
        h("div", { class: "demo-panel__header" }, [
          h("h2", { id: "demo-assets-title" }, "Assets and problems"),
          h("span", { "data-testid": "demo-problem-badge" }, `${state.value.problemCount} problems`)
        ]),
        h("ul", { class: "demo-assets", "data-testid": "demo-assets" }, state.value.assets.map((asset) =>
          h("li", { key: asset.id }, [
            h("span", asset.label ?? asset.id),
            h("small", `${asset.kind} · ${asset.id}`)
          ])
        )),
        h("button", { type: "button", onClick: async () => {
          const result = await props.context.replaceAsset({
            assetId: RECOVERABLE_ASSET_ID,
            kind: "glb",
            source: DEMO_ASSET_BYTES,
            label: "Recovered box.glb",
            mimeType: "model/gltf-binary"
          });
          if (result.ok) {
            await props.context.runtime?.project();
            props.context.refreshProblems();
            emit("markSession", "missingAssetRecovered");
            emit("status", "Recovered missing asset without changing its asset ID");
          } else {
            emit("status", result.problems[0]?.message ?? "Replacement failed");
          }
        } }, "Replace missing asset")
      ]),
      h("section", { class: "demo-panel", "aria-labelledby": "demo-checklist-title" }, [
        h("div", { class: "demo-panel__header" }, [
          h("h2", { id: "demo-checklist-title" }, "Proof checklist"),
          h("span", { "data-testid": "demo-checklist-score" }, `${state.value.completedCount}/${state.value.checklist.length}`)
        ]),
        h("ol", { class: "demo-checklist", "data-testid": "demo-checklist" }, state.value.checklist.map((item) =>
          h("li", { key: item.label, "data-complete": item.complete ? "true" : "false" }, [
            h("span", { "aria-hidden": "true" }, item.complete ? "OK" : "--"),
            item.label
          ])
        ))
      ])
    ]);
  }
});

function renderHierarchyNode(
  node: HierarchyNodeModel,
  context: WorkbenchContext,
  problemObjectIds: Set<string>,
  onSelect: (objectId: string) => void
) {
  const selected = context.snapshot.selection.objectIds.includes(node.object.id);
  const primary = context.snapshot.selection.objectId === node.object.id;
  const problem = problemObjectIds.has(node.object.id);

  return h("li", { key: node.object.id }, [
    h("button", {
      type: "button",
      class: "demo-hierarchy__row",
      style: { "--depth": String(node.depth) },
      "data-object-id": node.object.id,
      "data-selected": selected ? "true" : "false",
      "data-primary": primary ? "true" : "false",
      onClick: () => onSelect(node.object.id)
    }, [
      h("span", { class: "demo-hierarchy__marker" }, primary ? "Primary" : selected ? "Selected" : "Object"),
      h("span", { class: "demo-hierarchy__name" }, node.object.name),
      h("span", { class: "demo-hierarchy__asset" }, node.object.asset.id),
      problem ? h("span", { class: "demo-problem-dot" }, "Problem") : null
    ]),
    node.children.length > 0
      ? h("ul", node.children.map((child) => renderHierarchyNode(child, context, problemObjectIds, onSelect)))
      : null
  ]);
}
</script>
