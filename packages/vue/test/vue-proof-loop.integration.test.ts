import { Group } from "three";
import { describe, expect, it } from "vitest";
import { markRaw } from "vue";
import { createEditor, AssetResolverBridge, type RendererLike } from "@ek-aiot/3d-editor-core";
import { useEditor } from "../src/composables/use-editor";

describe("Vue proof-loop parity", () => {
  it("uses core command, asset, history, and runtime behavior for restored snapshots", async () => {
    const core = createEditor();
    core.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    core.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [3, 0, 0] } });
    const vue = useEditor({ editor: markRaw(createEditor({ snapshot: core.serialize() })) });
    const runtime = vue.editor.mountRuntime({
      container: document.createElement("div"),
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Group() },
      rendererFactory: fakeRenderer
    });

    await runtime.project();

    expect(vue.snapshot.value.objects["object-a"].transform.position).toEqual([3, 0, 0]);
    expect(runtime.getObject("object-a")).toBeTruthy();
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
