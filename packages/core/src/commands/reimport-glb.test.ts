import { describe, expect, it } from "vitest";
import { attachGlbImportManifestMetadata, createGlbImportManifest, type GlbImportManifest } from "../assets/import-pipeline";
import { planGlbImportRemap } from "../assets/import-remap";
import { createEditor } from "../editor/create-editor";
import { createMaterialAssignmentId } from "../materials/defaults";
import { findImportedGlbMaterialSlot } from "../imported-targets/slots";
import type { SceneImportedGlbNode, SceneSnapshot } from "../snapshot/types";

describe("reimport GLB command", () => {
  it("updates matched imported targets in place and supports undo/redo", () => {
    const editor = createExpandedEditor(createManifest());
    const oldPrimitive = findImportedNodeByKey(editor.getSnapshot(), "glb:object-a/primitive:meshes/0/primitives/0")!;
    editor.dispatch({
      type: "set-node-transform",
      nodeId: oldPrimitive.id,
      transform: { position: [1, 2, 3] }
    });
    const replacementManifest = withPrimitivePath(createManifest(), "meshes/panel/primitives/0");
    const remap = planForSnapshot(editor.getSnapshot(), replacementManifest);

    const result = editor.dispatch({
      type: "reimport-glb",
      ownerObjectId: "object-a",
      assetId: "asset-a",
      manifest: replacementManifest,
      remap
    });

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.snapshot.assets["asset-a"].metadata?.glbImportManifest).toEqual(replacementManifest);
    expect(result.snapshot.nodes[oldPrimitive.id]).toMatchObject({
      id: oldPrimitive.id,
      kind: "imported",
      importKey: "glb:object-a/primitive:meshes/panel/primitives/0",
      source: { kind: "primitive", path: "meshes/panel/primitives/0" },
      transform: { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] },
      remap: {
        status: "resolved",
        previousImportKey: "glb:object-a/primitive:meshes/0/primitives/0"
      }
    });

    editor.undo();
    expect(findImportedNodeByKey(editor.getSnapshot(), "glb:object-a/primitive:meshes/0/primitives/0")?.id).toBe(oldPrimitive.id);
    editor.redo();
    expect(editor.getSnapshot().nodes[oldPrimitive.id]).toMatchObject({
      importKey: "glb:object-a/primitive:meshes/panel/primitives/0"
    });
  });

  it("preserves unresolved imported targets and adds new replacement targets", () => {
    const editor = createExpandedEditor(createManifest());
    const oldPrimitive = findImportedNodeByKey(editor.getSnapshot(), "glb:object-a/primitive:meshes/0/primitives/0")!;
    const replacementManifest = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            nodes: [
              { name: "Replacement root" },
              { name: "Preview camera", camera: 0 }
            ],
            cameras: [{ name: "Camera" }]
          }
        }
      }
    });
    const remap = planForSnapshot(editor.getSnapshot(), replacementManifest);

    const result = editor.dispatch({
      type: "reimport-glb",
      ownerObjectId: "object-a",
      assetId: "asset-a",
      manifest: replacementManifest,
      remap
    });

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.snapshot.nodes[oldPrimitive.id]).toMatchObject({
      kind: "imported",
      importKey: oldPrimitive.importKey,
      remap: {
        status: "unresolved",
        previousImportKey: oldPrimitive.importKey
      }
    });
    expect(findImportedNodeByKey(result.snapshot, "glb:object-a/camera:cameras/0")).toBeTruthy();
  });

  it("allocates collision-safe ids for new replacement targets without overwriting preserved nodes", () => {
    const editor = createExpandedEditor(createManifest());
    const preserved = findImportedNodeByKey(editor.getSnapshot(), "glb:object-a/node:nodes/0")!;
    const replacementManifest = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            nodes: [
              { name: "Panel renamed", mesh: 0 },
              { name: "Added node" }
            ],
            meshes: [{
              name: "Panel mesh",
              primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }]
            }],
            materials: [{ name: "Red" }]
          }
        }
      }
    });
    const remap = planForSnapshot(editor.getSnapshot(), replacementManifest);
    const newTarget = remap.newTargets.find((target) => target.importKey === "glb:object-a/node:nodes/1")!;
    newTarget.descriptor.id = preserved.id;

    const result = editor.dispatch({
      type: "reimport-glb",
      ownerObjectId: "object-a",
      assetId: "asset-a",
      manifest: replacementManifest,
      remap
    });

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.snapshot.nodes[preserved.id]).toMatchObject({
      id: preserved.id,
      importKey: preserved.importKey
    });
    expect(findImportedNodeByKey(result.snapshot, "glb:object-a/node:nodes/1")).toMatchObject({
      id: `${preserved.id}-2`,
      importKey: "glb:object-a/node:nodes/1"
    });
  });

  it("rewrites material-slot assignment ids when a slot key remaps", () => {
    const editor = createExpandedEditor(createManifest());
    const oldSlotKey = "glb:object-a/slot:meshes/0/primitives/0:material-0";
    const oldAssignmentId = createMaterialAssignmentId({ kind: "material-slot", objectId: "object-a", slotId: oldSlotKey });
    editor.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId: oldSlotKey },
      materialId: "material-a",
      materialName: "Machine red",
      material: { color: "#ff0000" }
    });
    const replacementManifest = withPrimitivePath(createManifest(), "meshes/panel/primitives/0");
    const remap = planForSnapshot(editor.getSnapshot(), replacementManifest);

    const result = editor.dispatch({
      type: "reimport-glb",
      ownerObjectId: "object-a",
      assetId: "asset-a",
      manifest: replacementManifest,
      remap
    });

    const nextSlotKey = "glb:object-a/slot:meshes/panel/primitives/0:material-0";
    const nextAssignmentId = createMaterialAssignmentId({ kind: "material-slot", objectId: "object-a", slotId: nextSlotKey });
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.snapshot.materials.assignments[oldAssignmentId]).toBeUndefined();
    expect(result.snapshot.materials.assignments[nextAssignmentId]).toMatchObject({
      id: nextAssignmentId,
      materialId: "material-a",
      target: { kind: "material-slot", objectId: "object-a", slotId: nextSlotKey }
    });
    expect(findImportedGlbMaterialSlot(result.snapshot, "object-a", nextSlotKey)).toBeTruthy();
  });

  it("preserves unresolved material-slot assignments and marks the matched imported node", () => {
    const editor = createExpandedEditor(createManifest());
    const oldSlotKey = "glb:object-a/slot:meshes/0/primitives/0:material-0";
    const oldAssignmentId = createMaterialAssignmentId({ kind: "material-slot", objectId: "object-a", slotId: oldSlotKey });
    editor.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId: oldSlotKey },
      materialId: "material-a",
      materialName: "Machine red",
      material: { color: "#ff0000" }
    });
    const replacementManifest = withoutPrimitiveMaterial(createManifest());
    const remap = planForSnapshot(editor.getSnapshot(), replacementManifest);

    const result = editor.dispatch({
      type: "reimport-glb",
      ownerObjectId: "object-a",
      assetId: "asset-a",
      manifest: replacementManifest,
      remap
    });

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.snapshot.materials.assignments[oldAssignmentId]).toMatchObject({
      id: oldAssignmentId,
      target: { kind: "material-slot", objectId: "object-a", slotId: oldSlotKey }
    });
    expect(findImportedNodeByKey(result.snapshot, "glb:object-a/primitive:meshes/0/primitives/0")).toMatchObject({
      importKey: "glb:object-a/primitive:meshes/0/primitives/0",
      remap: {
        metadata: {
          unresolvedMaterialSlots: [oldSlotKey]
        }
      }
    });
  });

  it("fails without mutation when material-slot assignment ids collide after remap", () => {
    const editor = createExpandedEditor(createTwoSlotManifest());
    const firstSlotKey = "glb:object-a/slot:meshes/0/primitives/0:material-0";
    const secondSlotKey = "glb:object-a/slot:meshes/0/primitives/1:material-1";
    editor.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId: firstSlotKey },
      materialId: "material-a",
      materialName: "Machine red",
      material: { color: "#ff0000" }
    });
    editor.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId: secondSlotKey },
      materialId: "material-b",
      materialName: "Machine blue",
      material: { color: "#0000ff" }
    });
    const before = editor.getSnapshot();
    const replacementManifest = withPrimitivePath(createTwoSlotManifest(), "meshes/panel/primitives/0");
    const remap = planForSnapshot(before, replacementManifest);
    remap.slotRemaps.push({
      nodeId: "glb:object-a/primitive:meshes/0/primitives/1",
      previousImportKey: "glb:object-a/primitive:meshes/0/primitives/1",
      nextImportKey: "glb:object-a/primitive:meshes/panel/primitives/0",
      previousSlotKey: secondSlotKey,
      nextSlotKey: "glb:object-a/slot:meshes/panel/primitives/0:material-0",
      nextSlot: remap.slotRemaps[0]!.nextSlot,
      confidence: "high",
      reason: "Forced collision for regression coverage."
    });

    const result = editor.dispatch({
      type: "reimport-glb",
      ownerObjectId: "object-a",
      assetId: "asset-a",
      manifest: replacementManifest,
      remap
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("would collide");
    expect(editor.getSnapshot()).toBe(before);
  });

  it("fails without mutation when owner and asset references do not match", () => {
    const editor = createExpandedEditor(createManifest());
    const before = editor.getSnapshot();
    const remap = planForSnapshot(before, createManifest());

    const result = editor.dispatch({
      type: "reimport-glb",
      ownerObjectId: "object-a",
      assetId: "asset-b",
      manifest: createManifest(),
      remap
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("asset");
    expect(editor.getSnapshot()).toBe(before);
  });
});

