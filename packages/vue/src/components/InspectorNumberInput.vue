<template>
  <Input type="number" :value="draft" @input="edit" @blur="commit" @keydown="keydown"
    @compositionstart="compositionStart" @compositionend="compositionEnd" />
</template>

<script setup lang="ts">
import Input from "./ui/Input.vue";
import { useInspectorDraft } from "../composables/use-inspector-draft";

const props = defineProps<{
  value: number;
  onCommit(value: string): boolean;
}>();
const emit = defineEmits<{ cancel: [] }>();
const { draft, edit, commit, keydown, compositionStart, compositionEnd } = useInspectorDraft(
  () => String(props.value), (next) => props.onCommit(next), () => emit("cancel")
);
</script>
