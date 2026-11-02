<template>
  <label class="ek-workbench__field">
    <span>{{ label }}</span>
    <input
      type="text"
      :aria-label="label"
      :value="value"
      :list="listId"
      :placeholder="hint ?? t('dataSources.mapping.pathHint')"
      @input="emit('update', ($event.target as HTMLInputElement).value)"
    />
    <small v-if="hint" class="ek-workbench__request-hint">{{ hint }}</small>
  </label>
</template>

<script setup lang="ts">
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";

const props = defineProps<{
  context: ResolvedWorkbenchContext;
  label: string;
  value: string;
  listId: string;
  hint?: string;
}>();

const emit = defineEmits<{
  update: [value: string];
}>();

const t = (message: Parameters<ResolvedWorkbenchContext["i18n"]["t"]>[0]) => props.context.i18n.t(message);
</script>
