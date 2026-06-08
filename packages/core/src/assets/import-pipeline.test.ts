import { AnimationClip, BoxGeometry, Camera, Group, Mesh, MeshBasicMaterial, Object3D } from "three";
import { describe, expect, it } from "vitest";
import { validateSceneSnapshot } from "../snapshot/validation";
import { createEditor } from "../editor/create-editor";
import {
  attachGlbImportManifestMetadata,
  createGlbImportDiagnosticsFromError,
  createGlbImportManifest,
  glbImportDiagnosticToProblem,
  normalizeGltfLoaderOutput,
  validateGlbImportManifest
} from "./import-pipeline";

describe("GLB import pipeline contract", () => {
  it("extracts deterministic JSON-compatible manifest descriptors from glTF JSON", () => {
    const scene = new Group();
    scene.name = "Loaded scene";
    const manifest = createGlbImportManifest({
      gltf: createGltfFixture(scene),
      resolved: {
        uri: "blob:runtime-only",
        mimeType: "model/gltf-binary",
        metadata: { byteSize: 123, checksum: "fnv1a32-00000001" }
      },
      supportedExtensions: ["KHR_texture_basisu", "KHR_draco_mesh_compression"]
    });

    expect(manifest.counts).toMatchObject({
      scenes: 1,
      nodes: 2,
      meshes: 1,
      primitives: 2,
      materials: 2,
      textures: 1,
      images: 1,
      cameras: 1,
      animations: 1,
      skins: 0
    });
    expect(manifest.source).toEqual({
      mimeType: "model/gltf-binary",
      byteSize: 123,
      checksum: "fnv1a32-00000001"
    });
    expect(manifest.meshes[0]?.primitives.map((primitive) => primitive.path)).toEqual([
      "meshes/0/primitives/0",
      "meshes/0/primitives/1"
    ]);
    expect(manifest.extensions).toEqual({
      used: ["KHR_draco_mesh_compression", "KHR_texture_basisu"],
      required: ["KHR_texture_basisu"],
      unsupportedRequired: []
    });
    expect(validateGlbImportManifest(manifest).ok).toBe(true);
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
    expect(JSON.stringify(manifest)).not.toContain("Object3D");
    expect(JSON.stringify(manifest)).not.toContain("blob:");
  });

  it("does not persist resolver URIs in manifest source summaries", () => {
    const manifest = createGlbImportManifest({
      scene: new Group(),
      resolved: {
        uri: "/signed/machine.glb?token=runtime",
        mimeType: "model/gltf-binary",
        metadata: { byteSize: 4, checksum: "fnv1a32-00000004" }
      }
    });

    expect(manifest.source).toEqual({
      mimeType: "model/gltf-binary",
      byteSize: 4,
      checksum: "fnv1a32-00000004"
    });
    expect(JSON.stringify(manifest)).not.toContain("/signed/machine.glb");
    expect(JSON.stringify(attachGlbImportManifestMetadata(undefined, manifest))).not.toContain("runtime");
  });

  it("flags unsupported required extensions and normalizes decoder errors", () => {
    const manifest = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            asset: { version: "2.0" },
            extensionsUsed: ["KHR_texture_basisu", "VENDOR_required"],
            extensionsRequired: ["VENDOR_required"]
          }
        }
      },
      supportedExtensions: ["KHR_texture_basisu"]
    });
    const diagnostics = createGlbImportDiagnosticsFromError(
      new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures")
    );

    expect(manifest.diagnostics).toMatchObject([{
      code: "glb-extension-required-unsupported",
      target: { kind: "extension", extension: "VENDOR_required" }
    }]);
    expect(diagnostics).toMatchObject([{
      code: "glb-decoder-missing",
      target: { kind: "extension", extension: "KHR_texture_basisu" },
      recoverability: "user-action"
    }]);
  });

  it("flags unknown optional extensions without failing the import", () => {
    const manifest = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            asset: { version: "2.0" },
            extensionsUsed: ["VENDOR_optional"]
          }
        }
      }
    });

    expect(manifest.diagnostics).toMatchObject([{
      severity: "warning",
      code: "glb-extension-unknown",
      target: { kind: "extension", extension: "VENDOR_optional" }
    }]);
  });

  it("accepts legacy Object3D loader output and structured loader results", () => {
    const legacy = new Group();
    const manifest = createGlbImportManifest({ scene: legacy });
    const structured = normalizeGltfLoaderOutput({
      scene: legacy,
      manifest,
      diagnostics: manifest.diagnostics
    });

    expect(normalizeGltfLoaderOutput(legacy).scene).toBe(legacy);
    expect(structured).toMatchObject({ scene: legacy, manifest });
  });

  it("maps import diagnostics to runtime problems without changing snapshot durability", () => {
    const diagnostic = createGlbImportDiagnosticsFromError(new Error("THREE.GLTFLoader: No DRACOLoader instance provided."))[0]!;
    const problem = glbImportDiagnosticToProblem(diagnostic, { id: "asset-a", kind: "glb" }, "object-a");

    expect(problem).toMatchObject({
      code: "glb-decoder-missing",
      source: "runtime",
      target: { kind: "object", objectId: "object-a" },
      assetId: "asset-a",
      objectId: "object-a"
    });
    expect(JSON.parse(JSON.stringify(problem.metadata))).toEqual(problem.metadata);
  });

  it("stores manifest metadata only when it is JSON-compatible", () => {
    const editor = createEditor();
    const manifest = createGlbImportManifest({ scene: new Group() });
    const metadata = attachGlbImportManifestMetadata({ durable: true }, manifest);
    const result = editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata }
    });

    expect(result.ok).toBe(true);
    expect(validateSceneSnapshot(result.snapshot).ok).toBe(true);
    expect(JSON.stringify(result.snapshot)).not.toContain("isObject3D");

    const invalid = editor.dispatch({
      type: "import-glb",
      objectId: "object-b",
      asset: {
        id: "asset-b",
        metadata: { glbImportManifest: new Object3D() as unknown as never }
      }
    });
    expect(invalid.ok).toBe(false);
  });

  it("rejects malformed manifest diagnostics, targets, and counts", () => {
    const manifest = createGlbImportManifest();

    expect(validateGlbImportManifest({
      ...manifest,
      counts: { ...manifest.counts, meshes: -1 }
    })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["GLB import manifest count meshes must be a non-negative integer."])
    });
    expect(validateGlbImportManifest({
      ...manifest,
      diagnostics: [{
        id: "custom",
        severity: "warning",
        code: "custom-code",
        target: { kind: "asset" },
        message: "Custom",
        recoverability: "user-action",
        display: { title: "Custom" }
      }]
    })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["GLB import manifest diagnostic 0 is invalid."])
    });
    expect(validateGlbImportManifest({
      ...manifest,
      diagnostics: [{
        id: "bad-target",
        severity: "warning",
        code: "glb-extension-unknown",
        target: { kind: "extension" },
        message: "Custom",
        recoverability: "user-action",
        display: { title: "Custom" }
      }]
    })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["GLB import manifest diagnostic 0 is invalid."])
    });
  });

  it("counts runtime fallback meshes, materials, cameras, and node children when JSON is unavailable", () => {
    const scene = new Group();
    const child = new Group();
    const camera = new Camera();
    const red = new MeshBasicMaterial({ name: "Red" });
    const blue = new MeshBasicMaterial({ name: "Blue" });
    const mesh = new Mesh(new BoxGeometry(), [red, blue]);
    mesh.name = "Panel";
    camera.name = "Preview";
    child.add(mesh, camera);
    scene.add(child);

    const manifest = createGlbImportManifest({ scene });

    expect(manifest.counts).toMatchObject({
      scenes: 1,
      nodes: 4,
      meshes: 1,
      primitives: 2,
      materials: 2,
      cameras: 1
    });
    expect(manifest.nodes.find((node) => node.name === scene.name || node.index === 0)?.childNodeIndices).toEqual([1]);
    expect(manifest.meshes[0]).toMatchObject({
      name: "Panel",
      primitiveCount: 2
    });
    expect(manifest.meshes[0]?.primitives.map((primitive) => primitive.materialIndex)).toEqual([0, 1]);
    expect(manifest.meshes[0]?.primitives[0]?.attributeNames).toEqual(expect.arrayContaining(["normal", "position", "uv"]));
    expect(manifest.materials.map((material) => material.name)).toEqual(["Red", "Blue"]);
    expect(manifest.cameras[0]).toMatchObject({ name: "Preview" });
  });
});

