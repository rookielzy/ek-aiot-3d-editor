import { describe, expect, it } from "vitest";
import {
  attachGlbImportManifestMetadata,
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createDefaultDataQueryUpdatePolicy,
  createEditor,
  createGlbImportManifest,
  planGlbImportRemap,
  type SceneImportedGlbNode,
  type SceneSnapshot
} from "../index";

describe("node operations keep data bindings on stable object identities", () => {
  it("keeps the binding when the object moves under a group and back", () => {
    const editor = createEditor();
    const queryId = createQuery(editor);
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "create-group", nodeId: "group-a" });
    saveBinding(editor, queryId, "object-a");
    const binding = editor.getSnapshot().dataSources.bindings["object-a"];

    expect(editor.dispatch({ type: "reparent-node", nodeId: "object-a", parentId: "group-a" }).ok).toBe(true);
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toEqual(binding);

    expect(editor.dispatch({ type: "reparent-node", nodeId: "object-a", parentId: null }).ok).toBe(true);
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toEqual(binding);
    editor.dispose();
  });

  it("keeps the binding when objects are grouped and ungrouped", () => {
    const editor = createEditor();
    const queryId = createQuery(editor);
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
    saveBinding(editor, queryId, "object-a");

    const grouped = editor.dispatch({
      type: "group-nodes",
      nodeIds: ["object-a", "object-b"],
      nodeId: "group-a"
    });
    expect(grouped.ok).toBe(true);
    expect(grouped.snapshot.dataSources.bindings["object-a"]).toBeTruthy();
    expect(grouped.snapshot.nodes["object-a"]).toMatchObject({ parentId: "group-a" });

    expect(editor.dispatch({ type: "ungroup-nodes", nodeId: "group-a" }).ok).toBe(true);
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toBeTruthy();
    editor.dispose();
  });

  it("keeps the binding through a GLB reimport that preserves the owner object node", () => {
    const manifest = createGlbImportManifest({
      gltf: {
        parser: {
          json: {
            nodes: [{ name: "Panel", mesh: 0 }],
            meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
            materials: [{ name: "Red" }]
          }
        }
      }
    });
    const editor = createEditor();
    const queryId = createQuery(editor);
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: {
        id: "asset-a",
        metadata: attachGlbImportManifestMetadata(undefined, manifest)
      },
      expandImportedTargets: true
    });
    saveBinding(editor, queryId, "object-a");
    const binding = editor.getSnapshot().dataSources.bindings["object-a"];
    const remap = planGlbImportRemap({
      ownerObjectId: "object-a",
      currentTargets: Object.values(editor.getSnapshot().nodes).filter((node): node is SceneImportedGlbNode =>
        node.kind === "imported" && node.ownerObjectId === "object-a"
      ),
      replacementManifest: manifest
    });

    const result = editor.dispatch({
      type: "reimport-glb",
      ownerObjectId: "object-a",
      assetId: "asset-a",
      manifest,
      remap
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.nodes["object-a"]).toMatchObject({ kind: "object", objectId: "object-a" });
    expect(result.snapshot.dataSources.bindings["object-a"]).toEqual(binding);
    editor.dispose();
  });

  it("keeps the binding through a rename-only GLB reimport", () => {
    const manifest = createPanelManifest("Panel");
    const editor = createEditor();
    const queryId = createQuery(editor);
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: {
        id: "asset-a",
        metadata: attachGlbImportManifestMetadata(undefined, manifest)
      },
      expandImportedTargets: true
    });
    saveBinding(editor, queryId, "object-a");
    const binding = editor.getSnapshot().dataSources.bindings["object-a"];
    const importedNodes = findImportedNodes(editor.getSnapshot());
    const importedNode = importedNodes.find((node) => node.importKey.includes("/node:nodes/"))!;
    const renamed = createPanelManifest("Panel renamed");
    const remap = planGlbImportRemap({
      ownerObjectId: "object-a",
      currentTargets: importedNodes,
      replacementManifest: renamed
    });

    const result = editor.dispatch({
      type: "reimport-glb",
      ownerObjectId: "object-a",
      assetId: "asset-a",
      manifest: renamed,
      remap
    });

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.snapshot.nodes[importedNode.id]).toMatchObject({
      id: importedNode.id,
      name: "Panel renamed"
    });
    expect(result.snapshot.dataSources.bindings["object-a"]).toEqual(binding);
    editor.dispose();
  });

  it("keeps the binding when a GLB reimport leaves imported targets unresolved", () => {
    const manifest = createPanelManifest("Panel");
    const editor = createEditor();
    const queryId = createQuery(editor);
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: {
        id: "asset-a",
        metadata: attachGlbImportManifestMetadata(undefined, manifest)
      },
      expandImportedTargets: true
    });
    saveBinding(editor, queryId, "object-a");
    const binding = editor.getSnapshot().dataSources.bindings["object-a"];
    const importedNodes = findImportedNodes(editor.getSnapshot());
    const importedNode = importedNodes.find((node) => node.importKey.includes("meshes"))!;
    const replacement = createGlbImportManifest({
      gltf: { parser: { json: { nodes: [{ name: "Preview camera", camera: 0 }], cameras: [{ name: "Camera" }] } } }
    });
    const remap = planGlbImportRemap({
      ownerObjectId: "object-a",
      currentTargets: importedNodes,
      replacementManifest: replacement
    });

    const result = editor.dispatch({
      type: "reimport-glb",
      ownerObjectId: "object-a",
      assetId: "asset-a",
      manifest: replacement,
      remap
    });

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.snapshot.nodes[importedNode.id]).toMatchObject({
      id: importedNode.id,
      remap: { status: "unresolved" }
    });
    expect(result.snapshot.dataSources.bindings["object-a"]).toEqual(binding);
    editor.dispose();
  });

  it("removes nested object bindings with the deleted parent subtree and restores them with one undo", () => {
    const editor = createEditor();
    const queryId = createQuery(editor);
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", parentId: "object-a", asset: { id: "asset-b" } });
    saveBinding(editor, queryId, "object-a");
    saveBinding(editor, queryId, "object-b");
    const undoBeforeDelete = editor.getHistoryState().undoCount;

    expect(editor.dispatch({ type: "delete-nodes", nodeIds: ["object-a"] }).ok).toBe(true);
    expect(editor.getSnapshot().dataSources.bindings).toEqual({});
    expect(editor.getHistoryState().undoCount).toBe(undoBeforeDelete + 1);

    editor.undo();
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toBeTruthy();
    expect(editor.getSnapshot().dataSources.bindings["object-b"]).toBeTruthy();
    editor.dispose();
  });
});

