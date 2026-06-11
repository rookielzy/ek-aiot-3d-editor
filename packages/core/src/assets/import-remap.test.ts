import { describe, expect, it } from "vitest";
import { createGlbImportManifest, type GlbImportManifest } from "./import-pipeline";
import { planGlbImportRemap } from "./import-remap";
import { createImportedGlbNodesFromDescriptors } from "../imported-targets/create";
import { createImportedGlbTargetDescriptors } from "../imported-targets/keys";
import type { SceneImportedGlbNode } from "../snapshot/types";

describe("GLB import remap planner", () => {
  it("matches unchanged imported targets by exact import key and keeps node ids in the plan", () => {
    const manifest = createManifest();
    const currentTargets = createCurrentTargets("object-a", manifest);

    const plan = planGlbImportRemap({
      ownerObjectId: "object-a",
      currentTargets,
      replacementManifest: manifest
    });

    expect(plan.summary).toMatchObject({
      exactTargetCount: currentTargets.length,
      remappedTargetCount: 0,
      unresolvedTargetCount: 0,
      newTargetCount: 0
    });
    expect(plan.targetRemaps.map((remap) => remap.previousNodeId)).toEqual(currentTargets.map((node) => node.id).sort());
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
    expect(JSON.stringify(plan)).not.toContain("Object3D");
    expect(JSON.stringify(plan)).not.toContain("blob:");
  });

  it("fallback-matches rekeyed primitive targets by mesh primitive relationship and remaps material slots", () => {
    const oldManifest = createManifest();
    const newManifest = withPrimitivePath(createManifest(), "meshes/panel/primitives/0");
    const currentTargets = createCurrentTargets("object-a", oldManifest);
    const primitiveNode = currentTargets.find((node) => node.source.kind === "primitive")!;

    const plan = planGlbImportRemap({
      ownerObjectId: "object-a",
      currentTargets: [primitiveNode],
      replacementManifest: newManifest
    });

    expect(plan.targetRemaps).toHaveLength(1);
    expect(plan.targetRemaps[0]).toMatchObject({
      previousNodeId: primitiveNode.id,
      previousImportKey: "glb:object-a/primitive:meshes/0/primitives/0",
      nextImportKey: "glb:object-a/primitive:meshes/panel/primitives/0",
      kind: "relationship",
      confidence: "medium"
    });
    expect(plan.slotRemaps).toMatchObject([{
      previousSlotKey: "glb:object-a/slot:meshes/0/primitives/0:material-0",
      nextSlotKey: "glb:object-a/slot:meshes/panel/primitives/0:material-0"
    }]);
    expect(plan.summary.remappedSlotCount).toBe(1);
  });

  it("fallback-matches rekeyed targets by source descriptor identity before weaker relationships", () => {
    const manifest = createManifest();
    const currentTargets = createCurrentTargets("object-a", manifest);
    const node = {
      ...currentTargets.find((target) => target.source.kind === "node")!,
      importKey: "glb:object-a/node:nodes/legacy"
    };

    const plan = planGlbImportRemap({
      ownerObjectId: "object-a",
      currentTargets: [node],
      replacementManifest: manifest
    });

    expect(plan.targetRemaps).toHaveLength(1);
    expect(plan.targetRemaps[0]).toMatchObject({
      previousNodeId: node.id,
      nextImportKey: "glb:object-a/node:nodes/0",
      kind: "source",
      confidence: "high"
    });
    expect(plan.unresolvedTargets).toEqual([]);
  });

  it("reports unresolved material slots when a matched target has no replacement slot", () => {
    const oldManifest = createManifest();
    const newManifest = withoutPrimitiveMaterial(createManifest());
    const primitiveNode = createCurrentTargets("object-a", oldManifest)
      .find((target) => target.source.kind === "primitive")!;

    const plan = planGlbImportRemap({
      ownerObjectId: "object-a",
      currentTargets: [primitiveNode],
      replacementManifest: newManifest
    });

    expect(plan.targetRemaps).toHaveLength(1);
    expect(plan.unresolvedSlots).toEqual([{
      nodeId: primitiveNode.id,
      importKey: "glb:object-a/primitive:meshes/0/primitives/0",
      slotKey: "glb:object-a/slot:meshes/0/primitives/0:material-0",
      candidateSlotKeys: [],
      reason: "No replacement material slot matched."
    }]);
    expect(plan.summary.unresolvedSlotCount).toBe(1);
  });

  it("leaves ambiguous name-only matches unresolved with deterministic candidates", () => {
    const oldManifest = createManifest();
    const currentTargets = createCurrentTargets("object-a", oldManifest);
    const node = {
      ...currentTargets.find((target) => target.source.kind === "node")!,
      importKey: "glb:object-a/node:nodes/legacy",
      source: { kind: "node" as const, path: "nodes/legacy", index: 99 },
      name: "Panel"
    };
    const replacement = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            nodes: [
              { name: node.name },
              { name: node.name }
            ]
          }
        }
      }
    });

    const plan = planGlbImportRemap({
      ownerObjectId: "object-a",
      currentTargets: [node],
      replacementManifest: replacement
    });

    expect(plan.targetRemaps).toEqual([]);
    expect(plan.unresolvedTargets).toEqual([{
      nodeId: node.id,
      previousImportKey: node.importKey,
      candidateImportKeys: [
        "glb:object-a/node:nodes/0",
        "glb:object-a/node:nodes/1"
      ],
      reason: "Multiple replacement targets matched with the same confidence."
    }]);
  });

  it("reports removed old targets and newly discovered replacement targets separately", () => {
    const currentTargets = createCurrentTargets("object-a", createManifest()).map((node) =>
      node.source.kind === "primitive"
        ? {
            ...node,
            importKey: "glb:object-a/primitive:meshes/removed/primitives/0",
            source: {
              kind: "primitive" as const,
              path: "meshes/removed/primitives/0",
              meshIndex: 7,
              primitiveIndex: 0,
              materialIndex: 3
            }
          }
        : node
    );
    const replacement = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            nodes: [
              { name: "Replacement root", mesh: 0 },
              { name: "Added camera", camera: 0 }
            ],
            meshes: [{ name: "Replacement mesh", primitives: [{ attributes: { POSITION: 0 } }] }],
            cameras: [{ name: "Camera" }]
          }
        }
      }
    });

    const plan = planGlbImportRemap({
      ownerObjectId: "object-a",
      currentTargets,
      replacementManifest: replacement
    });

    expect(plan.unresolvedTargets.length).toBeGreaterThan(0);
    expect(plan.newTargets.map((target) => target.importKey)).toEqual(expect.arrayContaining([
      "glb:object-a/node:nodes/1",
      "glb:object-a/camera:cameras/0"
    ]));
    expect(plan.summary.newTargetCount).toBe(plan.newTargets.length);
  });
});

function createCurrentTargets(ownerObjectId: string, manifest: GlbImportManifest): SceneImportedGlbNode[] {
  const descriptors = createImportedGlbTargetDescriptors({ ownerObjectId, manifest });
  return Object.values(createImportedGlbNodesFromDescriptors(ownerObjectId, ownerObjectId, descriptors))
    .sort((left, right) => left.id.localeCompare(right.id));
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