function createGltfFixture(scene: Group) {
  const mesh = new Mesh(undefined, [new MeshBasicMaterial(), new MeshBasicMaterial()]);
  mesh.name = "Panel";
  scene.add(mesh);
  return {
    scene,
    scenes: [scene],
    cameras: [new Camera()],
    animations: [new AnimationClip("Spin", 1, [])],
    asset: { version: "2.0" },
    parser: {
      json: {
        asset: { version: "2.0", generator: "fixture" },
        extensionsUsed: ["KHR_texture_basisu", "KHR_draco_mesh_compression"],
        extensionsRequired: ["KHR_texture_basisu"],
        scenes: [{ name: "Main", nodes: [0] }],
        nodes: [
          { name: "Root", children: [1] },
          { name: "Panel", mesh: 0, camera: 0 }
        ],
        meshes: [{
          name: "Panel mesh",
          primitives: [
            { attributes: { POSITION: 0, NORMAL: 1 }, material: 0 },
            { attributes: { POSITION: 2 }, material: 1, extensions: { KHR_draco_mesh_compression: {} } }
          ]
        }],
        materials: [{ name: "Red" }, { name: "Blue" }],
        textures: [{ source: 0, sampler: 0 }],
        images: [{ mimeType: "image/ktx2", bufferView: 0 }],
        cameras: [{ name: "Camera" }],
        animations: [{ name: "Spin", channels: [{ sampler: 0, target: { node: 1 } }], samplers: [{}] }]
      }
    },
    userData: {}
  };
}
