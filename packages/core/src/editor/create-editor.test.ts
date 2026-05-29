import { describe, expect, it, vi } from "vitest";
import { Group } from "three";
import { AssetResolverBridge } from "../assets/resolver";
import type { RendererLike } from "../runtime/editor-runtime";
import { createLegacyProofLoopSnapshot } from "../../test/fixtures/legacy-proof-loop";
import { createEditor } from "./create-editor";

describe("createEditor", () => {
  it("subscribes to core state and dispatches commands through one API", () => {
    const editor = createEditor();
    const subscriber = vi.fn();
    const unsubscribe = editor.subscribe(subscriber);

    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    unsubscribe();
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(editor.getSnapshot().selection.objectId).toBe("object-a");
  });

  it("restores serialized proof-loop state without mounting runtime", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [1, 2, 3] } });
    const serialized = editor.serialize();
    const restored = createEditor();

    restored.restore(serialized);
    restored.dispatch({ type: "select-object", objectId: "object-a" });

    expect(restored.getSnapshot().objects["object-a"].transform.position).toEqual([1, 2, 3]);
    expect(restored.getSnapshot().selection.objectId).toBe("object-a");
  });

  it("accepts legacy serialized snapshots at construction and keeps command/history/runtime behavior working", async () => {
    const editor = createEditor({ snapshot: createLegacyProofLoopSnapshot() });
    const runtime = editor.mountRuntime({
      container: document.createElement("div"),
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Group() },
      rendererFactory: fakeRenderer
    });

    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [9, 0, 0] } });
    editor.undo();
    editor.redo();
    const restored = createEditor({ snapshot: editor.serialize() });
    await runtime.project();

    expect(editor.getSnapshot().version).toBe(2);
    expect(editor.getSnapshot().materials).toEqual({ definitions: {}, assignments: {} });
    expect(editor.getSnapshot().objects["object-a"].transform.position).toEqual([9, 0, 0]);
    expect(restored.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
    expect(runtime.getObject("object-a")).toBeTruthy();
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
