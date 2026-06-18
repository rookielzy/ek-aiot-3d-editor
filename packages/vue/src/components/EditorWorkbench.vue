<template>
  <main ref="root" :class="rootClassName" tabindex="0" :aria-label="context.i18n.t('reactWorkbench.shell.main.label')">
    <div v-if="showDefaultToolbar || $slots.toolbar" class="ek-workbench__toolbar">
      <WorkbenchToolbar
        v-if="showDefaultToolbar"
        :context="context"
        :marquee-selection-enabled="marqueeSelectionEnabled"
        :show-locale-switcher="showLocaleSwitcher"
        :locale-switcher-disabled="localeSwitcherDisabled"
        @toggle-marquee-selection="marqueeSelectionEnabled = !marqueeSelectionEnabled"
      />
      <div v-if="$slots.toolbar" class="ek-workbench__toolbar-region">
        <slot name="toolbar" v-bind="context" />
      </div>
    </div>

    <section class="ek-workbench__viewport-shell" :aria-label="context.i18n.t('reactWorkbench.shell.viewport.label')">
      <EditorViewport
        :editor="workbench.editor"
        :resolver="resolver"
        :loader="loader"
        :renderer-factory="rendererFactory"
        :interactions="resolvedInteractions"
        :class="viewportClassName ? `ek-workbench__viewport ${viewportClassName}` : 'ek-workbench__viewport'"
        @runtime-ready="emit('runtimeReady', $event)"
      />
      <div v-if="$slots.viewportOverlay" class="ek-workbench__overlay">
        <slot name="viewportOverlay" v-bind="context" />
      </div>
    </section>

    <aside class="ek-workbench__side-panel" :aria-label="context.i18n.t('reactWorkbench.shell.projectPanel.label')">
      <slot v-if="$slots.leftPanel" name="leftPanel" v-bind="context" />
      <slot v-else-if="$slots.sidePanel" name="sidePanel" v-bind="context" />
      <WorkbenchLeftPanel v-else :context="context" />
    </aside>

    <aside class="ek-workbench__right-panel" :aria-label="context.i18n.t('reactWorkbench.shell.inspectorPanel.label')">
      <slot v-if="$slots.rightPanel" name="rightPanel" v-bind="context" />
      <InspectorView
        v-else
        :editor="workbench.editor"
        :snapshot="currentSnapshot"
        :inspector="currentInspector"
        :camera="context.camera"
        :class="inspectorClassName"
        @update:active-light-id="workbench.setActiveLightId"
        @update:active-camera-view-id="workbench.setActiveCameraViewId"
        @replace-asset="replaceAsset"
      />
    </aside>

    <footer class="ek-workbench__status" :aria-label="context.i18n.t('reactWorkbench.shell.status.label')">
      <slot v-if="$slots.status" name="status" v-bind="context" />
      <WorkbenchStatusBar v-else :context="context" />
    </footer>
  </main>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, toRef } from "vue";
import { resolveEditorShortcut, type EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";
import { useWorkbench } from "../composables/use-workbench";
import type { EditorWorkbenchEmitDefinitions, EditorWorkbenchProps, EditorWorkbenchSlots } from "./EditorWorkbench.types";
import EditorViewport from "./EditorViewport.vue";
import InspectorView from "./InspectorView.vue";
import WorkbenchLeftPanel from "./WorkbenchLeftPanel.vue";
import WorkbenchStatusBar from "./WorkbenchStatusBar.vue";
import WorkbenchToolbar from "./WorkbenchToolbar.vue";
import "./workbench.css";

const DEFAULT_WORKBENCH_INTERACTIONS = {
  camera: true,
  pointerSelection: true,
  marqueeSelection: false,
  resize: true,
  selectionVisuals: true,
  transform: true,
  viewportHelpers: true
} satisfies EditorRuntimeOptions["interactions"];

const props = withDefaults(defineProps<EditorWorkbenchProps>(), {
  showDefaultToolbar: true,
  showLocaleSwitcher: true,
  localeSwitcherDisabled: false
});

const emit = defineEmits<EditorWorkbenchEmitDefinitions>();
defineSlots<EditorWorkbenchSlots>();
const instance = getCurrentInstance();

const workbench = useWorkbench({
  editor: toRef(props, "editor"),
  snapshot: props.snapshot,
  loader: toRef(props, "loader"),
  locale: toRef(props, "locale"),
  defaultLocale: props.defaultLocale,
  translate: toRef(props, "translate"),
  onLocaleChange: (locale) => emit("update:locale", locale)
});

const context = computed(() => workbench.context.value);
const currentSnapshot = computed(() => workbench.snapshot.value);
const currentInspector = computed(() => workbench.inspector.value);
const rootClassName = computed(() => props.class ? `ek-workbench ${props.class}` : "ek-workbench");
const interactions = computed(() => !hasProp("interactions") || props.interactions === undefined ? DEFAULT_WORKBENCH_INTERACTIONS : props.interactions);
const marqueeSelectionEnabled = ref(false);
const resolvedInteractions = computed(() =>
  interactions.value === DEFAULT_WORKBENCH_INTERACTIONS
    ? { ...DEFAULT_WORKBENCH_INTERACTIONS, marqueeSelection: marqueeSelectionEnabled.value }
    : interactions.value
);
const showDefaultToolbar = computed(() => props.showDefaultToolbar);
const showLocaleSwitcher = computed(() => props.showLocaleSwitcher);
const localeSwitcherDisabled = computed(() => props.localeSwitcherDisabled);
const root = ref<HTMLElement | null>(null);

function replaceAsset(assetId: string, file: File): void {
  void workbench.replaceAsset({ assetId, source: file, label: file.name, mimeType: file.type });
}

function hasProp(name: string): boolean {
  const vnodeProps = instance?.vnode.props;
  return Boolean(vnodeProps && (name in vnodeProps || kebabCase(name) in vnodeProps));
}

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
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
