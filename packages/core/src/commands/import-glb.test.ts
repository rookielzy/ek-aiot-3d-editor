import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { createEditor } from "../editor/create-editor";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { CommandDispatcher } from "./dispatcher";

describe("import GLB command", () => {
  it("creates a GLB-backed scene object with stable asset reference and default transform", () => {
    const dispatcher = new CommandDispatcher(new EditorStore(), new CommandHistory(), new AssetRegistry());

    const result = dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", label: "Box", source: { runtime: true } }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.assets["asset-a"]).toEqual({ id: "asset-a", kind: "glb", label: "Box" });
    expect(result.snapshot.objects["object-a"]).toMatchObject({
      id: "object-a",
      name: "Box",
      asset: { id: "asset-a", kind: "glb", label: "Box" },
      parentId: null,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      }
    });
    expect(JSON.stringify(result.snapshot)).not.toContain("runtime");
  });

  it("keeps distinct object IDs for two imports of the same source asset", () => {
    const dispatcher = new CommandDispatcher(new EditorStore(), new CommandHistory(), new AssetRegistry());

    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-a" } });

    const snapshot = dispatcher.dispatch({ type: "select-object", objectId: null }).snapshot;
    expect(Object.keys(snapshot.objects)).toEqual(["object-a", "object-b"]);
    expect(snapshot.objects["object-a"].asset.id).toBe("asset-a");
    expect(snapshot.objects["object-b"].asset.id).toBe("asset-a");
  });

  it("does not register assets when import validation fails", () => {
    const registry = new AssetRegistry();
    const dispatcher = new CommandDispatcher(new EditorStore(), new CommandHistory(), registry);
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });

    const duplicate = dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-b" } });
    const missingParent = dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-b",
      parentId: "missing",
      asset: { id: "asset-c" }
    });

    expect(duplicate.ok).toBe(false);
    expect(missingParent.ok).toBe(false);
    expect(registry.get("asset-b")).toBeUndefined();
    expect(registry.get("asset-c")).toBeUndefined();
  });

  it("rejects non-GLB assets before registering import input", () => {
    const registry = new AssetRegistry();
    const dispatcher = new CommandDispatcher(new EditorStore(), new CommandHistory(), registry);

    const result = dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "texture-a", kind: "texture" }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("GLB asset");
    expect(registry.get("texture-a")).toBeUndefined();
  });

  it("does not register assets when transform normalization fails", () => {
    const registry = new AssetRegistry();
    const dispatcher = new CommandDispatcher(new EditorStore(), new CommandHistory(), registry);

    const result = dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a" },
      transform: { position: [0, Number.NaN, 0] }
    });

    expect(result.ok).toBe(false);
    expect(registry.get("asset-a")).toBeUndefined();
  });

  it("imports under a group node without corrupting object compatibility roots", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Group A" });

    const result = editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      parentId: "group-a",
      asset: { id: "asset-a" }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.nodes["object-a"]).toMatchObject({
      kind: "object",
      objectId: "object-a",
      parentId: "group-a"
    });
    expect(result.snapshot.nodes["group-a"].children).toEqual(["object-a"]);
    expect(result.snapshot.rootNodeIds).toEqual(["group-a"]);
    expect(result.snapshot.objects["object-a"].parentId).toBeNull();
    expect(result.snapshot.rootObjectIds).toEqual(["object-a"]);
  });

  it("rejects light nodes as import parents without registering the asset", () => {
    const registry = new AssetRegistry();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), registry);
    dispatcher.dispatch({ type: "add-light", light: { id: "point-a", kind: "point" } });
    const before = store.getSnapshot();

    const result = dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      parentId: "point-a",
      asset: { id: "asset-a" }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Parent node point-a cannot contain imported objects");
    expect(store.getSnapshot()).toBe(before);
    expect(registry.get("asset-a")).toBeUndefined();
  });
});
