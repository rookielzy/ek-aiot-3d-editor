<template>
  <main ref="root" :class="rootClassName" tabindex="0">
    <div v-if="showDefaultToolbar || $slots.toolbar" class="ek-workbench__toolbar">
      <DefaultWorkbenchToolbar v-if="showDefaultToolbar" :context="context" />
      <div v-if="$slots.toolbar" class="ek-workbench__toolbar-region">
        <slot name="toolbar" v-bind="context" />
      </div>
    </div>

    <section class="ek-workbench__viewport-shell" aria-label="3D viewport">
      <EditorViewport
        :editor="workbench.editor"
        :resolver="resolver"
        :loader="loader"
        :renderer-factory="rendererFactory"
        :interactions="interactions"
        :class="viewportClassName ? `ek-workbench__viewport ${viewportClassName}` : 'ek-workbench__viewport'"
        @runtime-ready="emit('runtimeReady', $event)"
      />
      <div v-if="$slots.viewportOverlay" class="ek-workbench__overlay">
        <slot name="viewportOverlay" v-bind="context" />
      </div>
    </section>

    <aside class="ek-workbench__side-panel" aria-label="Project panel">
      <slot v-if="$slots.leftPanel" name="leftPanel" v-bind="context" />
      <slot v-else-if="$slots.sidePanel" name="sidePanel" v-bind="context" />
      <DefaultWorkbenchLeftPanel v-else :context="context" />
    </aside>

    <aside class="ek-workbench__right-panel" aria-label="Inspector panel">
      <slot v-if="$slots.rightPanel" name="rightPanel" v-bind="context" />
      <InspectorView
        v-else
        :editor="workbench.editor"
        :snapshot="currentSnapshot"
        :inspector="currentInspector"
        :class="inspectorClassName"
        @update:active-light-id="workbench.setActiveLightId"
        @replace-asset="replaceAsset"
      />
    </aside>

    <footer class="ek-workbench__status" aria-label="Editor status">
      <slot v-if="$slots.status" name="status" v-bind="context" />
      <DefaultWorkbenchStatus v-else :context="context" />
    </footer>
  </main>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, toRef, type PropType, type VNode } from "vue";
import {
  executeEditorAction,
  resolveEditorShortcut,
  type EditorRuntimeOptions,
  type SceneNode
} from "@ek-aiot/3d-editor-core";
import { useWorkbench, type WorkbenchContext } from "../composables/use-workbench";
import type { EditorWorkbenchEmits, EditorWorkbenchProps, EditorWorkbenchSlots } from "./EditorWorkbench.types";
import EditorViewport from "./EditorViewport.vue";
import InspectorView from "./InspectorView.vue";
import "./workbench.css";

const DEFAULT_WORKBENCH_INTERACTIONS = {
  camera: true,
  pointerSelection: true,
  resize: true,
  selectionVisuals: true,
  transform: true
} satisfies EditorRuntimeOptions["interactions"];

const props = withDefaults(defineProps<EditorWorkbenchProps>(), {
  showDefaultToolbar: true
});

const emit = defineEmits<EditorWorkbenchEmits>();
defineSlots<EditorWorkbenchSlots>();

const workbench = useWorkbench({
  editor: toRef(props, "editor"),
  snapshot: props.snapshot
});

const context = computed(() => workbench.context.value);
const currentSnapshot = computed(() => workbench.snapshot.value);
const currentInspector = computed(() => workbench.inspector.value);
const rootClassName = computed(() => props.class ? `ek-workbench ${props.class}` : "ek-workbench");
const interactions = computed(() => props.interactions ?? DEFAULT_WORKBENCH_INTERACTIONS);
const showDefaultToolbar = computed(() => props.showDefaultToolbar);
const root = ref<HTMLElement | null>(null);

function replaceAsset(assetId: string, file: File): void {
  void workbench.replaceAsset({ assetId, source: file, label: file.name, mimeType: file.type });
}

function onKeyDown(event: KeyboardEvent): void {
  const resolution = resolveEditorShortcut({
    key: event.key,
    code: event.code,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    target: event.target
  });
  if (!resolution.handled || !resolution.action) {
    return;
  }
  if (resolution.preventDefault) {
    event.preventDefault();
  }
  executeEditorAction(workbench.editor, resolution.action);
}

onMounted(() => {
  root.value?.addEventListener("keydown", onKeyDown);
});

onBeforeUnmount(() => {
  root.value?.removeEventListener("keydown", onKeyDown);
});

