<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>Lights</h2>
      <select aria-label="Add light" class="ek-inspector-inline-select" :value="addKind" @change="addLight(($event.target as HTMLSelectElement).value as LightKind)">
        <option value="">Add</option>
        <option v-for="option in section.addOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </header>
    <div v-if="section.lights.length" class="ek-inspector-light-list" role="list">
      <button
        v-for="light in section.lights"
        :key="light.id"
        type="button"
        :class="{ 'is-active': light.active }"
        :data-node-id="light.nodeId ?? undefined"
        :data-selected="light.selected ? 'true' : 'false'"
        @click="$emit('update:activeLightId', light.id)"
      >
        <span>{{ light.label }}</span>
        <small>{{ light.kind }}</small>
      </button>
    </div>
    <p v-else class="ek-inspector-empty">{{ section.reason }}</p>
    <p v-if="section.empty && section.reason && section.lights.length > 0" class="ek-inspector-empty">{{ section.reason }}</p>
    <div v-if="section.actions?.length" class="ek-inspector-button-row" aria-label="Lighting presets">
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
    <div v-if="section.diagnostics.length" class="ek-inspector-diagnostics" aria-label="Lighting diagnostics">
      <p v-for="diagnostic in section.diagnostics" :key="diagnostic.id" :data-severity="diagnostic.severity">
        <strong>{{ diagnostic.title }}</strong>
        <span v-if="diagnostic.detail">{{ diagnostic.detail }}</span>
      </p>
    </div>
    <div v-if="section.activeLightId" class="ek-inspector-grid">
      <label v-for="field in section.fields" :key="field.id" class="ek-inspector-field">
        <span>{{ field.label }}</span>
        <input
          v-if="field.kind === 'number'"
          :value="field.value"
          type="number"
          :min="field.min"
          :max="field.max"
          :step="field.step ?? 0.01"
          :aria-invalid="fieldProblem?.fieldId === field.id ? true : undefined"
          :aria-describedby="fieldProblem?.fieldId === field.id ? problemId(field.id) : undefined"
          @blur="commit(field.id as LightFieldId, ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="blurOnEnter"
        />
        <input v-else-if="field.kind === 'color'" :value="field.value" type="color" @change="commit(field.id as LightFieldId, ($event.target as HTMLInputElement).value)" />
        <input
          v-else-if="field.kind === 'checkbox'"
          :checked="Boolean(field.value)"
          type="checkbox"
          @change="commit(field.id as LightFieldId, String(($event.target as HTMLInputElement).checked))"
        />
        <input
          v-else
          :value="field.value"
          type="text"
          :aria-invalid="fieldProblem?.fieldId === field.id ? true : undefined"
          :aria-describedby="fieldProblem?.fieldId === field.id ? problemId(field.id) : undefined"
          @blur="commit(field.id as LightFieldId, ($event.target as HTMLInputElement).value)"
        />
        <small v-if="fieldProblem?.fieldId === field.id" :id="problemId(field.id)" class="ek-inspector-field-problem" role="alert">{{ fieldProblem.message }}</small>
      </label>
      <button class="ek-inspector-danger" type="button" @click="removeActive">Remove light</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  buildAddLightCommand,
  buildRemoveLightCommand,
  buildUpdateLightCommand,
  type Editor,
  type InspectorCommandProblem,
  type LightFieldId,
  type LightInspectorSection,
  type LightKind,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  section: LightInspectorSection;
}>();

const emit = defineEmits<{
  "update:activeLightId": [value: string | null];
}>();

const addKind = ref("");
const fieldProblem = ref<InspectorCommandProblem | null>(null);

function addLight(kind: LightKind | "") {
  if (!kind) {
    return;
  }
  const result = buildAddLightCommand(kind);
  if (result.ok) {
    const dispatch = props.editor.dispatch(result.command);
    emit("update:activeLightId", Object.keys(dispatch.snapshot.lights).at(-1) ?? null);
  }
  addKind.value = "";
}

function runAction(actionId: string) {
  const action = props.section.actions?.find((candidate) => candidate.id === actionId);
  fieldProblem.value = null;
  if (!action || action.disabled || !action.command) {
    fieldProblem.value = action?.problem ?? { code: "inspector-light-action-unavailable", message: "Lighting preset is unavailable.", severity: "info" };
    return;
  }
  const dispatch = props.editor.dispatch(action.command);
  if (!dispatch.ok) {
    fieldProblem.value = { code: "inspector-light-dispatch-failed", message: dispatch.error ?? "Lighting preset failed.", severity: "warning" };
  }
}

function commit(fieldId: LightFieldId, value: string) {
  if (!props.section.activeLightId) {
    return;
  }
  const result = buildUpdateLightCommand(props.snapshot, props.section.activeLightId, fieldId, value);
  if (result.ok) {
    fieldProblem.value = null;
    props.editor.dispatch(result.command);
  } else {
    fieldProblem.value = result.problem;
  }
}

function blurOnEnter(event: KeyboardEvent) {
  (event.currentTarget as HTMLInputElement).blur();
}

function removeActive() {
  if (!props.section.activeLightId) {
    return;
  }
  const result = buildRemoveLightCommand(props.snapshot, props.section.activeLightId);
  if (result.ok) {
    props.editor.dispatch(result.command);
  }
}

function problemId(fieldId: string): string {
  return `ek-light-${fieldId.replace(/[^a-z0-9_-]/gi, "-")}-problem`;
}
</script>
