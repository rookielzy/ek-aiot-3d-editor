<template>
  <div class="ek-workbench__default-toolbar" :aria-label="t('reactWorkbench.toolbar.controls.label')">
    <div class="ek-workbench__tool-group ek-workbench__tool-group--project" :aria-label="t('reactWorkbench.toolbar.project.label')">
      <button class="ek-workbench__command-button ek-workbench__command-button--primary" type="button" :title="t('reactWorkbench.toolbar.project.open.title')" @click="fileInput?.click()">
        <WorkbenchIcon name="open" />
        <span>{{ t("reactWorkbench.toolbar.project.open.label") }}</span>
      </button>
      <input
        ref="fileInput"
        class="ek-workbench__file-input"
        type="file"
        :accept="ACCEPT_PROJECT_PACKAGE"
        @change="openProject"
      />
      <button class="ek-workbench__command-button" type="button" :title="t('reactWorkbench.toolbar.project.export.title')" @click="exportProject(false)">
        <WorkbenchIcon name="export" />
        <span>{{ t("reactWorkbench.toolbar.project.export.label") }}</span>
      </button>
      <button class="ek-workbench__command-button" type="button" :title="t('reactWorkbench.toolbar.project.exportPartial.title')" @click="exportProject(true)">
        <WorkbenchIcon name="export-partial" />
        <span>{{ t("reactWorkbench.toolbar.project.exportPartial.label") }}</span>
      </button>
    </div>

    <div v-for="group in commandGroups" :key="group.key" class="ek-workbench__tool-group" :aria-label="t(group.label)">
      <button
        v-for="command in group.commands"
        :key="command.key"
        :class="command.primary ? 'ek-workbench__command-button ek-workbench__command-button--primary' : 'ek-workbench__command-button'"
        type="button"
        :title="t(command.title)"
        :disabled="command.disabled"
        :aria-pressed="typeof command.pressed === 'boolean' ? command.pressed : undefined"
        @click="command.onClick"
      >
        <WorkbenchIcon :name="command.icon" />
        <span>{{ t(command.label) }}</span>
      </button>
    </div>

    <label v-if="showLocaleSwitcher" class="ek-workbench__locale-switcher">
      <span>{{ t("reactWorkbench.toolbar.locale.switch.label") }}</span>
      <select
        :aria-label="t('reactWorkbench.toolbar.locale.switch.label')"
        :title="t('reactWorkbench.toolbar.locale.switch.title')"
        :value="context.i18n.locale"
        :disabled="localeSwitcherDisabled"
        @change="changeLocale"
      >
        <option v-for="locale in context.i18n.supportedLocales" :key="locale" :value="locale">
          {{ context.i18n.localeLabel(locale) }}
        </option>
      </select>
    </label>

    <span class="ek-workbench__toolbar-status" :data-tone="projectStatus.tone">
      <span class="ek-workbench__toolbar-status-label">{{ t("reactWorkbench.toolbar.status.label") }}</span>
      {{ projectStatusLabel }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { createAuthoredCameraViewInput, type ProjectExportResult } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchLocale, WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import WorkbenchIcon, { type WorkbenchIconName } from "./WorkbenchIcon.vue";

type ProjectActionStatus = {
  tone: "neutral" | "success" | "warning" | "error";
  message?: {
    key: WorkbenchMessageKey;
    fallback: string;
    values?: WorkbenchMessageValues;
  };
  fallback?: string;
};

interface CommandButton {
  key: string;
  icon: WorkbenchIconName;
  label: WorkbenchMessageKey;
  title: WorkbenchMessageKey;
  onClick(): void;
  disabled?: boolean;
  pressed?: boolean;
  primary?: boolean;
}

interface CommandGroup {
  key: string;
  label: WorkbenchMessageKey;
  commands: CommandButton[];
}

const ACCEPT_PROJECT_PACKAGE = ".ek3d,application/octet-stream";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  marqueeSelectionEnabled?: boolean;
  showLocaleSwitcher?: boolean;
  localeSwitcherDisabled?: boolean;
}>();
const emit = defineEmits<{
  toggleMarqueeSelection: [];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const projectStatus = ref<ProjectActionStatus>({
  tone: "neutral"
});
const toolbar = computed(() => props.context.model.toolbar);
const showLocaleSwitcher = computed(() => props.showLocaleSwitcher ?? true);
const localeSwitcherDisabled = computed(() => props.localeSwitcherDisabled ?? false);
const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: WorkbenchMessageValues) => props.context.i18n.t(message, values);
const projectStatusLabel = computed(() => projectStatus.value.message
  ? props.context.i18n.t(projectStatus.value.message)
  : projectStatus.value.fallback ?? props.context.i18n.t(props.context.model.project.statusLabelDescriptor ?? {
      key: "workbench.project.status.partial.label",
      fallback: props.context.model.project.statusLabel
    }));
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
        onClick: () => props.context.runAction("undo")
      },
      {
        key: "redo",
        icon: "redo",
        label: "reactWorkbench.toolbar.history.redo.label",
        title: "reactWorkbench.toolbar.history.redo.title",
        disabled: !toolbar.value.canRedo,
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
        primary: true,
        onClick: () => props.context.runAction("transform-translate")
      },
      {
        key: "rotate",
        icon: "rotate",
        label: "reactWorkbench.toolbar.transform.rotate.label",
        title: "reactWorkbench.toolbar.transform.rotate.title",
        pressed: toolbar.value.transformMode === "rotate",
        primary: true,
        onClick: () => props.context.runAction("transform-rotate")
      },
      {
        key: "scale",
        icon: "scale",
        label: "reactWorkbench.toolbar.transform.scale.label",
        title: "reactWorkbench.toolbar.transform.scale.title",
        pressed: toolbar.value.transformMode === "scale",
        primary: true,
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
        icon: "snap",
        label: "reactWorkbench.toolbar.snap.move.label",
        title: "reactWorkbench.toolbar.snap.move.title",
        pressed: toolbar.value.snapEnabled.translate,
        onClick: () => props.context.runAction("toggle-translate-snap")
      },
      {
        key: "snap-rotate",
        icon: "snap",
        label: "reactWorkbench.toolbar.snap.rotate.label",
        title: "reactWorkbench.toolbar.snap.rotate.title",
        pressed: toolbar.value.snapEnabled.rotate,
        onClick: () => props.context.runAction("toggle-rotate-snap")
      },
      {
        key: "snap-scale",
        icon: "snap",
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
        onClick: props.context.resetCamera
      },
      {
        key: "frame-selected",
        icon: "frame-selected",
        label: "reactWorkbench.toolbar.camera.frameSelected.label",
        title: "reactWorkbench.toolbar.camera.frameSelected.title",
        disabled: !toolbar.value.canFrameSelected,
        onClick: () => props.context.frameSelected()
      },
      {
        key: "frame-all",
        icon: "frame-all",
        label: "reactWorkbench.toolbar.camera.frameAll.label",
        title: "reactWorkbench.toolbar.camera.frameAll.title",
        disabled: !toolbar.value.canFrameAll,
        onClick: () => props.context.frameAll()
      },
      {
        key: "capture-view",
        icon: "capture-view",
        label: "reactWorkbench.toolbar.camera.capture.label",
        title: "reactWorkbench.toolbar.camera.capture.title",
        disabled: !toolbar.value.canCaptureCameraView,
        onClick: captureCameraView
      },
      {
        key: "apply-view",
        icon: "apply-view",
        label: "reactWorkbench.toolbar.camera.apply.label",
        title: "reactWorkbench.toolbar.camera.apply.title",
        disabled: !toolbar.value.canApplyCameraView,
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
        onClick: () => props.context.runAction("copy")
      },
      {
        key: "paste",
        icon: "paste",
        label: "reactWorkbench.toolbar.node.paste.label",
        title: "reactWorkbench.toolbar.node.paste.title",
        disabled: !toolbar.value.canPaste,
        onClick: () => props.context.runAction("paste")
      },
      {
        key: "duplicate",
        icon: "duplicate",
        label: "reactWorkbench.toolbar.node.duplicate.label",
        title: "reactWorkbench.toolbar.node.duplicate.title",
        disabled: !toolbar.value.canDuplicate,
        onClick: () => props.context.runAction("duplicate")
      },
      {
        key: "delete",
        icon: "delete",
        label: "reactWorkbench.toolbar.node.delete.label",
        title: "reactWorkbench.toolbar.node.delete.title",
        disabled: !toolbar.value.canDelete,
        onClick: () => props.context.runAction("delete")
      },
      {
        key: "group",
        icon: "group",
        label: "reactWorkbench.toolbar.node.group.label",
        title: "reactWorkbench.toolbar.node.group.title",
        disabled: !toolbar.value.canGroup,
        onClick: () => props.context.runAction("group")
      },
      {
        key: "ungroup",
        icon: "ungroup",
        label: "reactWorkbench.toolbar.node.ungroup.label",
        title: "reactWorkbench.toolbar.node.ungroup.title",
        disabled: !toolbar.value.canUngroup,
        onClick: () => props.context.runAction("ungroup")
      },
      {
        key: "select-all",
        icon: "select-all",
        label: "reactWorkbench.toolbar.node.selectAll.label",
        title: "reactWorkbench.toolbar.node.selectAll.title",
        disabled: !toolbar.value.canSelectAll,
        onClick: () => props.context.runAction("select-all")
      },
      {
        key: "clear-selection",
        icon: "clear-selection",
        label: "reactWorkbench.toolbar.node.clear.label",
        title: "reactWorkbench.toolbar.node.clear.title",
        disabled: !toolbar.value.canClearSelection,
        onClick: () => props.context.runAction("clear-selection")
      }
    ]
  }
]);

