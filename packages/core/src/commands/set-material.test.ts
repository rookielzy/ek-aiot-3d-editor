import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { CommandDispatcher } from "./dispatcher";

describe("set material command", () => {
  it("stores JSON-compatible material overrides and records undoable history", () => {
    const dispatcher = new CommandDispatcher(new EditorStore(), new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });

    const result = dispatcher.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: {
        color: "#336699",
        metalness: 0.4,
        roughness: 0.8,
        opacity: 0.75,
        transparent: true,
        side: "double"
      }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.materials.assignments["object:object-a"].materialId).toBe("material:object:object-a");
    expect(result.snapshot.materials.definitions["material:object:object-a"].override).toMatchObject({
      color: "#336699",
      metalness: 0.4,
      roughness: 0.8,
      opacity: 0.75,
      side: "double"
    });
    expect(JSON.stringify(result.snapshot)).not.toContain("runtime");
  });

  it("serializes texture slots as stable asset references", () => {
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(new EditorStore(), history, new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture", source: { runtime: true } } });

    const result = dispatcher.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: {
        textures: {
          map: {
            assetId: "texture-a",
            colorSpace: "srgb",
            transform: { repeat: [2, 2] }
          }
        }
      }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.materials.definitions["material:object:object-a"].override.textures?.map).toEqual({
      assetId: "texture-a",
      colorSpace: "srgb",
      transform: { repeat: [2, 2] }
    });
    expect(JSON.stringify(result.snapshot)).not.toContain("runtime");
  });

  it("rejects invalid ranges and unknown texture assets without mutating state", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const before = store.getSnapshot();

    const result = dispatcher.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: {
        roughness: 2,
        textures: {
          map: { assetId: "missing-texture" }
        }
      }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("roughness");
    expect(result.error).toContain("texture slot map");
    expect(store.getSnapshot()).toBe(before);
  });

  it("undoes and redoes material edits deterministically", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { color: "#111111" }
    });

    expect(store.getSnapshot().materials.definitions["material:object:object-a"].override.color).toBe("#111111");
    dispatcher.undo();
    expect(store.getSnapshot().materials.definitions["material:object:object-a"]).toBeUndefined();
    dispatcher.redo();
    expect(store.getSnapshot().materials.definitions["material:object:object-a"].override.color).toBe("#111111");
  });
});