function createQuery(editor: ReturnType<typeof createEditor>): string {
  const connection = editor.dispatch({
    type: "create-data-connection",
    connection: {
      id: "connection-a",
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      auth: { kind: "none" },
      headers: {},
      timeoutMs: 10_000
    }
  });
  if (!connection.ok) throw new Error(connection.error);
  const query = buildSaveDataQueryCommand(editor.getSnapshot(), {
    id: "query-a",
    connectionId: "connection-a",
    name: "Pump status",
    path: "/pumps",
    parameters: [],
    mapping: {
      mode: "array",
      root: [],
      identity: { kind: "path", path: [{ kind: "key", key: "deviceCode" }], valueType: "string" },
      displayName: null,
      properties: [{
        key: "temperature",
        label: "Temperature",
        type: "number",
        nullable: false,
        unit: "°C",
        source: [{ kind: "key", key: "temp" }],
        transform: { kind: "raw" },
        range: null,
        allowed: null
      }],
      observedAt: null,
      sourceQuality: null
    },
    updatePolicy: createDefaultDataQueryUpdatePolicy()
  });
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  const dispatched = editor.dispatch(query.command);
  if (!dispatched.ok) throw new Error(dispatched.error);
  return "query-a";
}

function saveBinding(editor: ReturnType<typeof createEditor>, queryId: string, objectNodeId: string): void {
  const result = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId,
    queryId,
    parameterOverrides: {},
    deviceId: `device-${objectNodeId}`,
    enabled: true,
    details: [{ key: "temperature", label: null, precision: null }]
  });
  if (!result.ok) throw new Error(result.problems.map((problem) => problem.message).join("\n"));
  const dispatched = editor.dispatch(result.command);
  if (!dispatched.ok) throw new Error(dispatched.error);
}

function createPanelManifest(name: string) {
  return createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name, mesh: 0 }],
          meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
          materials: [{ name: "Red" }]
        }
      }
    }
  });
}

function findImportedNodes(snapshot: Pick<SceneSnapshot, "nodes">): SceneImportedGlbNode[] {
  const nodes = Object.values(snapshot.nodes).filter(
    (candidate): candidate is SceneImportedGlbNode => candidate.kind === "imported"
  );
  if (nodes.length === 0) throw new Error("Expected imported GLB nodes.");
  return nodes;
}
