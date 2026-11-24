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
    editor.viewportHelpers.setVisibility({ grid: true, hover: true });
    editor.viewportHelpers.setHover("object-a");
    const serialized = editor.serialize();
    const restored = createEditor();

    restored.restore(serialized);
    restored.dispatch({ type: "select-object", objectId: "object-a" });

    expect(restored.getSnapshot().objects["object-a"].transform.position).toEqual([1, 2, 3]);
    expect(restored.getSnapshot().selection.objectId).toBe("object-a");
    expect(JSON.stringify(serialized)).not.toContain("viewportHelpers");
    expect(JSON.stringify(serialized)).not.toContain("hoverNodeId");
    expect(editor.viewportHelpers.get()).toMatchObject({
      hoverNodeId: "object-a",
      visibility: { grid: true, hover: true }
    });
  });

  it("resets helper session state on restore without writing durable fields", () => {
    const editor = createEditor();
    editor.viewportHelpers.setVisibility({ grid: true, floor: true, hover: true });
    editor.viewportHelpers.setHover("object-a");

    editor.restore(editor.serialize());

    expect(editor.viewportHelpers.get()).toMatchObject({
      hoverNodeId: null,
      visibility: { grid: false, floor: false, hover: false }
    });
    expect(JSON.stringify(editor.serialize())).not.toContain("viewportHelper");
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

    expect(editor.getSnapshot().version).toBe(10);
    expect(editor.getSnapshot().dataSources).toEqual({ connections: {}, queries: {}, bindings: {} });
    expect(editor.getSnapshot().materials).toEqual({ definitions: {}, assignments: {} });
    expect(editor.getSnapshot().objects["object-a"].transform.position).toEqual([9, 0, 0]);
    expect(editor.getSnapshot().nodes["object-a"]).toMatchObject({ kind: "object", objectId: "object-a" });
    expect(editor.getSnapshot().selection).toMatchObject({ nodeId: "object-a", nodeIds: ["object-a"] });
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
