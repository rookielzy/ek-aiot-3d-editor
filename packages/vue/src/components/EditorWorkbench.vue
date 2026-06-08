<template>
  <main ref="root" :class="rootClassName" tabindex="0">
    <div v-if="showDefaultToolbar || $slots.toolbar" class="ek-workbench__toolbar">
      <WorkbenchToolbar v-if="showDefaultToolbar" :context="context" />
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
      <WorkbenchLeftPanel v-else :context="context" />
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
      <WorkbenchStatusBar v-else :context="context" />
    </footer>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef } from "vue";
import { resolveEditorShortcut, type EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";
import { useWorkbench, type WorkbenchContext } from "../composables/use-workbench";
import type { EditorWorkbenchEmits, EditorWorkbenchProps, EditorWorkbenchSlots } from "./EditorWorkbench.types";
import EditorViewport from "./EditorViewport.vue";
import InspectorView from "./InspectorView.vue";
import WorkbenchLeftPanel from "./WorkbenchLeftPanel.vue";
import WorkbenchStatusBar from "./WorkbenchStatusBar.vue";
import WorkbenchToolbar from "./WorkbenchToolbar.vue";
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
  snapshot: props.snapshot,
  loader: toRef(props, "loader")
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
  workbench.runAction(resolution.action);
}

onMounted(() => {
  root.value?.addEventListener("keydown", onKeyDown);
});

onBeforeUnmount(() => {
  root.value?.removeEventListener("keydown", onKeyDown);
});
</script>
