<!-- Adapted from shadcn-vue Command (MIT): https://www.shadcn-vue.com/r/styles/new-york/command.json -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { ListboxRoot, ListboxFilter, ListboxContent, ListboxItem, useFilter } from "reka-ui";
import { PhCheck } from "@phosphor-icons/vue";
import type { InspectorI18n } from "../inspector-i18n";
import "./ui.css";
const props = defineProps<{
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  label?: string;
  i18n: InspectorI18n;
}>();
defineEmits<{ select: [value: string] }>();
const search = ref("");
const { contains } = useFilter({ sensitivity: "base" });
const filtered = computed(() => props.options.filter((option) => contains(`${option.label} ${option.value}`, search.value)));
</script>

<template>
  <ListboxRoot :model-value="`value:${value}`" @update:model-value="$emit('select', String($event).slice(6))">
    <ListboxFilter v-model="search" auto-focus class="ek-ui-input ek:w-full" :aria-label="i18n.t('reactWorkbench.inspector.form.search')" :placeholder="i18n.t('reactWorkbench.inspector.form.search')" />
    <ListboxContent class="ek-ui-command-list ek:overflow-y-auto" :aria-label="label">
      <p v-if="!filtered.length" class="ek-ui-command-empty">{{ i18n.t('reactWorkbench.inspector.form.noResults') }}</p>
      <ListboxItem v-for="option in filtered" :key="option.value" :value="`value:${option.value}`" :disabled="option.disabled" :data-ek-value="option.value"
        class="ek-ui-option ek:flex ek:items-center ek:justify-between ek:gap-2">
        <span>{{ option.label }}</span><PhCheck v-if="option.value === value" aria-hidden="true" :size="14" />
      </ListboxItem>
    </ListboxContent>
  </ListboxRoot>
</template>
