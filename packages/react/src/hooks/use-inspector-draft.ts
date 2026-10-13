import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from "react";

export function useInspectorDraft(value: string, onCommit: (value: string) => boolean, onReset?: () => void) {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);
  const composing = useRef(false);
  const resetRef = useRef(onReset);
  resetRef.current = onReset;
  useEffect(() => {
    setDraft(value);
    dirty.current = false;
    resetRef.current?.();
  }, [value]);
  useEffect(() => {
    function discardOnTargetIntent(event: PointerEvent) {
      if (dirty.current && event.target instanceof Element && event.target.closest("[data-ek-discard-draft]")) {
        dirty.current = false;
        setDraft(value);
        resetRef.current?.();
      }
    }
    document.addEventListener("pointerdown", discardOnTargetIntent, true);
    return () => document.removeEventListener("pointerdown", discardOnTargetIntent, true);
  }, [value]);

  function cancel() {
    dirty.current = false;
    setDraft(value);
    resetRef.current?.();
  }

  return {
    value: draft,
    onChange(event: ChangeEvent<HTMLInputElement>) {
      dirty.current = true;
      setDraft(event.currentTarget.value);
    },
    onCompositionStart() { composing.current = true; },
    onCompositionEnd() { composing.current = false; },
    onBlur(event: FocusEvent<HTMLInputElement>) {
      // Target/history buttons declare their intent before their click runs.
      if (event.relatedTarget instanceof Element && event.relatedTarget.closest("[data-ek-discard-draft]")) {
        cancel();
        return;
      }
      if (dirty.current && onCommit(event.currentTarget.value)) dirty.current = false;
    },
    onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (dirty.current && onCommit(event.currentTarget.value)) dirty.current = false;
      }
    }
  };
}
