<script setup lang="ts">
import { computed } from "vue";
import type { InspectorFieldDescriptor } from "@ek-aiot/3d-editor-core";
import InspectorNumberInput from "./InspectorNumberInput.vue";
import InspectorTextInput from "./InspectorTextInput.vue";
import InspectorColorInput from "./InspectorColorInput.vue";
import InspectorSelect from "./InspectorSelect.vue";
import Switch from "./ui/Switch.vue";
import { renderFieldLabel, renderOptionLabel, type InspectorI18n } from "./inspector-i18n";
const props = defineProps<{
  field: InspectorFieldDescriptor;
  invalid?: boolean;
  descriptionId?: string;
  i18n: InspectorI18n;
  onCommit(value: string): boolean;
}>();
defineEmits<{ cancel: [] }>();
const attributes = computed(() => ({
  "aria-label": renderFieldLabel(props.i18n, props.field),
  "aria-invalid": props.invalid || undefined,
  "aria-describedby": props.descriptionId,
  disabled: props.field.disabled
}));
const options = computed(() => {
  const result: { value: string; label: string; disabled?: boolean }[] = (props.field.options ?? []).map((option) => ({ value: option.value, label: renderOptionLabel(props.i18n, option) }));
  if (props.field.kind === "asset") result.unshift({ value: "", label: props.i18n.t("reactWorkbench.inspector.field.asset.none"), disabled: props.field.id.includes(".faces.") });
  return result;
});
</script>

<template>
  <InspectorNumberInput v-if="field.kind === 'number'" v-bind="attributes" :value="Number(field.value)" :min="field.min" :max="field.max" :step="field.step ?? 0.01"
    :on-commit="(value) => onCommit(value.trim() === '' ? 'NaN' : value)" @cancel="$emit('cancel')" />
  <InspectorTextInput v-else-if="field.kind === 'text'" v-bind="attributes" :value="String(field.value)" :on-commit="onCommit" @cancel="$emit('cancel')" />
  <InspectorColorInput v-else-if="field.kind === 'color'" v-bind="attributes" :value="String(field.value)" :i18n="i18n" :on-commit="onCommit" @cancel="$emit('cancel')" />
  <Switch v-else-if="field.kind === 'checkbox'" v-bind="attributes" :model-value="Boolean(field.value)" @update:model-value="onCommit(String($event))" />
  <InspectorSelect v-else v-bind="attributes" :value="String(field.value)" :i18n="i18n" :searchable="field.kind === 'asset'" :options="options" :on-commit="onCommit" />
</template>
