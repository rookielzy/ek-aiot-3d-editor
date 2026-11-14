<template>
  <div class="ek-workbench__default-toolbar" :aria-label="t('reactWorkbench.toolbar.controls.label')">
    <CommandMenu :trigger-label="t('reactWorkbench.toolbar.project.menu')" :label="t('reactWorkbench.toolbar.project.label')"
      icon="open" :commands="projectCommands" />
    <input
      ref="fileInput"
      class="ek-workbench__file-input"
      type="file"
      tabindex="-1"
      :aria-label="t('reactWorkbench.toolbar.project.open.title')"
      :disabled="busy"
      :accept="ACCEPT_PROJECT_PACKAGE"
      @change="openProject"
    />
    <span role="status" aria-live="polite" class="ek-workbench__toolbar-status" :data-tone="projectStatus.tone">
      <span class="ek-workbench__toolbar-status-label">{{ t("reactWorkbench.toolbar.status.label") }}</span>
      {{ projectStatusLabel }}
    </span>
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
    <button
      v-if="showLocaleSwitcher"
      type="button"
      class="ek-workbench__command-button"
      :lang="nextLocale"
      :title="t('reactWorkbench.toolbar.locale.switch.title')"
      :disabled="localeSwitcherDisabled"
      @click="context.i18n.setLocale(nextLocale)"
    >
      {{ context.i18n.localeLabel(nextLocale) }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { MessageDescriptor, Problem } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchLocale, WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import CommandMenu, { type MenuCommand } from "./ui/CommandMenu.vue";

type ProjectActionStatus = {
  tone: "neutral" | "success" | "warning" | "error";
  message?: MessageDescriptor;
};

const ACCEPT_PROJECT_PACKAGE = ".ek3d,application/octet-stream";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  showLocaleSwitcher?: boolean;
  localeSwitcherDisabled?: boolean;
}>();

const emit = defineEmits<{
  projectProblems: [problems: Problem[]];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const projectStatus = ref<ProjectActionStatus>({
  tone: "neutral"
});
const showLocaleSwitcher = computed(() => props.showLocaleSwitcher ?? true);
const localeSwitcherDisabled = computed(() => props.localeSwitcherDisabled ?? false);
const nextLocale = computed(() => props.context.i18n.locale === "en" ? "zh-CN" : "en");
const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: WorkbenchMessageValues) => props.context.i18n.t(message, values);
const projectStatusLabel = computed(() => projectStatus.value.message
  ? props.context.i18n.t(projectStatus.value.message)
  : props.context.i18n.t(props.context.model.project.statusLabelDescriptor ?? {
      key: "workbench.project.status.partial.label",
      fallback: props.context.model.project.statusLabel
    }));

const projectCommands = computed(() => ([
  { key: "open", label: t("reactWorkbench.toolbar.project.open.label"), title: t("reactWorkbench.toolbar.project.open.title"), icon: "open", onClick: () => fileInput.value?.click() },
  { key: "export", label: t("reactWorkbench.toolbar.project.export.label"), title: t("reactWorkbench.toolbar.project.export.title"), icon: "export", onClick: () => void exportProject(false) },
  { key: "export-partial", label: t("reactWorkbench.toolbar.project.exportPartial.label"), title: t("reactWorkbench.toolbar.project.exportPartial.title"), icon: "export-partial", onClick: () => void exportProject(true) }
] satisfies MenuCommand[]).map((command) => ({
  ...command,
  disabled: busy.value,
  reason: busy.value ? projectStatusLabel.value : undefined
})));

