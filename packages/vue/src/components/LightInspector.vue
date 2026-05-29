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
        @click="$emit('update:activeLightId', light.id)"
      >
        <span>{{ light.label }}</span>
        <small>{{ light.kind }}</small>
      </button>
    </div>
    <p v-else class="ek-inspector-empty">{{ section.reason }}</p>
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
          @blur="commit(field.id as LightFieldId, ($event.target as HTMLInputElement).value)"
          @keydown.enter.prevent="blurOnEnter"
        />
        <input v-else-if="field.kind === 'color'" :value="field.value" type="color" @change="commit(field.id as LightFieldId, ($event.target as HTMLInputElement).value)" />
        <input v-else :value="field.value" type="text" @blur="commit(field.id as LightFieldId, ($event.target as HTMLInputElement).value)" />
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
  getNextActiveLightId,
  type Editor,
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

function commit(fieldId: LightFieldId, value: string) {
  if (!props.section.activeLightId) {
    return;
  }
  const result = buildUpdateLightCommand(props.snapshot, props.section.activeLightId, fieldId, value);
  if (result.ok) {
    props.editor.dispatch(result.command);
  }
}

function blurOnEnter(event: KeyboardEvent) {
  (event.currentTarget as HTMLInputElement).blur();
}

function removeActive() {
  if (!props.section.activeLightId) {
    return;
  }
  const nextActiveId = getNextActiveLightId(props.snapshot, props.section.activeLightId);
  const result = buildRemoveLightCommand(props.snapshot, props.section.activeLightId);
  if (result.ok) {
    props.editor.dispatch(result.command);
    emit("update:activeLightId", nextActiveId);
  }
}
</script>
