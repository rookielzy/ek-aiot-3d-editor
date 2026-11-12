import { fireEvent } from "@testing-library/react";
import { vi } from "vitest";

// jsdom does not implement the layout APIs used by the Radix select popup. Real
// keyboard, pointer, placement and focus behavior is additionally verified in Chromium.
function installLayoutStubs() {
  if (!("ResizeObserver" in globalThis)) {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  }
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
}

function findListbox() {
  return document.querySelector<HTMLElement>('[role="listbox"]');
}

function openListbox(trigger: HTMLElement) {
  const opened = findListbox();
  if (opened) return opened;
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  return findListbox();
}

function optionLabel(option: HTMLElement) {
  return option.textContent?.trim() ?? "";
}

/** Opens the Radix popup of a workbench select and returns its rendered options. */
export function workbenchOptions(trigger: HTMLElement): HTMLElement[] {
  installLayoutStubs();
  fireEvent.click(trigger);
  const listbox = openListbox(trigger);
  return listbox ? Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]')) : [];
}

/** Picks one option of a workbench select by the label the user reads. */
export function selectWorkbenchOption(trigger: HTMLElement, label: string) {
  const options = workbenchOptions(trigger);
  const option = options.find((item) => optionLabel(item) === label);
  if (!option) {
    const available = options.map((item) => optionLabel(item));
    throw new Error(`Missing workbench option: ${label} (available: ${available.join(", ") || "none"})`);
  }
  fireEvent.click(option);
}

/** Returns the visible labels of a workbench select's options. */
export function workbenchOptionLabels(trigger: HTMLElement): string[] {
  const labels = workbenchOptions(trigger).map((option) => optionLabel(option));
  const listbox = findListbox();
  if (listbox) fireEvent.keyDown(listbox, { key: "Escape" });
  return labels;
}
