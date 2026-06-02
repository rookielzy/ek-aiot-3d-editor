import { AmbientLight, BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import { describe, expect, it, vi } from "vitest";
import { AssetResolverBridge } from "../assets/resolver";
import { AssetRegistry } from "../assets/registry";
import { CommandDispatcher } from "../commands/dispatcher";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import type { RuntimePmremAdapter } from "./pmrem-adapter";
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

  it("marks selected and primary selected objects as derived runtime state", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
    dispatcher.dispatch({ type: "select-objects", mode: "replace", objectIds: ["object-a", "object-b"], primaryObjectId: "object-b" });
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Group() }
    });

    await projector.project(store.getSnapshot());

    expect(projector.objects.get("object-a")?.userData.selected).toBe(true);
    expect(projector.objects.get("object-a")?.userData.primarySelected).toBe(false);
    expect(projector.objects.get("object-b")?.userData.selected).toBe(true);
    expect(projector.objects.get("object-b")?.userData.primarySelected).toBe(true);
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

  it("exposes structured runtime problems when GLB resolution throws", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => { throw new Error("resolver down"); })
    });

    await projector.project(store.getSnapshot());

    expect(projector.objects.get("object-a")?.userData.problem).toBe(true);
    expect(projector.problems).toMatchObject([{
      code: "asset-resolve-failed",
      source: "runtime",
      target: { kind: "object", objectId: "object-a" },
      objectId: "object-a",
      assetId: "asset-a",
      recoverability: "user-action",
      display: { title: "Asset failed to resolve" }
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

  it("projects GLB objects, HDR environments, lights, and combined runtime problems from one snapshot", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });
    dispatcher.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: { assetId: "hdr-a", intensity: 2, rotation: { x: 0, y: 1, z: 0 } },
        background: { mode: "none" }
      }
    });
    dispatcher.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient", intensity: 0.5 } });
    const pmremTexture = new Texture();
    const pmrem: RuntimePmremAdapter = {
      fromEquirectangular: vi.fn(() => ({ texture: pmremTexture, dispose() {} })),
      dispose() {}
    };
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge((asset) => asset.id === "asset-a" ? { uri: "/box.glb" } : null),
      loader: { load: async () => new Group() },
      hdrLoader: { load: async () => new Texture() },
      pmrem
    });

    await projector.project(store.getSnapshot());

    expect(projector.objects.get("object-a")).toBeInstanceOf(Group);
    expect(projector.scene.environment).toBeNull();
    expect(projector.getLight("light-a")).toBeInstanceOf(AmbientLight);
    expect(projector.problems).toMatchObject([{ code: "environment-asset-unresolved", assetId: "hdr-a" }]);
  });

  it("keeps object projection working when environment assets resolve", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });
    dispatcher.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: { assetId: "hdr-a", intensity: 2, rotation: { x: 0, y: 1, z: 0 } },
        background: { mode: "none" }
      }
    });
    const rawTexture = new Texture();
    const pmremTexture = new Texture();
    const pmrem: RuntimePmremAdapter = {
      fromEquirectangular: vi.fn(() => ({ texture: pmremTexture, dispose() {} })),
      dispose() {}
    };
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge((asset) => ({ uri: asset.id === "asset-a" ? "/box.glb" : "/studio.hdr" })),
      loader: { load: async () => new Group() },
      hdrLoader: { load: vi.fn(async () => rawTexture) },
      pmrem
    });

    await projector.project(store.getSnapshot());

    expect(projector.objects.get("object-a")).toBeInstanceOf(Group);
    expect(projector.scene.environment).toBe(pmremTexture);
    expect(projector.scene.environmentIntensity).toBe(2);
    expect(projector.problems).toEqual([]);
  });

  it("does not let an older projection restore removed lights after a newer snapshot wins", async () => {
    let resolveSlowLoad: (texture: Texture) => void = () => {};
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture" } });
    dispatcher.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    dispatcher.dispatch({
      type: "set-environment",
      environment: {
        mode: "none",
        background: { mode: "texture", assetId: "texture-a" },
        environment: { intensity: 1, rotation: { x: 0, y: 0, z: 0 } }
      }
    });
    const oldSnapshot = store.getSnapshot();
    dispatcher.dispatch({ type: "remove-light", lightId: "light-a" });
    const newSnapshot = store.getSnapshot();
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/sky.jpg" })),
      textureLoader: {
        load: vi
          .fn()
          .mockImplementationOnce(() => new Promise<Texture>((resolve) => { resolveSlowLoad = resolve; }))
          .mockResolvedValueOnce(new Texture())
      }
    });
    const oldProjection = projector.project(oldSnapshot);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await projector.project(newSnapshot);
    resolveSlowLoad(new Texture());
    await oldProjection;

    expect(projector.getLight("light-a")).toBeUndefined();
  });

  it("projects object-level material overrides and aggregates material runtime problems", async () => {
    const texture = new Texture();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture" } });
    dispatcher.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { color: "#336699", textures: { map: { assetId: "texture-a" } } }
    });
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge((asset) => asset.id === "asset-a" ? { uri: "/box.glb" } : null),
      loader: { load: async () => new Mesh(new BoxGeometry(), new MeshStandardMaterial()) },
      textureLoader: { load: vi.fn(async () => texture) }
    });

    await projector.project(store.getSnapshot());

    const runtimeObject = projector.objects.get("object-a") as Mesh;
    expect((runtimeObject.material as MeshStandardMaterial).color.getHexString()).toBe("336699");
    expect((runtimeObject.material as MeshStandardMaterial).map).toBeNull();
    expect(projector.problems).toMatchObject([{ code: "material-texture-asset-unresolved", assetId: "texture-a" }]);
    expect(store.getSnapshot().problems.acknowledged).toEqual({});
  });

  it("reapplies material overrides after project export/import restores durable references", async () => {
    const texture = new Texture();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture" } });
    dispatcher.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { color: "#ff0000", textures: { map: { assetId: "texture-a" } } }
    });
    const restoredSnapshot = JSON.parse(JSON.stringify(store.getSnapshot()));
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/asset" })),
      loader: { load: async () => new Mesh(new BoxGeometry(), new MeshStandardMaterial()) },
      textureLoader: { load: vi.fn(async () => texture) }
    });

    await projector.project(restoredSnapshot);

    const runtimeObject = projector.objects.get("object-a") as Mesh;
    expect((runtimeObject.material as MeshStandardMaterial).color.getHexString()).toBe("ff0000");
    expect((runtimeObject.material as MeshStandardMaterial).map).toBe(texture);
    expect(JSON.stringify(restoredSnapshot)).not.toContain("isTexture");
  });

  it("releases material projection resources when selected objects are deleted", async () => {
    const texture = new Texture();
    const textureDispose = vi.spyOn(texture, "dispose");
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture" } });
    dispatcher.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { textures: { map: { assetId: "texture-a" } } }
    });
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/asset" })),
      loader: { load: async () => new Mesh(new BoxGeometry(), new MeshStandardMaterial()) },
      textureLoader: { load: vi.fn(async () => texture) }
    });
    await projector.project(store.getSnapshot());

    dispatcher.dispatch({ type: "select-object", objectId: "object-a" });
    dispatcher.dispatch({ type: "delete-objects" });
    await projector.project(store.getSnapshot());

    expect(projector.objects.get("object-a")).toBeUndefined();
    expect(textureDispose).toHaveBeenCalledTimes(1);
  });
});
