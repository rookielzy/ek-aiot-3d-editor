<template>
  <select
    v-if="type === 'boolean'"
    :id="id"
    :aria-label="label"
    :value="value === 'true' ? 'true' : 'false'"
    :disabled="disabled"
    @change="emit('change', ($event.target as HTMLSelectElement).value)"
  >
    <option value="true">{{ trueLabel }}</option>
    <option value="false">{{ falseLabel }}</option>
  </select>
  <input
    v-else
    :id="id"
    :type="type === 'number' ? 'number' : 'text'"
    :step="type === 'number' ? 'any' : undefined"
    :inputmode="type === 'number' ? 'decimal' : undefined"
    :aria-label="label"
    :value="value"
    :disabled="disabled"
    @input="emit('change', ($event.target as HTMLInputElement).value)"
  />
</template>

<script setup lang="ts">
import type { DataParameterType } from "@ek-aiot/3d-editor-core";

defineProps<{
  id: string;
  type: DataParameterType;
  value: string;
  disabled: boolean;
  label: string;
  trueLabel: string;
  falseLabel: string;
}>();

const emit = defineEmits<{
  change: [value: string];
}>();
</script>
