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

    <aside v-if="$slots.sidePanel" class="ek-workbench__side-panel">
      <slot name="sidePanel" v-bind="context" />
    </aside>

    <InspectorView
      :editor="workbench.editor"
      :snapshot="currentSnapshot"
      :inspector="currentInspector"
      :class="inspectorClassName"
      @update:active-light-id="workbench.setActiveLightId"
      @replace-asset="replaceAsset"
    />

    <footer v-if="$slots.status" class="ek-workbench__status">
      <slot name="status" v-bind="context" />
    </footer>
  </main>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, toRef, type PropType } from "vue";
import {
  executeEditorAction,
  resolveEditorShortcut,
  type AssetResolverBridge,
  type Editor,
  type EditorOptions,
  type EditorRuntime,
  type EditorRuntimeOptions
} from "@ek-aiot/3d-editor-core";
import { useWorkbench, type WorkbenchContext } from "../composables/use-workbench";
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

const props = withDefaults(defineProps<{
  editor?: Editor;
  snapshot?: EditorOptions["snapshot"];
  resolver?: AssetResolverBridge;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
  interactions?: EditorRuntimeOptions["interactions"];
  showDefaultToolbar?: boolean;
  class?: string;
  viewportClassName?: string;
  inspectorClassName?: string;
}>(), {
  showDefaultToolbar: true
});

const emit = defineEmits<{
  runtimeReady: [runtime: EditorRuntime | null];
}>();

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
      h("div", { class: "ek-workbench__tool-group", "aria-label": "Object operations" }, [
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
</script>
