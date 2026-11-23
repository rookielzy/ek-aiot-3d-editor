import { selectInspectorOption, setInspectorColor } from "./support/inspector-controls";
import { mount } from "@vue/test-utils";
import { markRaw, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  AssetResolverBridge,
  attachGlbImportManifestMetadata,
  createEditor,
  createGlbImportManifest,
  createMessageDescriptor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import InspectorPanel from "../src/components/InspectorPanel.vue";
import ProblemsPanel from "../src/components/ProblemsPanel.vue";
import { useInspector } from "../src/composables/use-inspector";

describe("Vue InspectorPanel", () => {
  it("disables unresolved slots without assignments while keeping the owner editable", async () => {
    const editor = markRaw(createSlotEditor());
    const slotId = getSlotIds(editor)[0]!;
    const runtime = {
        getProblems: () => [{
          id: "unresolved-slot", severity: "warning", code: "imported-material-slot-unresolved", source: "runtime",
          target: { kind: "object", objectId: "object-a" }, metadata: { slotId }, recoverability: "user-action",
          message: "Imported material slot could not be resolved."
        }],
        subscribeProblems: () => () => {}
    };
    vi.spyOn(editor, "getRuntime").mockReturnValue(runtime as never);
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Material")!.trigger("click");
    const body = wrapper.findAll(".ek-material-target-option").find((target) => target.text().includes("Body"))!;
    expect(body.get("input").attributes("disabled")).toBeDefined();
    expect(body.text()).toContain("Slot is unresolved and cannot create a new assignment.");
    editor.dispatch({ type: "select-node", nodeId: getImportedNodeIds(editor)[0]! });
    await nextTick();
    const owner = wrapper.findAll(".ek-material-target-option").find((target) => target.text().includes("Object override"))!;
    expect((owner.get("input").element as HTMLInputElement).checked).toBe(true);
    wrapper.unmount();
  });

  it("preserves a manual material slot across groups and discards drafts when targets change", async () => {
    const editor = markRaw(createSlotEditor());
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Material")!.trigger("click");
    const target = (name: string) => wrapper.findAll(".ek-material-target-option").find((item) => item.text().includes(name))!.get('input[type="radio"]');
    const field = (name: string) => wrapper.findAll("label").find((label) => label.text().startsWith(name))!.get("input");
    await target("Body").setValue(true);
    await field("Roughness").setValue("0.25");
    await field("Roughness").trigger("keydown", { key: "Enter" });
    for (const name of ["Environment", "Scene", "Properties"]) {
      await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === name)!.trigger("click");
    }
    expect((target("Body").element as HTMLInputElement).checked).toBe(true);
    expect((field("Roughness").element as HTMLInputElement).value).toBe("0.25");
    await field("Opacity").setValue("2");
    await field("Opacity").trigger("blur");
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await target("Screen").setValue(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    await field("Roughness").setValue("0.6");
    editor.dispatch({ type: "select-node", nodeId: getImportedNodeIds(editor)[0]! });
    await nextTick();
    expect((field("Roughness").element as HTMLInputElement).value).toBe("0.25");
    editor.dispatch({ type: "select-node", nodeId: "object-a" });
    await nextTick();
    expect((target("Object override").element as HTMLInputElement).checked).toBe(true);
    expect((field("Roughness").element as HTMLInputElement).value).toBe("1");
    wrapper.unmount();
  });

  it("keeps stale assignments editable and all six texture fields reachable", async () => {
    const editor = markRaw(createSlotEditor());
    const slotId = getSlotIds(editor)[0]!;
    editor.dispatch({ type: "set-material", target: { kind: "material-slot", objectId: "object-a", slotId }, material: { opacity: 0.5 } });
    const snapshot = editor.getSnapshot();
    editor.restore({ ...snapshot, nodes: Object.fromEntries(Object.entries(snapshot.nodes).map(([id, node]) => [id, node.kind === "imported" ? { ...node, materialSlots: [] } : node])) });
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Material")!.trigger("click");
    await wrapper.findAll(".ek-material-target-option").find((item) => item.text().includes("Unresolved slot"))!.get("input").setValue(true);
    expect(wrapper.text()).toContain("Existing override values remain editable");
    const opacity = wrapper.findAll("label").find((label) => label.text() === "Opacity")!.get("input");
    await opacity.setValue("0.75");
    await opacity.trigger("keydown", { key: "Enter" });
    expect((opacity.element as HTMLInputElement).value).toBe("0.75");
    editor.undo();
    await nextTick();
    expect((opacity.element as HTMLInputElement).value).toBe("0.5");
    for (const name of ["map", "normal map", "roughness map", "metalness map", "emissive map", "alpha map"]) {
      expect(wrapper.findAll("label").find((label) => label.text().startsWith(name))!.get('[role="combobox"]').attributes("disabled")).toBeUndefined();
    }
    wrapper.unmount();
  });

  it("commits degrees once, cancels drafts and reports invalid transforms without losing focus", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    const rotation = wrapper.get('[aria-label="Rotation Y"]');
    (rotation.element as HTMLInputElement).focus();
    await rotation.setValue("90");
    expect(editor.getSnapshot().objects["object-a"].transform.rotation[1]).toBe(0);
    await rotation.trigger("keydown", { key: "Enter" });
    expect(editor.getSnapshot().objects["object-a"].transform.rotation[1]).toBeCloseTo(Math.PI / 2);
    expect(document.activeElement).toBe(rotation.element);
    await rotation.trigger("blur");
    editor.undo();
    await nextTick();
    expect((rotation.element as HTMLInputElement).value).toBe("0");
    editor.redo();
    await nextTick();
    await rotation.setValue("45");
    await rotation.trigger("keydown", { key: "Escape" });
    await rotation.trigger("blur");
    expect((rotation.element as HTMLInputElement).value).toBe("90");
    expect(editor.getSnapshot().objects["object-a"].transform.rotation[1]).toBeCloseTo(Math.PI / 2);
    await rotation.setValue("");
    await rotation.trigger("keydown", { key: "Enter" });
    expect(wrapper.get('[role="alert"]').text()).toContain("finite number");
    expect(rotation.attributes("aria-invalid")).toBe("true");
    await rotation.trigger("keydown", { key: "Escape" });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    await rotation.setValue("45");
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
    editor.dispatch({ type: "select-object", objectId: "object-b" });
    await nextTick();
    const nextRotation = wrapper.get('[aria-label="Rotation Y"]');
    expect((nextRotation.element as HTMLInputElement).value).toBe("0");
    wrapper.unmount();
  });

  it("renders disabled node transform sections and available scene sections with no selection", () => {
    const editor = markRaw(createEditor());
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });

    expect(wrapper.text()).toContain("Select a transformable node to edit transform.");
    expect(wrapper.text()).toContain("Environment");
    expect(wrapper.text()).toContain("Lights");

    wrapper.unmount();
  });

  it("commits transform edits through one core command", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const dispatchSpy = vi.spyOn(editor, "dispatch");
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });

    const input = wrapper.find('input[type="number"]');
    await input.setValue("4");
    await input.trigger("blur");

    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "set-node-transform", nodeId: "object-a", transform: { position: [4, 0, 0] } });
    expect(editor.getSnapshot().objects["object-a"].transform.position).toEqual([4, 0, 0]);

    wrapper.unmount();
  });

  it("refreshes panel snapshots after sequential transform commits", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });

    const inputs = () => wrapper.findAll('input[type="number"]');
    await inputs()[0].setValue("4");
    await inputs()[0].trigger("blur");
    await nextTick();
    await inputs()[1].setValue("5");
    await inputs()[1].trigger("blur");
    await nextTick();

    expect(editor.getSnapshot().objects["object-a"].transform.position).toEqual([4, 5, 0]);

    editor.undo();
    await nextTick();
    expect((inputs()[1].element as HTMLInputElement).value).toBe("0");

    wrapper.unmount();
  });

  it("commits material color through set-material and undo restores it", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Material")!.trigger("click");

    const colorInputs = wrapper.findAll(".ek-ui-color-trigger");
    await setInspectorColor(colorInputs[0], "#336699");

    expect(editor.getSnapshot().materials.definitions["material:object:object-a"].override.color).toBe("#336699");
    editor.undo();
    expect(editor.getSnapshot().materials.definitions["material:object:object-a"]).toBeUndefined();

    wrapper.unmount();
  });

  it("renders material slot targets and dispatches slot-aware material commands", async () => {
    const editor = markRaw(createSlotEditor());
    const slotId = getSlotIds(editor)[0]!;
    const dispatchSpy = vi.spyOn(editor, "dispatch");
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Material")!.trigger("click");

    const bodyTarget = wrapper.findAll(".ek-material-target-option").find((option) => option.text().includes("Body"));
    expect(bodyTarget).toBeTruthy();
    await bodyTarget!.find('input[type="radio"]').setValue(true);
    const baseColor = wrapper.findAll(".ek-ui-color-trigger")[0];
    await setInspectorColor(baseColor, "#336699");

    expect(dispatchSpy).toHaveBeenLastCalledWith({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId },
      material: { color: "#336699" }
    });
    wrapper.unmount();
  });

  it("keeps broad material target behavior when object override remains active", async () => {
    const editor = markRaw(createSlotEditor());
    const dispatchSpy = vi.spyOn(editor, "dispatch");
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Material")!.trigger("click");

    const roughness = wrapper.findAll("label").find((label) => label.text().includes("Roughness"))?.find('input[type="number"]');
    if (!roughness) {
      throw new Error("Roughness input was not rendered");
    }
    await roughness.setValue("0.42");
    await roughness.trigger("blur");

    expect(dispatchSpy).toHaveBeenLastCalledWith({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { roughness: 0.42 }
    });
    wrapper.unmount();
  });

  it("resets material target to the selected imported node slot context", async () => {
    const editor = markRaw(createSlotEditor());
    const importedNodeId = getImportedNodeIds(editor)[0]!;
    const slotId = getSlotIds(editor)[0]!;
    const dispatchSpy = vi.spyOn(editor, "dispatch");
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Material")!.trigger("click");

    const roughness = wrapper.findAll("label").find((label) => label.text().includes("Roughness"))?.find('input[type="number"]');
    if (!roughness) {
      throw new Error("Roughness input was not rendered");
    }
    await roughness.setValue("0.42");
    await roughness.trigger("blur");
    editor.dispatch({ type: "select-node", nodeId: importedNodeId });
    await nextTick();
    const baseColor = wrapper.findAll(".ek-ui-color-trigger")[0];
    await setInspectorColor(baseColor, "#336699");

    expect(dispatchSpy).toHaveBeenLastCalledWith({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId },
      material: { color: "#336699" }
    });
    wrapper.unmount();
  });

  it("resets material target to broad object when selection returns to the owner object", async () => {
    const editor = markRaw(createSlotEditor());
    const slotId = getSlotIds(editor)[0]!;
    const dispatchSpy = vi.spyOn(editor, "dispatch");
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Material")!.trigger("click");

    const bodyTarget = wrapper.findAll(".ek-material-target-option").find((option) => option.text().includes("Body"));
    expect(bodyTarget).toBeTruthy();
    await bodyTarget!.find('input[type="radio"]').setValue(true);
    const baseColor = wrapper.findAll(".ek-ui-color-trigger")[0];
    await setInspectorColor(baseColor, "#336699");
    expect(dispatchSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      target: { kind: "material-slot", objectId: "object-a", slotId }
    }));

    const importedNodeId = getImportedNodeIds(editor)[0]!;
    editor.dispatch({ type: "select-node", nodeId: importedNodeId });
    await nextTick();
    expect((bodyTarget!.find('input[type="radio"]').element as HTMLInputElement).checked).toBe(true);
    editor.dispatch({ type: "select-node", nodeId: "object-a" });
    await nextTick();
    const objectTarget = wrapper.findAll(".ek-material-target-option").find((option) => option.text().includes("Object override"));
    expect((objectTarget!.find('input[type="radio"]').element as HTMLInputElement).checked).toBe(true);
    const roughness = wrapper.findAll("label").find((label) => label.text().includes("Roughness"))?.find('input[type="number"]');
    if (!roughness) {
      throw new Error("Roughness input was not rendered");
    }
    await roughness.setValue("0.42");
    await roughness.trigger("blur");

    expect(dispatchSpy).toHaveBeenLastCalledWith({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { roughness: 0.42 }
    });
    wrapper.unmount();
  });

  it("shows controlled material field problems without dispatching invalid drafts", async () => {
    const editor = markRaw(createSlotEditor());
    const dispatchSpy = vi.spyOn(editor, "dispatch");
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Material")!.trigger("click");

    const opacity = wrapper.findAll("label").find((label) => label.text().includes("Opacity"))?.find('input[type="number"]');
    if (!opacity) {
      throw new Error("Opacity input was not rendered");
    }
    await opacity.setValue("1.2");
    await opacity.trigger("blur");

    expect(wrapper.text()).toContain("less than or equal to 1");
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: "set-material" }));
    wrapper.unmount();
  });

  it("subscribes and cleans up inspector runtime problem observations", () => {
    const editor = markRaw(createEditor());
    const unsubscribe = vi.fn();
    const runtime = {
      getProblems: () => [],
      subscribeProblems: vi.fn(() => unsubscribe)
    };
    vi.spyOn(editor, "getRuntime").mockReturnValue(runtime as never);

    const inspector = useInspector({ editor });
    inspector.dispose();

    expect(runtime.subscribeProblems).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("subscribes to runtime problems when viewport mounts after the inspector", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });

    const runtime = editor.mountRuntime({
      container: document.createElement("div"),
      resolver: new AssetResolverBridge(() => null),
      rendererFactory: (container) => ({
        domElement: container.ownerDocument.createElement("canvas"),
        setSize() {},
        render() {},
        dispose() {}
      })
    });
    await runtime.project();
    await nextTick();

    expect(wrapper.text()).toContain("Asset could not be resolved");
    wrapper.unmount();
  });

  it("renders descriptor-only problem details and action labels", () => {
    const wrapper = mount(ProblemsPanel, {
      props: {
        section: {
          id: "problems",
          title: "Problems",
          enabled: true,
          fields: [],
          problems: [{
            id: "problem-a",
            severity: "warning",
            code: "texture-missing",
            source: "runtime",
            target: { kind: "texture-slot", materialId: "material-a", slot: "map", assetId: "asset-a" },
            title: "Texture missing",
            detailDescriptor: createMessageDescriptor({
              key: "problem.material.textureAssetUnresolved.detail",
              fallback: "Texture slot {slot} references missing or unavailable asset {assetId}.",
              values: { slot: "map", assetId: "asset-a" }
            }),
            assetId: "asset-a",
            recoverability: "user-action",
            acknowledged: false,
            actionLabelDescriptor: createMessageDescriptor({
              key: "problem.importedTarget.reviewRemap.actionLabel",
              fallback: "Review remap"
            }),
            runtime: true
          }]
        }
      }
    });

    expect(wrapper.text()).toContain("Texture slot map references missing or unavailable asset asset-a.");
    expect(wrapper.text()).toContain("Review remap");
    wrapper.unmount();
  });

  it("selects an HDR environment asset from the default scene state", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "register-asset", asset: { id: "studio-hdr", kind: "hdr", label: "Studio HDR" } });
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Environment")!.trigger("click");

    const lightingAsset = wrapper.findAll("label").find((label) => label.text().includes("Lighting asset"))?.find('[role="combobox"]');
    if (!lightingAsset) {
      throw new Error("Lighting asset select was not rendered");
    }
    await selectInspectorOption(lightingAsset, "studio-hdr");

    expect(editor.getSnapshot().environment.lighting.source).toEqual({ kind: "hdr", assetId: "studio-hdr" });
    wrapper.unmount();
  });

  it("applies shared environment presets through core commands", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "register-asset", asset: { id: "studio-hdr", kind: "hdr", label: "Studio HDR" } });
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Environment")!.trigger("click");

    const preset = wrapper.findAll("button").find((button) => button.text() === "Shared lighting/background");
    expect(preset).toBeTruthy();
    await preset!.trigger("click");

    expect(editor.getSnapshot().environment.lighting.source).toEqual({ kind: "hdr", assetId: "studio-hdr" });
    expect(editor.getSnapshot().environment.background.source).toEqual({ kind: "hdr", assetId: "studio-hdr" });
    wrapper.unmount();
  });

  it("edits light shadow controls through core inspector commands", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "add-light", light: { id: "sun", kind: "directional" } });
    editor.dispatch({ type: "select-node", nodeId: "sun" });
    const dispatchSpy = vi.spyOn(editor, "dispatch");
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });

    const castShadows = wrapper.findAll("label").find((label) => label.text().includes("Cast shadows"))?.find('[role="switch"]');
    const mapWidth = wrapper.findAll("label").find((label) => label.text().includes("Shadow map width"))?.find('input[type="number"]');
    if (!castShadows || !mapWidth) {
      throw new Error("Shadow controls were not rendered");
    }
    await castShadows.trigger("click");
    await mapWidth.setValue("2048");
    await mapWidth.trigger("blur");

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: "update-light",
      lightId: "sun",
      patch: expect.objectContaining({
        shadow: expect.objectContaining({ enabled: true })
      })
    }));
    expect(editor.getSnapshot().lights.sun.shadow).toMatchObject({
      enabled: true,
      mapSize: { width: 2048 }
    });
    wrapper.unmount();
  });

  it("renders lighting presets and active light diagnostics", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "add-light", light: { id: "point-a", kind: "point" } });
    editor.dispatch({ type: "select-node", nodeId: "point-a" });
    const runtime = {
        getProblems: () => [{
          id: "lighting-point-shadow-cost:point-a",
          severity: "warning",
          code: "lighting-point-shadow-cost",
          source: "runtime",
          target: { kind: "light", lightId: "point-a" },
          recoverability: "user-action",
          message: "Point shadows render six faces.",
          display: {
            title: "Point light shadow is expensive",
            detail: "Point light uses six shadow map faces."
          }
        }],
        subscribeProblems: () => () => {}
      };
    vi.spyOn(editor, "getRuntime").mockReturnValue(runtime as never);
    vi.spyOn(editor, "subscribeRuntime").mockImplementation((subscriber) => {
      subscriber(runtime as never);
      return () => {};
    });
    const dispatchSpy = vi.spyOn(editor, "dispatch");
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });

    expect(wrapper.text()).toContain("Point light shadow is expensive");
    expect(wrapper.text()).toContain("Point light uses six shadow map faces.");
    const preset = wrapper.findAll("button").find((button) => button.text() === "Point preview");
    expect(preset).toBeTruthy();
    await preset!.trigger("click");

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: "update-light",
      lightId: "point-a"
    }));
    expect(editor.getSnapshot().lights["point-a"].shadow.enabled).toBe(true);
    wrapper.unmount();
  });

  it("shows light shadow validation problems without dispatching invalid drafts", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "add-light", light: { id: "sun", kind: "directional" } });
    editor.dispatch({ type: "select-node", nodeId: "sun" });
    const dispatchSpy = vi.spyOn(editor, "dispatch");
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });

    const mapWidth = wrapper.findAll("label").find((label) => label.text().includes("Shadow map width"))?.find('input[type="number"]');
    if (!mapWidth) {
      throw new Error("Shadow map width input was not rendered");
    }
    await mapWidth.setValue("0");
    await mapWidth.trigger("blur");

    expect(wrapper.text()).toContain("greater than or equal to 1");
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: "update-light" }));
    wrapper.unmount();
  });

  it("edits authored camera views through core inspector commands", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a", name: "Hero", projection: { kind: "perspective", fov: 60 } } });
    const dispatchSpy = vi.spyOn(editor, "dispatch");
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Scene")!.trigger("click");
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Camera views")!.trigger("click");

    const fov = wrapper.findAll("label").find((label) => label.text().includes("FOV"))?.find('input[type="number"]');
    if (!fov) {
      throw new Error("FOV input was not rendered");
    }
    await fov.setValue("35");
    await fov.trigger("blur");
    await wrapper.findAll("button").find((button) => button.text() === "Set default")?.trigger("click");

    expect(dispatchSpy).toHaveBeenCalledWith({
      type: "update-camera-view",
      viewId: "view-a",
      patch: { projection: { kind: "perspective", fov: 35 } }
    });
    expect(editor.getSnapshot().presentation.defaultCameraId).toBe("view-a");
    wrapper.unmount();
  });

  it("shows camera field validation problems without dispatching invalid camera commands", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a" } });
    const dispatchSpy = vi.spyOn(editor, "dispatch");
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Scene")!.trigger("click");
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Camera views")!.trigger("click");

    const fov = wrapper.findAll("label").find((label) => label.text().includes("FOV"))?.find('input[type="number"]');
    if (!fov) {
      throw new Error("FOV input was not rendered");
    }
    await fov.setValue("180");
    await fov.trigger("blur");

    expect(wrapper.text()).toContain("less than or equal");
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: "update-camera-view" }));
    wrapper.unmount();
  });

  it("wires standalone camera capture and apply through the mounted runtime", async () => {
    const editor = markRaw(createEditor());
    const runtime = editor.mountRuntime({
      container: document.createElement("div"),
      rendererFactory: fakeRenderer
    });
    const captureCameraView = vi.spyOn(runtime, "captureCameraView");
    const applyCameraView = vi.spyOn(runtime, "applyCameraView");
    captureCameraView.mockReturnValueOnce({
      ok: true,
      view: {
        id: "view-a",
        name: "Hero",
        projection: { kind: "perspective", fov: 50 },
        position: [1, 2, 3],
        target: [0, 0, 0],
        near: 0.1,
        far: 1000
      }
    });
    const wrapper = mount(InspectorPanel, { attachTo: document.body, props: { editor } });
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Scene")!.trigger("click");
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Camera views")!.trigger("click");

    await wrapper.findAll("button").find((button) => button.text() === "Capture")?.trigger("click");
    await nextTick();
    await wrapper.findAll("button").find((button) => button.text() === "Apply")?.trigger("click");

    expect(editor.getSnapshot().cameras["view-a"]).toBeDefined();
    expect(applyCameraView).toHaveBeenCalledWith(editor.getSnapshot().cameras["view-a"]);
    const click = async (name: string) => {
      await wrapper.findAll("button").find((button) => button.text() === name)!.trigger("click");
    };
    await click("Set default");
    expect(editor.getSnapshot().presentation.defaultCameraId).toBe("view-a");
    await click("Clear default");
    expect(editor.getSnapshot().presentation.defaultCameraId).toBeNull();
    captureCameraView.mockReturnValueOnce({ ok: true, view: { ...editor.getSnapshot().cameras["view-a"], position: [3, 4, 5] } });
    await click("Update");
    expect(editor.getSnapshot().cameras["view-a"].position).toEqual([3, 4, 5]);
    await click("Delete view");
    expect(Object.keys(editor.getSnapshot().cameras)).toHaveLength(0);
    expect(wrapper.text()).toContain("Capture a camera view to author presentation state.");
    wrapper.unmount();
  });
});

