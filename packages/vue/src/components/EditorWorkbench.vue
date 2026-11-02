<template>
  <main ref="root" :class="rootClassName" :data-desktop="desktop" :style="panelStyle" tabindex="0" :aria-label="context.i18n.t('reactWorkbench.shell.main.label')">
    <nav class="ek-workbench__navigation" :aria-label="context.i18n.t('reactWorkbench.leftPanel.nav.label')">
      <span class="ek-workbench__brand" aria-hidden="true">ek<span>.</span></span>
      <button v-for="view in panelViews" :key="view.id" type="button" class="ek-workbench__nav-button"
        :aria-label="`${context.i18n.t(`reactWorkbench.leftPanel.nav.${view.id}`)} ${view.count}`"
        :aria-pressed="activeView === view.id" :aria-expanded="activeView === view.id && !leftCollapsed"
        :aria-controls="`${panelId}-left`" @click="selectView(view.id)">
        <WorkbenchIcon :name="view.icon" />
        <span>{{ context.i18n.t(`reactWorkbench.leftPanel.nav.${view.id}`) }}</span>
        <small>{{ view.count }}</small>
      </button>
    </nav>
    <div v-if="showDefaultToolbar || $slots.toolbar" class="ek-workbench__toolbar">
      <WorkbenchToolbar
        v-if="showDefaultToolbar"
        :context="context"
        :show-locale-switcher="showLocaleSwitcher"
        :locale-switcher-disabled="localeSwitcherDisabled"
        @project-problems="setProjectProblems"
      />
      <div v-if="$slots.toolbar" class="ek-workbench__toolbar-region">
        <slot name="toolbar" v-bind="context" />
      </div>
    </div>

    <section class="ek-workbench__viewport-shell" :aria-label="context.i18n.t('reactWorkbench.shell.viewport.label')">
      <div class="ek-workbench__panel-toggles">
        <button type="button" :aria-controls="`${panelId}-left`" :aria-expanded="!leftCollapsed"
          :aria-label="context.i18n.t(leftCollapsed ? 'reactWorkbench.shell.left.expand' : 'reactWorkbench.shell.left.collapse')"
          @click="leftCollapsed = !leftCollapsed">{{ leftCollapsed ? "»" : "«" }}</button>
        <button type="button" :aria-controls="`${panelId}-right`" :aria-expanded="!rightCollapsed"
          :aria-label="context.i18n.t(rightCollapsed ? 'reactWorkbench.shell.right.expand' : 'reactWorkbench.shell.right.collapse')"
          @click="rightCollapsed = !rightCollapsed">{{ rightCollapsed ? "«" : "»" }}</button>
      </div>
      <WorkbenchViewportTools v-if="showDefaultToolbar" :context="context"
        :marquee-selection-enabled="marqueeSelectionEnabled"
        @toggle-marquee-selection="marqueeSelectionEnabled = !marqueeSelectionEnabled" />
      <EditorViewport
        :editor="workbench.editor"
        :resolver="resolver"
        :loader="loader"
        :renderer-factory="rendererFactory ?? createWorkbenchRenderer"
        :interactions="resolvedInteractions"
        :class="viewportClassName ? `ek-workbench__viewport ${viewportClassName}` : 'ek-workbench__viewport'"
        @runtime-ready="emit('runtimeReady', $event)"
      />
      <div v-if="context.model.hierarchy.totalCount === 0" class="ek-workbench__empty-viewport">
        <strong>{{ context.i18n.t("reactWorkbench.shell.empty.title") }}</strong>
        <p>{{ context.i18n.t("reactWorkbench.shell.empty.description") }}</p>
      </div>
      <div v-if="$slots.viewportOverlay" class="ek-workbench__overlay">
        <slot name="viewportOverlay" v-bind="context" />
      </div>
    </section>

    <aside :id="`${panelId}-left`" :hidden="leftCollapsed" class="ek-workbench__side-panel" :aria-label="context.i18n.t('reactWorkbench.shell.projectPanel.label')">
      <slot v-if="$slots.leftPanel" name="leftPanel" v-bind="context" />
      <slot v-else-if="$slots.sidePanel" name="sidePanel" v-bind="context" />
      <WorkbenchLeftPanel
        v-else
        :context="context"
        :active-view="activeView"
        :data-locate="dataLocate"
        @data-locate-handled="handleDataLocateHandled"
      />
    </aside>

    <WorkbenchPanelResize v-if="desktop && !leftCollapsed" side="left" :panel-id="`${panelId}-left`"
      :label="context.i18n.t('reactWorkbench.shell.left.resize')" :width="leftWidth" :minimum="220" :maximum="maximum" @resize="setLeftWidth" />
    <WorkbenchPanelResize v-if="desktop && !rightCollapsed" side="right" :panel-id="`${panelId}-right`"
      :label="context.i18n.t('reactWorkbench.shell.right.resize')" :width="rightWidth" :minimum="260" :maximum="maximum" @resize="setRightWidth" />
    <aside :id="`${panelId}-right`" :hidden="rightCollapsed" class="ek-workbench__right-panel" :aria-label="context.i18n.t('reactWorkbench.shell.inspectorPanel.label')">
      <slot v-if="$slots.rightPanel" name="rightPanel" v-bind="context" />
      <InspectorView
        v-else
        :editor="workbench.editor"
        :snapshot="currentSnapshot"
        :inspector="currentInspector"
        :camera="context.camera"
        :i18n="context.i18n"
        :class="inspectorClassName"
        @update:active-light-id="workbench.setActiveLightId"
        @update:active-camera-view-id="workbench.setActiveCameraViewId"
        @replace-asset="replaceAsset"
      />
    </aside>

    <footer class="ek-workbench__status" :aria-label="context.i18n.t('reactWorkbench.shell.status.label')">
      <slot v-if="$slots.status" name="status" v-bind="context" />
      <WorkbenchStatusBar v-else :context="context" @locate-data-target="locateDataTarget" />
    </footer>
  </main>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, toRef, useId } from "vue";
