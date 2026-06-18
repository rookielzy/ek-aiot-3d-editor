<template>
  <section class="ek-inspector-section">
    <header class="ek-inspector-section__header">
      <h2>{{ renderSectionTitle(resolvedI18n, section) }}</h2>
    </header>
    <p v-if="section.empty" class="ek-inspector-empty">{{ renderSectionReason(resolvedI18n, section) }}</p>
    <div v-else class="ek-inspector-grid ek-inspector-grid--vectors">
      <label v-for="field in section.fields" :key="field.id" class="ek-inspector-field">
        <span>{{ renderFieldLabel(resolvedI18n, field) }}</span>
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
import { computed } from "vue";
import { buildSetTransformCommand, type Editor, type InspectorSection, type SceneSnapshot, type TransformFieldId } from "@ek-aiot/3d-editor-core";
import { DEFAULT_INSPECTOR_I18N, renderFieldLabel, renderSectionReason, renderSectionTitle, type InspectorI18n } from "./inspector-i18n";

const props = defineProps<{
  editor: Editor;
  snapshot: SceneSnapshot;
  section: InspectorSection;
  i18n?: InspectorI18n;
}>();

const resolvedI18n = computed(() => props.i18n ?? DEFAULT_INSPECTOR_I18N);

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