function createSlotEditor() {
  const editor = createEditor();
  editor.dispatch({
    type: "import-glb",
    objectId: "object-a",
    asset: {
      id: "asset-a",
      metadata: attachGlbImportManifestMetadata(undefined, createSlotManifest())
    },
    expandImportedTargets: true
  });
  editor.dispatch({ type: "select-node", nodeId: "object-a" });
  return editor;
}

function getSlotIds(editor: ReturnType<typeof createEditor>) {
  return Object.values(editor.getSnapshot().nodes)
    .filter((node) => node.kind === "imported")
    .flatMap((node) => node.materialSlots?.map((slot) => slot.slotKey) ?? []);
}

function getImportedNodeIds(editor: ReturnType<typeof createEditor>) {
  return Object.values(editor.getSnapshot().nodes)
    .filter((node) => node.kind === "imported" && node.source.kind === "primitive")
    .map((node) => node.id)
    .sort();
}

function createSlotManifest() {
  return createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name: "Panel", mesh: 0 }],
          meshes: [{
            name: "Panel mesh",
            primitives: [
              { attributes: { POSITION: 0, NORMAL: 1 }, material: 0 },
              { attributes: { POSITION: 2, NORMAL: 3 }, material: 1 }
            ]
          }],
          materials: [{ name: "Body" }, { name: "Screen" }]
        }
      }
    }
  });
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
