<!-- Adapted from shadcn-vue (MIT): https://www.shadcn-vue.com/r/styles/new-york/input.json -->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "./utils";
import "./ui.css";
defineProps<{ class?: HTMLAttributes["class"] }>();
</script>

<template>
  <input :class="cn('ek-ui-input ek:w-full ek:min-w-0', $props.class)" />
</template>
