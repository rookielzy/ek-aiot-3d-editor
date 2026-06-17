import { Group } from "three";
import { describe, expect, it, vi } from "vitest";
import { createEditor } from "../editor/create-editor";
import { createGlbImportDiagnosticsFromError, createGlbImportManifest } from "./import-pipeline";
import { buildAssetWorkspaceModel } from "./workspace";
import {
  classifyWorkbenchAssetImportFile,
  importWorkbenchAssets
} from "./workspace-import";

describe("workbench asset import bridge", () => {
  it("routes GLB imports through the decoder-aware editor operation", async () => {
    const editor = createEditor();
    const urls = mockObjectUrls();
    const scene = new Group();
    scene.name = "Robot";
    const diagnostics = createGlbImportDiagnosticsFromError(
      new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures")
    ).map((diagnostic) => ({ ...diagnostic, severity: "warning" as const }));
    const loader = {
      load: vi.fn(async () => scene),
      analyze: vi.fn(async () => ({
        scene,
        manifest: createGlbImportManifest({
          scene,
          resolved: { uri: "blob:runtime-only", mimeType: "model/gltf-binary", metadata: { byteSize: 3 } },
          diagnostics
        }),
        diagnostics
      }))
    };

    const [result] = await editor.importWorkbenchAssets({
      files: [{ name: "robot.glb", source: new Uint8Array([1, 2, 3]), mimeType: "model/gltf-binary" }],
      loader
    });
    urls.restore();

    expect(result).toMatchObject({
      label: "robot.glb",
      kind: "glb",
      status: "succeeded",
      committed: true,
      diagnostics: [{ code: "glb-decoder-missing" }]
    });
    expect(result?.assetId).toBeDefined();
    expect(result?.objectId).toBeDefined();
    expect(loader.analyze).toHaveBeenCalledWith(expect.objectContaining({
      uri: "blob:workbench-import-0",
      mimeType: "model/gltf-binary"
    }));
    expect(loader.load).not.toHaveBeenCalled();
    expect(editor.getSnapshot().objects[result!.objectId!]).toMatchObject({
      name: "robot",
      asset: { id: result!.assetId, kind: "glb", label: "robot.glb" }
    });
    expect(buildAssetWorkspaceModel(editor.getSnapshot(), {
      payloads: editor.getAssetWorkspacePayloads()
    }).items.find((item) => item.id === result!.assetId)).toMatchObject({
      importStatus: "has-diagnostics",
      payloadStatus: "available"
    });
    expect(JSON.stringify(result)).not.toContain("Object3D");
    expect(JSON.stringify(result)).not.toContain("blob:");
    expect(JSON.stringify(editor.serialize())).not.toContain("blob:");
    expect(JSON.stringify(editor.exportProject({ partial: true }).manifest)).not.toContain("blob:");
  });

  it("registers HDR and raster texture assets without creating scene objects", async () => {
    const editor = createEditor();

    const results = await importWorkbenchAssets(editor, {
      rasterKind: "texture",
      files: [
        { id: "env-a", name: "studio.hdr", source: new Uint8Array([1, 2]), mimeType: "image/vnd.radiance" },
        { id: "tex-a", name: "albedo.png", source: new Uint8Array([3, 4]), mimeType: "image/png" }
      ]
    });

    expect(results.map((result) => [result.label, result.kind, result.status, result.assetId])).toEqual([
      ["studio.hdr", "hdr", "succeeded", "env-a"],
      ["albedo.png", "texture", "succeeded", "tex-a"]
    ]);
    expect(editor.getSnapshot().objects).toEqual({});
    expect(editor.getSnapshot().assets).toMatchObject({
      "env-a": { kind: "hdr", label: "studio.hdr" },
      "tex-a": { kind: "texture", label: "albedo.png" }
    });
    expect(editor.getAssetWorkspacePayloads()).toEqual([
      expect.objectContaining({ assetId: "env-a", kind: "hdr", available: true, exportable: true, byteSize: 2 }),
      expect.objectContaining({ assetId: "tex-a", kind: "texture", available: true, exportable: true, byteSize: 2 })
    ]);
  });

  it("preserves structured source metadata when file metadata is provided", async () => {
    const editor = createEditor();

    await importWorkbenchAssets(editor, {
      files: [{
        id: "env-a",
        name: "studio.hdr",
        source: {
          bytes: new Uint8Array([1, 2]),
          metadata: { sourceChecksum: "fnv1a32-00000002", sourceOnly: true }
        },
        metadata: { userLabel: "Studio", sourceOnly: false }
      }]
    });

    expect(editor.getAssetWorkspacePayloads()[0]).toMatchObject({
      assetId: "env-a",
      metadata: {
        sourceChecksum: "fnv1a32-00000002",
        sourceOnly: false,
        userLabel: "Studio"
      }
    });
  });

  it("requires explicit image or texture intent for ambiguous raster files", async () => {
    const editor = createEditor();

    const [result] = await importWorkbenchAssets(editor, {
      files: [{ id: "image-a", name: "label.jpg", source: new Uint8Array([1]) }]
    });

    expect(result).toMatchObject({
      label: "label.jpg",
      kind: "image",
      status: "failed",
      committed: false,
      diagnostics: [{
        code: "workbench-import-raster-kind-required",
        actionLabel: "Choose intent",
        titleDescriptor: {
          key: "workbenchImport.diagnostic.workbench.import.raster.kind.required.title",
          fallback: "Choose image or texture"
        },
        detailDescriptor: {
          values: expect.objectContaining({
            fileName: "label.jpg"
          })
        },
        actionLabelDescriptor: {
          key: "workbenchImport.diagnostic.workbench.import.raster.kind.required.actionLabel"
        }
      }]
    });
    expect(editor.getSnapshot().assets["image-a"]).toBeUndefined();
    expect(classifyWorkbenchAssetImportFile({ name: "label.jpg", source: new Uint8Array([1]) }, "image")).toMatchObject({
      kind: "image"
    });
  });

  it("keeps successful files committed when another batch item fails", async () => {
    const editor = createEditor();
    const urls = mockObjectUrls();
    const loader = {
      load: vi.fn(async () => new Group()),
      analyze: vi.fn(async () => ({
        scene: new Group(),
        manifest: createGlbImportManifest()
      }))
    };

    const results = await editor.importWorkbenchAssets({
      files: [
        { id: "machine-a", name: "machine.glb", source: new Uint8Array([1, 2, 3]) },
        { id: "bad-a", name: "notes.txt", source: new Uint8Array([4]) }
      ],
      loader
    });
    urls.restore();

    expect(results.map((result) => [result.label, result.status, result.committed])).toEqual([
      ["machine.glb", "succeeded", true],
      ["notes.txt", "failed", false]
    ]);
    expect(editor.getSnapshot().assets["machine-a"]).toMatchObject({ kind: "glb" });
    expect(editor.getSnapshot().assets["bad-a"]).toBeUndefined();
    expect(editor.getSnapshot().objects[results[0]!.objectId!]).toBeDefined();
  });
});

function mockObjectUrls(): {
  createObjectURL: ReturnType<typeof vi.fn>;
  revokeObjectURL: ReturnType<typeof vi.fn>;
  restore(): void;
} {
  let count = 0;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const createObjectURL = vi.fn(() => `blob:workbench-import-${count++}`);
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
