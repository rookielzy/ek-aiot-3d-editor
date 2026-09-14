import { computed, onBeforeUnmount, onMounted, ref, type Ref } from "vue";

export function useWorkbenchPanelWidths(root: Ref<HTMLElement | null>) {
  const availableWidth = ref(1440);
  const preferredLeftWidth = ref(272);
  const preferredRightWidth = ref(320);
  let observer: ResizeObserver | null = null;
  let frame: number | null = null;
  onMounted(() => {
    const element = root.value;
    if (!element) {
      return;
    }
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      if (width > 0) {
        availableWidth.value = Math.floor(width);
      }
    };
    measure();
    // Changing desktop rows can resize the observed root itself. Defer that
    // write beyond the notification cycle to avoid ResizeObserver loop errors.
    observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    });
    observer?.observe(element);
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
  });
  // Reserve the navigation, both handles and a usable central viewport.
  const maximum = computed(() => Math.max(260, Math.min(480, Math.floor((availableWidth.value - 64 - 12 - 320) / 2))));
  return {
    desktop: computed(() => availableWidth.value >= 1024),
    maximum,
    leftWidth: computed(() => Math.min(preferredLeftWidth.value, maximum.value)),
    rightWidth: computed(() => Math.min(preferredRightWidth.value, maximum.value)),
    setLeftWidth: (width: number) => { preferredLeftWidth.value = width; },
    setRightWidth: (width: number) => { preferredRightWidth.value = width; }
  };
}
