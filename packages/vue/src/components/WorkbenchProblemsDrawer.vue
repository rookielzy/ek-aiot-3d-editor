<template>
  <section
    :id="id"
    class="ek-workbench__problems-drawer"
    :hidden="!open"
    :aria-label="t('reactWorkbench.problems.details')"
    @keydown.capture="onKeyDown"
  >
    <header>
      <h2>{{ t("reactWorkbench.problems.details") }}</h2>
      <small v-if="context.model.problems.totalCount > 0" class="ek-workbench__problems-summary">{{ t("reactWorkbench.status.severitySummary", { errorCount: context.model.problems.bySeverity.error, warningCount: context.model.problems.bySeverity.warning, infoCount: context.model.problems.bySeverity.info }) }}</small>
      <button ref="closeButton" type="button" @click="emit('close')">
        {{ t("reactWorkbench.problems.close") }}
      </button>
    </header>
    <p v-if="context.model.problems.totalCount === 0">{{ t("reactWorkbench.problems.empty") }}</p>
    <ul class="ek-workbench__problem-list">
      <li
      v-for="problem in problems"
        :key="`${problem.id}:${problem.assetId ?? ''}:${problem.objectId ?? ''}`"
        :data-severity="problem.severity"
      >
        <div class="ek-workbench__problem-head">
          <strong>{{ problem.titleDescriptor ? t(problem.titleDescriptor) : problem.title }}</strong>
          <small>{{ t("reactWorkbench.problems.severity") }} {{ renderSeverity(context.i18n, problem.severity) }} · {{ t("reactWorkbench.problems.source") }} {{ renderProblemSource(context.i18n, problem.source) }}</small>
        </div>
        <dl class="ek-workbench__problem-facts">
          <div><dt>{{ t("reactWorkbench.problems.target") }}</dt><dd>{{ renderTarget(problem.target) }}</dd></div>
          <div v-if="problem.detail || problem.detailDescriptor"><dt>{{ t("reactWorkbench.problems.detail") }}</dt><dd>{{ problem.detailDescriptor ? t(problem.detailDescriptor) : problem.detail }}</dd></div>
        </dl>
        <div class="ek-workbench__problem-actions">
          <button v-if="locateProblemRequest(problem, context.model)" type="button" @click="locate(problem)">{{ t("reactWorkbench.problems.locate") }}</button>
        <label v-if="problem.assetId && problem.recoverability === 'user-action'" class="ek-workbench__file-action">
          <span>{{ problem.actionLabelDescriptor ? t(problem.actionLabelDescriptor) : problem.actionLabel ?? t("reactWorkbench.inspector.problems.replaceAsset.label") }}</span>
          <input type="file" :disabled="busy.includes(problem.assetId)" @change="recover(problem.assetId, $event)" />
        </label>
          <small v-if="problem.assetId && progress[problem.assetId]" role="status">{{ renderStatusMessage(context.i18n, progress[problem.assetId]) }}</small>
        </div>
      </li>
    </ul>
    <div v-if="Object.keys(feedback).length > 0" class="ek-workbench__problem-results" role="status" :aria-label="t('reactWorkbench.problems.results.label')">
      <p v-for="(message, assetId) in feedback" :key="assetId">
        {{ assetId }} · <span>{{ renderStatusMessage(context.i18n, message) }}</span>
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { ProblemSeverity, ProblemTarget, WorkbenchProblemItem } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageInput } from "../i18n/workbench-i18n";
import { renderProblemSource, renderSeverity } from "./inspector-i18n";
import { locateProblemRequest, type ProblemLocateRequest } from "./problem-locate";
import { replaceAssetFile, serializeAssetMaintenance } from "./asset-maintenance";
import { renderStatusMessage, localizedStatusMessage, type LocalizedStatusMessage } from "./asset-workspace-status";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  id: string;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  locate: [request: ProblemLocateRequest];
}>();

const closeButton = ref<HTMLButtonElement | null>(null);
const pending = new Set<string>();
const busy = ref<string[]>([]);
const feedback = ref<Record<string, LocalizedStatusMessage>>({});
const progress = ref<Record<string, LocalizedStatusMessage>>({});
const t = (message: WorkbenchMessageInput, values?: Record<string, string | number>) => props.context.i18n.t(message, values);
const problems = computed(() => [...props.context.model.problems.items].sort((left, right) => severityOrder[right.severity] - severityOrder[left.severity]));

watch(() => props.open, async (open) => {
  if (open) {
    await nextTick();
    closeButton.value?.focus();
  }
});

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape" && !event.defaultPrevented && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    event.stopPropagation();
    emit("close");
  }
}

function locate(problem: WorkbenchProblemItem): void {
  const request = locateProblemRequest(problem, props.context.model);
  if (!request) return;
  emit("locate", request);
  emit("close");
}

function renderTarget(target: ProblemTarget): string {
  const kind = t({
    key: `reactWorkbench.problems.target.${target.kind}`,
    fallback: target.kind
  });
  const detail = Object.entries(target)
    .filter(([key]) => key !== "kind")
    .map(([, value]) => value)
    .join(" · ");
  return `${t("reactWorkbench.problems.target")} · ${kind}${detail ? ` · ${detail}` : ""}`;
}

async function recover(assetId: string, event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || pending.has(assetId)) {
    return;
  }

  pending.add(assetId);
  busy.value = [...pending];
  progress.value = { ...progress.value, [assetId]: localizedStatusMessage("reactWorkbench.leftPanel.assets.replace.progress", "Replacing...") };
  try {
    const result = await serializeAssetMaintenance(props.context.editor, assetId, () => replaceAssetFile(props.context, assetId, file));
    feedback.value = { ...feedback.value, [assetId]: result.message };
  } catch (error) {
    feedback.value = {
      ...feedback.value,
      [assetId]: localizedStatusMessage("reactWorkbench.problems.recoveryFailed", "Recovery failed: {detail}", { detail: error instanceof Error ? error.message : String(error) })
    };
  } finally {
    pending.delete(assetId);
    busy.value = [...pending];
    const next = { ...progress.value };
    delete next[assetId];
    progress.value = next;
  }
}

const severityOrder: Record<ProblemSeverity, number> = { error: 3, warning: 2, info: 1 };
</script>
