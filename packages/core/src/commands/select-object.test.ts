import { describe, expect, it, vi } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { CommandDispatcher } from "./dispatcher";

describe("select object command", () => {
  it("changes selection and notifies subscribers once for a valid object", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const listener = vi.fn();
    store.subscribe(listener);

    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    listener.mockClear();

    const result = dispatcher.dispatch({ type: "select-object", objectId: "object-a" });

    expect(result.ok).toBe(true);
    expect(result.snapshot.selection.objectId).toBe("object-a");
    expect(result.snapshot.selection.objectIds).toEqual(["object-a"]);
    expect(result.snapshot.selection.nodeId).toBe("object-a");
    expect(result.snapshot.selection.nodeIds).toEqual(["object-a"]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("supports ordered multi-selection commands", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-c", asset: { id: "asset-c" } });

    expect(dispatcher.dispatch({ type: "select-objects", mode: "replace", objectIds: ["object-a", "object-b"], primaryObjectId: "object-b" }).ok).toBe(true);
    expect(store.getSnapshot().selection).toEqual({ nodeId: "object-b", nodeIds: ["object-a", "object-b"], objectId: "object-b", objectIds: ["object-a", "object-b"] });

    dispatcher.dispatch({ type: "select-objects", mode: "toggle", objectId: "object-b" });
    expect(store.getSnapshot().selection).toEqual({ nodeId: "object-a", nodeIds: ["object-a"], objectId: "object-a", objectIds: ["object-a"] });

    dispatcher.dispatch({ type: "select-objects", mode: "add", objectIds: ["object-c", "object-a"] });
    expect(store.getSnapshot().selection).toEqual({ nodeId: "object-a", nodeIds: ["object-a", "object-c"], objectId: "object-a", objectIds: ["object-a", "object-c"] });

    dispatcher.dispatch({ type: "select-objects", mode: "clear" });
    expect(store.getSnapshot().selection).toEqual({ nodeId: null, nodeIds: [], objectId: null, objectIds: [] });
  });

  it("selects all objects deterministically with roots first", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, parentId: "object-a" });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-c", asset: { id: "asset-c" } });

    const result = dispatcher.dispatch({ type: "select-objects", mode: "all" });

    expect(result.ok).toBe(true);
    expect(result.snapshot.selection).toEqual({ nodeId: "object-a", nodeIds: ["object-a", "object-c", "object-b"], objectId: "object-a", objectIds: ["object-a", "object-c", "object-b"] });
  });

  it("rejects unknown object IDs without mutating selection", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    const result = dispatcher.dispatch({ type: "select-object", objectId: "missing" });

    expect(result.ok).toBe(false);
    expect(result.snapshot.selection.objectId).toBeNull();
    expect(result.snapshot.selection.objectIds).toEqual([]);
  });

  it("rejects primary selections outside the selected object collection", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
    const before = store.getSnapshot();

    const result = dispatcher.dispatch({
      type: "select-objects",
      mode: "replace",
      objectIds: ["object-a"],
      primaryObjectId: "object-b"
    });

    expect(result.ok).toBe(false);
    expect(store.getSnapshot()).toBe(before);
  });
});
