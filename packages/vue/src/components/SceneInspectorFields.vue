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
          <InspectorFieldControl :key="`${targetKey}:${field.id}`" :field="field" :i18n="i18n"
            :invalid="problem?.fieldId === field.id" :description-id="activeProblem(field) ? `${id}-${field.id}` : undefined"
            :on-commit="(value) => onCommit(field.id, value)" @cancel="$emit('resetField', field.id)" />
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
import InspectorFieldControl from "./InspectorFieldControl.vue";
import { renderFieldLabel, renderProblemMessage, type InspectorI18n } from "./inspector-i18n";

const props = withDefaults(defineProps<{
  fields: InspectorFieldDescriptor[];
  targetKey?: string;
  problem?: InspectorCommandProblem | null;
  i18n: InspectorI18n;
  onCommit(fieldId: string, value: string): boolean;
}>(), { targetKey: "environment" });
const id = useId();
defineEmits<{ resetField: [fieldId: string] }>();
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

</script>
