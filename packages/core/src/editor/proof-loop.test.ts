import { Group } from "three";
import { describe, expect, it } from "vitest";
import { AssetResolverBridge } from "../assets/resolver";
import type { RendererLike } from "../runtime/editor-runtime";
import { createEditor } from "./create-editor";

describe("core proof loop", () => {
  it("imports, selects, transforms, undoes, redoes, serializes, restores, and projects the same scene", async () => {
    const editor = createEditor();
    const runtime = editor.mountRuntime({
      container: document.createElement("div"),
      resolver: new AssetResolverBridge(() => ({ uri: "/simple-box.glb" })),
      loader: { load: async () => new Group() },
      rendererFactory: fakeRenderer
    });

    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", label: "Box" } });
    await runtime.project();
    runtime.pickObject("object-a");
    editor.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [7, 0, 0] } });
    expect(editor.getHistoryState().undoCount).toBe(3);
    editor.undo();
    expect(editor.getSnapshot().objects["object-a"].transform.position).toEqual([0, 0, 0]);
    editor.redo();
    expect(editor.getSnapshot().objects["object-a"].transform.position).toEqual([7, 0, 0]);

    const serialized = editor.serialize();
    const restored = createEditor();
    const restoredRuntime = restored.mountRuntime({
      container: document.createElement("div"),
      resolver: new AssetResolverBridge(() => ({ uri: "/simple-box.glb" })),
      loader: { load: async () => new Group() },
      rendererFactory: fakeRenderer
    });
    restored.restore(serialized);
    await restoredRuntime.project();

    expect(restored.getSnapshot().objects["object-a"].transform.position).toEqual([7, 0, 0]);
    expect(restoredRuntime.getObject("object-a")).toBeTruthy();
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
