import { describe, expect, it } from "vitest";
import { createGlbImportManifest } from "../assets/import-pipeline";
import { createImportedGlbTargetDescriptors } from "./keys";

describe("imported GLB target keys", () => {
  it("generates deterministic target and material slot descriptors from a manifest", () => {
    const manifest = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            scenes: [{ name: "Main", nodes: [0] }],
            nodes: [
              { name: "Root", children: [1] },
              { name: "Panel", mesh: 0 }
            ],
            meshes: [{
              name: "Panel mesh",
              primitives: [
                { attributes: { POSITION: 0 }, material: 0 },
                { attributes: { NORMAL: 1, POSITION: 2 }, material: 1 }
              ]
            }],
            materials: [{ name: "Red" }, { name: "Blue" }]
          }
        }
      }
    });

    const first = createImportedGlbTargetDescriptors({ ownerObjectId: "object-a", manifest });
    const second = createImportedGlbTargetDescriptors({ ownerObjectId: "object-a", manifest });

    expect(second).toEqual(first);
    expect(first.map((target) => target.importKey)).toEqual([
      "glb:object-a/scene:scenes/0",
      "glb:object-a/node:nodes/0",
      "glb:object-a/node:nodes/1",
      "glb:object-a/mesh:meshes/0",
      "glb:object-a/primitive:meshes/0/primitives/0",
      "glb:object-a/primitive:meshes/0/primitives/1"
    ]);
    expect(first
      .filter((target) => target.source.kind === "primitive")
      .flatMap((target) => target.materialSlots?.map((slot) => slot.slotKey) ?? [])).toEqual([
        "glb:object-a/slot:meshes/0/primitives/0:material-0",
        "glb:object-a/slot:meshes/0/primitives/1:material-1"
      ]);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it("creates collision-safe node ids without changing source import keys", () => {
    const manifest = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            nodes: [
              { name: "A" },
              { name: "B" }
            ]
          }
        }
      }
    });

    const descriptors = createImportedGlbTargetDescriptors({
      ownerObjectId: "object/a",
      manifest,
      idPrefix: "target"
    });

    expect(new Set(descriptors.map((descriptor) => descriptor.id)).size).toBe(descriptors.length);
    expect(descriptors.map((descriptor) => descriptor.importKey)).toEqual([
      "glb:object/a/node:nodes/0",
      "glb:object/a/node:nodes/1"
    ]);
  });

  it("creates collision-safe import and slot keys when manifest paths sanitize to the same value", () => {
    const manifest = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            nodes: [
              { name: "A" },
              { name: "B" }
            ],
            meshes: [{
              primitives: [
                { attributes: { POSITION: 0 }, material: 0 },
                { attributes: { NORMAL: 1 }, material: 0 }
              ]
            }],
            materials: [{ name: "Red" }]
          }
        }
      }
    });
    manifest.nodes[1] = { ...manifest.nodes[1], path: manifest.nodes[0]!.path };
    manifest.meshes[0] = {
      ...manifest.meshes[0]!,
      primitives: manifest.meshes[0]!.primitives.map((primitive) => ({
        ...primitive,
        path: "meshes/0/primitives/@"
      }))
    };

    const descriptors = createImportedGlbTargetDescriptors({ ownerObjectId: "object-a", manifest });
    const importKeys = descriptors.map((descriptor) => descriptor.importKey);
    const slotKeys = descriptors.flatMap((descriptor) => descriptor.materialSlots?.map((slot) => slot.slotKey) ?? []);

    expect(new Set(importKeys).size).toBe(importKeys.length);
    expect(importKeys).toContain("glb:object-a/node:nodes/0");
    expect(importKeys).toContain("glb:object-a/node:nodes/0-2");
    expect(slotKeys).toEqual([
      "glb:object-a/slot:meshes/0/primitives:material-0",
      "glb:object-a/slot:meshes/0/primitives:material-0-2"
    ]);
    expect(descriptors.filter((descriptor) => descriptor.source.kind === "primitive").map((descriptor) => descriptor.source.path)).toEqual([
      "meshes/0/primitives/@",
      "meshes/0/primitives/@"
    ]);
  });
});
