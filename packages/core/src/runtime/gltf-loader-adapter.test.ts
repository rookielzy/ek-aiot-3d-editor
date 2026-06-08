import { Group } from "three";
import { describe, expect, it, vi } from "vitest";
import { createGlbImportManifest } from "../assets/import-pipeline";
import {
  configureGltfLoader,
  GlbImportError,
  loadGltfWithLoader,
  PlaceholderGltfLoaderAdapter,
  ThreeGltfLoaderAdapter,
  type GltfDecoderConfiguration
} from "./gltf-loader-adapter";

describe("GLTF loader adapter", () => {
  it("configures host-supplied Draco, KTX2, and Meshopt integrations before load", async () => {
    const calls: string[] = [];
    const loader = createFakeLoader(calls);
    const draco = { preload() {} };
    const ktx2 = { detectSupport() {} };
    const meshopt = { supported: true };
    const decoders: GltfDecoderConfiguration = {
      draco: () => draco as never,
      ktx2: async () => ktx2 as never,
      meshopt: meshopt as never
    };

    await configureGltfLoader(loader as never, decoders);

    expect(calls).toEqual(["draco", "ktx2", "meshopt"]);
    expect(loader.dracoLoader).toBe(draco);
    expect(loader.ktx2Loader).toBe(ktx2);
    expect(loader.meshoptDecoder).toBe(meshopt);
  });

  it("uses a full loader factory with decoder config and returns manifest diagnostics from analysis", async () => {
    const calls: string[] = [];
    const loader = createFakeLoader(calls);
    const draco = { preload() {} };
    const ktx2 = { detectSupport() {} };
    const meshopt = { supported: true };
    const adapter = new ThreeGltfLoaderAdapter({
      loaderFactory: () => loader as never,
      decoders: {
        draco: () => draco as never,
        ktx2: async () => ktx2 as never,
        meshopt: meshopt as never
      },
      supportedExtensions: []
    });

    const result = await adapter.analyze({ uri: "/machine.glb", mimeType: "model/gltf-binary" });
    const loadedScene = await adapter.load({ uri: "/machine.glb", mimeType: "model/gltf-binary" });

    expect(calls).toEqual([
      "draco",
      "ktx2",
      "meshopt",
      "load:/machine.glb",
      "draco",
      "ktx2",
      "meshopt",
      "load:/machine.glb"
    ]);
    expect(result.scene).toBe(loader.scene);
    expect(loadedScene).toBe(loader.scene);
    expect(result.manifest).toMatchObject({
      counts: { scenes: 1, nodes: 1 },
      source: { mimeType: "model/gltf-binary" }
    });
    expect(JSON.stringify(result.manifest)).not.toContain("/machine.glb");
    expect(result.diagnostics).toEqual([]);
  });

  it("normalizes decoder load failures into GLB import errors", async () => {
    const loader = createFailingLoader(new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files"));
    const adapter = new ThreeGltfLoaderAdapter({ loaderFactory: () => loader as never });

    await expect(adapter.load({ uri: "/compressed.glb" })).rejects.toMatchObject({
      name: "GlbImportError",
      diagnostics: [{
        code: "glb-decoder-missing",
        target: { kind: "extension", extension: "KHR_meshopt_compression" }
      }]
    } satisfies Partial<GlbImportError>);
  });

  it("normalizes loader construction and decoder setup failures into GLB import errors", async () => {
    const loader = createFakeLoader([]);
    const adapter = new ThreeGltfLoaderAdapter({
      loaderFactory: () => loader as never,
      decoders: {
        ktx2: () => {
          throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");
        }
      }
    });

    await expect(adapter.analyze({ uri: "/compressed.glb" })).rejects.toMatchObject({
      name: "GlbImportError",
      diagnostics: [{
        code: "glb-decoder-missing",
        target: { kind: "extension", extension: "KHR_texture_basisu" }
      }]
    } satisfies Partial<GlbImportError>);
  });

  it("keeps placeholder and direct loader helpers compatible", async () => {
    const placeholder = await new PlaceholderGltfLoaderAdapter().load();
    const loader = createFakeLoader([]);
    const gltf = await loadGltfWithLoader(loader as never, { uri: "/box.glb" });
    const manifest = createGlbImportManifest({ gltf });

    expect(placeholder).toBeInstanceOf(Group);
    expect(gltf.scene).toBe(loader.scene);
    expect(manifest.counts.nodes).toBe(1);
  });
});

function createFakeLoader(calls: string[]) {
  const scene = new Group();
  scene.name = "Loaded";
  return {
    scene,
    dracoLoader: null as unknown,
    ktx2Loader: null as unknown,
    meshoptDecoder: null as unknown,
    setDRACOLoader: vi.fn(function (this: { dracoLoader: unknown }, value: unknown) {
      calls.push("draco");
      this.dracoLoader = value;
      return this;
    }),
    setKTX2Loader: vi.fn(function (this: { ktx2Loader: unknown }, value: unknown) {
      calls.push("ktx2");
      this.ktx2Loader = value;
      return this;
    }),
    setMeshoptDecoder: vi.fn(function (this: { meshoptDecoder: unknown }, value: unknown) {
      calls.push("meshopt");
      this.meshoptDecoder = value;
      return this;
    }),
    load(uri: string, onLoad: (gltf: unknown) => void) {
      calls.push(`load:${uri}`);
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

function createFailingLoader(error: Error) {
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
    load(_uri: string, _onLoad: (gltf: unknown) => void, _onProgress: unknown, onError: (error: Error) => void) {
      onError(error);
    }
  };
}