async function openProject(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }

  if (busy.value) {
    return;
  }
  busy.value = true;
  projectStatus.value = { tone: "neutral", message: { key: "reactWorkbench.toolbar.status.opening", fallback: "Opening project..." } };
  try {
    const packageBytes = new Uint8Array(await file.arrayBuffer());
    const result = props.context.importProject(packageBytes);
    emit("projectProblems", result.problems);
    // Broken durable references are repairable authoring damage, not a bad file.
    // Core reports them on both paths: a rejected scene keeps its message in
    // `problems`, an accepted one is classified after the snapshot is replaced.
    if (result.outcome.kind === "config-error") {
      projectStatus.value = configInvalidProjectStatus(result.outcome.problems.length);
      return;
    }
    if (result.ok) {
      projectStatus.value = {
        tone: result.manifest?.completeness === "partial" || result.problems.length ? "warning" : "success",
        message: {
          key: result.manifest?.completeness === "partial"
            ? "reactWorkbench.toolbar.status.openedPartial"
            : result.problems.length
              ? "reactWorkbench.toolbar.status.openedWarnings"
              : "reactWorkbench.toolbar.status.opened.message",
          fallback: "Opened {fileName}",
          values: { fileName: file.name }
        }
      };
      // A restored configuration can need host credentials before preview works.
      if (result.outcome.kind === "reconnect") {
        projectStatus.value = {
          tone: "warning",
          message: {
            key: "reactWorkbench.toolbar.status.openedReconnect.message",
            fallback: "Reconnect required to preview data ({credentialCount} credentials missing)",
            values: { credentialCount: result.outcome.missingCredentialCount, fileName: file.name }
          }
        };
      }
    } else {
      projectStatus.value = errorProjectStatus(result.problems[0]?.display?.titleDescriptor,
        "reactWorkbench.toolbar.status.openFailed.message", "Project open failed");
    }
  } catch (error) {
    reportFailure(error, "open");
  } finally {
    busy.value = false;
  }
}

async function exportProject(partial: boolean): Promise<void> {
  if (busy.value) {
    return;
  }
  busy.value = true;
  projectStatus.value = { tone: "neutral", message: { key: "reactWorkbench.toolbar.status.exporting", fallback: "Exporting project..." } };
  try {
    const result = props.context.exportProject({ partial });
    emit("projectProblems", result.problems);
    if (!result.packageBytes) {
      projectStatus.value = errorProjectStatus(result.problems[0]?.display?.titleDescriptor,
        "reactWorkbench.toolbar.status.exportFailed.message", "Project export failed");
      return;
    }
    const packageBytes = await result.packageBytes;
    if (!downloadPackage(packageBytes, `${props.context.model.project.sceneName || "scene"}.ek3d`)) {
      throw new Error("Project download is unavailable");
    }
    const incomplete = result.manifest?.completeness === "partial";
    projectStatus.value = {
      tone: incomplete || result.problems.length ? "warning" : "success",
      message: {
        key: incomplete
          ? "reactWorkbench.toolbar.status.exportedPartial.message"
          : result.problems.length
            ? "reactWorkbench.toolbar.status.exportedWarnings"
            : "reactWorkbench.toolbar.status.exported.message",
        fallback: "Exported project",
        values: { problemCount: result.problems.length }
      }
    };
  } catch (error) {
    reportFailure(error, "export");
  } finally {
    busy.value = false;
  }
}

function reportFailure(error: unknown, operation: "open" | "export"): void {
  const message: MessageDescriptor = {
    key: operation === "open" ? "reactWorkbench.toolbar.status.openFailed.message" : "reactWorkbench.toolbar.status.exportFailed.message",
    fallback: operation === "open" ? "Project open failed" : "Project export failed"
  };
  projectStatus.value = { tone: "error", message };
  emit("projectProblems", [{
    id: `vue:project-${operation}-failed`,
    code: `project-${operation}-failed`,
    severity: "error",
    source: "command",
    target: { kind: "scene", sceneId: props.context.snapshot.scene.id },
    message: error instanceof Error ? error.message : String(error),
    recoverability: "user-action",
    display: { title: message.fallback, titleDescriptor: message }
  }]);
}

function changeLocale(event: Event): void {
  if (localeSwitcherDisabled.value) {
    return;
  }
  props.context.i18n.setLocale((event.currentTarget as HTMLSelectElement).value as WorkbenchLocale);
}

function downloadPackage(packageBytes: Uint8Array, filename: string): boolean {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof Blob === "undefined"
  ) {
    return false;
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
  return true;
}

function sanitizeFilename(value: string): string {
  const trimmed = value.trim().replace(/[/\\?%*:|"<>]/g, "-");
  return trimmed.endsWith(".ek3d") ? trimmed : `${trimmed || "scene"}.ek3d`;
}

function errorProjectStatus(
  detail: MessageDescriptor | undefined,
  key: WorkbenchMessageKey,
  fallback: string
): ProjectActionStatus {
  if (detail) {
    return { tone: "error", message: detail };
  }
  return {
    tone: "error",
    message: { key, fallback }
  };
}

function configInvalidProjectStatus(problemCount: number): ProjectActionStatus {
  return {
    tone: "error",
    message: {
      key: "reactWorkbench.toolbar.status.openConfigInvalid.message",
      fallback: "Project data configuration is damaged ({problemCount} broken references)",
      values: { problemCount }
    }
  };
}
</script>