function isSnapEnabled(value: number | null | undefined): boolean {
  return value !== null && value !== undefined;
}

const DefaultWorkbenchToolbar = defineComponent({
  props: {
    context: {
      type: Object as PropType<WorkbenchContext>,
      required: true
    }
  },
  setup(props) {
    return () => h("div", { class: "ek-workbench__default-toolbar", "aria-label": "Editor controls" }, [
      h("div", { class: "ek-workbench__tool-group", "aria-label": "History" }, [
        h("button", { type: "button", disabled: props.context.historyState.undoCount === 0, title: "Undo", onClick: () => props.context.runAction("undo") }, "Undo"),
        h("button", { type: "button", disabled: props.context.historyState.redoCount === 0, title: "Redo", onClick: () => props.context.runAction("redo") }, "Redo")
      ]),
      h("div", { class: "ek-workbench__tool-group", "aria-label": "Transform mode" }, [
        h("button", { type: "button", "aria-pressed": props.context.transformMode === "translate", title: "Move mode", onClick: () => props.context.runAction("transform-translate") }, "Move"),
        h("button", { type: "button", "aria-pressed": props.context.transformMode === "rotate", title: "Rotate mode", onClick: () => props.context.runAction("transform-rotate") }, "Rotate"),
        h("button", { type: "button", "aria-pressed": props.context.transformMode === "scale", title: "Scale mode", onClick: () => props.context.runAction("transform-scale") }, "Scale")
      ]),
      h("div", { class: "ek-workbench__tool-group", "aria-label": "Snap" }, [
        h("button", { type: "button", "aria-pressed": isSnapEnabled(props.context.snap.translate), title: "Toggle move snap", onClick: () => props.context.runAction("toggle-translate-snap") }, "Snap move"),
        h("button", { type: "button", "aria-pressed": isSnapEnabled(props.context.snap.rotate), title: "Toggle rotate snap", onClick: () => props.context.runAction("toggle-rotate-snap") }, "Snap rotate"),
        h("button", { type: "button", "aria-pressed": isSnapEnabled(props.context.snap.scale), title: "Toggle scale snap", onClick: () => props.context.runAction("toggle-scale-snap") }, "Snap scale")
      ]),
      h("div", { class: "ek-workbench__tool-group", "aria-label": "Camera" }, [
        h("button", { type: "button", disabled: !props.context.runtimeReady, title: "Reset camera", onClick: props.context.resetCamera }, "Reset"),
        h("button", { type: "button", disabled: !props.context.runtimeReady || props.context.selectionCount === 0, title: "Frame selected", onClick: () => props.context.frameSelected() }, "Frame sel"),
        h("button", { type: "button", disabled: !props.context.runtimeReady || Object.keys(props.context.snapshot.objects).length === 0, title: "Frame all", onClick: () => props.context.frameAll() }, "Frame all")
      ]),
      h("div", { class: "ek-workbench__tool-group", "aria-label": "Node operations" }, [
        h("button", { type: "button", disabled: props.context.selectionCount === 0, title: "Copy selection", onClick: () => props.context.runAction("copy") }, "Copy"),
        h("button", { type: "button", title: "Paste objects", onClick: () => props.context.runAction("paste") }, "Paste"),
        h("button", { type: "button", disabled: props.context.selectionCount === 0, title: "Duplicate selection", onClick: () => props.context.runAction("duplicate") }, "Duplicate"),
        h("button", { type: "button", disabled: props.context.selectionCount === 0, title: "Delete selection", onClick: () => props.context.runAction("delete") }, "Delete"),
        h("button", { type: "button", disabled: props.context.selectionCount < 2, title: "Group selection", onClick: () => props.context.runAction("group") }, "Group"),
        h("button", { type: "button", disabled: props.context.selectionCount === 0, title: "Ungroup selection", onClick: () => props.context.runAction("ungroup") }, "Ungroup"),
        h("button", { type: "button", disabled: Object.keys(props.context.snapshot.objects).length === 0, title: "Select all", onClick: () => props.context.runAction("select-all") }, "Select all"),
        h("button", { type: "button", disabled: props.context.selectionCount === 0, title: "Clear selection", onClick: () => props.context.runAction("clear-selection") }, "Clear")
      ])
    ]);
  }
});

