<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>Environment</h2>
    </header>
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
          @blur="commit(field.id as EnvironmentFieldId, ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="blurOnEnter"
        />
        <input
          v-else-if="field.kind === 'color'"
          :value="field.value"
          :disabled="field.disabled"
          type="color"
          @change="commit(field.id as EnvironmentFieldId, ($event.target as HTMLInputElement).value)"
        />
        <select
          v-else
          :value="String(field.value)"
          :disabled="field.disabled"
          @change="commit(field.id as EnvironmentFieldId, ($event.target as HTMLSelectElement).value)"
        >
          <option v-if="field.kind === 'asset'" value="">None</option>
          <option v-for="option in field.options ?? []" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import { buildSetEnvironmentCommand, type Editor, type EnvironmentFieldId, type InspectorSection, type SceneSnapshot } from "@ek-aiot/3d-editor-core";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  section: InspectorSection;
}>();

function commit(fieldId: EnvironmentFieldId, value: string) {
  if (value === "" && fieldId.endsWith("assetId")) {
    return;
  }
  const result = buildSetEnvironmentCommand(props.snapshot, fieldId, value);
  if (result.ok) {
    props.editor.dispatch(result.command);
  }
}

function blurOnEnter(event: KeyboardEvent) {
  (event.currentTarget as HTMLInputElement).blur();
}
</script>
