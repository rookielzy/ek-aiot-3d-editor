<template>
  <div class="ek-inspector-grid ek-scene-fields">
    <component :is="group.title ? 'fieldset' : 'div'" v-for="group in groups" :key="group.fields[0]!.id"
      :class="group.title ? 'ek-inspector-vector' : 'ek-scene-field-row'">
      <legend v-if="group.title">{{ group.title }}</legend>
      <div :class="group.title ? 'ek-inspector-grid ek-inspector-grid--vectors' : 'ek-scene-field-row'">
        <label v-for="field in group.fields" :key="field.id"
          :class="group.title ? 'ek-inspector-axis' : ['ek-inspector-field', { 'ek-inspector-field--checkbox': field.kind === 'checkbox' }]"
          :data-axis="group.title ? field.id.slice(-1) : undefined">
          <span :aria-hidden="group.title ? true : undefined">{{ group.title ? field.id.slice(-1).toUpperCase() : renderFieldLabel(i18n, field) }}</span>
          <InspectorNumberInput v-if="field.kind === 'number'" :key="`${targetKey}:${field.id}`"
            v-bind="attributes(field)" :value="Number(field.value)" :min="field.min" :max="field.max" :step="field.step ?? 0.01"
            :on-commit="(value) => onCommit(field.id, value.trim() === '' ? 'NaN' : value)" />
          <select v-else-if="field.kind === 'select' || field.kind === 'asset'" v-bind="attributes(field)"
            :value="String(field.value)" @change="onCommit(field.id, ($event.target as HTMLSelectElement).value)">
            <option v-if="field.kind === 'asset'" value="" :disabled="field.id.includes('.faces.')">{{ i18n.t('reactWorkbench.inspector.field.asset.none') }}</option>
            <option v-for="option in field.options" :key="option.value" :value="option.value">{{ renderOptionLabel(i18n, option) }}</option>
          </select>
          <input v-else-if="field.kind === 'checkbox'" v-bind="attributes(field)" type="checkbox" :checked="Boolean(field.value)"
            @change="onCommit(field.id, String(($event.target as HTMLInputElement).checked))" />
          <input v-else v-bind="attributes(field)" :key="`${targetKey}:${field.id}:${String(field.value)}`"
            :type="field.kind === 'color' ? 'color' : 'text'" :value="String(field.value)"
            @change="field.kind === 'color' && onCommit(field.id, ($event.target as HTMLInputElement).value)"
            @blur="field.kind === 'text' && ($event.target as HTMLInputElement).value !== String(field.value) && onCommit(field.id, ($event.target as HTMLInputElement).value)" />
          <small v-if="activeProblem(field)" :id="`${id}-${field.id}`" class="ek-inspector-field-problem"
            :role="problem?.fieldId === field.id ? 'alert' : undefined">{{ renderProblemMessage(i18n, activeProblem(field)!) }}</small>
        </label>
      </div>
    </component>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import type { InspectorCommandProblem, InspectorFieldDescriptor } from "@ek-aiot/3d-editor-core";
import InspectorNumberInput from "./InspectorNumberInput.vue";
import { renderFieldLabel, renderOptionLabel, renderProblemMessage, type InspectorI18n } from "./inspector-i18n";

const props = withDefaults(defineProps<{
  fields: InspectorFieldDescriptor[];
  targetKey?: string;
  problem?: InspectorCommandProblem | null;
  i18n: InspectorI18n;
  onCommit(fieldId: string, value: string): boolean;
}>(), { targetKey: "environment" });
const id = useId();
const groups = computed(() => {
  const result: { title?: string; fields: InspectorFieldDescriptor[] }[] = [];
  for (let index = 0; index < props.fields.length; index++) {
    const field = props.fields[index]!;
    if (field.id.endsWith(".x") && props.fields[index + 1]?.id === field.id.replace(/x$/, "y") && props.fields[index + 2]?.id === field.id.replace(/x$/, "z")) {
      const prefix = field.id.slice(0, -2);
      const title = props.i18n.t(prefix === "position" ? "reactWorkbench.inspector.transform.position"
        : prefix === "target" ? "reactWorkbench.inspector.sceneFields.target"
        : prefix === "environment.rotation" ? "reactWorkbench.inspector.sceneFields.lightingRotation"
        : "reactWorkbench.inspector.sceneFields.backgroundRotation");
      result.push({ title, fields: props.fields.slice(index, index + 3) });
      index += 2;
    } else {
      result.push({ fields: [field] });
    }
  }
  return result;
});

function activeProblem(field: InspectorFieldDescriptor) {
  return props.problem?.fieldId === field.id ? props.problem : field.problem;
}

function attributes(field: InspectorFieldDescriptor) {
  return {
    "aria-label": renderFieldLabel(props.i18n, field),
    "aria-invalid": props.problem?.fieldId === field.id ? true as const : undefined,
    "aria-describedby": activeProblem(field) ? `${id}-${field.id}` : undefined,
    disabled: field.disabled
  };
}
</script>
