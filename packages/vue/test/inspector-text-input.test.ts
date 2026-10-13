import "./support/inspector-controls";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import InspectorTextInput from "../src/components/InspectorTextInput.vue";

describe("Vue Inspector text drafts", () => {
  it("preserves focus, commits once on Enter and cancels invalid drafts", async () => {
    const onCommit = vi.fn((value: string) => value !== "invalid");
    const wrapper = mount(InspectorTextInput, { attachTo: document.body, props: { value: "Hero", onCommit } });
    const input = wrapper.get("input");
    (input.element as HTMLInputElement).focus();
    await input.setValue("Detail");
    expect(onCommit).not.toHaveBeenCalled();
    await input.trigger("keydown", { key: "Enter" });
    await input.trigger("blur");
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("Detail");
    expect(document.activeElement).toBe(input.element);
    await input.setValue("invalid");
    await input.trigger("keydown", { key: "Enter" });
    expect((input.element as HTMLInputElement).value).toBe("invalid");
    await input.trigger("keydown", { key: "Escape" });
    expect((input.element as HTMLInputElement).value).toBe("Hero");
    expect(wrapper.emitted("cancel")).toBeTruthy();
    wrapper.unmount();
  });

  it("waits for IME confirmation and replaces drafts after external value changes", async () => {
    const onCommit = vi.fn(() => true);
    const wrapper = mount(InspectorTextInput, { props: { value: "Hero", onCommit } });
    const input = wrapper.get("input");
    await input.trigger("compositionstart");
    await input.setValue("特写");
    await input.trigger("keydown", { key: "Enter", isComposing: true });
    expect(onCommit).not.toHaveBeenCalled();
    await input.trigger("compositionend");
    await input.trigger("keydown", { key: "Enter" });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("特写");
    await input.setValue("Unfinished");
    await wrapper.setProps({ value: "Restored" });
    expect((input.element as HTMLInputElement).value).toBe("Restored");
    await input.trigger("blur");
    expect(onCommit).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
