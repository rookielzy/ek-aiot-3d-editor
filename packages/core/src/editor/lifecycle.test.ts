import { describe, expect, it, vi } from "vitest";
import { createEditor } from "./create-editor";
import { createGlbImportDiagnosticsFromError, createGlbImportManifest } from "../assets/import-pipeline";
import { buildWorkbenchModel } from "../workbench/workbench-model";
import { buildInspectorModel } from "../inspector/selection";
import { GlbImportError } from "../runtime/gltf-loader-adapter";
import type { RendererLike } from "../runtime/editor-runtime";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { defaultArchiveAdapter, decodeArchiveJson } from "../project/archive-adapter";
import { PROJECT_MANIFEST_PATH, PROJECT_SCENE_PATH } from "../project/package-types";

describe("editor lifecycle", () => {
  it("mounts runtime and disposes runtime plus store subscriptions idempotently", () => {
    const editor = createEditor();
    const rendererDispose = vi.fn();
    const runtime = editor.mountRuntime({
      container: document.createElement("div"),
      rendererFactory: (container): RendererLike => {
        const canvas = container.ownerDocument.createElement("canvas");
        return {
          domElement: canvas,
          setSize() {},
          render() {},
          dispose: rendererDispose
        };
      }
    });

    editor.dispose();
    editor.dispose();

    expect(runtime.disposed).toBe(true);
    expect(rendererDispose).toHaveBeenCalledTimes(1);
    expect(editor.disposed).toBe(true);
  });

  it("notifies runtime subscribers when runtime mounts and editor disposes", () => {
    const editor = createEditor();
    const runtimes: Array<ReturnType<typeof editor.getRuntime>> = [];
    const unsubscribe = editor.subscribeRuntime((runtime) => {
      runtimes.push(runtime);
    });
    const runtime = editor.mountRuntime({
      container: document.createElement("div"),
      rendererFactory: (container): RendererLike => ({
        domElement: container.ownerDocument.createElement("canvas"),
        setSize() {},
        render() {},
        dispose() {}
      })
    });

    unsubscribe();
    editor.dispose();

    expect(runtimes).toEqual([null, runtime]);
  });

  it("exposes disposed runtimes as null when remounting", () => {
    const editor = createEditor();
    const runtimes: Array<ReturnType<typeof editor.getRuntime>> = [];
    editor.subscribeRuntime((runtime) => {
      runtimes.push(runtime);
    });
    const first = editor.mountRuntime({
      container: document.createElement("div"),
      rendererFactory: createFakeRenderer
    });
    const second = editor.mountRuntime({
      container: document.createElement("div"),
      rendererFactory: createFakeRenderer
    });

    expect(first.disposed).toBe(true);
    expect(editor.getRuntime()).toBe(second);
    expect(runtimes).toEqual([null, first, null, second]);
  });

  it("clears project payloads when restoring a plain snapshot", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", source: new Uint8Array([1]) } });
    expect(editor.exportProject().ok).toBe(true);

    editor.restore(editor.serialize());

    expect(editor.exportProject().ok).toBe(false);
    expect(editor.exportProject().problems).toMatchObject([{ code: "project-export-payload-missing" }]);
  });

  it("notifies asset workspace subscribers for snapshot and payload-only changes", async () => {
    const editor = createEditor();
    const versions: number[] = [];
    editor.subscribeAssetWorkspace((version) => {
      versions.push(version);
    });

    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const missingVersion = editor.getAssetWorkspaceVersion();
    const replaced = await editor.replaceAsset({ assetId: "asset-a", source: new Uint8Array([1, 2, 3]) });
    const payloadVersion = editor.getAssetWorkspaceVersion();

    expect(replaced.ok).toBe(true);
    expect(payloadVersion).toBeGreaterThan(missingVersion);
    expect(versions).toEqual([0, 1, 2]);
    expect(editor.getAssetWorkspacePayloads()).toEqual([expect.objectContaining({
      assetId: "asset-a",
      available: true,
      exportable: true,
      byteSize: 3
    })]);
    expect(JSON.stringify(editor.getAssetWorkspacePayloads())).not.toContain("bytes");
    expect(JSON.stringify(editor.getAssetWorkspacePayloads())).not.toContain("blob:");
  });

  it("notifies asset workspace subscribers when project import or restore replaces payloads", () => {
    const source = createEditor();
    source.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", source: new Uint8Array([1]) } });
    const exported = source.exportProject();
    const editor = createEditor();
    const versions: number[] = [];
    editor.subscribeAssetWorkspace((version) => {
      versions.push(version);
    });

    const imported = editor.importProject(exported.packageBytes as Uint8Array);
    editor.restore(editor.serialize());

    expect(imported.ok).toBe(true);
    expect(versions).toEqual([0, 1, 2]);
    expect(editor.getAssetWorkspacePayloads()).toEqual([]);
  });

  it("keeps durable command results when transient payload registration fails", () => {
    const editor = createEditor();
    const result = editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: {
        id: "asset-a",
        source: { metadata: { bad: Number.NaN }, bytes: new Uint8Array([1]) }
      }
    });

    expect(result.ok).toBe(true);
    expect(editor.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
    expect(editor.exportProject().ok).toBe(false);
  });

  it("analyzes and commits GLB imports through the async operation without serializing runtime state", async () => {
    const editor = createEditor();
    const urls = mockObjectUrls();
    const scene = new Group();
    scene.name = "Analyzed GLB";
    const loader = {
      load: vi.fn(async () => scene),
      analyze: vi.fn(async () => ({
        scene,
        manifest: createGlbImportManifest({
          scene,
          resolved: { uri: "blob:runtime-only", mimeType: "model/gltf-binary", metadata: { byteSize: 3 } }
        })
      }))
    };

    const result = await editor.importGlbAsset({
      objectId: "object-a",
      name: "Machine",
      asset: {
        id: "asset-a",
        label: "machine.glb",
        source: { bytes: new Uint8Array([1, 2, 3]), mimeType: "model/gltf-binary" }
      },
      loader
    });
    urls.restore();

    expect(result.ok).toBe(true);
    expect(result.committed).toBe(true);
    expect(loader.load).not.toHaveBeenCalled();
    expect(loader.analyze).toHaveBeenCalledWith(expect.objectContaining({
      uri: "blob:import-0",
      mimeType: "model/gltf-binary"
    }));
    expect(urls.revokeObjectURL).toHaveBeenCalledWith("blob:import-0");
    expect(editor.getSnapshot().objects["object-a"]).toMatchObject({
      name: "Machine",
      asset: { id: "asset-a", kind: "glb" }
    });
    expect(editor.getSnapshot().assets["asset-a"].metadata?.glbImportManifest).toEqual(result.manifest);
    expect(editor.getAssetWorkspacePayloads()).toEqual([expect.objectContaining({
      assetId: "asset-a",
      byteSize: 3,
      available: true
    })]);
    expect(JSON.stringify(editor.serialize())).not.toContain("isObject3D");
    expect(JSON.stringify(editor.exportProject({ partial: true }).manifest)).not.toContain("blob:");
    const exported = editor.exportProject();
    expect(exported.ok).toBe(true);
    const entries = defaultArchiveAdapter.read(exported.packageBytes as Uint8Array);
    const manifestEntry = entries.find((entry) => entry.path === PROJECT_MANIFEST_PATH);
    const sceneEntry = entries.find((entry) => entry.path === PROJECT_SCENE_PATH);
    expect(decodeArchiveJson(manifestEntry!.bytes)).toMatchObject({
      assets: {
        "asset-a": { id: "asset-a", byteSize: 3 }
      }
    });
    expect(JSON.stringify(decodeArchiveJson(sceneEntry!.bytes))).toContain("glbImportManifest");
    expect(JSON.stringify(decodeArchiveJson(sceneEntry!.bytes))).not.toContain("blob:");
  });

  it("disposes transient GLB analysis scenes after import operations finish", async () => {
    const editor = createEditor();
    const urls = mockObjectUrls();
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const disposeGeometry = vi.spyOn(geometry, "dispose");
    const disposeMaterial = vi.spyOn(material, "dispose");
    const scene = new Group();
    scene.add(new Mesh(geometry, material));

    const result = await editor.importGlbAsset({
      objectId: "object-a",
      asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) },
      loader: {
        load: async () => scene,
        analyze: async () => ({
          scene,
          manifest: createGlbImportManifest({ scene })
        })
      }
    });
    urls.restore();

    expect(result.ok).toBe(true);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(scene.parent).toBeNull();
    expect(urls.revokeObjectURL).toHaveBeenCalledWith("blob:import-0");
  });

  it("returns diagnostics and leaves snapshot unchanged when import analysis fails", async () => {
    const editor = createEditor();
    const urls = mockObjectUrls();
    const diagnostics = createGlbImportDiagnosticsFromError(new Error("THREE.GLTFLoader: No DRACOLoader instance provided."));
    const before = editor.getSnapshot();

    const result = await editor.importGlbAsset({
      objectId: "object-a",
      asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) },
      loader: {
        load: async () => {
          throw new GlbImportError("missing draco", diagnostics);
        }
      }
    });
    urls.restore();

    expect(result.ok).toBe(false);
    expect(result.committed).toBe(false);
    expect(result.diagnostics).toMatchObject([{ code: "glb-decoder-missing" }]);
    expect(editor.getSnapshot()).toStrictEqual(before);
    expect(editor.getSnapshot().assets["asset-a"]).toBeUndefined();
    expect(urls.revokeObjectURL).toHaveBeenCalledWith("blob:import-0");
  });

  it("rejects non-GLB import operation inputs before registering assets", async () => {
    const editor = createEditor();

    const result = await editor.importGlbAsset({
      objectId: "object-a",
      asset: { id: "texture-a", kind: "texture", source: new Uint8Array([1]) }
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toMatchObject([{ code: "glb-source-invalid" }]);
    expect(editor.getSnapshot().assets["texture-a"]).toBeUndefined();
  });

  it("can analyze without committing and exposes manifest diagnostics through workbench after commit", async () => {
    const editor = createEditor();
    const urls = mockObjectUrls();
    const diagnostics = createGlbImportDiagnosticsFromError(
      new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures")
    );
    const loader = {
      load: async () => new Group(),
      analyze: async () => ({
        scene: new Group(),
        manifest: createGlbImportManifest({ diagnostics }),
        diagnostics
      })
    };
    const before = editor.getSnapshot();
    const beforeHistory = editor.getHistoryState();

    const analysis = await editor.importGlbAsset({
      asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) },
      loader,
      commit: false
    });
    expect(analysis.ok).toBe(false);
    expect(analysis.committed).toBe(false);
    expect(analysis.snapshot).toBe(before);
    expect(editor.getSnapshot()).toStrictEqual(before);
    expect(editor.getHistoryState()).toEqual(beforeHistory);
    expect(editor.getSnapshot().assets["asset-a"]).toBeUndefined();

    const committed = await editor.importGlbAsset({
      objectId: "object-a",
      asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) },
      loader: {
        load: async () => new Group(),
        analyze: async () => ({
          scene: new Group(),
          manifest: createGlbImportManifest()
        })
      }
    });

    expect(editor.getSnapshot().assets["asset-a"]).toBeDefined();
    expect(committed.ok).toBe(true);
    urls.restore();
    const model = buildWorkbenchModel(editor.getSnapshot(), {
      inspector: buildInspectorModel(editor.getSnapshot()),
      assetPayloads: editor.getAssetWorkspacePayloads()
    });
    expect(model.assets.workspace?.items.find((item) => item.id === "asset-a")).toMatchObject({
      importStatus: "analyzed"
    });
    expect(urls.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("rolls back transient payloads and analysis scenes when the import command fails", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const urls = mockObjectUrls();
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const disposeGeometry = vi.spyOn(geometry, "dispose");
    const disposeMaterial = vi.spyOn(material, "dispose");
    const scene = new Group();
    scene.add(new Mesh(geometry, material));
    const before = editor.getSnapshot();
    const beforeHistory = editor.getHistoryState();

    const result = await editor.importGlbAsset({
      objectId: "object-a",
      asset: { id: "asset-b", source: new Uint8Array([1, 2, 3]) },
      loader: {
        load: async () => scene,
        analyze: async () => ({
          scene,
          manifest: createGlbImportManifest({ scene })
        })
      }
    });
    urls.restore();

    expect(result.ok).toBe(false);
    expect(result.committed).toBe(false);
    expect(result.commandResult?.ok).toBe(false);
    expect(editor.getSnapshot()).toBe(before);
    expect(editor.getSnapshot().assets["asset-b"]).toBeUndefined();
    expect(editor.getHistoryState()).toEqual(beforeHistory);
    expect(editor.getAssetWorkspacePayloads().some((payload) => payload.assetId === "asset-b")).toBe(false);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(urls.revokeObjectURL).toHaveBeenCalledWith("blob:import-0");
  });

  it("previews GLB reimport remaps without mutating snapshot or payloads", async () => {
    const editor = createEditor();
    const urls = mockObjectUrls();
    await editor.importGlbAsset({
      objectId: "object-a",
      asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) },
      loader: createManifestLoader(createManifest()),
      expandImportedTargets: true
    });
    const before = editor.getSnapshot();
    const beforePayloads = editor.getAssetWorkspacePayloads();

    const result = await editor.reimportGlbAsset({
      assetId: "asset-a",
      source: new Uint8Array([4, 5, 6]),
      loader: createManifestLoader(withPrimitivePath(createManifest(), "meshes/panel/primitives/0")),
      commit: false
    });
    urls.restore();

    expect(result.ok).toBe(true);
    expect(result.committed).toBe(false);
    expect(result.remap?.summary.remappedTargetCount).toBeGreaterThan(0);
    expect(editor.getSnapshot()).toBe(before);
    expect(editor.getAssetWorkspacePayloads()).toEqual(beforePayloads);
  });

  it("commits GLB reimport by preserving asset id and replacing payload after analysis succeeds", async () => {
    const editor = createEditor();
    const urls = mockObjectUrls();
    await editor.importGlbAsset({
      objectId: "object-a",
      asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) },
      loader: createManifestLoader(createManifest()),
      expandImportedTargets: true
    });
    const oldPrimitive = Object.values(editor.getSnapshot().nodes)
      .find((node) => node.kind === "imported" && node.source.kind === "primitive")!;

    const result = await editor.reimportGlbAsset({
      assetId: "asset-a",
      source: { bytes: new Uint8Array([4, 5, 6]), mimeType: "model/gltf-binary" },
      loader: createManifestLoader(withPrimitivePath(createManifest(), "meshes/panel/primitives/0"))
    });
    urls.restore();

    expect(result.ok).toBe(true);
    expect(result.committed).toBe(true);
    expect(result.commandResult?.ok).toBe(true);
    expect(editor.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
    expect(editor.getSnapshot().nodes[oldPrimitive.id]).toMatchObject({
      kind: "imported",
      importKey: "glb:object-a/primitive:meshes/panel/primitives/0"
    });
    expect(editor.getAssetWorkspacePayloads()).toEqual([expect.objectContaining({
      assetId: "asset-a",
      byteSize: 3,
      checksum: "fnv1a32-c31d9cec"
    })]);
  });

  it("does not report a committed GLB reimport as failed when an asset workspace subscriber throws", async () => {
    const editor = createEditor();
    const urls = mockObjectUrls();
    await editor.importGlbAsset({
      objectId: "object-a",
      asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) },
      loader: createManifestLoader(createManifest()),
      expandImportedTargets: true
    });
    editor.subscribeAssetWorkspace(() => {
      throw new Error("subscriber failed");
    });

    const result = await editor.reimportGlbAsset({
      assetId: "asset-a",
      source: new Uint8Array([4, 5, 6]),
      loader: createManifestLoader(withPrimitivePath(createManifest(), "meshes/panel/primitives/0"))
    });
    urls.restore();

    expect(result.ok).toBe(true);
    expect(result.committed).toBe(true);
    expect(result.commandResult?.ok).toBe(true);
    expect(Object.values(editor.getSnapshot().nodes).find((node) =>
      node.kind === "imported" && node.source.kind === "primitive"
    )).toMatchObject({
      importKey: "glb:object-a/primitive:meshes/panel/primitives/0"
    });
  });

  it("leaves previous snapshot and payload unchanged when GLB reimport analysis fails", async () => {
    const editor = createEditor();
    const urls = mockObjectUrls();
    await editor.importGlbAsset({
      objectId: "object-a",
      asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) },
      loader: createManifestLoader(createManifest()),
      expandImportedTargets: true
    });
    const before = editor.getSnapshot();
    const beforePayloads = editor.getAssetWorkspacePayloads();
    const diagnostics = createGlbImportDiagnosticsFromError(new Error("THREE.GLTFLoader: No DRACOLoader instance provided."));

    const result = await editor.reimportGlbAsset({
      assetId: "asset-a",
      source: new Uint8Array([4, 5, 6]),
      loader: {
        load: async () => {
          throw new GlbImportError("missing draco", diagnostics);
        }
      }
    });
    urls.restore();

    expect(result.ok).toBe(false);
    expect(result.committed).toBe(false);
    expect(result.diagnostics).toMatchObject([{ code: "glb-decoder-missing" }]);
    expect(editor.getSnapshot()).toStrictEqual(before);
    expect(editor.getAssetWorkspacePayloads()).toEqual(beforePayloads);
  });

  it("rolls back replacement payload when GLB reimport command dispatch fails", async () => {
    const editor = createEditor();
    const urls = mockObjectUrls();
    await editor.importGlbAsset({
      objectId: "object-a",
      asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) },
      loader: createManifestLoader(createManifest()),
      expandImportedTargets: true
    });
    const before = editor.getSnapshot();
    const beforePayloads = editor.getAssetWorkspacePayloads();

    const result = await editor.reimportGlbAsset({
      assetId: "asset-a",
      ownerObjectId: "missing-object",
      source: new Uint8Array([4, 5, 6]),
      loader: createManifestLoader(createManifest())
    });
    urls.restore();

    expect(result.ok).toBe(false);
    expect(result.commandResult?.ok).toBe(false);
    expect(result.committed).toBe(false);
    expect(editor.getSnapshot()).toStrictEqual(before);
    expect(editor.getAssetWorkspacePayloads()).toEqual(beforePayloads);
  });

  it("does not dispatch GLB reimport when replacement payload registration fails", async () => {
    const editor = createEditor();
    const urls = mockObjectUrls();
    await editor.importGlbAsset({
      objectId: "object-a",
      asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) },
      loader: createManifestLoader(createManifest()),
      expandImportedTargets: true
    });
    const before = editor.getSnapshot();
    const beforePayloads = editor.getAssetWorkspacePayloads();
    const result = await editor.reimportGlbAsset({
      assetId: "asset-a",
      source: {
        bytes: new Uint8Array([4, 5, 6]),
        metadata: { invalid: Number.NaN }
      },
      loader: createManifestLoader(withPrimitivePath(createManifest(), "meshes/panel/primitives/0"))
    });
    urls.restore();

    expect(result.ok).toBe(false);
    expect(result.committed).toBe(false);
    expect(result.commandResult).toBeUndefined();
    expect(result.snapshot).toBe(before);
    expect(editor.getSnapshot()).toBe(before);
    expect(editor.getAssetWorkspacePayloads()).toEqual(beforePayloads);
  });
});

function createFakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}

function mockObjectUrls(): {
  createObjectURL: ReturnType<typeof vi.fn>;
  revokeObjectURL: ReturnType<typeof vi.fn>;
  restore(): void;
} {
  let count = 0;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const createObjectURL = vi.fn(() => `blob:import-${count++}`);
  const revokeObjectURL = vi.fn();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  return {
    createObjectURL,
    revokeObjectURL,
    restore() {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  };
}

function createManifestLoader(manifest: ReturnType<typeof createManifest>) {
  return {
    load: async () => new Group(),
    analyze: async () => ({
      scene: new Group(),
      manifest
    })
  };
}

function createManifest() {
  return createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name: "Panel", mesh: 0 }],
          meshes: [{
            name: "Panel mesh",
            primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }]
          }],
          materials: [{ name: "Red" }]
        }
      }
    }
  });
}

function withPrimitivePath(manifest: ReturnType<typeof createManifest>, path: string) {
  const mesh = manifest.meshes[0]!;
  const primitive = mesh.primitives[0]!;
  return {
    ...manifest,
    meshes: [{
      ...mesh,
      primitives: [{
        ...primitive,
        path
      }]
    }]
  };
}
