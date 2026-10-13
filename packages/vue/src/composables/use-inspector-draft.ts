import { onMounted, onUnmounted, ref, watch } from "vue";

export function useInspectorDraft(value: () => string, onCommit: (value: string) => boolean, onReset: () => void) {
  const draft = ref(value());
  let dirty = false;
  let composing = false;
  function reset() {
    draft.value = value();
    dirty = false;
    onReset();
  }
  watch(value, reset);
  function discardOnTargetIntent(event: PointerEvent) {
    if (dirty && event.target instanceof Element && event.target.closest("[data-ek-discard-draft]")) reset();
  }
  onMounted(() => document.addEventListener("pointerdown", discardOnTargetIntent, true));
  onUnmounted(() => document.removeEventListener("pointerdown", discardOnTargetIntent, true));
  function commit(event: FocusEvent | KeyboardEvent) {
    if (event instanceof FocusEvent && event.relatedTarget instanceof Element && event.relatedTarget.closest("[data-ek-discard-draft]")) {
      reset();
      return;
    }
    if (dirty && onCommit((event.target as HTMLInputElement).value)) dirty = false;
  }
  return {
    draft,
    edit(event: Event) {
      draft.value = (event.target as HTMLInputElement).value;
      dirty = true;
    },
    commit,
    compositionStart() { composing = true; },
    compositionEnd() { composing = false; },
    keydown(event: KeyboardEvent) {
      if (composing || event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        reset();
      } else if (event.key === "Enter") {
        event.preventDefault();
        commit(event);
      }
    }
  };
}
