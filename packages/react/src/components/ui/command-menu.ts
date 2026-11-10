// Command menus are driven by the owning component, not by a library's internal open state:
// a pressed toggle must keep its menu open, and Escape must keep returning focus to its trigger.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MENU_ITEM } from "./command-menu-item";


export interface CommandMenuState {
  open: string | null;
  roving: string | null;
  openRef: { current: string | null };
  panelRef: (key: string) => (node: HTMLDivElement | null) => void;
  triggerRef: (key: string) => (node: HTMLElement | null) => void;
  rovingItems(panel: HTMLElement): HTMLElement[];
  openMenu(key: string, options?: { enter?: boolean }): void;
  closeMenu(options?: { restore?: boolean }): void;
  toggleMenu(key: string): void;
  moveFocus(panel: HTMLElement | null, delta: 1 | -1 | "first" | "last"): void;
  focusItem(panel: HTMLElement | null, command: string): void;
}

/** Why a row is unavailable, and the row that owns the explanation. */
export interface CommandReason {
  text: string;
  owner: HTMLElement;
}

export function useCommandMenu(): CommandMenuState {
  const [open, setOpen] = useState<string | null>(null);
  const [roving, setRoving] = useState<string | null>(null);
  const openRef = useRef<string | null>(null);
  openRef.current = open;
  const panels = useRef(new Map<string, HTMLDivElement>());
  const triggers = useRef(new Map<string, HTMLElement>());
  // Focus that Escape, Tab, or a one-shot command hands back once the panel has unmounted.
  const returning = useRef<(() => void) | null>(null);
  // Moving focus from a trigger into its panel is not the user leaving the menu.
  const entering = useRef(false);

  // Focus leaving is what dismisses a menu. The panel is portaled, so no wrapper element holds
  // the trigger and the menu together; these listeners name both elements explicitly instead.
  useEffect(() => {
    if (!open) return;
    function onFocusOut(event: FocusEvent) {
      const panel = openRef.current ? panels.current.get(openRef.current) : null;
      const trigger = openRef.current ? triggers.current.get(openRef.current) : null;
      if (!panel || !(event.target instanceof Node) || !panel.contains(event.target)) return;
      // A destination inside the menu or back on its trigger is not leaving.
      const next = event.relatedTarget;
      if (next instanceof Node && (panel.contains(next) || Boolean(trigger?.contains(next)))) return;
      closeMenu({ restore: false });
    }
    document.addEventListener("focusout", onFocusOut, true);
    return () => document.removeEventListener("focusout", onFocusOut, true);
  }, [open]);

  useLayoutEffect(() => {
    const restore = returning.current;
    if (open || !restore) return;
    returning.current = null;
    restore();
  }, [open]);

  function panelRef(key: string) {
    return (node: HTMLDivElement | null) => {
      if (node) panels.current.set(key, node);
      else panels.current.delete(key);
    };
  }

  function triggerRef(key: string) {
    return (node: HTMLElement | null) => {
      if (node) triggers.current.set(key, node);
      else triggers.current.delete(key);
    };
  }

  function rovingItems(panel: HTMLElement) {
    // Disabled commands stay readable in the roving order's shortcuts but cannot take focus.
    return [...panel.querySelectorAll<HTMLElement>(MENU_ITEM)].filter((item) => item.getAttribute("aria-disabled") !== "true");
  }

  function openMenu(key: string, options: { enter?: boolean } = {}) {
    setOpen(key);
    setRoving(null);
    if (!options.enter) return;
    entering.current = true;
    window.requestAnimationFrame(() => {
      entering.current = false;
      const panel = panels.current.get(key);
      if (panel && !panel.contains(document.activeElement)) moveFocus(panel, "first");
    });
  }

  function closeMenu(options: { restore?: boolean } = {}) {
    const restore = options.restore ?? true;
    const key = openRef.current;
    returning.current = restore
      ? () => {
          if (!key) return;
          triggers.current.get(key)?.focus();
        }
      : null;
    setOpen(null);
  }

  function toggleMenu(key: string) {
    if (openRef.current === key) closeMenu();
    else openMenu(key);
  }

  function moveFocus(panel: HTMLElement | null, delta: 1 | -1 | "first" | "last") {
    if (!panel) return;
    const items = rovingItems(panel);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next =
      delta === "first"
        ? 0
        : delta === "last"
          ? items.length - 1
          : current < 0
            ? delta === 1 ? 0 : items.length - 1
            : (current + delta + items.length) % items.length;
    const target = items[next];
    if (!target) return;
    setRoving(target.dataset.command ?? null);
    target.focus();
  }

  function focusItem(panel: HTMLElement | null, command: string) {
    const item = panel?.querySelector<HTMLElement>(`[data-command="${command}"]`);
    const target = item && item.getAttribute("aria-disabled") !== "true" ? item : panel ? rovingItems(panel)[0] : null;
    setRoving(target?.dataset.command ?? null);
    if (target) target.focus();
  }

  return { open, roving, openRef, panelRef, triggerRef, rovingItems, openMenu, closeMenu, toggleMenu, moveFocus, focusItem };
}
