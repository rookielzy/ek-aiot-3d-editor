import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { CommandDispatcher } from "../commands/dispatcher";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { ObjectPicker } from "./picking";
import { PerspectiveCamera } from "three";
import { ThreeObjectMap } from "./three-object-map";

describe("object picking", () => {
  it("dispatches a selection command for a resolved object id", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const picker = new ObjectPicker(new PerspectiveCamera(), new ThreeObjectMap(), dispatcher);

    const result = picker.selectObject("object-a");

    expect(result.ok).toBe(true);
    expect(result.snapshot.selection.objectId).toBe("object-a");
  });
});
