<template>
  <div ref="root" class="ek-workbench__viewport-tools" :aria-label="t('reactWorkbench.toolbar.controls.label')" @keydown.esc="dismissWithEscape" @focusout="dismissOnBlur">
    <div class="ek-workbench__viewport-tool-strip">
      <div v-for="group in directGroups" :key="group.key" class="ek-workbench__tool-group" role="group" :aria-label="t(group.label)">
        <button v-for="command in group.commands" :key="command.key"
          class="ek-workbench__command-button ek-workbench__command-button--icon"
          type="button" :title="command.reason ? t(command.reason) : t(command.title)" :aria-label="t(command.label)"
          :disabled="command.disabled" :aria-pressed="command.pressed" @click="command.onClick">
          <WorkbenchIcon :name="command.icon" />
          <span>{{ t(command.label) }}</span>
          <small v-if="group.key === 'snap'" class="ek-workbench__snap-mark" aria-hidden="true"><WorkbenchIcon name="snap" /></small>
        </button>
      </div>
      <div class="ek-workbench__tool-group">
        <button v-for="group in secondaryGroups" :key="group.key" class="ek-workbench__command-button ek-workbench__command-button--icon"
          type="button" :title="t(group.label)" :aria-label="t(group.label)"
          :aria-expanded="openGroup === group.key" :aria-controls="`${id}-${group.key}`" @click="toggleGroup(group.key, $event)">
          <WorkbenchIcon :name="group.key === 'helpers' ? 'grid' : group.key === 'camera' ? 'capture-view' : 'group'" />
        </button>
      </div>
    </div>
    <div v-for="group in secondaryGroups" :id="`${id}-${group.key}`" :key="group.key"
      class="ek-workbench__tool-popover" role="group" :hidden="openGroup !== group.key" :aria-label="t(group.label)">
      <strong>{{ t(group.label) }}</strong>
      <button v-for="command in group.commands" :key="command.key" class="ek-workbench__command-button"
        type="button" :title="command.reason ? t(command.reason) : t(command.title)" :disabled="command.disabled"
        :aria-pressed="command.pressed" @click="runCommand(command)">
        <WorkbenchIcon :name="command.icon" /><span>{{ t(command.label) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from "vue";
import { createAuthoredCameraViewInput, type MessageDescriptor } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import WorkbenchIcon, { type WorkbenchIconName } from "./WorkbenchIcon.vue";

interface CommandButton {
  key: string;
  icon: WorkbenchIconName;
  label: WorkbenchMessageKey;
  title: WorkbenchMessageKey;
  onClick(): void;
  disabled?: boolean;
  reason?: MessageDescriptor;
  pressed?: boolean;
}

interface CommandGroup {
  key: string;
  label: WorkbenchMessageKey;
  commands: CommandButton[];
}

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  marqueeSelectionEnabled: boolean;
}>();
const emit = defineEmits<{ toggleMarqueeSelection: [] }>();
const root = ref<HTMLElement | null>(null);
const id = useId();
const openGroup = ref<string | null>(null);
let trigger: HTMLButtonElement | null = null;
const secondaryKeys = ["helpers", "camera", "node"];
const directGroups = computed(() => commandGroups.value.filter((group) => !secondaryKeys.includes(group.key)));
const secondaryGroups = computed(() => commandGroups.value.filter((group) => secondaryKeys.includes(group.key)));

async function toggleGroup(key: string, event: MouseEvent): Promise<void> {
  trigger = event.currentTarget as HTMLButtonElement;
  if (openGroup.value === key) {
    closeGroup();
    return;
  }
  openGroup.value = key;
  await nextTick();
  root.value?.querySelector<HTMLButtonElement>(".ek-workbench__tool-popover:not([hidden]) button:not(:disabled)")?.focus();
}

function closeGroup(): void {
  if (!openGroup.value) return;
  openGroup.value = null;
  trigger?.focus();
}

function dismissWithEscape(event: KeyboardEvent): void {
  if (!openGroup.value) return;
  event.preventDefault();
  event.stopPropagation();
  closeGroup();
}

function runCommand(command: CommandButton): void {
  command.onClick();
  if (typeof command.pressed !== "boolean") closeGroup();
}

function dismissOnBlur(event: FocusEvent): void {
  if (event.relatedTarget instanceof Node && !root.value?.contains(event.relatedTarget)) openGroup.value = null;
}

function dismiss(event: PointerEvent): void {
  if (event.target instanceof Node && !root.value?.contains(event.target)) {
    openGroup.value = null;
  }
}

onMounted(() => document.addEventListener("pointerdown", dismiss, true));
onBeforeUnmount(() => document.removeEventListener("pointerdown", dismiss, true));

const toolbar = computed(() => props.context.model.toolbar);
const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: WorkbenchMessageValues) => props.context.i18n.t(message, values);
const commandGroups = computed<CommandGroup[]>(() => [
  {
    key: "history",
    label: "reactWorkbench.toolbar.history.label",
    commands: [
      {
        key: "undo",
        icon: "undo",
        label: "reactWorkbench.toolbar.history.undo.label",
        title: "reactWorkbench.toolbar.history.undo.title",
        disabled: !toolbar.value.canUndo,
        reason: toolbar.value.disabledReasons?.canUndo,
        onClick: () => props.context.runAction("undo")
      },
      {
        key: "redo",
        icon: "redo",
        label: "reactWorkbench.toolbar.history.redo.label",
        title: "reactWorkbench.toolbar.history.redo.title",
        disabled: !toolbar.value.canRedo,
        reason: toolbar.value.disabledReasons?.canRedo,
        onClick: () => props.context.runAction("redo")
      }
    ]
  },
  {
    key: "transform",
    label: "reactWorkbench.toolbar.transform.label",
    commands: [
      {
        key: "move",
        icon: "move",
        label: "reactWorkbench.toolbar.transform.move.label",
        title: "reactWorkbench.toolbar.transform.move.title",
        pressed: toolbar.value.transformMode === "translate",
        onClick: () => props.context.runAction("transform-translate")
      },
      {
        key: "rotate",
        icon: "rotate",
        label: "reactWorkbench.toolbar.transform.rotate.label",
        title: "reactWorkbench.toolbar.transform.rotate.title",
        pressed: toolbar.value.transformMode === "rotate",
        onClick: () => props.context.runAction("transform-rotate")
      },
      {
        key: "scale",
        icon: "scale",
        label: "reactWorkbench.toolbar.transform.scale.label",
        title: "reactWorkbench.toolbar.transform.scale.title",
        pressed: toolbar.value.transformMode === "scale",
        onClick: () => props.context.runAction("transform-scale")
      }
    ]
  },
  {
    key: "snap",
    label: "reactWorkbench.toolbar.snap.label",
    commands: [
      {
        key: "snap-move",
        icon: "move",
        label: "reactWorkbench.toolbar.snap.move.label",
        title: "reactWorkbench.toolbar.snap.move.title",
        pressed: toolbar.value.snapEnabled.translate,
        onClick: () => props.context.runAction("toggle-translate-snap")
      },
      {
        key: "snap-rotate",
        icon: "rotate",
        label: "reactWorkbench.toolbar.snap.rotate.label",
        title: "reactWorkbench.toolbar.snap.rotate.title",
        pressed: toolbar.value.snapEnabled.rotate,
        onClick: () => props.context.runAction("toggle-rotate-snap")
      },
      {
        key: "snap-scale",
        icon: "scale",
        label: "reactWorkbench.toolbar.snap.scale.label",
        title: "reactWorkbench.toolbar.snap.scale.title",
        pressed: toolbar.value.snapEnabled.scale,
        onClick: () => props.context.runAction("toggle-scale-snap")
      }
    ]
  },
  {
    key: "selection",
    label: "reactWorkbench.toolbar.selection.label",
    commands: [
      {
        key: "marquee",
        icon: "marquee",
        label: "reactWorkbench.toolbar.selection.marquee.label",
        title: "reactWorkbench.toolbar.selection.marquee.title",
        pressed: props.marqueeSelectionEnabled ?? false,
        onClick: () => emit("toggleMarqueeSelection")
      }
    ]
  },
  {
    key: "helpers",
    label: "reactWorkbench.toolbar.helpers.label",
    commands: [
      {
        key: "grid",
        icon: "grid",
        label: "reactWorkbench.toolbar.helpers.grid.label",
        title: "reactWorkbench.toolbar.helpers.grid.title",
        pressed: toolbar.value.viewportHelpers.grid,
        onClick: () => props.context.toggleViewportHelper("grid")
      },
      {
        key: "floor",
        icon: "floor",
        label: "reactWorkbench.toolbar.helpers.floor.label",
        title: "reactWorkbench.toolbar.helpers.floor.title",
        pressed: toolbar.value.viewportHelpers.floor,
        onClick: () => props.context.toggleViewportHelper("floor")
      },
      {
        key: "axes",
        icon: "axes",
        label: "reactWorkbench.toolbar.helpers.axes.label",
        title: "reactWorkbench.toolbar.helpers.axes.title",
        pressed: toolbar.value.viewportHelpers.axes,
        onClick: () => props.context.toggleViewportHelper("axes")
      },
      {
        key: "hover",
        icon: "hover",
        label: "reactWorkbench.toolbar.helpers.hover.label",
        title: "reactWorkbench.toolbar.helpers.hover.title",
        pressed: toolbar.value.viewportHelpers.hover,
        onClick: () => props.context.toggleViewportHelper("hover")
      },
      {
        key: "bounds",
        icon: "bounds",
        label: "reactWorkbench.toolbar.helpers.bounds.label",
        title: "reactWorkbench.toolbar.helpers.bounds.title",
        pressed: toolbar.value.viewportHelpers.selectionBounds,
        onClick: () => props.context.toggleViewportHelper("selectionBounds")
      },
      {
        key: "guide",
        icon: "snap",
        label: "reactWorkbench.toolbar.helpers.guide.label",
        title: "reactWorkbench.toolbar.helpers.guide.title",
        pressed: toolbar.value.viewportHelpers.snapFeedback,
        onClick: () => props.context.toggleViewportHelper("snapFeedback")
      },
      {
        key: "lights",
        icon: "lights",
        label: "reactWorkbench.toolbar.helpers.lights.label",
        title: "reactWorkbench.toolbar.helpers.lights.title",
        pressed: toolbar.value.viewportHelpers.lightGizmos,
        onClick: () => props.context.toggleViewportHelper("lightGizmos")
      },
      {
        key: "targets",
        icon: "targets",
        label: "reactWorkbench.toolbar.helpers.targets.label",
        title: "reactWorkbench.toolbar.helpers.targets.title",
        pressed: toolbar.value.viewportHelpers.lightTargets,
        onClick: () => props.context.toggleViewportHelper("lightTargets")
      },
      {
        key: "shadow-camera",
        icon: "shadow-camera",
        label: "reactWorkbench.toolbar.helpers.shadowCam.label",
        title: "reactWorkbench.toolbar.helpers.shadowCam.title",
        pressed: toolbar.value.viewportHelpers.shadowCameras,
        onClick: () => props.context.toggleViewportHelper("shadowCameras")
      }
    ]
  },
  {
    key: "camera",
    label: "reactWorkbench.toolbar.camera.label",
    commands: [
      {
        key: "reset-camera",
        icon: "reset-camera",
        label: "reactWorkbench.toolbar.camera.reset.label",
        title: "reactWorkbench.toolbar.camera.reset.title",
        disabled: !props.context.camera.ready,
        reason: toolbar.value.disabledReasons?.canCaptureCameraView,
        onClick: props.context.resetCamera
      },
      {
        key: "frame-selected",
        icon: "frame-selected",
        label: "reactWorkbench.toolbar.camera.frameSelected.label",
        title: "reactWorkbench.toolbar.camera.frameSelected.title",
        disabled: !toolbar.value.canFrameSelected,
        reason: toolbar.value.disabledReasons?.canFrameSelected,
        onClick: () => props.context.frameSelected()
      },
      {
        key: "frame-all",
        icon: "frame-all",
        label: "reactWorkbench.toolbar.camera.frameAll.label",
        title: "reactWorkbench.toolbar.camera.frameAll.title",
        disabled: !toolbar.value.canFrameAll,
        reason: toolbar.value.disabledReasons?.canFrameAll,
        onClick: () => props.context.frameAll()
      },
      {
        key: "capture-view",
        icon: "capture-view",
        label: "reactWorkbench.toolbar.camera.capture.label",
        title: "reactWorkbench.toolbar.camera.capture.title",
        disabled: !toolbar.value.canCaptureCameraView,
        reason: toolbar.value.disabledReasons?.canCaptureCameraView,
        onClick: captureCameraView
      },
      {
        key: "apply-view",
        icon: "apply-view",
        label: "reactWorkbench.toolbar.camera.apply.label",
        title: "reactWorkbench.toolbar.camera.apply.title",
        disabled: !toolbar.value.canApplyCameraView,
        reason: toolbar.value.disabledReasons?.canApplyCameraView,
        onClick: applyCameraView
      }
    ]
  },
  {
    key: "node",
    label: "reactWorkbench.toolbar.node.label",
    commands: [
      {
        key: "copy",
        icon: "copy",
        label: "reactWorkbench.toolbar.node.copy.label",
        title: "reactWorkbench.toolbar.node.copy.title",
        disabled: !toolbar.value.canCopy,
        reason: toolbar.value.disabledReasons?.canCopy,
        onClick: () => props.context.runAction("copy")
      },
      {
        key: "paste",
        icon: "paste",
        label: "reactWorkbench.toolbar.node.paste.label",
        title: "reactWorkbench.toolbar.node.paste.title",
        disabled: !toolbar.value.canPaste,
        reason: toolbar.value.disabledReasons?.canPaste,
        onClick: () => props.context.runAction("paste")
      },
      {
        key: "duplicate",
        icon: "duplicate",
        label: "reactWorkbench.toolbar.node.duplicate.label",
        title: "reactWorkbench.toolbar.node.duplicate.title",
        disabled: !toolbar.value.canDuplicate,
        reason: toolbar.value.disabledReasons?.canDuplicate,
        onClick: () => props.context.runAction("duplicate")
      },
      {
        key: "delete",
        icon: "delete",
        label: "reactWorkbench.toolbar.node.delete.label",
        title: "reactWorkbench.toolbar.node.delete.title",
        disabled: !toolbar.value.canDelete,
        reason: toolbar.value.disabledReasons?.canDelete,
        onClick: () => props.context.runAction("delete")
      },
      {
        key: "group",
        icon: "group",
        label: "reactWorkbench.toolbar.node.group.label",
        title: "reactWorkbench.toolbar.node.group.title",
        disabled: !toolbar.value.canGroup,
        reason: toolbar.value.disabledReasons?.canGroup,
        onClick: () => props.context.runAction("group")
      },
      {
        key: "ungroup",
        icon: "ungroup",
        label: "reactWorkbench.toolbar.node.ungroup.label",
        title: "reactWorkbench.toolbar.node.ungroup.title",
        disabled: !toolbar.value.canUngroup,
        reason: toolbar.value.disabledReasons?.canUngroup,
        onClick: () => props.context.runAction("ungroup")
      },
      {
        key: "select-all",
        icon: "select-all",
        label: "reactWorkbench.toolbar.node.selectAll.label",
        title: "reactWorkbench.toolbar.node.selectAll.title",
        disabled: !toolbar.value.canSelectAll,
        reason: toolbar.value.disabledReasons?.canSelectAll,
        onClick: () => props.context.runAction("select-all")
      },
      {
        key: "clear-selection",
        icon: "clear-selection",
        label: "reactWorkbench.toolbar.node.clear.label",
        title: "reactWorkbench.toolbar.node.clear.title",
        disabled: !toolbar.value.canClearSelection,
        reason: toolbar.value.disabledReasons?.canClearSelection,
        onClick: () => props.context.runAction("clear-selection")
      }
    ]
  }
]);

function captureCameraView(): void {
  const captured = props.context.captureCameraView({ name: t("reactWorkbench.toolbar.camera.defaultName", { count: props.context.model.project.cameraViewCount + 1 }) });
  if (!captured) {
    return;
  }

  const view = createAuthoredCameraViewInput(props.context.snapshot.cameras, captured);
  const result = props.context.dispatch({ type: "create-camera-view", view });
  if (result.ok) {
    props.context.setActiveCameraViewId(view.id ?? null);
  }
}

function applyCameraView(): void {
  const view = props.context.activeCameraViewId
    ? props.context.snapshot.cameras[props.context.activeCameraViewId]
    : null;
  if (view) {
    props.context.applyCameraView(view);
  }
}

</script>
