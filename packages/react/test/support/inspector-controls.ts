import { fireEvent, screen } from "@testing-library/react";
import { afterAll, beforeAll, vi } from "vitest";

// jsdom does not implement the layout APIs used by cmdk/Radix. Real keyboard,
// pointer, placement and focus behavior is additionally verified in Chromium.
beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
});
afterAll(() => vi.unstubAllGlobals());

export function inspectorOptions(trigger: HTMLElement) {
  if (trigger.hasAttribute("data-ek-searchable")) fireEvent.click(trigger);
  else fireEvent.keyDown(trigger, { key: "ArrowDown" });
  return screen.getAllByRole("option");
}

export function selectInspectorOption(trigger: HTMLElement, value: string) {
  const option = inspectorOptions(trigger).find((item) => item.getAttribute("data-ek-value") === value);
  if (!option) throw new Error(`Missing Inspector option: ${value}`);
  fireEvent.click(option);
}

export function setInspectorColor(trigger: HTMLElement, value: string) {
  fireEvent.click(trigger);
  fireEvent.change(screen.getByLabelText("Hex color"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Apply", exact: true }));
}

export function inspectorOptionValues(trigger: HTMLElement) {
  const options = inspectorOptions(trigger).map((option) => option.getAttribute("data-ek-value"));
  fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
  return options;
}
