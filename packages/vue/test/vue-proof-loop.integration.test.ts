import { Group } from "three";
import { describe, expect, it } from "vitest";
import { markRaw } from "vue";
import { createEditor, AssetResolverBridge, type RendererLike } from "@ek-aiot/3d-editor-core";
import { useEditor } from "../src/composables/use-editor";

describe("Vue proof-loop parity", () => {
  it("uses core command, asset, history, and runtime behavior for restored snapshots", async () => {
    const core = createEditor();
    core.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    core.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture" } });
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
    const runtime = vue.editor.mountRuntime({
      container: document.createElement("div"),
      resolver: new AssetResolverBridge((asset) => asset.kind === "glb" ? { uri: "/box.glb" } : null),
      loader: { load: async () => new Group() },
      rendererFactory: fakeRenderer
    });

    await runtime.project();

    expect(vue.snapshot.value.objects["object-a"].transform.position).toEqual([3, 0, 0]);
    expect(vue.snapshot.value.materials.definitions["material:object:object-a"].override.textures?.map?.assetId).toBe("texture-a");
    expect(vue.snapshot.value.environment.environment.assetId).toBe("hdr-a");
    expect(vue.snapshot.value.lights["light-a"].intensity).toBe(2);
    expect(runtime.getObject("object-a")).toBeTruthy();
    expect(runtime.getProblems()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "environment-asset-unresolved", assetId: "hdr-a", metadata: { role: "background" } }),
      expect.objectContaining({ code: "environment-asset-unresolved", assetId: "hdr-a", metadata: { role: "environment" } })
    ]));
    vue.dispose();
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
