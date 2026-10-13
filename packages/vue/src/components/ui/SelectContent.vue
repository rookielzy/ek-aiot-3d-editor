<!-- Adapted from shadcn-vue (MIT): https://www.shadcn-vue.com/r/styles/new-york/select.json -->
<script setup lang="ts">
import { SelectContent, SelectPortal, SelectScrollDownButton, SelectScrollUpButton, SelectViewport } from "reka-ui";
import { PhCaretDown, PhCaretUp } from "@phosphor-icons/vue";
import type { CSSProperties } from "vue";
import "./ui.css";
defineProps<{ theme?: CSSProperties }>();
</script>

<template>
  <SelectPortal>
    <SelectContent :style="theme" position="popper" align="start" :side-offset="4" :collision-padding="8" class="ek-ui-scope ek-ui-popup ek-ui-select-content">
      <SelectScrollUpButton class="ek-ui-scroll"><PhCaretUp aria-hidden="true" :size="14" /></SelectScrollUpButton>
      <SelectViewport><slot /></SelectViewport>
      <SelectScrollDownButton class="ek-ui-scroll"><PhCaretDown aria-hidden="true" :size="14" /></SelectScrollDownButton>
    </SelectContent>
  </SelectPortal>
</template>
