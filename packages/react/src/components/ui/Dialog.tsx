import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./utils";
import "./ui.css";

export interface DialogProps {
  open: boolean;
  /**
   * The user asked to close the dialog. The owning component decides what that
   * means while an unsaved draft exists, so Escape and the native `cancel`
   * event never close the dialog behind its back.
   */
  onDismiss(): void;
  label: string;
  descriptionId?: string;
  title: ReactNode;
  headerActions?: ReactNode;
  className?: string;
  /**
   * Track whether an in-dialog confirmation layer (for example a discard
   * prompt) is currently on top. While it is, Escape belongs to that layer and
   * is left for the owning component to handle.
   */
  hasNestedLayer?: boolean;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])"
].join(",");

function focusableIn(dialog: HTMLDialogElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.closest("[inert]")
  );
}

/**
 * Modal editing surface for longer data flows.
 *
 * Dismissal is always routed through `onDismiss`: the native `cancel` event and
 * Escape are intercepted so unsaved work reaches the owning component's discard
 * flow instead of closing the dialog silently. Keystrokes stop propagating so
 * workbench shortcuts do not act behind the modal. Focus stays inside the
 * dialog for pointer-free operation.
 */
export function Dialog({
  open,
  onDismiss,
  label,
  descriptionId,
  title,
  headerActions,
  className,
  hasNestedLayer = false,
  children
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Where focus sat when the user last acted inside the dialog, so a
  // confirmation layer can hand focus back to the same control.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") {
          dialog.showModal();
        } else {
          // Nonvisual DOM hosts do not implement the modal dialog API.
          dialog.setAttribute("open", "");
        }
      }
      return;
    }
    if (dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  const selectLayer = useCallback((active: HTMLElement) => {
    if (active === document.body || active === ref.current) {
      return;
    }
    returnFocusRef.current = active;
  }, []);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }
    const dialog = ref.current;
    function handleFocusIn(event: FocusEvent): void {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      // Tabbing past the last control moves focus to the page body; modal
      // focus must stay inside the dialog instead.
      if (target === document.body && dialog) {
        const focusable = focusableIn(dialog);
        if (focusable.length > 0) {
          focusable[0].focus();
        }
        return;
      }
      selectLayer(target);
    }
    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof HTMLElement) {
        selectLayer(event.target);
      }
    }
    const options = { capture: true };
    document.addEventListener("focusin", handleFocusIn, options);
    document.addEventListener("pointerdown", handlePointerDown, options);
    return () => {
      document.removeEventListener("focusin", handleFocusIn, options);
      document.removeEventListener("pointerdown", handlePointerDown, options);
    };
  }, [open, selectLayer]);

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    event.stopPropagation();
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    const textEntry =
      event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
        ? event.target
        : null;
    // Input methods compose text: keys reach neither our layers nor the
    // workbench shortcuts behind the dialog.
    if (event.nativeEvent.isComposing && textEntry) {
      return;
    }
    // The dialog handles keys only once the event bubbled out of the focused
    // control, so a confirmation layer inside it gets Escape first.
    const target = event.target;
    if (target !== dialog && dialog.contains(target as Node)) {
      return;
    }
    if (event.key === "Escape") {
      // A confirmation layer inside the dialog handles its own Escape so the
      // key acts on the top-most layer only: the browser must not close the
      // dialog, but the event still has to reach that layer.
      if (hasNestedLayer) {
        return;
      }
      // On an input the first Escape only exits text entry; that is what input
      // method composition and Chinese/Japanese users expect.
      if (textEntry) {
        textEntry.blur();
        return;
      }
      event.preventDefault();
      onDismiss();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = focusableIn(dialog);
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    // The dialog element itself is a browser tab stop (document.activeElement),
    // so it cycles at the same edge as the last control.
    const active = event.target instanceof HTMLElement ? event.target : null;
    const inside = active === dialog || (active ? dialog.contains(active) : false);
    if (!inside) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === dialog)) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleCancel(event: { preventDefault(): void }): void {
    // The browser would close natively and skip the draft guard.
    event.preventDefault();
    if (!hasNestedLayer) {
      onDismiss();
    }
  }

  return (
    <dialog
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      aria-describedby={descriptionId}
      className={cn("ek-workbench__dialog", className)}
      onKeyDown={handleKeyDown}
      onCancel={handleCancel}
    >
      <div className="ek-workbench__dialog-header">
        <h3>{title}</h3>
        {headerActions}
      </div>
      {children}
    </dialog>
  );
}
