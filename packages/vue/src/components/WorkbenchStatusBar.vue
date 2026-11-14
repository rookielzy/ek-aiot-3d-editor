<template>
  <WorkbenchProblemsDrawer
    :id="drawerId"
    :context="context"
    :open="open"
    @close="closeDrawer"
    @locate-data-target="emit('locateDataTarget', $event)"
  />
  <div class="ek-workbench__default-status">
    <span class="ek-workbench__status-chip" :data-tone="status.selectionCount > 0 ? 'active' : 'neutral'">
      <strong>{{ t("reactWorkbench.status.group.selection") }}</strong>
      <span>{{ t("reactWorkbench.status.selection", { selection: selectionLabel }) }}</span>
    </span>
    <span class="ek-workbench__status-chip">
      <strong>{{ t("reactWorkbench.status.group.history") }}</strong>
      <span>{{ t("reactWorkbench.status.undo", { count: status.undoCount }) }}</span>
      <span>{{ t("reactWorkbench.status.redo", { count: status.redoCount }) }}</span>
    </span>
    <span class="ek-workbench__status-chip" :data-tone="status.runtimeReady ? 'success' : 'warning'">
      <strong>{{ t("reactWorkbench.status.group.runtime") }}</strong>
      <span>{{ t("reactWorkbench.status.runtime", { state: runtimeStateLabel }) }}</span>
    </span>
    <span class="ek-workbench__status-chip">
      <strong>{{ t("reactWorkbench.status.group.snap") }}</strong>
      <span>{{ snapFeedbackLabel }}</span>
    </span>
    <span class="ek-workbench__status-chip" :data-tone="project.ready ? 'success' : 'warning'">
      <strong>{{ t("reactWorkbench.status.group.project") }}</strong>
      <span>{{ t("reactWorkbench.status.project", { status: projectStatusLabel }) }}</span>
    </span>
    <span v-if="workspace" class="ek-workbench__status-chip" :data-tone="workspace.readiness.blockingAssetIds.length > 0 ? 'warning' : 'neutral'">
      <strong>{{ t("reactWorkbench.status.group.assets") }}</strong>
      <span>
      {{ t("reactWorkbench.status.assets", {
        totalCount: workspace.totalCount,
        missingCount: workspace.missingPayloadCount + workspace.missingReferenceCount,
        blockedCount: workspace.readiness.blockingAssetIds.length
      }) }}
      </span>
    </span>
    <span class="ek-workbench__status-chip" :data-tone="status.dirty ? 'warning' : 'success'">
      <strong>{{ t("reactWorkbench.status.group.save") }}</strong>
      <span>{{ status.dirty ? t("reactWorkbench.status.dirty") : t("reactWorkbench.status.saved") }}</span>
    </span>
    <button
      ref="trigger"
      type="button"
      class="ek-workbench__status-chip"
      :data-tone="problemTone"
      :aria-label="t('reactWorkbench.problems.details')"
      :aria-expanded="open"
      :aria-controls="drawerId"
      :aria-describedby="`${drawerId}-count`"
      @click="open = !open"
    >
      <strong>{{ t("reactWorkbench.status.group.problems") }}</strong>
      <span :id="`${drawerId}-count`">{{ t("reactWorkbench.status.problems", { count: status.problemCount }) }}</span>
    </button>
    <span v-if="status.problemCount > 0" class="ek-workbench__status-chip" :data-tone="problemTone">
      <span>
      {{ t("reactWorkbench.status.problemBreakdown", {
        authoredCount: status.authoredProblemCount,
        runtimeCount: status.runtimeProblemCount,
        dataCount: status.dataProblemCount,
        projectCount: status.projectProblemCount
      }) }}
      </span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from "vue";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageValues } from "../i18n/workbench-i18n";
import { problemToneFromCounts } from "./workbench-model-helpers";
import WorkbenchProblemsDrawer from "./WorkbenchProblemsDrawer.vue";
import type { DataProblemTarget } from "./workbench-problem-target";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
}>();

const emit = defineEmits<{
  locateDataTarget: [target: DataProblemTarget];
}>();

const open = ref(false);
const trigger = ref<HTMLButtonElement | null>(null);
const drawerId = `problems-drawer-${useId()}`;
const status = computed(() => props.context.model.status);
const selection = computed(() => props.context.model.selection);
const project = computed(() => props.context.model.project);
const workspace = computed(() => props.context.model.assets.workspace);
const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: WorkbenchMessageValues) => props.context.i18n.t(message, values);
const selectionLabel = computed(() => selection.value.labelDescriptor ? t(selection.value.labelDescriptor) : status.value.selectionLabel);
const runtimeStateLabel = computed(() => status.value.runtimeReady ? t("reactWorkbench.status.runtime.ready") : t("reactWorkbench.status.runtime.missing"));
const snapFeedbackLabel = computed(() => t(status.value.snapFeedbackLabelDescriptor ?? {
  key: "workbench.status.snap.idle.label",
  fallback: status.value.snapFeedbackLabel
}));
const projectStatusLabel = computed(() => t(project.value.statusLabelDescriptor ?? {
  key: "workbench.project.status.partial.label",
  fallback: project.value.statusLabel
}));
const problemTone = computed(() => problemToneFromCounts(props.context.model.problems.bySeverity, status.value.problemCount));

function closeDrawer(): void {
  open.value = false;
  trigger.value?.focus();
}

defineExpose({
  dismissProblems() {
    if (!open.value) return false;
    closeDrawer();
    return true;
  }
});
</script>
