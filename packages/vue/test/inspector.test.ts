import { mount } from "@vue/test-utils";
import { markRaw, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import { AssetResolverBridge, createEditor } from "@ek-aiot/3d-editor-core";
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

    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "set-transform", objectId: "object-a", transform: { position: [4, 0, 0] } });
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

    expect(editor.getSnapshot().environment.mode).toBe("hdr");
    expect(editor.getSnapshot().environment.environment.assetId).toBe("studio-hdr");
    wrapper.unmount();
  });
});
