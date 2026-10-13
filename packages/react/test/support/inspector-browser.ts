import { userEvent } from "vitest/browser";
import { expect } from "vitest";

export async function selectInspectorOption(trigger: Element, value: string) {
  if (trigger instanceof HTMLSelectElement) return userEvent.selectOptions(trigger, value);
  await userEvent.click(trigger);
  await expect.poll(() => document.querySelector(`[role="option"][data-ek-value="${CSS.escape(value)}"]`)).toBeTruthy();
  await userEvent.click(document.querySelector(`[role="option"][data-ek-value="${CSS.escape(value)}"]`)!);
}

export async function setInspectorColor(trigger: Element, value: string) {
  if (trigger instanceof HTMLInputElement) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(trigger, value);
    trigger.dispatchEvent(new Event("input", { bubbles: true }));
    trigger.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  await userEvent.click(trigger);
  const popup = document.querySelector<HTMLElement>(".ek-ui-color-editor")!;
  await userEvent.fill(popup.querySelector('input[type="text"]')!, value);
  await userEvent.click([...popup.querySelectorAll("button")].find((button) => ["Apply", "应用"].includes(button.textContent ?? ""))!);
}
