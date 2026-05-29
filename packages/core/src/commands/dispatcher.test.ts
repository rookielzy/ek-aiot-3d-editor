import { describe, expect, it, vi } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { CommandDispatcher } from "./dispatcher";

describe("command dispatcher", () => {
  it("updates snapshot first and notifies subscribers once per successful command", () => {
    const store = new EditorStore();
    const listener = vi.fn();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    store.subscribe(listener);

    const result = dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", label: "Box" }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.objects["object-a"].asset.id).toBe("asset-a");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].objects["object-a"].asset.id).toBe("asset-a");
  });

  it("returns controlled failures without mutating state", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const before = store.getSnapshot();

    const result = dispatcher.dispatch({
      type: "set-transform",
      objectId: "missing",
      transform: { position: [1, 0, 0] }
    });

    expect(result.ok).toBe(false);
    expect(store.getSnapshot()).toBe(before);
  });
});
