<!-- Adapted from shadcn-vue (MIT): https://www.shadcn-vue.com/r/styles/new-york/popover.json -->
<script setup lang="ts">
import { PopoverContent, PopoverPortal } from "reka-ui";
import type { CSSProperties } from "vue";
import "./ui.css";
defineOptions({ inheritAttrs: false });
defineProps<{ theme?: CSSProperties }>();
</script>

<template>
  <PopoverPortal>
    <PopoverContent v-bind="$attrs" :style="theme" align="start" :side-offset="4" :collision-padding="8" class="ek-ui-scope ek-ui-popup ek-ui-popover">
      <slot />
    </PopoverContent>
  </PopoverPortal>
</template>
