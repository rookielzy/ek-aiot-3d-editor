<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>{{ renderSectionTitle(resolvedI18n, section) }}</h2>
    </header>
    <p v-if="section.empty" class="ek-inspector-empty">{{ renderSectionReason(resolvedI18n, section) }}</p>
    <div v-else class="ek-inspector-grid ek-inspector-grid--vectors">
      <label v-for="field in section.fields" :key="field.id" class="ek-inspector-field">
        <span>{{ renderFieldLabel(resolvedI18n, field) }}{{ field.id.startsWith('rotation.') ? ' (°)' : '' }}</span>
        <InspectorNumberInput
          :key="`${snapshot.selection.nodeId}:${field.id}`"
          :value="displayValue(field.id, field.value)"
          :aria-label="renderFieldLabel(resolvedI18n, field)"
          :disabled="field.disabled"
          :step="field.id.startsWith('rotation.') ? 1 : field.step ?? 0.01"
          :aria-invalid="problem?.fieldId === field.id ? true : undefined"
          :aria-describedby="problem?.fieldId === field.id ? problemId : undefined"
          :on-commit="(value) => commit(field.id as TransformFieldId, value)"
          @cancel="problem = null"
        />
      </label>
    </div>
    <p v-if="problem" :id="problemId" class="ek-inspector-field-problem" role="alert">{{ renderProblemMessage(resolvedI18n, problem) }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { buildSetTransformCommand, type Editor, type InspectorCommandProblem, type InspectorSection, type SceneSnapshot, type TransformFieldId } from "@ek-aiot/3d-editor-core";
import { DEFAULT_INSPECTOR_I18N, renderFieldLabel, renderProblemMessage, renderSectionReason, renderSectionTitle, type InspectorI18n } from "./inspector-i18n";
import InspectorNumberInput from "./InspectorNumberInput.vue";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  section: InspectorSection;
  i18n?: InspectorI18n;
}>();

const resolvedI18n = computed(() => props.i18n ?? DEFAULT_INSPECTOR_I18N);
const problem = ref<InspectorCommandProblem | null>(null);
const problemId = useId();
watch(() => props.snapshot.selection.nodeId, () => { problem.value = null; });

function displayValue(fieldId: string, value: unknown): number {
  return fieldId.startsWith("rotation.") ? Number(value) * 180 / Math.PI : Number(value);
}

function commit(fieldId: TransformFieldId, value: string): boolean {
  const number = value.trim() === "" ? NaN : Number(value);
  const field = props.section.fields.find((candidate) => candidate.id === fieldId);
  problem.value = null;
  // An untouched degree value must not introduce a rounded rotation command.
  if (field && number === displayValue(fieldId, field.value)) return true;
  const result = buildSetTransformCommand(props.editor.getSnapshot(), fieldId, fieldId.startsWith("rotation.") ? number * Math.PI / 180 : number);
  if (result.ok) {
    props.editor.dispatch(result.command);
  } else {
    problem.value = result.problem;
  }
  return result.ok;
}
</script>
