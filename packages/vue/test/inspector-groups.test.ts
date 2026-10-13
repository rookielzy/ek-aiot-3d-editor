import { inspectorOptions, selectInspectorOption } from "./support/inspector-controls";
import { mount, type VueWrapper } from "@vue/test-utils";
import { markRaw, nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { createEditor } from "@ek-aiot/3d-editor-core";
import InspectorPanel from "../src/components/InspectorPanel.vue";

async function openGroup(wrapper: VueWrapper, name: string) {
  const tab = wrapper.findAll('[role="tab"]').find((item) => item.text() === name);
  expect(tab, `Inspector group ${name}`).toBeDefined();
  await tab!.trigger("click");
  return wrapper.get(`[id="${tab!.attributes("aria-controls")}"]`);
}

describe("Vue Inspector groups", () => {
  it("switches away from an already selected camera and edits the new node from either group", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "create-camera-view", view: { id: "hero", name: "Hero" } });
    editor.dispatch({ type: "create-camera-view", view: { id: "detail", name: "Detail", projection: { kind: "perspective", fov: 35 } } });
    editor.dispatch({ type: "select-node", nodeId: "hero" });
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    const scene = await openGroup(wrapper, "Scene");
    await scene.findAll("button").find((button) => button.text().startsWith("Detail"))!.trigger("click");
    expect(editor.getSnapshot().selection.nodeId).toBe("detail");
    const selected = await openGroup(wrapper, "Properties");
    expect((selected.get('[aria-label="FOV"]').element as HTMLInputElement).value).toBe("35");
    wrapper.unmount();
  });

  it.each(["ambient", "hemisphere", "directional", "point", "spot"])("adds, edits and removes %s lights and resets the add control", async (kind) => {
    const editor = markRaw(createEditor());
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    const scene = await openGroup(wrapper, "Scene");
    const add = scene.get('[aria-label="Add light"]');
    await selectInspectorOption(add, kind);
    const light = Object.values(editor.getSnapshot().lights)[0]!;
    expect(light.kind).toBe(kind);
    expect(editor.getSnapshot().nodes[editor.getSnapshot().selection.nodeId!].kind).toBe("light");
    expect(add.text()).toBe("Add");
    await scene.get('[aria-label="Intensity"]').setValue("2");
    await scene.get('[aria-label="Intensity"]').trigger("keydown", { key: "Enter" });
    expect(editor.getSnapshot().lights[light.id].intensity).toBe(2);
    await selectInspectorOption(add, kind);
    expect(Object.keys(editor.getSnapshot().lights)).toHaveLength(2);
    await scene.findAll("button").find((button) => button.text() === "Remove light")!.trigger("click");
    expect(Object.keys(editor.getSnapshot().lights)).toEqual([light.id]);
    wrapper.unmount();
  });

  it("clears lighting and background assets independently and restores them with undo", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "register-asset", asset: { id: "hdr", kind: "hdr" } });
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    const panel = await openGroup(wrapper, "Environment");
    await panel.findAll("button").find((button) => button.text() === "Shared lighting/background")!.trigger("click");
    await selectInspectorOption(panel.get('[aria-label="Lighting asset"]'), "");
    expect(editor.getSnapshot().environment.lighting.source).toEqual({ kind: "none" });
    expect(editor.getSnapshot().environment.background.source).toEqual({ kind: "hdr", assetId: "hdr" });
    await selectInspectorOption(panel.get('[aria-label="Background asset"]'), "");
    expect(editor.getSnapshot().environment.background.source).toEqual({ kind: "none" });
    editor.undo();
    expect(editor.getSnapshot().environment.background.source).toEqual({ kind: "hdr", assetId: "hdr" });
    wrapper.unmount();
  });

  it("retains six cubemap faces, independent flat backgrounds and diagnostic associations", async () => {
    const editor = markRaw(createEditor());
    for (const id of ["px", "nx", "py", "ny", "pz", "nz", "image"]) {
      editor.dispatch({ type: "register-asset", asset: { id, kind: "image", label: id } });
    }
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    const panel = await openGroup(wrapper, "Environment");
    await panel.findAll("button").find((button) => button.text() === "Use six textures for both")!.trigger("click");
    await selectInspectorOption(panel.get('[aria-label="Background asset"]'), "image");
    await selectInspectorOption(panel.get('[aria-label="Background source"]'), "flat-image");
    const faces = panel.findAll('[role="combobox"]').filter((select) => select.attributes("aria-label")?.startsWith("Lighting ") && !["Lighting source", "Lighting asset"].includes(select.attributes("aria-label")));
    expect(faces).toHaveLength(6);
    for (const face of faces) {
      const options = await inspectorOptions(face);
      expect(options.find((option) => option.attributes("data-ek-value") === "")!.attributes("data-disabled")).toBeDefined();
      await options.find((option) => option.attributes("data-ek-value") === "image")!.trigger("click");
    }
    expect(editor.getSnapshot().environment.lighting.source).toEqual({ kind: "cubemap", faces: ["positive-x", "negative-x", "positive-y", "negative-y", "positive-z", "negative-z"].map((role) => ({ role, assetId: "image" })) });
    expect(editor.getSnapshot().environment.background.source).toEqual({ kind: "flat-image", assetId: "image" });
    const blur = panel.get('[aria-label="Background blur"]');
    await blur.setValue("0.4");
    await blur.trigger("keydown", { key: "Enter" });
    expect(panel.get(`[id="${blur.attributes("aria-describedby")}"]`).text()).not.toBe("");
    wrapper.unmount();
  });

  it("commits explicit default material values once and preserves focus and target across groups", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "box", asset: { id: "box-asset" } });
    editor.dispatch({ type: "select-node", nodeId: "box" });
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    const opacity = wrapper.findAll("label").find((label) => label.text() === "Opacity")!.get("input");
    (opacity.element as HTMLInputElement).focus();
    await opacity.setValue("1");
    await opacity.trigger("keydown", { key: "Enter" });
    expect(editor.getSnapshot().materials.definitions["material:object:box"].override.opacity).toBe(1);
    expect(document.activeElement).toBe(opacity.element);
    await opacity.trigger("blur");
    editor.undo();
    await nextTick();
    expect(editor.getSnapshot().materials.definitions["material:object:box"]).toBeUndefined();
    await opacity.setValue("0.6");
    await opacity.trigger("keydown", { key: "Enter" });
    await openGroup(wrapper, "Environment");
    await openGroup(wrapper, "Properties");
    expect((opacity.element as HTMLInputElement).value).toBe("0.6");
    await opacity.setValue("");
    await opacity.trigger("keydown", { key: "Enter" });
    expect(opacity.attributes("aria-invalid")).toBe("true");
    wrapper.unmount();
  });

  it("shares light edits across groups and clears invalid drafts on camera target changes", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "add-light", light: { id: "sun", kind: "directional", name: "Sun" } });
    editor.dispatch({ type: "select-node", nodeId: "sun" });
    editor.dispatch({ type: "create-camera-view", view: { id: "hero", name: "Hero" } });
    editor.dispatch({ type: "create-camera-view", view: { id: "detail", name: "Detail" } });
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    const properties = await openGroup(wrapper, "Properties");
    const intensity = properties.findAll("label").find((label) => label.text() === "Intensity")!.get("input");
    (intensity.element as HTMLInputElement).focus();
    await intensity.setValue("3");
    await intensity.trigger("keydown", { key: "Enter" });
    expect(editor.getSnapshot().lights.sun.intensity).toBe(3);
    expect(document.activeElement).toBe(intensity.element);
    await intensity.trigger("blur");
    editor.undo();
    await nextTick();
    const scene = await openGroup(wrapper, "Scene");
    expect((scene.get('[aria-label="Intensity"]').element as HTMLInputElement).value).toBe("1");
    const fov = scene.get('[aria-label="FOV"]');
    await fov.setValue("");
    await fov.trigger("keydown", { key: "Enter" });
    expect(fov.attributes("aria-invalid")).toBe("true");
    await scene.findAll("button").find((button) => button.text().startsWith("Detail"))!.trigger("click");
    expect(scene.find('[role="alert"]').exists()).toBe(false);
    expect(editor.getSnapshot().selection.nodeId).toBe("detail");
    expect((scene.get('[aria-label="FOV"]').element as HTMLInputElement).value).toBe("50");
    const selected = await openGroup(wrapper, "Properties");
    expect(selected.findAll('[aria-label="Position X"]')).toHaveLength(1);
    await selected.get('[aria-label="FOV"]').setValue("35");
    await selected.get('[aria-label="FOV"]').trigger("keydown", { key: "Enter" });
    expect(editor.getSnapshot().cameras.detail.projection.fov).toBe(35);
    wrapper.unmount();
  });

  it("commits environment drafts on Enter, retains focus and undoes once", async () => {
    const editor = markRaw(createEditor());
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    const panel = await openGroup(wrapper, "Environment");
    const input = panel.findAll("label").find((label) => label.text().includes("Lighting intensity"))!.get("input");
    (input.element as HTMLInputElement).focus();
    await input.setValue("2.5");
    expect(editor.getSnapshot().environment.lighting.intensity).toBe(1);
    await input.trigger("keydown", { key: "Enter" });
    expect(editor.getSnapshot().environment.lighting.intensity).toBe(2.5);
    expect(document.activeElement).toBe(input.element);
    await input.trigger("blur");
    editor.undo();
    await nextTick();
    expect(editor.getSnapshot().environment.lighting.intensity).toBe(1);
    await input.setValue("");
    await input.trigger("keydown", { key: "Enter" });
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(panel.get('[role="alert"]').text()).toContain("finite number");
    wrapper.unmount();
  });

  it("keeps empty scene editing accessible through keyboard groups without changing the snapshot", async () => {
    const editor = markRaw(createEditor());
    const before = editor.getSnapshot();
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.map((tab) => tab.text())).toEqual(["Properties", "Environment", "Scene"]);
    expect(tabs[0].attributes("aria-selected")).toBe("true");
    expect(wrapper.get('[role="tabpanel"]:not([hidden])').text()).toContain("Select a transformable node");
    await tabs[0].trigger("keydown", { key: "ArrowRight" });
    expect(tabs[1].attributes("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1].element);
    await tabs[1].trigger("keydown", { key: "End" });
    expect(wrapper.get('[role="tabpanel"]:not([hidden])').text()).toContain("Lights");
    await tabs[2].trigger("keydown", { key: "Home" });
    expect(tabs[0].attributes("aria-selected")).toBe("true");
    expect(editor.getSnapshot()).toEqual(before);
    wrapper.unmount();
  });
});
