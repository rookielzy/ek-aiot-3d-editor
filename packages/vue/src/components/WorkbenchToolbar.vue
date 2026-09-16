<template>
  <div ref="root" class="ek-workbench__default-toolbar" :aria-label="t('reactWorkbench.toolbar.controls.label')" @focusout="onFocusOut" @keydown.capture="onKeyDown">
    <button ref="trigger" type="button" class="ek-workbench__command-button" :aria-expanded="menuOpen" :aria-controls="menuId" @click="menuOpen = !menuOpen">
      {{ t("reactWorkbench.toolbar.project.menu") }}
    </button>
    <div ref="menu" :id="menuId" class="ek-workbench__project-menu" role="region" :hidden="!menuOpen" :aria-label="t('reactWorkbench.toolbar.project.label')">
    <div class="ek-workbench__tool-group ek-workbench__tool-group--project">
      <button class="ek-workbench__command-button ek-workbench__command-button--primary" type="button" :disabled="busy" :title="t('reactWorkbench.toolbar.project.open.title')" @click="fileInput?.click()">
        <WorkbenchIcon name="open" />
        <span>{{ t("reactWorkbench.toolbar.project.open.label") }}</span>
      </button>
      <input
        ref="fileInput"
        class="ek-workbench__file-input"
        type="file"
        :aria-label="t('reactWorkbench.toolbar.project.open.title')"
        :disabled="busy"
        :accept="ACCEPT_PROJECT_PACKAGE"
        @change="openProject"
      />
      <button class="ek-workbench__command-button" type="button" :disabled="busy" :title="t('reactWorkbench.toolbar.project.export.title')" @click="exportProject(false)">
        <WorkbenchIcon name="export" />
        <span>{{ t("reactWorkbench.toolbar.project.export.label") }}</span>
      </button>
      <button class="ek-workbench__command-button" type="button" :disabled="busy" :title="t('reactWorkbench.toolbar.project.exportPartial.title')" @click="exportProject(true)">
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
    </div>

    <span role="status" aria-live="polite" class="ek-workbench__toolbar-status" :data-tone="projectStatus.tone">
      <span class="ek-workbench__toolbar-status-label">{{ t("reactWorkbench.toolbar.status.label") }}</span>
      {{ projectStatusLabel }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import type { MessageDescriptor, Problem, ProjectExportResult } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchLocale, WorkbenchMessageKey, WorkbenchMessageValues } from "../i18n/workbench-i18n";
import WorkbenchIcon from "./WorkbenchIcon.vue";

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

const root = ref<HTMLDivElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const menu = ref<HTMLDivElement | null>(null);
const menuId = `project-menu-${useId()}`;
const menuOpen = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const projectStatus = ref<ProjectActionStatus>({
  tone: "neutral"
});
const showLocaleSwitcher = computed(() => props.showLocaleSwitcher ?? true);
const localeSwitcherDisabled = computed(() => props.localeSwitcherDisabled ?? false);
const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: WorkbenchMessageValues) => props.context.i18n.t(message, values);
const projectStatusLabel = computed(() => projectStatus.value.message
  ? props.context.i18n.t(projectStatus.value.message)
  : props.context.i18n.t(props.context.model.project.statusLabelDescriptor ?? {
      key: "workbench.project.status.partial.label",
      fallback: props.context.model.project.statusLabel
    }));

watch(menuOpen, async (open) => {
  if (open) {
    await nextTick();
    menu.value?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }
});

function dismiss(event: PointerEvent): void {
  if (event.target instanceof Node && !root.value?.contains(event.target)) {
    menuOpen.value = false;
  }
}

onMounted(() => document.addEventListener("pointerdown", dismiss, true));
onBeforeUnmount(() => document.removeEventListener("pointerdown", dismiss, true));

function closeMenu(): void {
  menuOpen.value = false;
  trigger.value?.focus();
}

function onFocusOut(event: FocusEvent): void {
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget)) {
    menuOpen.value = false;
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (menuOpen.value && event.key === "Escape") {
    event.stopPropagation();
    closeMenu();
  }
}

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
  closeMenu();
  try {
    const packageBytes = new Uint8Array(await file.arrayBuffer());
    const result = props.context.importProject(packageBytes);
    emit("projectProblems", result.problems);
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
  closeMenu();
  try {
    const result = props.context.exportProject({ partial });
    emit("projectProblems", result.problems);
    if (!result.packageBytes) {
      projectStatus.value = errorProjectStatus(result.problems[0]?.display?.titleDescriptor,
        "reactWorkbench.toolbar.status.exportFailed.message", "Project export failed");
      return;
    }
    const packageBytes = await resolvePackageBytes(result);
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

async function resolvePackageBytes(result: ProjectExportResult): Promise<Uint8Array> {
  const packageBytes = result.packageBytes;
  if (!packageBytes) {
    return new Uint8Array();
  }
  return packageBytes instanceof Uint8Array ? packageBytes : packageBytes;
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
</script>
