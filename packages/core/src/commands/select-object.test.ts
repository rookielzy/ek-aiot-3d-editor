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
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown object IDs without mutating selection", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());

    const result = dispatcher.dispatch({ type: "select-object", objectId: "missing" });

    expect(result.ok).toBe(false);
    expect(result.snapshot.selection.objectId).toBeNull();
  });
});
