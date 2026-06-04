<template>
  <div class="ek-workbench__default-toolbar" aria-label="Editor controls">
    <div class="ek-workbench__tool-group" aria-label="Project actions">
      <button type="button" title="Open project package" @click="fileInput?.click()">
        Open
      </button>
      <input
        ref="fileInput"
        class="ek-workbench__file-input"
        type="file"
        :accept="ACCEPT_PROJECT_PACKAGE"
        @change="openProject"
      />
      <button type="button" title="Export complete project" @click="exportProject(false)">
        Export
      </button>
      <button type="button" title="Export partial project" @click="exportProject(true)">
        Export partial
      </button>
    </div>

    <div class="ek-workbench__tool-group" aria-label="History">
      <button type="button" title="Undo" :disabled="!toolbar.canUndo" @click="context.runAction('undo')">
        Undo
      </button>
      <button type="button" title="Redo" :disabled="!toolbar.canRedo" @click="context.runAction('redo')">
        Redo
      </button>
    </div>

    <div class="ek-workbench__tool-group" aria-label="Transform mode">
      <button type="button" title="Move mode" :aria-pressed="toolbar.transformMode === 'translate'" @click="context.runAction('transform-translate')">
        Move
      </button>
      <button type="button" title="Rotate mode" :aria-pressed="toolbar.transformMode === 'rotate'" @click="context.runAction('transform-rotate')">
        Rotate
      </button>
      <button type="button" title="Scale mode" :aria-pressed="toolbar.transformMode === 'scale'" @click="context.runAction('transform-scale')">
        Scale
      </button>
    </div>

    <div class="ek-workbench__tool-group" aria-label="Snap">
      <button type="button" title="Toggle move snap" :aria-pressed="toolbar.snapEnabled.translate" @click="context.runAction('toggle-translate-snap')">
        Snap move
      </button>
      <button type="button" title="Toggle rotate snap" :aria-pressed="toolbar.snapEnabled.rotate" @click="context.runAction('toggle-rotate-snap')">
        Snap rotate
      </button>
      <button type="button" title="Toggle scale snap" :aria-pressed="toolbar.snapEnabled.scale" @click="context.runAction('toggle-scale-snap')">
        Snap scale
      </button>
    </div>

    <div class="ek-workbench__tool-group" aria-label="Camera">
      <button type="button" title="Reset camera" :disabled="!context.camera.ready" @click="context.resetCamera">
        Reset
      </button>
      <button type="button" title="Frame selected" :disabled="!toolbar.canFrameSelected" @click="context.frameSelected()">
        Frame sel
      </button>
      <button type="button" title="Frame all" :disabled="!toolbar.canFrameAll" @click="context.frameAll()">
        Frame all
      </button>
    </div>

    <div class="ek-workbench__tool-group" aria-label="Node operations">
      <button type="button" title="Copy selection" :disabled="!toolbar.canCopy" @click="context.runAction('copy')">
        Copy
      </button>
      <button type="button" title="Paste objects" :disabled="!toolbar.canPaste" @click="context.runAction('paste')">
        Paste
      </button>
      <button type="button" title="Duplicate selection" :disabled="!toolbar.canDuplicate" @click="context.runAction('duplicate')">
        Duplicate
      </button>
      <button type="button" title="Delete selection" :disabled="!toolbar.canDelete" @click="context.runAction('delete')">
        Delete
      </button>
      <button type="button" title="Group selection" :disabled="!toolbar.canGroup" @click="context.runAction('group')">
        Group
      </button>
      <button type="button" title="Ungroup selection" :disabled="!toolbar.canUngroup" @click="context.runAction('ungroup')">
        Ungroup
      </button>
      <button type="button" title="Select all" :disabled="!toolbar.canSelectAll" @click="context.runAction('select-all')">
        Select all
      </button>
      <button type="button" title="Clear selection" :disabled="!toolbar.canClearSelection" @click="context.runAction('clear-selection')">
        Clear
      </button>
    </div>

    <span class="ek-workbench__toolbar-status" :data-tone="projectStatus.tone">
      {{ projectStatus.label }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { ProjectExportResult } from "@ek-aiot/3d-editor-core";
import type { WorkbenchContext } from "../composables/use-workbench";

type ProjectActionStatus = {
  tone: "neutral" | "success" | "warning" | "error";
  label: string;
};

const ACCEPT_PROJECT_PACKAGE = ".ek3d,application/octet-stream";

const props = defineProps<{
  context: WorkbenchContext;
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const projectStatus = ref<ProjectActionStatus>({
  tone: "neutral",
  label: props.context.model.project.statusLabel
});
const toolbar = computed(() => props.context.model.toolbar);

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
      projectStatus.value = { tone: "success", label: `Opened ${file.name}` };
    } else {
      projectStatus.value = { tone: "error", label: result.problems[0]?.message ?? "Project open failed" };
    }
  } catch (error) {
    projectStatus.value = { tone: "error", label: error instanceof Error ? error.message : "Project open failed" };
  }
}

async function exportProject(partial: boolean): Promise<void> {
  const result = props.context.exportProject({ partial });
  if (!result.packageBytes) {
    projectStatus.value = {
      tone: "error",
      label: result.problems[0]?.message ?? "Project export failed"
    };
    return;
  }

  try {
    const packageBytes = await resolvePackageBytes(result);
    downloadPackage(packageBytes, `${props.context.model.project.sceneName || "scene"}.ek3d`);
    projectStatus.value = {
      tone: result.ok ? "success" : "warning",
      label: result.ok ? "Exported project" : `Exported partial project (${result.problems.length} problems)`
    };
  } catch (error) {
    projectStatus.value = { tone: "error", label: error instanceof Error ? error.message : "Project export failed" };
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
</script>
