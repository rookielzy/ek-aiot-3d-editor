import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { createGlbImportManifest } from "../assets/import-pipeline";
import type { SceneImportedGlbNode } from "../snapshot/types";
import { resolveImportedGlbTargets } from "./imported-target-resolver";

describe("runtime imported target resolver", () => {
  it("matches imported node, mesh, and primitive targets to loaded GLB descendants", () => {
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    mesh.name = "Panel";
    root.add(mesh);
    const manifest = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            nodes: [{ name: "Panel", mesh: 0 }],
            meshes: [{ name: "Panel", primitives: [{ attributes: { POSITION: 0 } }] }]
          }
        }
      }
    });

    const matches = resolveImportedGlbTargets({
      ownerObjectId: "object-a",
      ownerRoot: root,
      manifest,
      importedNodes: [
        createImportedNode("node-a", "node", "nodes/0", { index: 0 }),
        createImportedNode("mesh-a", "mesh", "meshes/0", { index: 0, meshIndex: 0 }),
        createImportedNode("primitive-a", "primitive", "meshes/0/primitives/0", { meshIndex: 0, primitiveIndex: 0 })
      ]
    });

    expect(matches.map((match) => [match.node.id, match.object, match.status])).toEqual([
      ["node-a", mesh, "aliased"],
      ["mesh-a", mesh, "aliased"],
      ["primitive-a", mesh, "aliased"]
    ]);
    expect(matches.find((match) => match.node.id === "primitive-a")).toMatchObject({
      pickable: true,
      transformable: false,
      aliasNodeIds: ["mesh-a", "node-a"]
    });
  });

  it("returns missing matches without mutating durable imported nodes", () => {
    const node = createImportedNode("node-missing", "node", "nodes/3", { index: 3 });

    const [match] = resolveImportedGlbTargets({
      ownerObjectId: "object-a",
      ownerRoot: new Group(),
      importedNodes: [node]
    });

    expect(match).toMatchObject({
      node,
      status: "missing",
      pickable: false,
      transformable: false
    });
    expect(node.transform).toBeUndefined();
  });

  it("uses deterministic fallback traversal when manifest associations are unavailable", () => {
    const root = new Group();
    const first = new Group();
    const second = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    root.add(first, second);

    const firstRun = resolveImportedGlbTargets({
      ownerObjectId: "object-a",
      ownerRoot: root,
      importedNodes: [
        createImportedNode("node-root", "node", "nodes/0", { index: 0 }),
        createImportedNode("node-first", "node", "nodes/1", { index: 1 }),
        createImportedNode("mesh-first", "mesh", "meshes/0", { meshIndex: 0 })
      ]
    });
    const secondRun = resolveImportedGlbTargets({
      ownerObjectId: "object-a",
      ownerRoot: root,
      importedNodes: [
        createImportedNode("node-root", "node", "nodes/0", { index: 0 }),
        createImportedNode("node-first", "node", "nodes/1", { index: 1 }),
        createImportedNode("mesh-first", "mesh", "meshes/0", { meshIndex: 0 })
      ]
    });

    expect(firstRun.map((match) => match.object)).toEqual([root, first, second]);
    expect(secondRun.map((match) => match.object)).toEqual(firstRun.map((match) => match.object));
  });

  it("resolves multi-primitive mesh targets to mesh-level and primitive-level runtime objects", () => {
    const root = new Group();
    const meshGroup = new Group();
    meshGroup.name = "Two-part mesh";
    const firstPrimitive = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const secondPrimitive = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    meshGroup.add(firstPrimitive, secondPrimitive);
    root.add(meshGroup);
    const manifest = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            nodes: [{ name: "Two-part mesh", mesh: 0 }],
            meshes: [{
              name: "Two-part mesh",
              primitives: [
                { attributes: { POSITION: 0 } },
                { attributes: { POSITION: 1 } }
              ]
            }]
          }
        }
      }
    });

    const matches = resolveImportedGlbTargets({
      ownerObjectId: "object-a",
      ownerRoot: root,
      manifest,
      importedNodes: [
        createImportedNode("mesh-a", "mesh", "meshes/0", { index: 0, meshIndex: 0 }),
        createImportedNode("primitive-a", "primitive", "meshes/0/primitives/0", { meshIndex: 0, primitiveIndex: 0 }),
        createImportedNode("primitive-b", "primitive", "meshes/0/primitives/1", { meshIndex: 0, primitiveIndex: 1 })
      ]
    });

    expect(matches.map((match) => [match.node.id, match.object, match.status])).toEqual([
      ["mesh-a", meshGroup, "matched"],
      ["primitive-a", firstPrimitive, "matched"],
      ["primitive-b", secondPrimitive, "matched"]
    ]);
  });

  it("reports ambiguous matches when one glTF mesh is instanced by multiple runtime nodes", () => {
    const root = new Group();
    const firstInstance = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const secondInstance = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    firstInstance.name = "Instance A";
    secondInstance.name = "Instance B";
    root.add(firstInstance, secondInstance);
    const manifest = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            nodes: [
              { name: "Instance A", mesh: 0 },
              { name: "Instance B", mesh: 0 }
            ],
            meshes: [{ name: "Shared mesh", primitives: [{ attributes: { POSITION: 0 } }] }]
          }
        }
      }
    });

    const [match] = resolveImportedGlbTargets({
      ownerObjectId: "object-a",
      ownerRoot: root,
      manifest,
      importedNodes: [
        createImportedNode("mesh-a", "mesh", "meshes/0", { index: 0, meshIndex: 0 })
      ]
    });

    expect(match).toMatchObject({
      status: "ambiguous",
      pickable: true,
      transformable: false,
      message: "Imported target glb:object-a/mesh:meshes/0 matched 2 runtime objects."
    });
  });

  it("resolves scene and camera targets from generated descriptors", () => {
    const root = new Group();
    const camera = new PerspectiveCamera();
    root.add(camera);
    const manifest = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            scenes: [{ nodes: [0] }],
            nodes: [{ name: "Camera node", camera: 0 }],
            cameras: [{ name: "Render Camera" }]
          }
        }
      }
    });

    const matches = resolveImportedGlbTargets({
      ownerObjectId: "object-a",
      ownerRoot: root,
      manifest,
      importedNodes: [
        createImportedNode("scene-a", "scene", "scenes/0", { index: 0 }),
        createImportedNode("camera-a", "camera", "cameras/0", { index: 0, cameraIndex: 0 })
      ]
    });

    expect(matches).toMatchObject([
      {
        node: expect.objectContaining({ id: "scene-a" }),
        object: root,
        status: "matched",
        transformable: false
      },
      {
        node: expect.objectContaining({ id: "camera-a" }),
        object: camera,
        status: "matched",
        transformable: true
      }
    ]);
  });
});

function createImportedNode(
  id: string,
  kind: SceneImportedGlbNode["source"]["kind"],
  path: string,
  source: Partial<SceneImportedGlbNode["source"]> = {}
): SceneImportedGlbNode {
  return {
    id,
    kind: "imported",
    name: id,
    ownerObjectId: "object-a",
    importKey: `glb:object-a/${kind}:${path}`,
    source: { kind, path, ...source },
    parentId: "object-a",
    children: []
  };
}
