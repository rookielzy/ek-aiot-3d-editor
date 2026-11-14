<template>
  <div class="ek-workbench__viewport-tools" :aria-label="t('reactWorkbench.toolbar.tools.label')">
    <div class="ek-workbench__viewport-tool-strip">
      <div v-for="group in directGroups" :key="group.key" class="ek-workbench__tool-group" role="group" :aria-label="t(group.label)">
        <button v-for="command in group.commands" :key="command.key" :data-ek-discard-draft="command.key === 'undo' || command.key === 'redo' ? '' : undefined"
          class="ek-workbench__command-button ek-workbench__command-button--icon"
          type="button" :title="[t(command.title), command.disabled && command.reason ? t(command.reason) : undefined].filter(Boolean).join(' — ')"
          :aria-label="t(command.label)" :aria-keyshortcuts="command.shortcut"
          :aria-description="command.disabled && command.reason ? t(command.reason) : undefined"
          :disabled="command.disabled" :aria-pressed="command.pressed" @click="command.onClick">
          <WorkbenchIcon :name="command.icon" />
          <span>{{ t(command.label) }}</span>
          <small v-if="group.key === 'snap'" class="ek-workbench__snap-mark" aria-hidden="true"><WorkbenchIcon name="snap" /></small>
        </button>
      </div>
      <div class="ek-workbench__tool-group">
        <CommandMenu v-for="group in secondaryGroups" :key="group.key" :label="t(group.label)" :trigger-label="t(group.label)"
          :icon="group.key === 'helpers' ? 'grid' : group.key === 'camera' ? 'capture-view' : 'group'" :commands="group.commands" compact />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { createAuthoredCameraViewInput, type MessageDescriptor } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import WorkbenchIcon, { type WorkbenchIconName } from "./WorkbenchIcon.vue";
import CommandMenu from "./ui/CommandMenu.vue";
import { workbenchNodeCommands } from "./workbench-node-commands";

interface CommandButton {
  key: string;
  icon: WorkbenchIconName;
  label: WorkbenchMessageKey;
  title: WorkbenchMessageKey;
  onClick(): void;
  disabled?: boolean;
  reason?: MessageDescriptor;
  pressed?: boolean;
  shortcut?: string;
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
const menuGroups = ["helpers", "camera", "node"];
const directGroups = computed(() => commandGroups.value.filter((group) => !menuGroups.includes(group.key)));
const secondaryGroups = computed(() => commandGroups.value
  .filter((group) => menuGroups.includes(group.key))
  .map((group) => ({
    ...group,
    commands: group.commands.map((command) => ({
      ...command,
      label: t(command.label),
      title: t(command.title),
      reason: command.reason ? t(command.reason) : undefined
    }))
  })));

const helperKeys = ["grid", "floor", "axes", "hover", "selectionBounds", "snapFeedback", "lightGizmos", "lightTargets", "shadowCameras"] as const;
const allHelpersVisible = computed(() => helperKeys.every((key) => toolbar.value.viewportHelpers[key]));
const primary = /mac|iphone|ipad/i.test(typeof navigator === "undefined" ? "" : navigator.platform) ? "Meta" : "Control";

const toolbar = computed(() => props.context.model.toolbar);
const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: WorkbenchMessageValues) => props.context.i18n.t(message, values);
const commandGroups = computed<CommandGroup[]>(() => [
  {
    key: "history",
    label: "reactWorkbench.toolbar.history.label",
    commands: [
      {
        key: "undo",
        shortcut: `${primary}+Z ${primary === "Meta" ? "Control" : "Meta"}+Z`,
        icon: "undo",
        label: "reactWorkbench.toolbar.history.undo.label",
        title: "reactWorkbench.toolbar.history.undo.title",
        disabled: !toolbar.value.canUndo,
        reason: toolbar.value.disabledReasons?.canUndo,
        onClick: () => props.context.runAction("undo")
      },
      {
        key: "redo",
        shortcut: `${primary}+Shift+Z ${primary}+Y`,
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
        shortcut: "W",
        icon: "move",
        label: "reactWorkbench.toolbar.transform.move.label",
        title: "reactWorkbench.toolbar.transform.move.title",
        pressed: toolbar.value.transformMode === "translate",
        onClick: () => props.context.runAction("transform-translate")
      },
      {
        key: "rotate",
        shortcut: "E",
        icon: "rotate",
        label: "reactWorkbench.toolbar.transform.rotate.label",
        title: "reactWorkbench.toolbar.transform.rotate.title",
        pressed: toolbar.value.transformMode === "rotate",
        onClick: () => props.context.runAction("transform-rotate")
      },
      {
        key: "scale",
        shortcut: "R",
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
        shortcut: `${primary}+Alt+W`,
        icon: "move",
        label: "reactWorkbench.toolbar.snap.move.label",
        title: "reactWorkbench.toolbar.snap.move.title",
        pressed: toolbar.value.snapEnabled.translate,
        onClick: () => props.context.runAction("toggle-translate-snap")
      },
      {
        key: "snap-rotate",
        shortcut: `${primary}+Alt+E`,
        icon: "rotate",
        label: "reactWorkbench.toolbar.snap.rotate.label",
        title: "reactWorkbench.toolbar.snap.rotate.title",
        pressed: toolbar.value.snapEnabled.rotate,
        onClick: () => props.context.runAction("toggle-rotate-snap")
      },
      {
        key: "snap-scale",
        shortcut: `${primary}+Alt+R`,
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
      },
      {
        key: "helpers-all",
        icon: "grid",
        label: "reactWorkbench.toolbar.helpers.toggleAll",
        title: "reactWorkbench.toolbar.helpers.toggleAll",
        pressed: allHelpersVisible.value,
        onClick: () => {
          const visible = !allHelpersVisible.value;
          if (props.context.editor.viewportHelpers) {
            props.context.editor.viewportHelpers.setVisibility(Object.fromEntries(helperKeys.map((key) => [key, visible])));
            return;
          }
          helperKeys.filter((key) => toolbar.value.viewportHelpers[key] !== visible)
            .forEach((key) => props.context.toggleViewportHelper(key));
        }
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
        reason: { key: "reactWorkbench.toolbar.camera.reset.reason", fallback: "Wait for the viewport to be ready." },
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
    commands: workbenchNodeCommands(props.context, { primary })
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