import { buildWorkbenchModel, resolveEditorShortcut, type EditorRuntimeOptions, type Problem } from "@ek-aiot/3d-editor-core";
import { useWorkbench } from "../composables/use-workbench";
import type { DataProblemTarget } from "./workbench-problem-target";
import type { EditorWorkbenchEmitDefinitions, EditorWorkbenchProps, EditorWorkbenchSlots } from "./EditorWorkbench.types";
import EditorViewport from "./EditorViewport.vue";
import InspectorView from "./InspectorView.vue";
import WorkbenchLeftPanel from "./WorkbenchLeftPanel.vue";
import WorkbenchStatusBar from "./WorkbenchStatusBar.vue";
import WorkbenchToolbar from "./WorkbenchToolbar.vue";
import WorkbenchViewportTools from "./WorkbenchViewportTools.vue";
import WorkbenchIcon, { type WorkbenchIconName } from "./WorkbenchIcon.vue";
import WorkbenchPanelResize from "./WorkbenchPanelResize.vue";
import { useWorkbenchPanelWidths } from "../composables/use-workbench-panel-widths";
import { createWorkbenchRenderer } from "./workbench-renderer";
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
  credentials: props.credentials,
  executor: props.executor,
  loader: toRef(props, "loader"),
  locale: toRef(props, "locale"),
  defaultLocale: props.defaultLocale,
  translate: toRef(props, "translate"),
  onLocaleChange: (locale) => emit("update:locale", locale)
});

const projectFeedback = ref<{ editor: typeof workbench.editor; problems: Problem[] } | null>(null);
const projectProblems = computed(() => projectFeedback.value?.editor === workbench.editor
  ? projectFeedback.value.problems.filter((problem) => {
      if (problem.assetId && (problem.code === "project-export-payload-missing" || problem.code === "project-export-asset-missing")) {
        return workbench.model.value.assets.workspace?.items.some((asset) => asset.id === problem.assetId && asset.packageBlocking);
      }
      return true;
    })
  : []);
const context = computed(() => {
  const base = workbench.context.value;
  if (!projectProblems.value.length) {
    return base;
  }
  const model = buildWorkbenchModel(workbench.snapshot.value, {
    canPaste: workbench.editor.operations.canPaste(),
    inspector: workbench.inspector.value,
    runtimeProblems: workbench.runtimeProblems.value,
    projectProblems: projectProblems.value,
    assetPayloads: base.assets.payloads,
    dataCredentials: workbench.editor.getDataCredentials?.() ?? [],
    dataState: workbench.dataState.value,
    history: workbench.editor.getHistoryState(),
    snap: workbench.snap.value,
    viewportHelpers: workbench.viewportHelperState.value,
    transformMode: workbench.transformMode.value,
    runtimeReady: workbench.runtime.value !== null
  });
  return {
    ...base,
    model,
    problems: {
      ...base.problems,
      items: model.problems.items,
      totalCount: model.problems.totalCount
    }
  };
});
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
const panelId = useId();
type PanelView = "scene" | "assets" | "data" | "project";
const activeView = ref<PanelView>("scene");
const dataLocate = ref<{ connectionId: string; queryId: string } | null>(null);
const leftCollapsed = ref(false);
const rightCollapsed = ref(false);
const { desktop, maximum, leftWidth, rightWidth, setLeftWidth, setRightWidth } = useWorkbenchPanelWidths(root);
const panelStyle = computed(() => ({
  "--ek-workbench-left-width": `${leftCollapsed.value ? 0 : leftWidth.value}px`,
  "--ek-workbench-right-width": `${rightCollapsed.value ? 0 : rightWidth.value}px`,
  "--ek-workbench-left-handle": leftCollapsed.value ? "0px" : "6px",
  "--ek-workbench-right-handle": rightCollapsed.value ? "0px" : "6px"
}));
const panelViews = computed<Array<{ id: PanelView; icon: WorkbenchIconName; count: number }>>(() => [
  { id: "scene", icon: "group", count: context.value.model.hierarchy.totalCount },
  { id: "assets", icon: "floor", count: context.value.model.assets.workspace?.totalCount ?? context.value.model.assets.totalCount },
  { id: "data", icon: "data", count: context.value.model.dataSources.totalCount },
  { id: "project", icon: "open", count: context.value.model.problems.totalCount }
]);

function selectView(view: PanelView): void {
  leftCollapsed.value = activeView.value === view ? !leftCollapsed.value : false;
  activeView.value = view;
}

function handleDataLocateHandled(): void {
  dataLocate.value = null;
}

function locateDataTarget(target: DataProblemTarget): void {
  const query = context.value.snapshot.dataSources.queries[target.queryId];
  if (!query) {
    return;
  }
  activeView.value = "data";
  leftCollapsed.value = false;
  dataLocate.value = { connectionId: query.connectionId, queryId: target.queryId };
}

function replaceAsset(assetId: string, file: File): void {
  void workbench.replaceAsset({ assetId, source: file, label: file.name, mimeType: file.type });
}

function setProjectProblems(problems: Problem[]): void {
  projectFeedback.value = { editor: workbench.editor, problems };
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
