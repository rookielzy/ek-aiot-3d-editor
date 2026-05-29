<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>Material</h2>
    </header>
    <p v-if="section.empty" class="ek-inspector-empty">{{ section.reason }}</p>
    <div v-else class="ek-inspector-grid">
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
          @blur="commit(field.id as MaterialFieldId, ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="blurOnEnter"
        />
        <input
          v-else-if="field.kind === 'color'"
          :value="field.value"
          :disabled="field.disabled"
          type="color"
          @change="commit(field.id as MaterialFieldId, ($event.target as HTMLInputElement).value)"
        />
        <input
          v-else-if="field.kind === 'checkbox'"
          :checked="Boolean(field.value)"
          :disabled="field.disabled"
          type="checkbox"
          @change="commit(field.id as MaterialFieldId, ($event.target as HTMLInputElement).checked)"
        />
        <select
          v-else
          :value="String(field.value)"
          :disabled="field.disabled"
          @change="commit(field.id as MaterialFieldId, ($event.target as HTMLSelectElement).value)"
        >
          <option v-if="field.kind === 'asset'" value="">None</option>
          <option v-for="option in field.options ?? []" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import { buildSetMaterialCommand, type Editor, type MaterialFieldId, type MaterialInspectorSection, type SceneSnapshot } from "@ek-aiot/3d-editor-core";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  section: MaterialInspectorSection;
}>();

function commit(fieldId: MaterialFieldId, value: unknown) {
  if (value === "" && !fieldId.startsWith("textures.")) {
    return;
  }
  const result = buildSetMaterialCommand(props.snapshot, fieldId, value);
  if (result.ok) {
    props.editor.dispatch(result.command);
  }
}

function blurOnEnter(event: KeyboardEvent) {
  (event.currentTarget as HTMLInputElement).blur();
}
</script>
