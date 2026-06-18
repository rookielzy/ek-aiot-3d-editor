<template>
  <div class="ek-workbench__default-status">
    <span>{{ t("reactWorkbench.status.selection", { selection: selectionLabel }) }}</span>
    <span>{{ t("reactWorkbench.status.undo", { count: status.undoCount }) }}</span>
    <span>{{ t("reactWorkbench.status.redo", { count: status.redoCount }) }}</span>
    <span>{{ t("reactWorkbench.status.runtime", { state: status.runtimeReady ? t("reactWorkbench.status.runtime.ready") : t("reactWorkbench.status.runtime.missing") }) }}</span>
    <span>{{ t(status.snapFeedbackLabelDescriptor ?? { key: "workbench.status.snap.idle.label", fallback: status.snapFeedbackLabel }) }}</span>
    <span>{{ t("reactWorkbench.status.project", { status: t(project.statusLabelDescriptor ?? { key: "workbench.project.status.partial.label", fallback: project.statusLabel }) }) }}</span>
    <span v-if="workspace">
      {{ t("reactWorkbench.status.assets", {
        totalCount: workspace.totalCount,
        missingCount: workspace.missingPayloadCount + workspace.missingReferenceCount,
        blockedCount: workspace.readiness.blockingAssetIds.length
      }) }}
    </span>
    <span>{{ status.dirty ? t("reactWorkbench.status.dirty") : t("reactWorkbench.status.saved") }}</span>
    <span>{{ t("reactWorkbench.status.problems", { count: status.problemCount }) }}</span>
    <span v-if="status.problemCount > 0">
      {{ t("reactWorkbench.status.problemBreakdown", {
        authoredCount: status.authoredProblemCount,
        runtimeCount: status.runtimeProblemCount,
        projectCount: status.projectProblemCount
      }) }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchMessageValues } from "../i18n/workbench-i18n";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
}>();

const status = computed(() => props.context.model.status);
const selection = computed(() => props.context.model.selection);
const project = computed(() => props.context.model.project);
const workspace = computed(() => props.context.model.assets.workspace);
const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0], values?: WorkbenchMessageValues) => props.context.i18n.t(message, values);
const selectionLabel = computed(() => selection.value.labelDescriptor ? t(selection.value.labelDescriptor) : status.value.selectionLabel);
</script>
