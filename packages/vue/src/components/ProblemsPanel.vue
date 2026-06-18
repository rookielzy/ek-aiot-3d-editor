<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>{{ renderSectionTitle(resolvedI18n, section) }}</h2>
      <span class="ek-inspector-count">{{ section.problems.length }}</span>
    </header>
    <p v-if="section.problems.length === 0" class="ek-inspector-empty">{{ resolvedI18n.t("reactWorkbench.inspector.problems.empty") }}</p>
    <ul v-else class="ek-inspector-problems">
      <li v-for="problem in section.problems" :key="problem.id" :data-severity="problem.severity">
        <strong>{{ problem.titleDescriptor ? resolvedI18n.t(problem.titleDescriptor) : problem.title }}</strong>
        <span v-if="renderProblemDetail(problem)">{{ renderProblemDetail(problem) }}</span>
        <small>
          {{ renderSeverity(resolvedI18n, problem.severity) }} · {{ renderProblemSource(resolvedI18n, problem.source) }}
          <template v-if="problem.assetId"> · {{ problem.assetId }}</template>
          <template v-if="renderProblemActionLabel(problem)"> · {{ renderProblemActionLabel(problem) }}</template>
        </small>
        <label v-if="problem.assetId && problem.recoverability === 'user-action'" class="ek-inspector-file-action">
          <span>{{ renderProblemActionLabel(problem) ?? resolvedI18n.t("reactWorkbench.inspector.problems.replaceAsset.label") }}</span>
          <input type="file" @change="onReplacementFile(problem.assetId, $event)" />
        </label>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { InspectorProblemItem, ProblemInspectorSection } from "@ek-aiot/3d-editor-core";
import {
  DEFAULT_INSPECTOR_I18N,
  renderProblemSource,
  renderSectionTitle,
  renderSeverity,
  type InspectorI18n
} from "./inspector-i18n";

const props = defineProps<{
  section: ProblemInspectorSection;
  i18n?: InspectorI18n;
}>();

const emit = defineEmits<{
  replaceAsset: [assetId: string, file: File];
}>();

const resolvedI18n = computed(() => props.i18n ?? DEFAULT_INSPECTOR_I18N);

function renderProblemDetail(problem: InspectorProblemItem): string | null {
  if (problem.detailDescriptor) {
    return resolvedI18n.value.t(problem.detailDescriptor);
  }
  return problem.detail ?? null;
}

function renderProblemActionLabel(problem: InspectorProblemItem): string | null {
  if (problem.actionLabelDescriptor) {
    return resolvedI18n.value.t(problem.actionLabelDescriptor);
  }
  return problem.actionLabel ?? null;
}

function onReplacementFile(assetId: string, event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) {
    emit("replaceAsset", assetId, file);
  }
}
</script>