async function openProject(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }

  try {
    const packageBytes = new Uint8Array(await file.arrayBuffer());
    const result = props.context.importProject(packageBytes);
    if (result.ok) {
      projectStatus.value = {
        tone: "success",
        message: {
          key: "reactWorkbench.toolbar.status.opened.message",
          fallback: "Opened {fileName}",
          values: { fileName: file.name }
        }
      };
    } else {
      projectStatus.value = errorProjectStatus(
        "reactWorkbench.toolbar.status.openFailed.message",
        "Project open failed",
        result.problems[0]?.message
      );
    }
  } catch (error) {
    projectStatus.value = errorProjectStatus(
      "reactWorkbench.toolbar.status.openFailed.message",
      "Project open failed",
      error instanceof Error ? error.message : undefined
    );
  }
}

async function exportProject(partial: boolean): Promise<void> {
  const result = props.context.exportProject({ partial });
  if (!result.packageBytes) {
    projectStatus.value = errorProjectStatus(
      "reactWorkbench.toolbar.status.exportFailed.message",
      "Project export failed",
      result.problems[0]?.message
    );
    return;
  }

  try {
    const packageBytes = await resolvePackageBytes(result);
    downloadPackage(packageBytes, `${props.context.model.project.sceneName || "scene"}.ek3d`);
    projectStatus.value = {
      tone: result.ok ? "success" : "warning",
      message: result.ok
        ? {
            key: "reactWorkbench.toolbar.status.exported.message",
            fallback: "Exported project"
          }
        : {
            key: "reactWorkbench.toolbar.status.exportedPartial.message",
            fallback: "Exported partial project ({problemCount} problems)",
            values: { problemCount: result.problems.length }
          }
    };
  } catch (error) {
    projectStatus.value = errorProjectStatus(
      "reactWorkbench.toolbar.status.exportFailed.message",
      "Project export failed",
      error instanceof Error ? error.message : undefined
    );
  }
}

