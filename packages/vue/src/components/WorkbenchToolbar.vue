<template>
  <div class="ek-workbench__default-toolbar" :aria-label="t('reactWorkbench.toolbar.controls.label')">
    <div class="ek-workbench__tool-group" :aria-label="t('reactWorkbench.toolbar.project.label')">
      <button type="button" :title="t('reactWorkbench.toolbar.project.open.title')" @click="fileInput?.click()">
        {{ t("reactWorkbench.toolbar.project.open.label") }}
      </button>
      <input
        ref="fileInput"
        class="ek-workbench__file-input"
        type="file"
        :accept="ACCEPT_PROJECT_PACKAGE"
        @change="openProject"
      />
      <button type="button" :title="t('reactWorkbench.toolbar.project.export.title')" @click="exportProject(false)">
        {{ t("reactWorkbench.toolbar.project.export.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.project.exportPartial.title')" @click="exportProject(true)">
        {{ t("reactWorkbench.toolbar.project.exportPartial.label") }}
      </button>
    </div>

    <div class="ek-workbench__tool-group" :aria-label="t('reactWorkbench.toolbar.history.label')">
      <button type="button" :title="t('reactWorkbench.toolbar.history.undo.title')" :disabled="!toolbar.canUndo" @click="context.runAction('undo')">
        {{ t("reactWorkbench.toolbar.history.undo.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.history.redo.title')" :disabled="!toolbar.canRedo" @click="context.runAction('redo')">
        {{ t("reactWorkbench.toolbar.history.redo.label") }}
      </button>
    </div>

    <div class="ek-workbench__tool-group" :aria-label="t('reactWorkbench.toolbar.transform.label')">
      <button type="button" :title="t('reactWorkbench.toolbar.transform.move.title')" :aria-pressed="toolbar.transformMode === 'translate'" @click="context.runAction('transform-translate')">
        {{ t("reactWorkbench.toolbar.transform.move.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.transform.rotate.title')" :aria-pressed="toolbar.transformMode === 'rotate'" @click="context.runAction('transform-rotate')">
        {{ t("reactWorkbench.toolbar.transform.rotate.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.transform.scale.title')" :aria-pressed="toolbar.transformMode === 'scale'" @click="context.runAction('transform-scale')">
        {{ t("reactWorkbench.toolbar.transform.scale.label") }}
      </button>
    </div>

    <div class="ek-workbench__tool-group" :aria-label="t('reactWorkbench.toolbar.snap.label')">
      <button type="button" :title="t('reactWorkbench.toolbar.snap.move.title')" :aria-pressed="toolbar.snapEnabled.translate" @click="context.runAction('toggle-translate-snap')">
        {{ t("reactWorkbench.toolbar.snap.move.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.snap.rotate.title')" :aria-pressed="toolbar.snapEnabled.rotate" @click="context.runAction('toggle-rotate-snap')">
        {{ t("reactWorkbench.toolbar.snap.rotate.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.snap.scale.title')" :aria-pressed="toolbar.snapEnabled.scale" @click="context.runAction('toggle-scale-snap')">
        {{ t("reactWorkbench.toolbar.snap.scale.label") }}
      </button>
    </div>

    <div class="ek-workbench__tool-group" :aria-label="t('reactWorkbench.toolbar.selection.label')">
      <button type="button" :title="t('reactWorkbench.toolbar.selection.marquee.title')" :aria-pressed="marqueeSelectionEnabled" @click="emit('toggleMarqueeSelection')">
        {{ t("reactWorkbench.toolbar.selection.marquee.label") }}
      </button>
    </div>

    <div class="ek-workbench__tool-group" :aria-label="t('reactWorkbench.toolbar.helpers.label')">
      <button type="button" :title="t('reactWorkbench.toolbar.helpers.grid.title')" :aria-pressed="toolbar.viewportHelpers.grid" @click="context.toggleViewportHelper('grid')">
        {{ t("reactWorkbench.toolbar.helpers.grid.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.helpers.floor.title')" :aria-pressed="toolbar.viewportHelpers.floor" @click="context.toggleViewportHelper('floor')">
        {{ t("reactWorkbench.toolbar.helpers.floor.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.helpers.axes.title')" :aria-pressed="toolbar.viewportHelpers.axes" @click="context.toggleViewportHelper('axes')">
        {{ t("reactWorkbench.toolbar.helpers.axes.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.helpers.hover.title')" :aria-pressed="toolbar.viewportHelpers.hover" @click="context.toggleViewportHelper('hover')">
        {{ t("reactWorkbench.toolbar.helpers.hover.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.helpers.bounds.title')" :aria-pressed="toolbar.viewportHelpers.selectionBounds" @click="context.toggleViewportHelper('selectionBounds')">
        {{ t("reactWorkbench.toolbar.helpers.bounds.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.helpers.guide.title')" :aria-pressed="toolbar.viewportHelpers.snapFeedback" @click="context.toggleViewportHelper('snapFeedback')">
        {{ t("reactWorkbench.toolbar.helpers.guide.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.helpers.lights.title')" :aria-pressed="toolbar.viewportHelpers.lightGizmos" @click="context.toggleViewportHelper('lightGizmos')">
        {{ t("reactWorkbench.toolbar.helpers.lights.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.helpers.targets.title')" :aria-pressed="toolbar.viewportHelpers.lightTargets" @click="context.toggleViewportHelper('lightTargets')">
        {{ t("reactWorkbench.toolbar.helpers.targets.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.helpers.shadowCam.title')" :aria-pressed="toolbar.viewportHelpers.shadowCameras" @click="context.toggleViewportHelper('shadowCameras')">
        {{ t("reactWorkbench.toolbar.helpers.shadowCam.label") }}
      </button>
    </div>

    <div class="ek-workbench__tool-group" :aria-label="t('reactWorkbench.toolbar.camera.label')">
      <button type="button" :title="t('reactWorkbench.toolbar.camera.reset.title')" :disabled="!context.camera.ready" @click="context.resetCamera">
        {{ t("reactWorkbench.toolbar.camera.reset.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.camera.frameSelected.title')" :disabled="!toolbar.canFrameSelected" @click="context.frameSelected()">
        {{ t("reactWorkbench.toolbar.camera.frameSelected.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.camera.frameAll.title')" :disabled="!toolbar.canFrameAll" @click="context.frameAll()">
        {{ t("reactWorkbench.toolbar.camera.frameAll.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.camera.capture.title')" :disabled="!toolbar.canCaptureCameraView" @click="captureCameraView">
        {{ t("reactWorkbench.toolbar.camera.capture.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.camera.apply.title')" :disabled="!toolbar.canApplyCameraView" @click="applyCameraView">
        {{ t("reactWorkbench.toolbar.camera.apply.label") }}
      </button>
    </div>

    <div class="ek-workbench__tool-group" :aria-label="t('reactWorkbench.toolbar.node.label')">
      <button type="button" :title="t('reactWorkbench.toolbar.node.copy.title')" :disabled="!toolbar.canCopy" @click="context.runAction('copy')">
        {{ t("reactWorkbench.toolbar.node.copy.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.node.paste.title')" :disabled="!toolbar.canPaste" @click="context.runAction('paste')">
        {{ t("reactWorkbench.toolbar.node.paste.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.node.duplicate.title')" :disabled="!toolbar.canDuplicate" @click="context.runAction('duplicate')">
        {{ t("reactWorkbench.toolbar.node.duplicate.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.node.delete.title')" :disabled="!toolbar.canDelete" @click="context.runAction('delete')">
        {{ t("reactWorkbench.toolbar.node.delete.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.node.group.title')" :disabled="!toolbar.canGroup" @click="context.runAction('group')">
        {{ t("reactWorkbench.toolbar.node.group.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.node.ungroup.title')" :disabled="!toolbar.canUngroup" @click="context.runAction('ungroup')">
        {{ t("reactWorkbench.toolbar.node.ungroup.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.node.selectAll.title')" :disabled="!toolbar.canSelectAll" @click="context.runAction('select-all')">
        {{ t("reactWorkbench.toolbar.node.selectAll.label") }}
      </button>
      <button type="button" :title="t('reactWorkbench.toolbar.node.clear.title')" :disabled="!toolbar.canClearSelection" @click="context.runAction('clear-selection')">
        {{ t("reactWorkbench.toolbar.node.clear.label") }}
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
      {{ projectStatusLabel }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { createAuthoredCameraViewInput, type ProjectExportResult } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchLocale, WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";

type ProjectActionStatus = {
  tone: "neutral" | "success" | "warning" | "error";
  message?: {
    key: WorkbenchMessageKey;
    fallback: string;
    values?: WorkbenchMessageValues;
  };
  fallback?: string;
};

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
