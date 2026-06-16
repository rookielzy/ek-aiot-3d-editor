import { describe, expect, it } from "vitest";
import { createMissingAssetProblem } from "./problems";
import { attachGlbImportManifestMetadata, createGlbImportDiagnosticsFromError, createGlbImportManifest } from "./import-pipeline";
import {
  buildAssetWorkspaceModel,
  collectAssetReferenceLocations,
  filterAssetWorkspaceItems,
  sortAssetWorkspaceItems,
  type AssetWorkspacePayloadSummary
} from "./workspace";
import { createEditor } from "../editor/create-editor";
import { createProjectProblem } from "../project/package-validation";
import type { Problem } from "../problems/types";
import type { SceneSnapshot } from "../snapshot/types";

describe("asset workspace", () => {
  it("collects deterministic reference locations for objects, texture slots, and environment assets", () => {
    const snapshot = createWorkspaceSnapshot();

    const locations = collectAssetReferenceLocations(snapshot);

    expect(locations.map((location) => [location.assetId, location.kind, location.label])).toEqual([
      ["glb-a", "object-glb", "Object Machine"],
      ["hdr-a", "environment-lighting", "Environment lighting"],
      ["missing-texture", "material-texture", "Panel Material normal map"],
      ["texture-a", "environment-background", "Environment background"],
      ["texture-a", "material-texture", "Panel Material map"]
    ]);
    expect(locations.find((location) => location.kind === "material-texture" && location.assetId === "texture-a")).toMatchObject({
      materialId: "mat-a",
      assignmentId: "object:object-a",
      objectId: "object-a",
      slot: "map"
    });
    expect(JSON.parse(JSON.stringify(locations))).toEqual(locations);
  });

  it("uses the scene node id for object references when it differs from the object id", () => {
    const snapshot = createWorkspaceSnapshot();
    const renamedNode: SceneSnapshot = {
      ...snapshot,
      nodes: {
        ...snapshot.nodes,
        "node-object-a": {
          ...snapshot.nodes["object-a"],
          id: "node-object-a"
        }
      },
      rootNodeIds: snapshot.rootNodeIds.map((nodeId) => nodeId === "object-a" ? "node-object-a" : nodeId)
    };
    delete renamedNode.nodes["object-a"];

    const location = collectAssetReferenceLocations(renamedNode)
      .find((candidate) => candidate.kind === "object-glb" && candidate.assetId === "glb-a");

    expect(location).toMatchObject({
      objectId: "object-a",
      nodeId: "node-object-a"
    });
  });

  it("keeps every material assignment when a texture material is reused", () => {
    const snapshot = createWorkspaceSnapshot();
    const reused: SceneSnapshot = {
      ...snapshot,
      objects: {
        ...snapshot.objects,
        "object-b": {
          ...snapshot.objects["object-a"],
          id: "object-b",
          name: "Second Machine"
        }
      },
      nodes: {
        ...snapshot.nodes,
        "object-b": {
          ...snapshot.nodes["object-a"],
          id: "object-b",
          objectId: "object-b",
          name: "Second Machine"
        }
      },
      rootNodeIds: [...snapshot.rootNodeIds, "object-b"],
      rootObjectIds: [...snapshot.rootObjectIds, "object-b"],
      materials: {
        ...snapshot.materials,
        assignments: {
          ...snapshot.materials.assignments,
          "object:object-b": {
            id: "object:object-b",
            materialId: "mat-a",
            target: { kind: "object", objectId: "object-b" }
          }
        }
      }
    };

    const locations = collectAssetReferenceLocations(reused)
      .filter((location) => location.kind === "material-texture" && location.assetId === "texture-a");

    expect(locations.map((location) => location.kind === "material-texture" ? location.assignmentId : "")).toEqual([
      "object:object-a",
      "object:object-b"
    ]);
  });

  it("keeps material definition texture references even when the material is not assigned", () => {
    const snapshot = createWorkspaceSnapshot();
    const unassigned: SceneSnapshot = {
      ...snapshot,
      materials: {
        ...snapshot.materials,
        assignments: {}
      }
    };

    const location = collectAssetReferenceLocations(unassigned)
      .find((candidate) => candidate.kind === "material-texture" && candidate.assetId === "texture-a");

    expect(location).toMatchObject({
      kind: "material-texture",
      materialId: "mat-a",
      slot: "map"
    });
    expect(location && "assignmentId" in location).toBe(false);
    expect(location && "objectId" in location).toBe(false);
  });

  it("builds rows for registered, unreferenced, payload-backed, and missing referenced assets", () => {
    const snapshot = createWorkspaceSnapshot();
    const payloads: AssetWorkspacePayloadSummary[] = [
      {
        assetId: "glb-a",
        kind: "glb",
        label: "Machine payload",
        available: true,
        exportable: true,
        byteSize: 3,
        mimeType: "model/gltf-binary",
        checksum: "fnv1a32-12345678",
        metadata: { package: true }
      },
      {
        assetId: "texture-a",
        kind: "texture",
        available: true,
        exportable: true,
        byteSize: 2
      }
    ];

    const workspace = buildAssetWorkspaceModel(snapshot, { payloads });

    expect(workspace.items.map((item) => [item.id, item.status, item.payloadStatus, item.packageStatus])).toEqual([
      ["glb-a", "ready", "available", "complete"],
      ["hdr-a", "missing-payload", "missing", "blocked"],
      ["missing-texture", "missing-reference", "missing", "blocked"],
      ["texture-a", "ready", "available", "complete"],
      ["unused-a", "unreferenced", "missing", "blocked"]
    ]);
    expect(workspace.readiness).toMatchObject({
      completeness: "partial",
      ready: false,
      blockingAssetIds: ["hdr-a", "missing-texture", "unused-a"],
      missingPayloadAssetIds: ["hdr-a", "missing-texture", "unused-a"],
      missingReferenceAssetIds: ["missing-texture"]
    });
    expect(workspace.items.find((item) => item.id === "unused-a")).toMatchObject({
      referenced: false,
      registered: true,
      missing: false
    });
  });

  it("blocks package readiness for unavailable, unexportable, and kind-mismatched payloads", () => {
    const workspace = buildAssetWorkspaceModel(createWorkspaceSnapshot(), {
      payloads: [
        { assetId: "glb-a", kind: "texture", available: true, exportable: true },
        { assetId: "texture-a", kind: "texture", available: false, exportable: true },
        { assetId: "hdr-a", kind: "hdr", available: true, exportable: false },
        { assetId: "unused-a", kind: "image", available: true, exportable: false }
      ]
    });

    expect(workspace.items.map((item) => [item.id, item.payloadStatus, item.packageStatus, item.packageBlocking])).toEqual([
      ["glb-a", "kind-mismatch", "blocked", true],
      ["hdr-a", "missing", "blocked", true],
      ["missing-texture", "missing", "blocked", true],
      ["texture-a", "missing", "blocked", true],
      ["unused-a", "missing", "blocked", true]
    ]);
    expect(workspace.readiness.blockingAssetIds).toEqual([
      "glb-a",
      "hdr-a",
      "missing-texture",
      "texture-a",
      "unused-a"
    ]);
    expect(workspace.readiness.missingPayloadAssetIds).toEqual([
      "glb-a",
      "hdr-a",
      "missing-texture",
      "texture-a",
      "unused-a"
    ]);
  });

  it("attaches runtime and project asset problems with replacement affordance metadata", () => {
    const snapshot = createWorkspaceSnapshot();
    const runtimeProblem = createMissingAssetProblem("glb-a", "object-a");
    const textureProblem: Problem = {
      id: "runtime:texture-slot",
      severity: "error",
      code: "texture-unresolved",
      source: "runtime",
      target: { kind: "texture-slot", materialId: "mat-a", slot: "normalMap", assetId: "missing-texture" },
      assetId: "missing-texture",
      recoverability: "user-action",
      message: "Texture missing.",
      display: {
        title: "Texture missing",
        detail: "Choose a replacement texture.",
        actionLabel: "Replace texture"
      }
    };
    const projectProblem = createProjectProblem("project-export-payload-missing", "Project export is missing payload for asset hdr-a.", {
      assetId: "hdr-a"
    });

    const workspace = buildAssetWorkspaceModel(snapshot, {
      problems: [runtimeProblem, textureProblem, projectProblem]
    });

    expect(workspace.items.find((item) => item.id === "glb-a")).toMatchObject({
      problemCount: 1,
      highestProblemSeverity: "warning",
      recoverable: true,
      actionLabel: "Replace asset"
    });
    expect(workspace.items.find((item) => item.id === "missing-texture")).toMatchObject({
      problemIds: ["runtime:texture-slot"],
      highestProblemSeverity: "error",
      actionLabel: "Replace texture"
    });
    expect(workspace.items.find((item) => item.id === "hdr-a")?.problems[0]).toMatchObject({
      project: true,
      assetId: "hdr-a",
      title: "Project Export Payload Missing"
    });
  });

  it("attaches normalized asset problem summaries from target asset ids", () => {
    const workspace = buildAssetWorkspaceModel(createWorkspaceSnapshot(), {
      problems: [{
        id: "normalized:glb-a",
        severity: "error",
        code: "payload-missing",
        source: "validation",
        title: "Payload missing",
        recoverability: "user-action",
        actionLabel: "Replace asset",
        target: { kind: "asset", assetId: "glb-a" },
        project: true
      }]
    });

    expect(workspace.items.find((item) => item.id === "glb-a")).toMatchObject({
      problemIds: ["normalized:glb-a"],
      problemCount: 1,
      actionLabel: "Replace asset"
    });
  });

  it("projects GLB import manifest status and diagnostics onto asset rows", () => {
    const editor = createEditor();
    const manifest = createGlbImportManifest({
      diagnostics: createGlbImportDiagnosticsFromError(new Error("THREE.GLTFLoader: No DRACOLoader instance provided."))
    });
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: {
        id: "glb-a",
        label: "Compressed GLB",
        metadata: attachGlbImportManifestMetadata(undefined, manifest)
      }
    });

    const workspace = buildAssetWorkspaceModel(editor.getSnapshot());
    const item = workspace.items.find((candidate) => candidate.id === "glb-a");

    expect(item).toMatchObject({
      importStatus: "failed",
      problemCount: 1,
      highestProblemSeverity: "error",
      actionLabel: "Configure decoder"
    });
    expect(item?.importManifest).toEqual(manifest);
    expect(item?.importDiagnostics[0]).toMatchObject({
      code: "glb-decoder-missing",
      assetId: "glb-a",
      target: { kind: "asset", assetId: "glb-a" }
    });
    expect(JSON.stringify(workspace)).not.toContain("Object3D");
    expect(JSON.stringify(workspace)).not.toContain("blob:");
  });

  it("does not duplicate GLB manifest diagnostics already reported by runtime", () => {
    const editor = createEditor();
    const diagnostic = createGlbImportDiagnosticsFromError(new Error("THREE.GLTFLoader: No DRACOLoader instance provided."))[0]!;
    const manifest = createGlbImportManifest({ diagnostics: [diagnostic] });
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: {
        id: "glb-a",
        metadata: attachGlbImportManifestMetadata(undefined, manifest)
      }
    });

    const workspace = buildAssetWorkspaceModel(editor.getSnapshot(), {
      problems: [{
        id: "glb-import:glb-a:object-a:glb-decoder-missing:KHR_draco_mesh_compression",
        severity: diagnostic.severity,
        code: diagnostic.code,
        source: "runtime",
        target: { kind: "object", objectId: "object-a" },
        title: diagnostic.display.title,
        detail: diagnostic.display.detail ?? diagnostic.message,
        recoverability: diagnostic.recoverability,
        actionLabel: diagnostic.display.actionLabel,
        assetId: "glb-a",
        objectId: "object-a",
        project: false
      }]
    });
    const item = workspace.items.find((candidate) => candidate.id === "glb-a");

    expect(item?.importDiagnostics).toEqual([]);
    expect(item?.problemIds).toEqual(["glb-import:glb-a:object-a:glb-decoder-missing:KHR_draco_mesh_compression"]);
    expect(item?.problemCount).toBe(1);
  });

  it("filters and sorts rows using core-owned semantics", () => {
    const workspace = buildAssetWorkspaceModel(createWorkspaceSnapshot());

    expect(filterAssetWorkspaceItems(workspace.items, { query: "panel material", kinds: ["texture"] }).map((item) => item.id)).toEqual([
      "missing-texture",
      "texture-a"
    ]);
    expect(filterAssetWorkspaceItems(workspace.items, { payloadStatuses: ["missing"], referenced: true }).map((item) => item.id)).toEqual([
      "glb-a",
      "hdr-a",
      "missing-texture",
      "texture-a"
    ]);
    expect(sortAssetWorkspaceItems(workspace.items, { key: "referenced" }).map((item) => item.id)).toEqual([
      "texture-a",
      "glb-a",
      "missing-texture",
      "hdr-a",
      "unused-a"
    ]);
  });

  it("keeps workspace output serialization-safe", () => {
    const workspace = buildAssetWorkspaceModel(createWorkspaceSnapshot(), {
      payloads: [{
        assetId: "glb-a",
        kind: "glb",
        available: true,
        exportable: true,
        byteSize: 4,
        mimeType: "model/gltf-binary"
      }]
    });

    const serialized = JSON.stringify(workspace);

    expect(serialized).not.toContain("blob:");
    expect(serialized).not.toContain("\"bytes\"");
    expect(serialized).not.toContain("\"uri\"");
    expect(serialized).not.toContain("Blob");
    expect(serialized).not.toContain("File");
  });
});

