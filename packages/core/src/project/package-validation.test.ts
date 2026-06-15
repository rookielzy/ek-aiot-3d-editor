import { describe, expect, it } from "vitest";
import { createEmptySnapshot } from "../snapshot/defaults";
import type { SceneSnapshot, V3SceneSnapshot } from "../snapshot/types";
import { encodeArchiveJson, type ArchiveAdapter, type ArchiveEntry } from "./archive-adapter";
import { parseProjectPackage } from "./package-validation";

describe("project package validation", () => {
  it("accepts a manifest, scene, and payload whose asset ids and paths are valid", () => {
    const scene = createSceneWithAsset();
    const parsed = parseProjectPackage(new Uint8Array([1]), {
      archive: fakeArchive([
        { path: "project.json", bytes: encodeArchiveJson(createManifest()) },
        { path: "scene.json", bytes: encodeArchiveJson(scene) },
        { path: "assets/asset-a.glb", bytes: new Uint8Array([1, 2, 3]) }
      ])
    });

    expect("problems" in parsed).toBe(false);
    expect("scene" in parsed ? parsed.scene.objects["object-a"].asset.id : "").toBe("asset-a");
    expect("payloads" in parsed ? parsed.payloads["asset-a"] : undefined).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("migrates old package scene snapshots before manifest validation", () => {
    const scene = createVersion3SceneWithAsset();
    const parsed = parseProjectPackage(new Uint8Array([1]), {
      archive: fakeArchive([
        { path: "project.json", bytes: encodeArchiveJson(createManifest()) },
        { path: "scene.json", bytes: encodeArchiveJson(scene) },
        { path: "assets/asset-a.glb", bytes: new Uint8Array([1, 2, 3]) }
      ])
    });

    expect("problems" in parsed).toBe(false);
    expect("scene" in parsed ? parsed.scene.version : 0).toBe(6);
    expect("scene" in parsed ? parsed.scene.nodes["object-a"].kind : "").toBe("object");
  });

  it("rejects unsafe archive paths and paths outside the asset directory", () => {
    const scene = createSceneWithAsset();
    const parsed = parseProjectPackage(new Uint8Array([1]), {
      archive: fakeArchive([
        { path: "project.json", bytes: encodeArchiveJson({ ...createManifest(), assets: { "asset-a": { ...createManifest().assets["asset-a"], payloadPath: "../asset.glb" } } }) },
        { path: "scene.json", bytes: encodeArchiveJson(scene) },
        { path: "../asset.glb", bytes: new Uint8Array([1]) }
      ])
    });

    expect("problems" in parsed ? parsed.problems.map((problem) => problem.code) : []).toContain("project-entry-path-invalid");
    expect("problems" in parsed ? parsed.problems.map((problem) => problem.code) : []).toContain("project-asset-payload-path-invalid");
  });

  it("rejects unsupported kinds and keeps reporting payload failures for otherwise valid assets", () => {
    const scene = createSceneWithAsset();
    const manifest = createManifest();
    const invalidKind = parseProjectPackage(new Uint8Array([1]), {
      archive: fakeArchive([
        {
          path: "project.json",
          bytes: encodeArchiveJson({
            ...manifest,
            assets: {
              "asset-a": {
                ...manifest.assets["asset-a"],
                kind: "video",
                metadata: { ok: true }
              }
            }
          })
        },
        { path: "scene.json", bytes: encodeArchiveJson(scene) }
      ])
    });
    const missingPayload = parseProjectPackage(new Uint8Array([1]), {
      archive: fakeArchive([
        { path: "project.json", bytes: encodeArchiveJson(manifest) },
        { path: "scene.json", bytes: encodeArchiveJson(scene) }
      ])
    });

    expect("problems" in invalidKind ? invalidKind.problems.map((problem) => problem.code) : []).toContain("project-asset-kind-invalid");
    expect("problems" in missingPayload ? missingPayload.problems.map((problem) => problem.code) : []).toContain("project-payload-missing");
  });

  it("enforces archive byte and entry-count limits before state replacement", () => {
    const parsed = parseProjectPackage(new Uint8Array([1, 2, 3]), {
      archive: fakeArchive([]),
      limits: { maxArchiveBytes: 2 }
    });

    expect("problems" in parsed ? parsed.problems[0].code : "").toBe("project-archive-too-large");
  });
});

function createSceneWithAsset(): SceneSnapshot {
  return {
    ...createEmptySnapshot("scene-a"),
    assets: {
      "asset-a": { id: "asset-a", kind: "glb" }
    },
    nodes: {
      "object-a": {
        id: "object-a",
        kind: "object",
        name: "Box",
        objectId: "object-a",
        parentId: null,
        children: [],
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      }
    },
    rootNodeIds: ["object-a"],
    objects: {
      "object-a": {
        id: "object-a",
        name: "Box",
        kind: "glb",
        parentId: null,
        children: [],
        asset: { id: "asset-a", kind: "glb" },
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      }
    },
    rootObjectIds: ["object-a"]
  };
}

function createVersion3SceneWithAsset(): V3SceneSnapshot {
  return {
    version: 3,
    scene: { id: "scene-a", name: "Untitled scene" },
    assets: {
      "asset-a": { id: "asset-a", kind: "glb" }
    },
    objects: {
      "object-a": {
        id: "object-a",
        name: "Box",
        kind: "glb",
        parentId: null,
        children: [],
        asset: { id: "asset-a", kind: "glb" },
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      }
    },
    rootObjectIds: ["object-a"],
    selection: { objectId: null, objectIds: [] },
    materials: { definitions: {}, assignments: {} },
    environment: createEmptySnapshot("scene-a").environment,
    lights: {},
    problems: { acknowledged: {} }
  };
}

function createManifest() {
  return {
    version: 1,
    scenePath: "scene.json",
    completeness: "complete",
    assets: {
      "asset-a": {
        id: "asset-a",
        kind: "glb",
        byteSize: 3,
        payloadPath: "assets/asset-a.glb"
      }
    }
  };
}

function fakeArchive(entries: ArchiveEntry[]): ArchiveAdapter {
  return {
    read: () => entries,
    write: () => new Uint8Array()
  };
}
