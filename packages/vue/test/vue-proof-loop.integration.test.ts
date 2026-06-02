import { Group } from "three";
import { describe, expect, it } from "vitest";
import { h, markRaw, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createEditor, AssetResolverBridge, type RendererLike } from "@ek-aiot/3d-editor-core";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";
import { useEditor } from "../src/composables/use-editor";

describe("Vue proof-loop parity", () => {
  it("uses core command, asset, history, and runtime behavior for restored snapshots", async () => {
    const core = createEditor();
    core.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    core.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture" } });
    core.registerAsset({ id: "hdr-a", kind: "hdr" });
    core.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });
    core.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { color: "#ffffff", textures: { map: { assetId: "texture-a" } } }
    });
    core.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: { assetId: "hdr-a", intensity: 1, rotation: { x: 0, y: 0, z: 0 } },
        background: { mode: "hdr", assetId: "hdr-a" }
      }
    });
    core.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    core.dispatch({ type: "update-light", lightId: "light-a", patch: { intensity: 2 } });
    core.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [3, 0, 0] } });
    const vue = useEditor({ editor: markRaw(createEditor({ snapshot: core.serialize() })) });
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor: vue.editor,
        resolver: new AssetResolverBridge((asset) => asset.kind === "glb" ? { uri: "/box.glb" } : null),
        loader: { load: async () => new Group() },
        rendererFactory: fakeRenderer
      },
      slots: {
        status: ({ runtimeProblems }) => h("span", `Runtime problems ${runtimeProblems.length}`)
      }
    });
    const runtime = vue.editor.getRuntime();

    await runtime?.project();
    await nextTick();

    expect(vue.snapshot.value.objects["object-a"].transform.position).toEqual([3, 0, 0]);
    expect(vue.snapshot.value.materials.definitions["material:object:object-a"].override.textures?.map?.assetId).toBe("texture-a");
    expect(vue.snapshot.value.environment.environment.assetId).toBe("hdr-a");
    expect(vue.snapshot.value.lights["light-a"].intensity).toBe(2);
    expect(runtime?.getObject("object-a")).toBeTruthy();
    expect(runtime?.getProblems()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "environment-asset-unresolved", assetId: "hdr-a", metadata: { role: "background" } }),
      expect.objectContaining({ code: "environment-asset-unresolved", assetId: "hdr-a", metadata: { role: "environment" } })
    ]));
    expect(wrapper.text()).toContain("Runtime problems 2");
    expect(JSON.stringify(vue.editor.serialize())).not.toContain("environment-asset-unresolved");
    wrapper.unmount();
    vue.dispose();
  });

  it("renders workbench regions beside the inspector and commits through core commands", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });

    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer },
      slots: {
        toolbar: ({ dispatch, editor: workbenchEditor }) => [
          h("button", {
            onClick: () => dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [4, 0, 0] } })
          }, "Move object"),
          h("button", {
            onClick: () => {
              const saved = workbenchEditor.serialize();
              workbenchEditor.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [8, 0, 0] } });
              workbenchEditor.restore(saved);
            }
          }, "Save restore")
        ],
        sidePanel: ({ snapshot, inspector }) => h("span", `${inspector.selection.objectId}:${Object.keys(snapshot.objects).length}`),
        viewportOverlay: ({ runtimeProblems }) => h("span", `${runtimeProblems.length} runtime problems`)
      }
    });

    expect(wrapper.text()).toContain("object-a:1");
    expect(wrapper.text()).toContain("Transform");
    expect(wrapper.text()).toContain("Material");
    expect(wrapper.text()).toContain("Environment");
    expect(wrapper.text()).toContain("Lights");

    const moveButton = wrapper.findAll("button").find((button) => button.text() === "Move object");
    expect(moveButton).toBeTruthy();
    await moveButton!.trigger("click");
    expect(editor.getSnapshot().objects["object-a"].transform.position).toEqual([4, 0, 0]);

    const restoreButton = wrapper.findAll("button").find((button) => button.text() === "Save restore");
    expect(restoreButton).toBeTruthy();
    await restoreButton!.trigger("click");
    expect(editor.getSnapshot().objects["object-a"].transform.position).toEqual([4, 0, 0]);
    wrapper.unmount();
  });
});

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
