import { mount } from "@vue/test-utils";
import { markRaw, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  AssetResolverBridge,
  attachGlbImportManifestMetadata,
  createEditor,
  createGlbImportManifest,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import InspectorPanel from "../src/components/InspectorPanel.vue";
import { useInspector } from "../src/composables/use-inspector";

describe("Vue InspectorPanel", () => {
  it("renders disabled node transform sections and available scene sections with no selection", () => {
    const editor = markRaw(createEditor());
    const wrapper = mount(InspectorPanel, { props: { editor } });

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
    const wrapper = mount(InspectorPanel, { props: { editor } });

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
    const wrapper = mount(InspectorPanel, { props: { editor } });

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
    const wrapper = mount(InspectorPanel, { props: { editor } });

    const colorInputs = wrapper.findAll('input[type="color"]');
    await colorInputs[0].setValue("#336699");

    expect(editor.getSnapshot().materials.definitions["material:object:object-a"].override.color).toBe("#336699");
    editor.undo();
    expect(editor.getSnapshot().materials.definitions["material:object:object-a"]).toBeUndefined();

    wrapper.unmount();
  });

  it("renders material slot targets and dispatches slot-aware material commands", async () => {
    const editor = markRaw(createSlotEditor());
    const slotId = getSlotIds(editor)[0]!;
    const dispatchSpy = vi.spyOn(editor, "dispatch");
    const wrapper = mount(InspectorPanel, { props: { editor } });

    const bodyTarget = wrapper.findAll(".ek-material-target-option").find((option) => option.text().includes("Body"));
    expect(bodyTarget).toBeTruthy();
    await bodyTarget!.find('input[type="radio"]').setValue(true);
    const baseColor = wrapper.findAll('input[type="color"]')[0];
    await baseColor.setValue("#336699");

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
    const wrapper = mount(InspectorPanel, { props: { editor } });

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
    const wrapper = mount(InspectorPanel, { props: { editor } });

    const roughness = wrapper.findAll("label").find((label) => label.text().includes("Roughness"))?.find('input[type="number"]');
    if (!roughness) {
      throw new Error("Roughness input was not rendered");
    }
    await roughness.setValue("0.42");
    await roughness.trigger("blur");
    editor.dispatch({ type: "select-node", nodeId: importedNodeId });
    await nextTick();
    const baseColor = wrapper.findAll('input[type="color"]')[0];
    await baseColor.setValue("#336699");

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
    const wrapper = mount(InspectorPanel, { props: { editor } });

    const bodyTarget = wrapper.findAll(".ek-material-target-option").find((option) => option.text().includes("Body"));
    expect(bodyTarget).toBeTruthy();
    await bodyTarget!.find('input[type="radio"]').setValue(true);
    const baseColor = wrapper.findAll('input[type="color"]')[0];
    await baseColor.setValue("#336699");
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
    const wrapper = mount(InspectorPanel, { props: { editor } });

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
    const wrapper = mount(InspectorPanel, { props: { editor } });

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

  it("selects an HDR environment asset from the default scene state", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "register-asset", asset: { id: "studio-hdr", kind: "hdr", label: "Studio HDR" } });
    const wrapper = mount(InspectorPanel, { props: { editor } });

    const lightingAsset = wrapper.findAll("label").find((label) => label.text().includes("Lighting asset"))?.find("select");
    if (!lightingAsset) {
      throw new Error("Lighting asset select was not rendered");
    }
    await lightingAsset.setValue("studio-hdr");

    expect(editor.getSnapshot().environment.lighting.source).toEqual({ kind: "hdr", assetId: "studio-hdr" });
    wrapper.unmount();
  });

  it("applies shared environment presets through core commands", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "register-asset", asset: { id: "studio-hdr", kind: "hdr", label: "Studio HDR" } });
    const wrapper = mount(InspectorPanel, { props: { editor } });

    const preset = wrapper.findAll("button").find((button) => button.text() === "Shared lighting/background");
    expect(preset).toBeTruthy();
    await preset!.trigger("click");

    expect(editor.getSnapshot().environment.lighting.source).toEqual({ kind: "hdr", assetId: "studio-hdr" });
    expect(editor.getSnapshot().environment.background.source).toEqual({ kind: "hdr", assetId: "studio-hdr" });
    wrapper.unmount();
  });

  it("edits authored camera views through core inspector commands", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a", name: "Hero", projection: { kind: "perspective", fov: 60 } } });
    const dispatchSpy = vi.spyOn(editor, "dispatch");
    const wrapper = mount(InspectorPanel, { props: { editor } });

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
    const wrapper = mount(InspectorPanel, { props: { editor } });

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
    const wrapper = mount(InspectorPanel, { props: { editor } });

    await wrapper.findAll("button").find((button) => button.text() === "Capture")?.trigger("click");
    await nextTick();
    await wrapper.findAll("button").find((button) => button.text() === "Apply")?.trigger("click");

    expect(editor.getSnapshot().cameras["view-a"]).toBeDefined();
    expect(applyCameraView).toHaveBeenCalledWith(editor.getSnapshot().cameras["view-a"]);
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
