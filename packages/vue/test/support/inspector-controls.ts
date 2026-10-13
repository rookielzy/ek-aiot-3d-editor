import { DOMWrapper, enableAutoUnmount, flushPromises } from "@vue/test-utils";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

enableAutoUnmount(afterEach);

// jsdom lacks the layout API used by Reka. Browser tests cover real placement.
beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
});
afterAll(() => vi.unstubAllGlobals());

export async function inspectorOptions(trigger: DOMWrapper<Element>) {
  if (trigger.attributes("data-ek-searchable") !== undefined) await trigger.trigger("click");
  else await trigger.trigger("keydown", { key: "ArrowDown" });
  await flushPromises();
  return [...document.querySelectorAll('[role="option"][data-ek-value]')].map((item) => new DOMWrapper(item));
}

export async function selectInspectorOption(trigger: DOMWrapper<Element>, value: string) {
  const options = await inspectorOptions(trigger);
  const option = options.find((item) => item.attributes("data-ek-value") === value);
  if (!option) throw new Error(`Missing Inspector option: ${value}`);
  if (trigger.attributes("data-ek-searchable") !== undefined) await option.trigger("click");
  else await option.trigger("keydown", { key: "Enter" });
  await flushPromises();
}

export async function setInspectorColor(trigger: DOMWrapper<Element>, value: string) {
  await trigger.trigger("click");
  await flushPromises();
  const popup = new DOMWrapper(document.querySelector(".ek-ui-color-editor")!);
  await popup.get('input[type="text"]').setValue(value);
  await popup.findAll("button").find((button) => ["Apply", "应用"].includes(button.text()))!.trigger("click");
  await flushPromises();
}