function changeLocale(event: Event): void {
  if (localeSwitcherDisabled.value) {
    return;
  }
  props.context.i18n.setLocale((event.currentTarget as HTMLSelectElement).value as WorkbenchLocale);
}

function captureCameraView(): void {
  const captured = props.context.captureCameraView({ name: `Camera view ${props.context.model.project.cameraViewCount + 1}` });
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

async function resolvePackageBytes(result: ProjectExportResult): Promise<Uint8Array> {
  const packageBytes = result.packageBytes;
  if (!packageBytes) {
    return new Uint8Array();
  }
  return packageBytes instanceof Uint8Array ? packageBytes : packageBytes;
}

function downloadPackage(packageBytes: Uint8Array, filename: string): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof Blob === "undefined"
  ) {
    return;
  }

  const payload = new ArrayBuffer(packageBytes.byteLength);
  new Uint8Array(payload).set(packageBytes);
  const blob = new Blob([payload], { type: "application/octet-stream" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = sanitizeFilename(filename);
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  if (typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(objectUrl);
  }
}

function sanitizeFilename(value: string): string {
  const trimmed = value.trim().replace(/[/\\?%*:|"<>]/g, "-");
  return trimmed.endsWith(".ek3d") ? trimmed : `${trimmed || "scene"}.ek3d`;
}

function errorProjectStatus(
  key: WorkbenchMessageKey,
  fallback: string,
  detail?: string
): ProjectActionStatus {
  return {
    tone: "error",
    message: {
      key: detail ? projectFailureDetailKey(key) : key,
      fallback: detail ? `${fallback}: {detail}` : fallback,
      ...(detail ? { values: { detail } } : {})
    }
  };
}

function projectFailureDetailKey(key: WorkbenchMessageKey): WorkbenchMessageKey {
  if (key === "reactWorkbench.toolbar.status.openFailed.message") {
    return "reactWorkbench.toolbar.status.openFailedDetail.message";
  }
  if (key === "reactWorkbench.toolbar.status.exportFailed.message") {
    return "reactWorkbench.toolbar.status.exportFailedDetail.message";
  }
  return key;
}
</script>
