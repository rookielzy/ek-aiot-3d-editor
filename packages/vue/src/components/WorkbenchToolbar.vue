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
import type { ProjectExportResult } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchLocale, WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import WorkbenchIcon from "./WorkbenchIcon.vue";

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
  showLocaleSwitcher?: boolean;
  localeSwitcherDisabled?: boolean;
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const projectStatus = ref<ProjectActionStatus>({
  tone: "neutral"
});
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
