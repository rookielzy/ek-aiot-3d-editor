<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>Transform</h2>
    </header>
    <p v-if="section.empty" class="ek-inspector-empty">{{ section.reason }}</p>
    <div v-else class="ek-inspector-grid ek-inspector-grid--vectors">
      <label v-for="field in section.fields" :key="field.id" class="ek-inspector-field">
        <span>{{ field.label }}</span>
        <input
          :value="field.value"
          :disabled="field.disabled"
          type="number"
          :step="field.step ?? 0.01"
          @blur="commit(field.id as TransformFieldId, ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="blurOnEnter"
        />
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import { buildSetTransformCommand, type Editor, type InspectorSection, type SceneSnapshot, type TransformFieldId } from "@ek-aiot/3d-editor-core";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  section: InspectorSection;
}>();

function commit(fieldId: TransformFieldId, value: string) {
  const result = buildSetTransformCommand(props.snapshot, fieldId, value);
  if (result.ok) {
    props.editor.dispatch(result.command);
  }
}

function blurOnEnter(event: KeyboardEvent) {
  (event.currentTarget as HTMLInputElement).blur();
}
</script>
