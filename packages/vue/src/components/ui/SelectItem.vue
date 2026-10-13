<!-- Adapted from shadcn-vue (MIT): https://www.shadcn-vue.com/r/styles/new-york/select.json -->
<script setup lang="ts">
import { SelectItem, SelectItemIndicator, SelectItemText } from "reka-ui";
import { PhCheck } from "@phosphor-icons/vue";
defineProps<{ value: string; disabled?: boolean }>();
</script>

<template>
  <SelectItem :value="value" :disabled="disabled" class="ek-ui-option ek:flex ek:items-center ek:justify-between ek:gap-2">
    <SelectItemText><slot /></SelectItemText>
    <SelectItemIndicator><PhCheck aria-hidden="true" :size="14" /></SelectItemIndicator>
  </SelectItem>
</template>
