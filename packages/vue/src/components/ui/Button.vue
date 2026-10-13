<!-- Adapted from shadcn-vue (MIT): https://www.shadcn-vue.com/r/styles/new-york/button.json -->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "./utils";
import "./ui.css";
withDefaults(defineProps<{ class?: HTMLAttributes["class"]; type?: "button" | "submit" | "reset" }>(), { type: "button" });
</script>

<template>
  <button :type="type" :class="cn('ek-ui-button ek:inline-flex ek:items-center ek:justify-between ek:gap-2', $props.class)"><slot /></button>
</template>
