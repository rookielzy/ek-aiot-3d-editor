import { AmbientLight, BoxGeometry, Group, Mesh, MeshStandardMaterial, PointLight, Texture } from "three";
import { describe, expect, it, vi } from "vitest";
import { attachGlbImportManifestMetadata, createGlbImportDiagnosticsFromError, createGlbImportManifest } from "../assets/import-pipeline";
import { AssetResolverBridge } from "../assets/resolver";
import { AssetRegistry } from "../assets/registry";
import { CommandDispatcher } from "../commands/dispatcher";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import type { RuntimePmremAdapter } from "./pmrem-adapter";
import { GlbImportError, ThreeGltfLoaderAdapter } from "./gltf-loader-adapter";
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

  it("projects root nodes recursively for groups, objects, and spatial lights", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "create-group", nodeId: "group-a", transform: { position: [3, 0, 0] } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", parentId: "group-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "add-light", light: { id: "point-a", kind: "point", transform: { position: [1, 2, 3] } } });
    dispatcher.dispatch({ type: "reparent-node", nodeId: "point-a", parentId: "group-a" });
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Group() }
    });

    await projector.project(store.getSnapshot());

    const group = projector.objects.get("group-a");
    const object = projector.objects.getObject("object-a");
    const point = projector.objects.get("point-a");
    expect(group).toBeInstanceOf(Group);
    expect(object?.parent).toBe(group);
    expect(point).toBeInstanceOf(PointLight);
    expect(point?.parent).toBe(group);
    expect(point?.position.toArray()).toEqual([1, 2, 3]);
    const pickProxy = point?.children.find((child) => child.userData.runtimeLightPickProxyId === "point-a");
    expect(pickProxy?.userData).toMatchObject({
      runtimeOnly: true,
      sceneNodeId: "point-a",
      runtimeLightPickProxyId: "point-a"
    });
    expect(pickProxy ? projector.objects.getId(pickProxy) : null).toBe("point-a");
    expect(projector.objects.getTarget("object-a")).toMatchObject({ kind: "object", objectId: "object-a", transformable: true });
    expect(projector.objects.getTarget("group-a")).toMatchObject({ kind: "group", transformable: true });
    expect(projector.objects.getTarget("point-a")).toMatchObject({ kind: "light", lightId: "point-a", transformable: true });
  });

  it("toggles projection-owned mesh shadow participation from enabled light shadows", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "add-light", light: { id: "sun", kind: "directional", shadow: { enabled: true } } });
    const root = new Group();
    const realMesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const runtimeOnlyMesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const problemMesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    runtimeOnlyMesh.userData.runtimeOnly = true;
    problemMesh.userData.problem = true;
    root.add(realMesh, runtimeOnlyMesh, problemMesh);
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => root }
    });

    await projector.project(store.getSnapshot());

    expect(realMesh.castShadow).toBe(true);
    expect(realMesh.receiveShadow).toBe(true);
    expect(runtimeOnlyMesh.castShadow).toBe(false);
    expect(runtimeOnlyMesh.receiveShadow).toBe(false);
    expect(problemMesh.castShadow).toBe(false);
    expect(problemMesh.receiveShadow).toBe(false);
    expect(projector.shadowSummary.enabled).toBe(true);

    dispatcher.dispatch({
      type: "update-light",
      lightId: "sun",
      patch: { shadow: { ...store.getSnapshot().lights.sun.shadow, enabled: false } }
    });
    await projector.project(store.getSnapshot());

    expect(realMesh.castShadow).toBe(false);
    expect(realMesh.receiveShadow).toBe(false);
    expect(projector.shadowSummary.enabled).toBe(false);
  });

  it("does not let a stale async load re-enable mesh shadow participation", async () => {
    let resolveSlowLoad: (scene: Group) => void = () => {};
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "add-light", light: { id: "sun", kind: "directional", shadow: { enabled: true } } });
    const oldSnapshot = store.getSnapshot();
    dispatcher.dispatch({
      type: "update-light",
      lightId: "sun",
      patch: { shadow: { ...store.getSnapshot().lights.sun.shadow, enabled: false } }
    });
    const newSnapshot = store.getSnapshot();
    const oldRoot = new Group();
    const oldMesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const newRoot = new Group();
    const newMesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    oldRoot.add(oldMesh);
    newRoot.add(newMesh);
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: {
        load: vi
          .fn()
          .mockImplementationOnce(() => new Promise<Group>((resolve) => { resolveSlowLoad = resolve; }))
          .mockResolvedValueOnce(newRoot)
      }
    });

    const staleProjection = projector.project(oldSnapshot);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await projector.project(newSnapshot);
    resolveSlowLoad(oldRoot);
    await staleProjection;

    expect(projector.objects.getObject("object-a")).toBe(newRoot);
    expect(newMesh.castShadow).toBe(false);
    expect(newMesh.receiveShadow).toBe(false);
    expect(oldMesh.castShadow).toBe(false);
    expect(oldRoot.parent).toBeNull();
  });

  it("keeps non-spatial light nodes selectable but unavailable for transform targets", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });
    dispatcher.dispatch({ type: "select-node", nodeId: "ambient-a" });
    const projector = new SceneProjector();

    await projector.project(store.getSnapshot());

    const target = projector.objects.getTarget("ambient-a");
    expect(target).toMatchObject({ kind: "light", lightId: "ambient-a", transformable: false });
    expect(target?.object.userData).toMatchObject({
      sceneNodeId: "ambient-a",
      selected: true,
      primarySelected: true
    });
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

  it("reloads cached GLB objects when the resolved asset signature changes", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const first = new Group();
    const second = new Group();
    let checksum = "first";
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb", metadata: { checksum } })),
      loader: {
        load: vi
          .fn()
          .mockResolvedValueOnce(first)
          .mockResolvedValueOnce(second)
      }
    });

    await projector.project(store.getSnapshot());
    checksum = "second";
    await projector.project(store.getSnapshot());

    expect(projector.objects.get("object-a")).toBe(second);
    expect(first.parent).toBeNull();
    expect(second.parent).toBe(projector.scene);
  });

  it("replaces cached GLB objects with problem placeholders when assets become unresolved", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const loaded = new Group();
    let resolved = true;
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => resolved ? { uri: "/box.glb", metadata: { checksum: "same" } } : null),
      loader: { load: async () => loaded }
    });

    await projector.project(store.getSnapshot());
    resolved = false;
    await projector.project(store.getSnapshot());

    expect(projector.objects.get("object-a")).not.toBe(loaded);
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

  it("converts structured GLB loader diagnostics into runtime problems", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const diagnostics = createGlbImportDiagnosticsFromError(
      new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures")
    );
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/ktx2.glb" })),
      loader: {
        load: async () => new Group(),
        analyze: async () => ({
          scene: new Group(),
          manifest: createGlbImportManifest({ diagnostics }),
          diagnostics
        })
      }
    });

    await projector.project(store.getSnapshot());

    expect(projector.objects.get("object-a")).toBeInstanceOf(Group);
    expect(projector.problems).toMatchObject([{
      code: "glb-decoder-missing",
      source: "runtime",
      target: { kind: "object", objectId: "object-a" },
      assetId: "asset-a",
      objectId: "object-a",
      recoverability: "user-action",
      display: { actionLabel: "Configure decoder" }
    }]);
    expect(store.getSnapshot().problems.acknowledged).toEqual({});
  });

  it("uses GLB import diagnostics instead of generic load failures when decoder config is missing", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const diagnostics = createGlbImportDiagnosticsFromError(new Error("THREE.GLTFLoader: No DRACOLoader instance provided."));
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/draco.glb" })),
      loader: {
        load: async () => {
          throw new GlbImportError("missing draco", diagnostics);
        }
      }
    });

    await projector.project(store.getSnapshot());

    expect(projector.objects.get("object-a")?.userData.problem).toBe(true);
    expect(projector.problems.map((problem) => problem.code)).toEqual(["glb-decoder-missing"]);
  });

  it("uses GLB diagnostics when adapter decoder setup fails before load", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/ktx2.glb" })),
      loader: new ThreeGltfLoaderAdapter({
        loaderFactory: () => createFakeGltfLoader() as never,
        decoders: {
          ktx2: () => {
            throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");
          }
        }
      })
    });

    await projector.project(store.getSnapshot());

    expect(projector.objects.get("object-a")?.userData.problem).toBe(true);
    expect(projector.problems).toMatchObject([{
      code: "glb-decoder-missing",
      target: { kind: "object", objectId: "object-a" },
      assetId: "asset-a",
      objectId: "object-a"
    }]);
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
    expect(store.getSnapshot().environment.background.source).toEqual({ kind: "solid", color: "#101010" });
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
      fromCubemap: vi.fn(() => ({ texture: new Texture(), dispose() {} })),
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
      fromCubemap: vi.fn(() => ({ texture: new Texture(), dispose() {} })),
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

  it("adds lighting diagnostics to runtime problems without authored acknowledgements", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({
      type: "add-light",
      light: {
        id: "point-a",
        kind: "point",
        shadow: { enabled: true, mapSize: { width: 2048, height: 2048 } }
      }
    });
    const projector = new SceneProjector();
    projector.setRendererShadowMapAvailable(false);

    await projector.project(store.getSnapshot());

    expect(projector.problems.map((problem) => problem.code)).toEqual(expect.arrayContaining([
      "lighting-shadow-renderer-missing",
      "lighting-point-shadow-cost",
      "lighting-shadow-map-high",
      "lighting-shadow-budget-high"
    ]));
    expect(projector.problems).toContainEqual(expect.objectContaining({
      target: { kind: "light", lightId: "point-a" }
    }));
    expect(store.getSnapshot().problems.acknowledged).toEqual({});
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

  it("applies object material overrides when object nodes are nested under groups", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "create-group", nodeId: "group-a" });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", parentId: "group-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { color: "#336699" }
    });
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(), new MeshStandardMaterial()) }
    });

    await projector.project(store.getSnapshot());

    const runtimeObject = projector.objects.getObject("object-a") as Mesh;
    expect(runtimeObject.parent).toBe(projector.objects.get("group-a"));
    expect((runtimeObject.material as MeshStandardMaterial).color.getHexString()).toBe("336699");
  });

  it("links imported GLB nodes to loaded descendants without reparenting them", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata: createRuntimeImportManifestMetadata() },
      expandImportedTargets: true
    });
    const loadedScene = new Group();
    const loadedMesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    loadedMesh.name = "Panel";
    loadedScene.add(loadedMesh);
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: {
        analyze: async () => ({
          scene: loadedScene,
          manifest: createGlbImportManifest({
            gltf: {
              parser: {
                json: {
                  nodes: [{ name: "Panel", mesh: 0 }],
                  meshes: [{ name: "Panel", primitives: [{ attributes: { POSITION: 0 } }] }]
                }
              }
            }
          })
        }),
        load: async () => loadedScene
      }
    });

    await projector.project(store.getSnapshot());

    const nodeTargetId = findImportedNodeIdByKey(store.getSnapshot(), "glb:object-a/node:nodes/0")!;
    const primitiveTargetId = findImportedNodeIdByKey(store.getSnapshot(), "glb:object-a/primitive:meshes/0/primitives/0")!;
    expect(projector.objects.get(nodeTargetId)).toBe(loadedMesh);
    expect(projector.objects.get(primitiveTargetId)).toBe(loadedMesh);
    expect(loadedMesh.parent).toBe(loadedScene);
    expect(projector.objects.getTarget(primitiveTargetId)).toMatchObject({
      kind: "imported",
      ownerObjectId: "object-a",
      importKey: "glb:object-a/primitive:meshes/0/primitives/0",
      matchStatus: "aliased",
      transformable: false
    });
    expect(projector.problems).toContainEqual(expect.objectContaining({
      code: "imported-target-non-transformable",
      target: { kind: "imported-target", objectId: "object-a", nodeId: primitiveTargetId, importKey: "glb:object-a/primitive:meshes/0/primitives/0" }
    }));
  });

  it("tracks selected imported aliases on target metadata even when they share one runtime object", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata: createRuntimeImportManifestMetadata() },
      expandImportedTargets: true
    });
    const nodeTargetId = findImportedNodeIdByKey(store.getSnapshot(), "glb:object-a/node:nodes/0")!;
    dispatcher.dispatch({ type: "select-node", nodeId: nodeTargetId });
    const loadedScene = new Group();
    const loadedMesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    loadedScene.add(loadedMesh);
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: {
        analyze: async () => ({
          scene: loadedScene,
          manifest: createGlbImportManifest({
            gltf: {
              parser: {
                json: {
                  nodes: [{ name: "Panel", mesh: 0 }],
                  meshes: [{ name: "Panel", primitives: [{ attributes: { POSITION: 0 } }] }]
                }
              }
            }
          })
        }),
        load: async () => loadedScene
      }
    });

    await projector.project(store.getSnapshot());

    expect(projector.objects.getTarget(nodeTargetId)).toMatchObject({
      selected: true,
      primarySelected: true
    });
    expect(projector.objects.get(nodeTargetId)).toBe(loadedMesh);
  });

  it("projects material-slot assignments onto only the resolved imported primitive", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata: createTwoPrimitiveImportManifestMetadata() },
      expandImportedTargets: true
    });
    const secondSlotId = "glb:object-a/slot:meshes/0/primitives/1:material-1";
    dispatcher.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId: secondSlotId },
      material: { color: "#0000ff" }
    });
    const loadedScene = new Group();
    const meshGroup = new Group();
    const firstPrimitive = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: "#ffffff" }));
    const secondPrimitive = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: "#ffffff" }));
    meshGroup.add(firstPrimitive, secondPrimitive);
    loadedScene.add(meshGroup);
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: {
        analyze: async () => ({ scene: loadedScene, manifest: createTwoPrimitiveImportManifest() }),
        load: async () => loadedScene
      }
    });

    await projector.project(store.getSnapshot());

    expect((firstPrimitive.material as MeshStandardMaterial).color.getHexString()).toBe("ffffff");
    expect((secondPrimitive.material as MeshStandardMaterial).color.getHexString()).toBe("0000ff");
    expect(projector.problems.map((problem) => problem.code)).not.toContain("imported-material-slot-unresolved");
  });

  it("keeps stale material-slot assignments durable and emits unresolved runtime problems after reimport", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata: createTwoPrimitiveImportManifestMetadata() },
      expandImportedTargets: true
    });
    const slotId = "glb:object-a/slot:meshes/0/primitives/0:material-0";
    dispatcher.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId },
      material: { color: "#ff0000" }
    });
    const primitiveNodeId = findImportedNodeIdByKey(store.getSnapshot(), "glb:object-a/primitive:meshes/0/primitives/0")!;
    store.replaceSnapshot({
      ...store.getSnapshot(),
      nodes: {
        ...store.getSnapshot().nodes,
        [primitiveNodeId]: {
          ...store.getSnapshot().nodes[primitiveNodeId],
          materialSlots: [],
          remap: {
            status: "resolved",
            previousImportKey: "glb:object-a/primitive:meshes/0/primitives/0",
            metadata: { unresolvedMaterialSlots: [slotId] }
          }
        }
      }
    });
    const loadedScene = new Group();
    loadedScene.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: {
        analyze: async () => ({ scene: loadedScene, manifest: createTwoPrimitiveImportManifest() }),
        load: async () => loadedScene
      }
    });

    await projector.project(store.getSnapshot());

    expect(store.getSnapshot().materials.assignments[`material-slot:object-a:${slotId}`]).toBeDefined();
    expect(projector.problems).toContainEqual(expect.objectContaining({
      code: "imported-material-slot-unresolved",
      target: {
        kind: "imported-material-slot",
        objectId: "object-a",
        nodeId: primitiveNodeId,
        importKey: "glb:object-a/primitive:meshes/0/primitives/0",
        slotId
      }
    }));
    expect(JSON.stringify(store.getSnapshot())).not.toContain("Object3D");
  });

  it("applies imported target transforms and restores loaded base transforms when overrides are removed", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata: createRuntimeImportManifestMetadata("node-only") },
      expandImportedTargets: true
    });
    const importedNodeId = findImportedNodeIdByKey(store.getSnapshot(), "glb:object-a/node:nodes/0")!;
    dispatcher.dispatch({
      type: "set-node-transform",
      nodeId: importedNodeId,
      transform: { position: [4, 5, 6] }
    });
    const loadedScene = new Group();
    const loadedPivot = new Group();
    loadedPivot.position.set(1, 2, 3);
    loadedScene.add(loadedPivot);
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: {
        analyze: async () => ({
          scene: loadedScene,
          manifest: createGlbImportManifest({
            gltf: {
              parser: {
                json: {
                  nodes: [{ name: "Panel", mesh: 0 }],
                  meshes: []
                }
              }
            }
          })
        }),
        load: async () => loadedScene
      }
    });

    await projector.project(store.getSnapshot());
    expect(loadedPivot.position.toArray()).toEqual([4, 5, 6]);

    const snapshotWithoutOverride = {
      ...store.getSnapshot(),
      nodes: {
        ...store.getSnapshot().nodes,
        [importedNodeId]: omitTransform(store.getSnapshot().nodes[importedNodeId])
      }
    };
    await projector.project(snapshotWithoutOverride);

    expect(loadedPivot.position.toArray()).toEqual([1, 2, 3]);
  });

  it("releases stale imported runtime targets and restores loaded base transforms", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata: createRuntimeImportManifestMetadata("node-only") },
      expandImportedTargets: true
    });
    const importedNodeId = findImportedNodeIdByKey(store.getSnapshot(), "glb:object-a/node:nodes/0")!;
    dispatcher.dispatch({
      type: "set-node-transform",
      nodeId: importedNodeId,
      transform: { position: [4, 5, 6] }
    });
    const loadedScene = new Group();
    const loadedPivot = new Group();
    loadedPivot.position.set(1, 2, 3);
    loadedScene.add(loadedPivot);
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: {
        analyze: async () => ({
          scene: loadedScene,
          manifest: createGlbImportManifest({
            gltf: {
              parser: {
                json: {
                  nodes: [{ name: "Panel" }],
                  meshes: []
                }
              }
            }
          })
        }),
        load: async () => loadedScene
      }
    });

    await projector.project(store.getSnapshot());
    expect(loadedPivot.position.toArray()).toEqual([4, 5, 6]);

    dispatcher.dispatch({ type: "delete-nodes", nodeIds: [importedNodeId] });
    await projector.project(store.getSnapshot());

    expect(projector.objects.get(importedNodeId)).toBeUndefined();
    expect(projector.objects.getObject("object-a")).toBe(loadedScene);
    expect(loadedPivot.position.toArray()).toEqual([1, 2, 3]);
    expect(loadedPivot.userData.importedTargetBaseTransform).toBeUndefined();
  });

  it("keeps active alias transforms when releasing stale imported aliases", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata: createRuntimeImportManifestMetadata() },
      expandImportedTargets: true
    });
    const nodeTargetId = findImportedNodeIdByKey(store.getSnapshot(), "glb:object-a/node:nodes/0")!;
    const meshTargetId = findImportedNodeIdByKey(store.getSnapshot(), "glb:object-a/mesh:meshes/0")!;
    const primitiveTargetId = findImportedNodeIdByKey(store.getSnapshot(), "glb:object-a/primitive:meshes/0/primitives/0")!;
    dispatcher.dispatch({
      type: "set-node-transform",
      nodeId: nodeTargetId,
      transform: { position: [4, 5, 6] }
    });
    const loadedScene = new Group();
    const loadedMesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    loadedMesh.position.set(1, 2, 3);
    loadedScene.add(loadedMesh);
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: {
        analyze: async () => ({
          scene: loadedScene,
          manifest: createGlbImportManifest({
            gltf: {
              parser: {
                json: {
                  nodes: [{ name: "Panel", mesh: 0 }],
                  meshes: [{ name: "Panel", primitives: [{ attributes: { POSITION: 0 } }] }]
                }
              }
            }
          })
        }),
        load: async () => loadedScene
      }
    });

    await projector.project(store.getSnapshot());
    expect(loadedMesh.position.toArray()).toEqual([1, 2, 3]);

    dispatcher.dispatch({ type: "delete-nodes", nodeIds: [meshTargetId, primitiveTargetId] });
    await projector.project(store.getSnapshot());

    expect(projector.objects.get(meshTargetId)).toBeUndefined();
    expect(projector.objects.get(primitiveTargetId)).toBeUndefined();
    expect(projector.objects.get(nodeTargetId)).toBe(loadedMesh);
    expect(loadedMesh.position.toArray()).toEqual([4, 5, 6]);
  });

  it("emits imported target runtime problems without deleting durable imported nodes", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata: createRuntimeImportManifestMetadata() },
      expandImportedTargets: true
    });
    const importedNodeId = findImportedNodeIdByKey(store.getSnapshot(), "glb:object-a/node:nodes/0")!;
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: {
        analyze: async () => ({
          scene: new Group(),
          manifest: createGlbImportManifest({
            gltf: {
              parser: {
                json: {
                  nodes: [],
                  meshes: []
                }
              }
            }
          })
        }),
        load: async () => new Group()
      }
    });

    await projector.project(store.getSnapshot());

    expect(projector.objects.get(importedNodeId)).toBeUndefined();
    expect(store.getSnapshot().nodes[importedNodeId]).toBeDefined();
    expect(projector.problems).toContainEqual(expect.objectContaining({
      code: "imported-target-missing",
      target: {
        kind: "imported-target",
        objectId: "object-a",
        nodeId: importedNodeId,
        importKey: "glb:object-a/node:nodes/0"
      }
    }));
    expect(JSON.stringify(store.getSnapshot())).not.toContain("Object3D");
  });

  it("prefers unresolved reimport problems over duplicate missing imported target problems", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata: createRuntimeImportManifestMetadata() },
      expandImportedTargets: true
    });
    const importedNodeId = findImportedNodeIdByKey(store.getSnapshot(), "glb:object-a/node:nodes/0")!;
    store.replaceSnapshot({
      ...store.getSnapshot(),
      nodes: {
        ...store.getSnapshot().nodes,
        [importedNodeId]: {
          ...store.getSnapshot().nodes[importedNodeId],
          remap: {
            status: "unresolved",
            previousImportKey: "glb:object-a/node:nodes/previous",
            candidateImportKeys: ["glb:object-a/node:nodes/1"]
          }
        }
      }
    });
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: {
        analyze: async () => ({
          scene: new Group(),
          manifest: createGlbImportManifest({
            gltf: {
              parser: {
                json: {
                  nodes: [],
                  meshes: []
                }
              }
            }
          })
        }),
        load: async () => new Group()
      }
    });

    await projector.project(store.getSnapshot());

    const targetProblems = projector.problems.filter((problem) =>
      problem.target.kind === "imported-target" && problem.target.nodeId === importedNodeId
    );
    expect(targetProblems.map((problem) => problem.code)).toEqual(["imported-target-unresolved"]);
    expect(targetProblems[0]).toMatchObject({
      target: {
        kind: "imported-target",
        objectId: "object-a",
        nodeId: importedNodeId,
        importKey: "glb:object-a/node:nodes/0"
      },
      metadata: {
        previousImportKey: "glb:object-a/node:nodes/previous",
        candidateImportKeys: ["glb:object-a/node:nodes/1"]
      }
    });
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

