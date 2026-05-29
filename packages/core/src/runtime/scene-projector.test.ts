import { Group } from "three";
import { describe, expect, it } from "vitest";
import { AssetResolverBridge } from "../assets/resolver";
import { AssetRegistry } from "../assets/registry";
import { CommandDispatcher } from "../commands/dispatcher";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { SceneProjector } from "./scene-projector";

describe("scene projector", () => {
  it("creates runtime objects for GLB scene objects", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Group() }
    });

    await projector.project(store.getSnapshot());

    expect(projector.objects.get("object-a")).toBeInstanceOf(Group);
  });

  it("renders placeholders and preserves object mapping for missing assets", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const projector = new SceneProjector({ resolver: new AssetResolverBridge(() => null) });

    await projector.project(store.getSnapshot());

    expect(projector.objects.get("object-a")?.userData.problem).toBe(true);
    expect(projector.problems).toMatchObject([{ code: "asset-unresolved", objectId: "object-a" }]);
  });
});
