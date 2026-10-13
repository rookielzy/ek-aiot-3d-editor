<script setup lang="ts">
import Input from "./ui/Input.vue";
import { useInspectorDraft } from "../composables/use-inspector-draft";
const props = defineProps<{ value: string; onCommit(value: string): boolean }>();
const emit = defineEmits<{ cancel: [] }>();
const { draft, edit, commit, keydown, compositionStart, compositionEnd } = useInspectorDraft(() => props.value,
  (next) => next === props.value || props.onCommit(next), () => emit("cancel"));
</script>

<template>
  <Input type="text" :value="draft" @input="edit" @blur="commit" @keydown="keydown" @compositionstart="compositionStart" @compositionend="compositionEnd" />
</template>
