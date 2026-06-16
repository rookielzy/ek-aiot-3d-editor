<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>Environment</h2>
    </header>
    <div v-if="section.actions?.length" class="ek-inspector-button-row" aria-label="Environment presets">
      <button
        v-for="action in section.actions"
        :key="action.id"
        type="button"
        :disabled="action.disabled"
        :title="action.problem?.message"
        @click="runAction(action.id)"
      >
        {{ action.label }}
      </button>
    </div>
    <p v-if="fieldProblem && !fieldProblem.fieldId" class="ek-inspector-warning" role="alert">{{ fieldProblem.message }}</p>
    <div class="ek-inspector-grid">
      <label v-for="field in section.fields" :key="field.id" class="ek-inspector-field">
        <span>{{ field.label }}</span>
        <input
          v-if="field.kind === 'number'"
          :value="field.value"
          :disabled="field.disabled"
          type="number"
          :min="field.min"
          :max="field.max"
          :step="field.step ?? 0.01"
          :aria-invalid="fieldProblem?.fieldId === field.id ? true : undefined"
          :aria-describedby="activeProblem(field)?.message ? problemId(field.id) : undefined"
          @blur="commit(field.id as EnvironmentFieldId, ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="blurOnEnter"
        />
        <input
          v-else-if="field.kind === 'color'"
          :value="field.value"
          :disabled="field.disabled"
          type="color"
          :aria-invalid="fieldProblem?.fieldId === field.id ? true : undefined"
          :aria-describedby="activeProblem(field)?.message ? problemId(field.id) : undefined"
          @change="commit(field.id as EnvironmentFieldId, ($event.target as HTMLInputElement).value)"
        />
        <select
          v-else
          :value="String(field.value)"
          :disabled="field.disabled"
          :aria-invalid="fieldProblem?.fieldId === field.id ? true : undefined"
          :aria-describedby="activeProblem(field)?.message ? problemId(field.id) : undefined"
          @change="commit(field.id as EnvironmentFieldId, ($event.target as HTMLSelectElement).value)"
        >
          <option v-if="field.kind === 'asset'" value="">None</option>
          <option v-for="option in field.options ?? []" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <small
          v-if="activeProblem(field)"
          :id="problemId(field.id)"
          class="ek-inspector-field-problem"
          :role="fieldProblem?.fieldId === field.id ? 'alert' : undefined"
        >
          {{ activeProblem(field)?.message }}
        </small>
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  buildSetEnvironmentCommand,
  type Editor,
  type EnvironmentFieldId,
  type InspectorCommandProblem,
  type InspectorFieldDescriptor,
  type InspectorSection,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  section: InspectorSection;
}>();

const fieldProblem = ref<InspectorCommandProblem | null>(null);

function commit(fieldId: EnvironmentFieldId, value: string) {
  if (value === "" && fieldId.endsWith("assetId")) {
    return;
  }
  fieldProblem.value = null;
  const result = buildSetEnvironmentCommand(props.snapshot, fieldId, value);
  if (result.ok) {
    const dispatch = props.editor.dispatch(result.command);
    if (!dispatch.ok) {
      fieldProblem.value = { code: "inspector-environment-dispatch-failed", fieldId, message: dispatch.error ?? "Environment edit failed.", severity: "warning" };
    }
  } else {
    fieldProblem.value = result.problem;
  }
}

function runAction(actionId: string) {
  const action = props.section.actions?.find((candidate) => candidate.id === actionId);
  fieldProblem.value = null;
  if (!action || action.disabled || !action.command) {
    fieldProblem.value = action?.problem ?? { code: "inspector-environment-action-unavailable", message: "Environment preset is unavailable.", severity: "info" };
    return;
  }
  const dispatch = props.editor.dispatch(action.command);
  if (!dispatch.ok) {
    fieldProblem.value = { code: "inspector-environment-dispatch-failed", message: dispatch.error ?? "Environment preset failed.", severity: "warning" };
  }
}

function activeProblem(field: InspectorFieldDescriptor): InspectorCommandProblem | undefined {
  return fieldProblem.value?.fieldId === field.id ? fieldProblem.value : field.problem;
}

function blurOnEnter(event: KeyboardEvent) {
  (event.currentTarget as HTMLInputElement).blur();
}

function problemId(fieldId: string): string {
  return `ek-environment-${fieldId.replace(/[^a-z0-9_-]/gi, "-")}-problem`;
}
</script>
