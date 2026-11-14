<template>
  <component :is="Icon" aria-hidden="true" :size="15" weight="regular" :mirrored="false" focusable="false" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  PhArrowClockwise,
  PhArrowCounterClockwise,
  PhArrowsOutCardinal,
  PhBoundingBox,
  PhCamera,
  PhCopy,
  PhCornersOut,
  PhCrosshair,
  PhCube,
  PhDatabase,
  PhCursor,
  PhDownloadSimple,
  PhDotsThree,
  PhEye,
  PhFileArrowUp,
  PhFrameCorners,
  PhGridFour,
  PhHand,
  PhMagnetStraight,
  PhSelectionAll,
  PhStackPlus,
  PhTarget,
  PhTrash,
  PhTreeStructure,
  PhUploadSimple
} from "@phosphor-icons/vue";

const ICONS = {
  "apply-view": PhEye,
  axes: PhCrosshair,
  bounds: PhBoundingBox,
  "capture-view": PhCamera,
  "clear-selection": PhSelectionAll,
  copy: PhCopy,
  data: PhDatabase,
  delete: PhTrash,
  duplicate: PhStackPlus,
  export: PhDownloadSimple,
  "export-partial": PhDownloadSimple,
  floor: PhCube,
  "frame-all": PhCornersOut,
  "frame-selected": PhFrameCorners,
  grid: PhGridFour,
  group: PhTreeStructure,
  hover: PhCursor,
  lights: PhHand,
  marquee: PhSelectionAll,
  more: PhDotsThree,
  move: PhArrowsOutCardinal,
  open: PhFileArrowUp,
  paste: PhUploadSimple,
  redo: PhArrowClockwise,
  "reset-camera": PhCamera,
  rotate: PhArrowClockwise,
  scale: PhCornersOut,
  "select-all": PhSelectionAll,
  "shadow-camera": PhCamera,
  snap: PhMagnetStraight,
  targets: PhTarget,
  undo: PhArrowCounterClockwise,
  ungroup: PhTreeStructure
};

export type WorkbenchIconName = keyof typeof ICONS;

const props = defineProps<{
  name: WorkbenchIconName;
}>();

const Icon = computed(() => ICONS[props.name]);
</script>
