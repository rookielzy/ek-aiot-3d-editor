<template>
  <input type="number" :value="draft" @input="edit" @blur="commit"
    @keydown.enter.prevent="commit" @keydown.esc.stop.prevent="cancel" />
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  value: number;
  onCommit(value: string): boolean;
}>();
const emit = defineEmits<{ cancel: [] }>();
const draft = ref(String(props.value));
let dirty = false;

watch(() => props.value, reset);

function reset(): void {
  draft.value = String(props.value);
  dirty = false;
}

function edit(event: Event): void {
  draft.value = (event.target as HTMLInputElement).value;
  dirty = true;
}

function commit(): void {
  if (dirty && props.onCommit(draft.value)) dirty = false;
}

function cancel(): void {
  reset();
  emit("cancel");
}
</script>
