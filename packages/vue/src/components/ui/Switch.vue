<!-- Adapted from shadcn-vue (MIT): https://www.shadcn-vue.com/r/styles/new-york/switch.json -->
<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from "reka-ui";
import "./ui.css";
defineProps<{ modelValue: boolean; disabled?: boolean }>();
defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <SwitchRoot :model-value="modelValue" :disabled="disabled" class="ek-ui-switch ek:inline-flex ek:items-center ek:shrink-0"
    @update:model-value="$emit('update:modelValue', $event)">
    <SwitchThumb class="ek-ui-switch-thumb ek:block ek:rounded-full" />
  </SwitchRoot>
</template>
