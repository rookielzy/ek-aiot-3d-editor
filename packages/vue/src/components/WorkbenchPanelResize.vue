<template>
  <div
    :class="`ek-workbench__resize ek-workbench__resize--${side}`"
    role="separator"
    tabindex="0"
    :aria-label="label"
    aria-orientation="vertical"
    :aria-controls="panelId"
    :aria-valuemin="minimum"
    :aria-valuemax="maximum"
    :aria-valuenow="width"
    :aria-valuetext="`${width}px`"
    @keydown="onKeyDown"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="drag = null"
    @lostpointercapture="drag = null"
  />
</template>

<script setup lang="ts">
const props = defineProps<{
  side: "left" | "right";
  label: string;
  panelId: string;
  width: number;
  minimum: number;
  maximum: number;
}>();
const emit = defineEmits<{ resize: [width: number] }>();
let drag: { pointerId: number; x: number; width: number } | null = null;

function resize(width: number): void {
  emit("resize", Math.round(Math.max(props.minimum, Math.min(props.maximum, width))));
}

function onKeyDown(event: KeyboardEvent): void {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  resize(event.key === "Home" ? props.minimum : event.key === "End" ? props.maximum :
    props.width + (event.key === "ArrowRight" ? 16 : -16) * (props.side === "left" ? 1 : -1));
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || drag) {
    return;
  }
  event.preventDefault();
  const element = event.currentTarget as HTMLElement;
  element.focus();
  drag = { pointerId: event.pointerId, x: event.clientX, width: props.width };
  element.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (drag?.pointerId === event.pointerId) {
    resize(drag.width + (event.clientX - drag.x) * (props.side === "left" ? 1 : -1));
  }
}

function onPointerUp(event: PointerEvent): void {
  if (drag?.pointerId !== event.pointerId) {
    return;
  }
  drag = null;
  const element = event.currentTarget as HTMLElement;
  if (element.hasPointerCapture(event.pointerId)) {
    element.releasePointerCapture(event.pointerId);
  }
}
</script>