function createWorkspaceSnapshot(): SceneSnapshot {
  const editor = createEditor();
  editor.dispatch({
    type: "import-glb",
    objectId: "object-a",
    name: "Machine",
    asset: { id: "glb-a", kind: "glb", label: "Machine GLB", metadata: { durable: true } }
  });
  editor.dispatch({
    type: "register-asset",
    asset: { id: "texture-a", kind: "texture", label: "Albedo Texture" }
  });
  editor.dispatch({
    type: "register-asset",
    asset: { id: "hdr-a", kind: "hdr", label: "Studio HDR" }
  });
  editor.dispatch({
    type: "register-asset",
    asset: { id: "unused-a", kind: "image", label: "Unused Reference" }
  });
  editor.dispatch({
    type: "set-material",
    target: { kind: "object", objectId: "object-a" },
    materialId: "mat-a",
    materialName: "Panel Material",
    material: {
      textures: {
        map: { assetId: "texture-a", colorSpace: "srgb" }
      }
    }
  });
  editor.dispatch({
    type: "set-environment",
    environment: {
      lighting: { source: { kind: "hdr", assetId: "hdr-a" } },
      background: { source: { kind: "flat-image", assetId: "texture-a" } }
    }
  });
  const snapshot = editor.getSnapshot();
  const material = snapshot.materials.definitions["mat-a"];
  return {
    ...snapshot,
    materials: {
      ...snapshot.materials,
      definitions: {
        ...snapshot.materials.definitions,
        "mat-a": {
          ...material,
          override: {
            ...material.override,
            textures: {
              ...material.override.textures,
              normalMap: { assetId: "missing-texture" }
            }
          }
        }
      }
    }
  };
}