function createExpandedEditor(manifest: GlbImportManifest) {
  const editor = createEditor();
  editor.dispatch({
    type: "import-glb",
    objectId: "object-a",
    asset: {
      id: "asset-a",
      metadata: attachGlbImportManifestMetadata(undefined, manifest)
    },
    expandImportedTargets: true
  });
  return editor;
}

function planForSnapshot(snapshot: SceneSnapshot, replacementManifest: GlbImportManifest) {
  return planGlbImportRemap({
    ownerObjectId: "object-a",
    currentTargets: Object.values(snapshot.nodes).filter((node): node is SceneImportedGlbNode =>
      node.kind === "imported" && node.ownerObjectId === "object-a"
    ),
    replacementManifest
  });
}

function findImportedNodeByKey(snapshot: SceneSnapshot, importKey: string): SceneImportedGlbNode | null {
  return Object.values(snapshot.nodes).find((node): node is SceneImportedGlbNode =>
    node.kind === "imported" && node.importKey === importKey
  ) ?? null;
}

function createManifest(): GlbImportManifest {
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

function createTwoSlotManifest(): GlbImportManifest {
  return createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name: "Panel", mesh: 0 }],
          meshes: [{
            name: "Panel mesh",
            primitives: [
              { attributes: { POSITION: 0, NORMAL: 1 }, material: 0 },
              { attributes: { POSITION: 2, NORMAL: 3 }, material: 1 }
            ]
          }],
          materials: [{ name: "Red" }, { name: "Blue" }]
        }
      }
    }
  });
}

function withPrimitivePath(manifest: GlbImportManifest, path: string): GlbImportManifest {
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

function withoutPrimitiveMaterial(manifest: GlbImportManifest): GlbImportManifest {
  const mesh = manifest.meshes[0]!;
  const primitive = mesh.primitives[0]!;
  const { materialIndex, ...primitiveWithoutMaterial } = primitive;
  return {
    ...manifest,
    meshes: [{
      ...mesh,
      primitives: [primitiveWithoutMaterial]
    }]
  };
}
