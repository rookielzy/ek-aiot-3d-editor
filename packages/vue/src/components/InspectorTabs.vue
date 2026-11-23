<template>
  <div v-if="tabs.length" class="ek-inspector-tabs" :class="{ 'ek-inspector-tabs--secondary': secondary }" role="tablist" :aria-label="label">
    <button v-for="(tab, index) in tabs" :key="tab.id" type="button" role="tab"
      :id="`${id}-tab-${tab.id}`" :aria-controls="`${id}-panel-${tab.id}`"
      :aria-selected="activeTab === tab.id" :tabindex="activeTab === tab.id ? 0 : -1"
      @click="preferredTab = tab.id" @keydown="navigate($event, index)">
      {{ tab.label }}
    </button>
  </div>
  <div v-for="tab in tabs" :key="tab.id" role="tabpanel" :id="`${id}-panel-${tab.id}`"
    :aria-labelledby="`${id}-tab-${tab.id}`" :hidden="activeTab !== tab.id">
    <slot :name="tab.id" />
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";

const props = defineProps<{
  label: string;
  tabs: readonly { id: string; label: string }[];
  secondary?: boolean;
}>();

const id = useId();
const preferredTab = defineModel<string>();
const activeTab = computed(() => props.tabs.find((tab) => tab.id === preferredTab.value)?.id ?? props.tabs[0]?.id);

function navigate(event: KeyboardEvent, index: number): void {
  const next = event.key === "ArrowRight" ? (index + 1) % props.tabs.length
    : event.key === "ArrowLeft" ? (index + props.tabs.length - 1) % props.tabs.length
    : event.key === "Home" ? 0 : event.key === "End" ? props.tabs.length - 1 : null;
  if (next === null) return;
  event.preventDefault();
  preferredTab.value = props.tabs[next]!.id;
  (event.currentTarget as HTMLButtonElement).parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
}
</script>
