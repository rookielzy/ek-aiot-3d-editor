<script setup lang="ts">
import { computed, ref, useAttrs, type CSSProperties } from "vue";
import { SelectRoot, SelectTrigger, SelectValue, SelectIcon, PopoverRoot, PopoverTrigger } from "reka-ui";
import { PhCaretDown } from "@phosphor-icons/vue";
import Button from "./ui/Button.vue";
import SelectContent from "./ui/SelectContent.vue";
import SelectItem from "./ui/SelectItem.vue";
import PopoverContent from "./ui/PopoverContent.vue";
import Command from "./ui/Command.vue";
import { getPortalTheme } from "./ui/utils";
import type { InspectorI18n } from "./inspector-i18n";

defineOptions({ inheritAttrs: false });
const props = defineProps<{
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
  searchable?: boolean;
  i18n: InspectorI18n;
  onCommit(value: string): boolean;
}>();
const attrs = useAttrs();
const trigger = ref<{ $el: HTMLElement } | null>(null);
const open = ref(false);
const theme = ref<CSSProperties>({});
const label = computed(() => props.options.find((option) => option.value === props.value)?.label ?? props.value);
function changeOpen(next: boolean) {
  if (next) theme.value = getPortalTheme(trigger.value?.$el ?? null);
  open.value = next;
}
function commit(next: string) {
  if (next === props.value || props.onCommit(next)) open.value = false;
}
</script>

<template>
  <PopoverRoot v-if="searchable" :open="open" @update:open="changeOpen">
    <PopoverTrigger as-child>
      <Button ref="trigger" v-bind="attrs" data-ek-searchable :disabled="disabled" class="ek-ui-select-trigger" role="combobox" aria-haspopup="listbox" :aria-expanded="open">
        <span>{{ label }}</span><PhCaretDown aria-hidden="true" :size="14" />
      </Button>
    </PopoverTrigger>
    <PopoverContent :theme="theme">
      <Command :value="value" :options="options" :label="attrs['aria-label'] as string | undefined" :i18n="i18n" @select="commit" />
    </PopoverContent>
  </PopoverRoot>
  <SelectRoot v-else :model-value="`value:${value}`" :open="open" :disabled="disabled" @update:open="changeOpen" @update:model-value="commit(String($event).slice(6))">
    <SelectTrigger ref="trigger" v-bind="attrs" class="ek-ui-button ek-ui-select-trigger ek:inline-flex ek:items-center ek:justify-between ek:gap-2">
      <SelectValue>{{ label }}</SelectValue><SelectIcon><PhCaretDown aria-hidden="true" :size="14" /></SelectIcon>
    </SelectTrigger>
    <SelectContent :theme="theme">
      <SelectItem v-for="option in options" :key="option.value" :value="`value:${option.value}`" :disabled="option.disabled" :data-ek-value="option.value">{{ option.label }}</SelectItem>
    </SelectContent>
  </SelectRoot>
</template>