function createFakeGltfLoader() {
  return {
    setDRACOLoader() {
      return this;
    },
    setKTX2Loader() {
      return this;
    },
    setMeshoptDecoder() {
      return this;
    },
    load(_uri: string, onLoad: (gltf: unknown) => void) {
      const scene = new Group();
      onLoad({
        scene,
        scenes: [scene],
        cameras: [],
        animations: [],
        asset: { version: "2.0" },
        parser: {
          json: {
            asset: { version: "2.0" },
            scenes: [{ nodes: [0] }],
            nodes: [{ name: "Loaded" }]
          }
        },
        userData: {}
      });
    }
  };
}

function createRuntimeImportManifestMetadata(variant: "mesh" | "node-only" = "mesh") {
  return attachGlbImportManifestMetadata(undefined, createGlbImportManifest({
    gltf: {
      parser: {
        json: variant === "node-only" ? {
          nodes: [{ name: "Panel" }],
          meshes: []
        } : {
          nodes: [{ name: "Panel", mesh: 0 }],
          meshes: [{ name: "Panel", primitives: [{ attributes: { POSITION: 0 } }] }]
        }
      }
    }
  }));
}

function createTwoPrimitiveImportManifest() {
  return createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name: "Panel", mesh: 0 }],
          meshes: [{
            name: "Panel",
            primitives: [
              { attributes: { POSITION: 0 }, material: 0 },
              { attributes: { POSITION: 1 }, material: 1 }
            ]
          }],
          materials: [{ name: "Red" }, { name: "Blue" }]
        }
      }
    }
  });
}

function createTwoPrimitiveImportManifestMetadata() {
  return attachGlbImportManifestMetadata(undefined, createTwoPrimitiveImportManifest());
}

function findImportedNodeIdByKey(snapshot: ReturnType<EditorStore["getSnapshot"]>, importKey: string): string | null {
  return Object.values(snapshot.nodes).find((node) => node.kind === "imported" && node.importKey === importKey)?.id ?? null;
}

function omitTransform<T extends { transform?: unknown }>(node: T): Omit<T, "transform"> {
  const { transform: _transform, ...rest } = node;
  return rest;
}
