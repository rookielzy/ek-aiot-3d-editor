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
    expect(projector.problems).toMatchObject([{ code: "asset-unresolved", target: { kind: "object", objectId: "object-a" } }]);
  });

  it("keeps unresolved asset problems visible across repeated projection attempts", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const projector = new SceneProjector({ resolver: new AssetResolverBridge(() => null) });

    await projector.project(store.getSnapshot());
    await projector.project(store.getSnapshot());

    expect(projector.objects.get("object-a")?.userData.problem).toBe(true);
    expect(projector.problems).toMatchObject([{ code: "asset-unresolved", target: { kind: "object", objectId: "object-a" } }]);
  });

  it("exposes structured runtime problems when GLB loading fails", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => { throw new Error("bad glb"); } }
    });

    await projector.project(store.getSnapshot());

    expect(projector.problems).toMatchObject([{
      code: "asset-load-failed",
      source: "runtime",
      target: { kind: "object", objectId: "object-a" },
      objectId: "object-a",
      assetId: "asset-a",
      recoverability: "user-action",
      display: { title: "Asset failed to load" }
    }]);
    expect(store.getSnapshot().problems.acknowledged).toEqual({});
  });

  it("tolerates expanded schema records while projecting GLB objects", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    dispatcher.dispatch({ type: "set-environment", environment: { background: { mode: "solid", color: "#101010" } } });
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Group() }
    });

    await projector.project(store.getSnapshot());

    expect(projector.objects.get("object-a")).toBeInstanceOf(Group);
    expect(store.getSnapshot().lights["light-a"]).toBeTruthy();
    expect(store.getSnapshot().environment.background.color).toBe("#101010");
  });
});
