import { createContext, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Button } from "./Button";
import { cn } from "./utils";
import "./ui.css";

export const DialogPortalContainer = createContext<HTMLDialogElement | null>(null);

interface DialogProps {
  onDismiss(): void;
  label: string;
  title: ReactNode;
  headerActions?: ReactNode;
  className?: string;
  initialFocus: RefObject<HTMLElement | null>;
  /** Entry the dialog returns to after an unsaved draft was discarded by leaving. */
  fallbackFocus?: RefObject<HTMLElement | null>;
  discard?: {
    title: string;
    description: string;
    keepLabel: string;
    discardLabel: string;
    onKeepEditing(): void;
    onDiscard(): void;
  };
  children: ReactNode;
}

const FOCUSABLE_SELECTOR = "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]";

export function Dialog({
  onDismiss,
  label,
  title,
  headerActions,
  className,
  initialFocus,
  fallbackFocus,
  discard,
  children
}: DialogProps) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const lastFocused = useRef<HTMLElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();
  const confirming = discard !== undefined;

  useLayoutEffect(() => {
    if (!dialog) return;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      }
      // Nonvisual DOM hosts do not implement showModal().
      if (!dialog.open) dialog.setAttribute("open", "");
      initialFocus.current?.focus();
      return;
    }
    if (confirming) {
      keepEditingRef.current?.focus();
      return;
    }
    const previous = lastFocused.current;
    (previous?.isConnected ? previous : fallbackFocus?.current ?? initialFocus.current)?.focus();
  }, [dialog, confirming, initialFocus, fallbackFocus]);

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    event.stopPropagation();
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229) return;

    if (event.key === "Escape") {
      event.preventDefault();
      dismissTopLayer();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((element) => element.tabIndex >= 0 && !element.closest("[inert], [hidden], [aria-hidden='true']"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && (event.target === first || event.target === event.currentTarget)) {
      event.preventDefault();
      last?.focus();
      return;
    }
    if (!event.shiftKey && (event.target === last || event.target === event.currentTarget)) {
      event.preventDefault();
      first?.focus();
    }
  }

  function dismissTopLayer(): void {
    if (discard) {
      discard.onKeepEditing();
      return;
    }
    onDismiss();
  }

  return (
    <dialog
      ref={setDialog}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={cn("ek-workbench__dialog", className)}
      onFocus={(event) => {
        // Opening the discard prompt from a button should resume at the previous control.
        if (!confirming && event.target instanceof HTMLElement
          && event.target !== event.currentTarget && !event.target.hasAttribute("data-dialog-dismiss")) {
          lastFocused.current = event.target;
        }
      }}
      onKeyDown={handleKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        dismissTopLayer();
      }}
    >
      <DialogPortalContainer.Provider value={dialog}>
        <div className="ek-workbench__dialog-scroll">
          <div inert={confirming}>
            <div className="ek-workbench__dialog-header">
              <h3>{title}</h3>
              {headerActions}
            </div>
            {children}
          </div>
          {discard ? (
            <div
              className="ek-workbench__connection-discard"
              role="alertdialog"
              aria-modal="true"
              aria-label={discard.title}
              aria-describedby={descriptionId}
            >
              <strong>{discard.title}</strong>
              <p id={descriptionId}>{discard.description}</p>
              <div className="ek-workbench__connection-discard-actions">
                <Button ref={keepEditingRef} onClick={discard.onKeepEditing}>{discard.keepLabel}</Button>
                <Button onClick={discard.onDiscard}>{discard.discardLabel}</Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogPortalContainer.Provider>
    </dialog>
  );
}