const DefaultWorkbenchLeftPanel = defineComponent({
  props: {
    context: {
      type: Object as PropType<WorkbenchContext>,
      required: true
    }
  },
  setup(props) {
    return () => {
      const roots = props.context.snapshot.rootNodeIds
        .map((nodeId) => props.context.snapshot.nodes[nodeId])
        .filter((node): node is SceneNode => Boolean(node));
      const assets = Object.values(props.context.snapshot.assets);
      const problemItems = props.context.problems.items;

      return h("div", { class: "ek-workbench__default-left-panel" }, [
        h("section", { class: "ek-workbench__panel-section", "aria-label": "Hierarchy" }, [
          h("div", { class: "ek-workbench__section-header" }, [
            h("h2", "Hierarchy"),
            h("span", Object.keys(props.context.snapshot.nodes).length)
          ]),
          roots.length > 0
            ? h("ul", { class: "ek-workbench__tree" }, roots.map((node) => renderNodeRow(props.context, node, 0)))
            : h("p", { class: "ek-workbench__empty" }, "No scene nodes.")
        ]),
        h("section", { class: "ek-workbench__panel-section", "aria-label": "Assets" }, [
          h("div", { class: "ek-workbench__section-header" }, [
            h("h2", "Assets"),
            h("span", assets.length)
          ]),
          assets.length > 0
            ? h("ul", { class: "ek-workbench__asset-list" }, assets.map((asset) =>
              h("li", { key: asset.id }, [
                h("span", asset.label ?? asset.id),
                h("small", asset.kind)
              ])
            ))
            : h("p", { class: "ek-workbench__empty" }, "No registered assets.")
        ]),
        h("section", { class: "ek-workbench__panel-section", "aria-label": "Project" }, [
          h("div", { class: "ek-workbench__section-header" }, [
            h("h2", "Project"),
            h("span", problemItems.length === 0 ? "Ready" : `${problemItems.length} problems`)
          ]),
          h("dl", { class: "ek-workbench__summary-list" }, [
            renderSummaryTerm("Scene", props.context.snapshot.scene.name),
            renderSummaryTerm("Objects", Object.keys(props.context.snapshot.objects).length),
            renderSummaryTerm("Lights", Object.keys(props.context.snapshot.lights).length)
          ]),
          problemItems.length > 0
            ? h("ul", { class: "ek-workbench__problem-list", "aria-label": "Project problems" }, problemItems.slice(0, 3).map((problem) =>
              h("li", { key: problem.id, "data-severity": problem.severity }, [
                h("span", problem.title),
                problem.actionLabel ? h("small", problem.actionLabel) : null
              ])
            ))
            : null
        ])
      ]);
    };
  }
});

const DefaultWorkbenchStatus = defineComponent({
  props: {
    context: {
      type: Object as PropType<WorkbenchContext>,
      required: true
    }
  },
  setup(props) {
    return () => h("div", { class: "ek-workbench__default-status" }, [
      h("span", `Selection ${formatSelection(props.context)}`),
      h("span", `Undo ${props.context.historyState.undoCount}`),
      h("span", `Redo ${props.context.historyState.redoCount}`),
      h("span", `Runtime ${props.context.runtimeReady ? "ready" : "missing"}`),
      h("span", `Problems ${props.context.problems.totalCount}`)
    ]);
  }
});

function renderNodeRow(context: WorkbenchContext, node: SceneNode, depth: number): VNode {
  const selected = context.selectedNodeIds.includes(node.id);
  const children = node.children
    .map((childId) => context.snapshot.nodes[childId])
    .filter((child): child is SceneNode => Boolean(child));

  return h("li", { key: node.id }, [
    h("button", {
      type: "button",
      class: "ek-workbench__tree-row",
      "data-selected": selected ? "true" : undefined,
      style: { "--ek-workbench-tree-depth": depth },
      onClick: () => context.dispatch({ type: "select-node", nodeId: node.id })
    }, [
      h("span", node.name),
      h("small", node.kind)
    ]),
    children.length > 0 ? h("ul", children.map((child) => renderNodeRow(context, child, depth + 1))) : null
  ]);
}

function renderSummaryTerm(label: string, value: string | number): VNode {
  return h("div", [
    h("dt", label),
    h("dd", String(value))
  ]);
}

function formatSelection(context: WorkbenchContext): string {
  if (context.selectionCount === 0) {
    return "none";
  }
  const node = context.selectedNodeId ? context.snapshot.nodes[context.selectedNodeId] : undefined;
  if (context.selectionCount === 1 && node) {
    return node.name;
  }
  return `${context.selectionCount} nodes`;
}
</script>
