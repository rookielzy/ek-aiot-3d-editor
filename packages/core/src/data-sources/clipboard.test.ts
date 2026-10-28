import { describe, expect, it } from "vitest";
import {
  buildDataSourcesWorkspaceModel,
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createClipboardPayload,
  createDefaultDataQueryUpdatePolicy,
  createEditor,
  createNodeClipboardPayload,
  type DataQueryDefinition,
  type EditorClipboardPayload
} from "../index";

describe("data source clipboard", () => {
  it("duplicates an object binding while keeping the original query and device", () => {
    const editor = createSourceEditor();

    const result = editor.dispatch({
      type: "duplicate-objects",
      objectIds: ["object-a"],
      objectIdMap: { "object-a": "object-copy-a" }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.dataSources.bindings["object-copy-a"]).toEqual({
      objectNodeId: "object-copy-a",
      queryId: "query-a",
      parameterOverrides: { areaId: "B" },
      deviceId: "pump-01",
      enabled: true,
      details: [{ key: "temperature", label: "Temperature", precision: 1 }],
      color: { propertyKey: "temperature", rules: [{ operator: "gte", value: 40, max: null, color: "#ef4444" }] }
    });
    expect(result.snapshot.dataSources.bindings["object-a"]).toBeTruthy();
    expect(Object.keys(result.snapshot.dataSources.queries)).toEqual(["query-a"]);
    expect(Object.keys(result.snapshot.dataSources.connections)).toEqual(["connection-a"]);

    editor.undo();
    expect(editor.getSnapshot().dataSources.bindings["object-copy-a"]).toBeUndefined();
    editor.redo();
    expect(editor.getSnapshot().dataSources.bindings["object-copy-a"]).toBeTruthy();
    editor.dispose();
  });

  it("copies bindings for every object in a duplicated subtree", () => {
    const editor = createSourceEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-b", parentId: "object-a", asset: { id: "asset-b" } });
    saveBinding(editor, "object-b");

    const result = editor.dispatch({
      type: "duplicate-objects",
      objectIds: ["object-a"],
      objectIdMap: { "object-a": "object-copy-a", "object-b": "object-copy-b" }
    });

    expect(result.ok).toBe(true);
    expect(Object.keys(result.snapshot.dataSources.bindings).sort()).toEqual([
      "object-a",
      "object-b",
      "object-copy-a",
      "object-copy-b"
    ]);
    expect(result.snapshot.dataSources.bindings["object-copy-b"]).toMatchObject({
      queryId: "query-a",
      deviceId: "pump-01"
    });
    editor.dispose();
  });

  it("copies bindings for nested objects in node clipboard payloads", () => {
    const editor = createSourceEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Assembly" });
    editor.dispatch({ type: "reparent-node", nodeId: "object-a", parentId: "group-a" });

    const payload = createNodeClipboardPayload(editor.getSnapshot(), ["group-a"]);
    const result = editor.dispatch({
      type: "paste-objects",
      payload,
      objectIdMap: { "object-a": "object-copy-a" }
    });

    expect(payload.version).toBe(3);
    expect(payload.dataSources?.bindings["object-a"]).toBeTruthy();
    expect(result.ok).toBe(true);
    expect(result.snapshot.dataSources.bindings["object-copy-a"]).toMatchObject({
      queryId: "query-a",
      deviceId: "pump-01",
      details: [{ key: "temperature" }]
    });
    editor.dispose();
  });

  it("reuses identical source definitions when pasting into another editor", () => {
    const source = createSourceEditor();
    const target = createSourceEditorWithAssets();
    const payload = createClipboardPayload(source.getSnapshot(), ["object-a"]);

    const result = target.dispatch({
      type: "paste-objects",
      payload,
      objectIdMap: { "object-a": "object-copy-a" }
    });

    expect(payload.version).toBe(2);
    expect(result.ok).toBe(true);
    expect(result.snapshot.dataSources.connections).toEqual(target.getSnapshot().dataSources.connections);
    expect(result.snapshot.dataSources.queries).toEqual(target.getSnapshot().dataSources.queries);
    expect(target.getSnapshot().dataSources.connections["connection-a"]).toBeTruthy();
    expect(target.getSnapshot().dataSources.queries["query-a"]).toBeTruthy();
    expect(result.snapshot.dataSources.bindings["object-copy-a"]).toMatchObject({
      queryId: "query-a",
      deviceId: "pump-01"
    });
    expect(target.getHistoryState()).toEqual({ undoCount: 4, redoCount: 0 });
    source.dispose();
    target.dispose();
  });

  it("clones conflicting connections with new ids and unique names and rewrites query references", () => {
    const source = createSourceEditor();
    const target = createSourceEditorWithAssets();
    target.dispatch({
      type: "update-data-connection",
      connectionId: "connection-a",
      connection: {
        name: "Plant API",
        baseUrl: "https://other.example.test/v1",
        auth: { kind: "none" },
        headers: {},
        timeoutMs: 10_000
      }
    });
    const payload = createClipboardPayload(source.getSnapshot(), ["object-a"]);

    const result = target.dispatch({
      type: "paste-objects",
      payload,
      objectIdMap: { "object-a": "object-copy-a" }
    });

    expect(result.ok).toBe(true);
    expect(target.getSnapshot().dataSources.connections["connection-a"].baseUrl).toBe("https://other.example.test/v1");
    const copiedConnection = Object.values(result.snapshot.dataSources.connections)
      .find((connection) => connection.id !== "connection-a");
    expect(copiedConnection).toMatchObject({
      name: "Plant API 2",
      baseUrl: "https://api.example.test/v1"
    });
    const copiedQuery = Object.values(result.snapshot.dataSources.queries)
      .find((query) => query.id !== "query-a");
    expect(copiedQuery).toMatchObject({ connectionId: copiedConnection?.id, path: "/pumps" });
    expect(result.snapshot.dataSources.queries["query-a"].connectionId).toBe("connection-a");
    expect(result.snapshot.dataSources.bindings["object-copy-a"].queryId).toBe(copiedQuery?.id);
    expect(result.snapshot.dataSources.bindings["object-copy-a"].deviceId).toBe("pump-01");
    source.dispose();
    target.dispose();
  });

  it("clones conflicting queries with new ids and unique names without overwriting target config", () => {
    const source = createSourceEditor();
    const target = createSourceEditorWithAssets();
    const conflict = buildSaveDataQueryCommand(
      target.getSnapshot(),
      queryDefinition("connection-a", { name: "Pump status", path: "/target-pumps" }),
      { queryId: "query-a" }
    );
    if (!conflict.ok) throw new Error(conflict.problems.map((problem) => problem.message).join("\n"));
    expect(target.dispatch(conflict.command).ok).toBe(true);
    const payload = createClipboardPayload(source.getSnapshot(), ["object-a"]);

    const result = target.dispatch({
      type: "paste-objects",
      payload,
      objectIdMap: { "object-a": "object-copy-a" }
    });

    expect(result.ok).toBe(true);
    expect(target.getSnapshot().dataSources.queries["query-a"].path).toBe("/target-pumps");
    const copiedQuery = Object.values(result.snapshot.dataSources.queries)
      .find((query) => query.id !== "query-a");
    expect(copiedQuery).toMatchObject({ name: "Pump status 2", connectionId: "connection-a", path: "/pumps" });
    expect(result.snapshot.dataSources.bindings["object-copy-a"].queryId).toBe(copiedQuery?.id);
    source.dispose();
    target.dispose();
  });

  it("deduplicates connection names when the source id is free", () => {
    const source = createSourceEditor();
    const target = createEditor();
    target.dispatch({ type: "register-asset", asset: { id: "asset-a" } });
    target.dispatch({
      type: "create-data-connection",
      connection: {
        id: "connection-other",
        name: "Plant API",
        baseUrl: "https://other.example.test",
        auth: { kind: "none" },
        headers: {},
        timeoutMs: 10_000
      }
    });
    const payload = createClipboardPayload(source.getSnapshot(), ["object-a"]);

    const result = target.dispatch({
      type: "paste-objects",
      payload,
      objectIdMap: { "object-a": "object-copy-a" }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.dataSources.connections["connection-a"]).toMatchObject({
      name: "Plant API 2",
      baseUrl: "https://api.example.test/v1"
    });
    expect(result.snapshot.dataSources.bindings["object-copy-a"].queryId).toBe("query-a");
    source.dispose();
    target.dispose();
  });

  it.each(["object", "node"] as const)("keeps legacy %s payloads readable without copying bindings", (kind) => {
    const source = createSourceEditor();
    const payload: EditorClipboardPayload = kind === "object"
      ? { ...createClipboardPayload(source.getSnapshot(), ["object-a"]), version: 1, dataSources: undefined }
      : { ...createNodeClipboardPayload(source.getSnapshot(), ["object-a"]), version: 2, dataSources: undefined };
    const target = createEditor();
    target.dispatch({ type: "register-asset", asset: { id: "asset-a" } });

    const result = target.dispatch({
      type: "paste-objects",
      payload,
      objectIdMap: { "object-a": "object-copy-a" }
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.objects["object-copy-a"]).toBeTruthy();
    expect(result.snapshot.dataSources.bindings).toEqual({});
    source.dispose();
    target.dispose();
  });

  it("keeps pasted configuration editable when the target host lacks its credential", () => {
    const source = createSourceEditor();
    const target = createEditor();
    target.dispatch({ type: "register-asset", asset: { id: "asset-a" } });
    const payload = createClipboardPayload(source.getSnapshot(), ["object-a"]);

    const result = target.dispatch({
      type: "paste-objects",
      payload,
      objectIdMap: { "object-a": "object-copy-a" }
    });

    expect(result.ok).toBe(true);
    expect(target.getSnapshot().dataSources.connections["connection-a"].auth).toEqual({
      kind: "bearer",
      credentialRef: "credential-host"
    });
    const workspace = buildDataSourcesWorkspaceModel(target.getSnapshot(), {
      credentials: target.getDataCredentials()
    });
    expect(workspace.connections).toContainEqual(expect.objectContaining({
      id: "connection-a",
      missingCredential: true,
      referenced: true
    }));
    expect(target.getDataService().getObjectDataState().preview.enabled).toBe(false);
    source.dispose();
    target.dispose();
  });

  it("deduplicates query names within a reused connection", () => {
    const source = createSourceEditor();
    const target = createSourceEditorWithAssets();
    expect(target.dispatch({ type: "delete-data-query", queryId: "query-a" }).ok).toBe(true);
    const extra = buildSaveDataQueryCommand(target.getSnapshot(), {
      ...queryDefinition("connection-a", { name: "Pump status", path: "/other" })
    });
    if (!extra.ok) throw new Error("Expected a query command.");
    expect(target.dispatch(extra.command).ok).toBe(true);
    const payload = createClipboardPayload(source.getSnapshot(), ["object-a"]);

    const result = target.dispatch({
      type: "paste-objects",
      payload,
      objectIdMap: { "object-a": "object-copy-a" }
    });

    expect(result.ok).toBe(true);
    const queryNames = Object.values(result.snapshot.dataSources.queries)
      .filter((query) => query.connectionId === "connection-a")
      .map((query) => query.name)
      .sort();
    expect(queryNames).toEqual(["Pump status", "Pump status 2"]);
    expect(result.snapshot.dataSources.queries["query-a"]).toMatchObject({
      name: "Pump status 2",
      path: "/pumps"
    });
    expect(result.snapshot.dataSources.bindings["object-copy-a"].queryId).toBe("query-a");
    source.dispose();
    target.dispose();
  });

  it("remaps bindings by object node identity when node ids differ from object ids", () => {
    const editor = createSourceEditor();
    const renamed = renameObjectNode(editor, "object-a", "node-a");
    editor.dispose();

    const duplicated = renamed.dispatch({
      type: "duplicate-objects",
      objectIds: ["object-a"],
      objectIdMap: { "object-a": "object-copy-a" }
    });
    expect(duplicated.ok).toBe(true);
    expect(duplicated.snapshot.dataSources.bindings["object-copy-a"]).toMatchObject({
      deviceId: "pump-01",
      queryId: "query-a"
    });

    const payload = createNodeClipboardPayload(renamed.getSnapshot(), ["node-a"]);
    const pasted = renamed.dispatch({
      type: "paste-objects",
      payload,
      objectIdMap: { "object-a": "object-copy-b" }
    });
    expect(pasted.ok).toBe(true);
    const pastedObjectNode = Object.values(pasted.snapshot.nodes).find((node) =>
      node.kind === "object" && node.objectId === "object-copy-b"
    );
    expect(pastedObjectNode).toBeTruthy();
    expect(pasted.snapshot.dataSources.bindings[pastedObjectNode!.id]).toMatchObject({
      objectNodeId: pastedObjectNode!.id,
      deviceId: "pump-01"
    });
    renamed.dispose();
  });

  it("attaches pasted bindings to the actual object node id when node ids collide", () => {
    const source = createSourceEditor();
    const payload = createNodeClipboardPayload(source.getSnapshot(), ["object-a"]);
    const target = createEditor();
    target.dispatch({ type: "register-asset", asset: { id: "asset-a" } });
    target.dispatch({ type: "create-group", nodeId: "object-copy-a" });

    const result = target.dispatch({
      type: "paste-objects",
      payload,
      objectIdMap: { "object-a": "object-copy-a" }
    });

    expect(result.ok).toBe(true);
    const objectNode = Object.values(result.snapshot.nodes).find((node) =>
      node.kind === "object" && node.objectId === "object-copy-a"
    );
    expect(objectNode).toBeTruthy();
    expect(objectNode?.id).not.toBe("object-copy-a");
    expect(result.snapshot.dataSources.bindings[objectNode!.id]).toMatchObject({
      objectNodeId: objectNode!.id,
      deviceId: "pump-01"
    });
    source.dispose();
    target.dispose();
  });

  it("carries only durable configuration and credential references", () => {
    const source = createSourceEditor();
    source.dispatch({
      type: "update-data-connection",
      connectionId: "connection-a",
      connection: {
        name: "Plant API",
        baseUrl: "https://api.example.test/v1",
        auth: { kind: "bearer", credentialRef: "credential-host" },
        headers: { "X-Tenant": "plant-1" },
        timeoutMs: 10_000
      }
    });
    const payload = createClipboardPayload(source.getSnapshot(), ["object-a"]);
    const serialized = JSON.stringify(payload.dataSources);

    expect(payload.dataSources?.connections["connection-a"].auth).toEqual({
      kind: "bearer",
      credentialRef: "credential-host"
    });
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("samples");
    expect(serialized).not.toContain("executor");
    expect(serialized).not.toContain("lastResult");
    source.dispose();
  });
});

function createSourceEditor() {
  const editor = createEditor();
  editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Pump A", asset: { id: "asset-a" } });
  editor.dispatch({
    type: "create-data-connection",
    connection: {
      id: "connection-a",
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      auth: { kind: "bearer", credentialRef: "credential-host" },
      headers: {},
      timeoutMs: 10_000
    }
  });
  saveQuery(editor, queryDefinition("connection-a"));
  saveBinding(editor);
  return editor;
}

function createSourceEditorWithAssets() {
  const editor = createEditor();
  editor.dispatch({ type: "register-asset", asset: { id: "asset-a" } });
  editor.dispatch({
    type: "create-data-connection",
    connection: {
      id: "connection-a",
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      auth: { kind: "bearer", credentialRef: "credential-host" },
      headers: {},
      timeoutMs: 10_000
    }
  });
  saveQuery(editor, queryDefinition("connection-a"));
  return editor;
}

function saveQuery(editor: ReturnType<typeof createEditor>, definition: DataQueryDefinition): void {
  const result = buildSaveDataQueryCommand(editor.getSnapshot(), { ...definition, id: "query-a" });
  if (!result.ok) throw new Error(result.problems.map((problem) => problem.message).join("\n"));
  const dispatched = editor.dispatch(result.command);
  if (!dispatched.ok) throw new Error(dispatched.error);
}

function saveBinding(editor: ReturnType<typeof createEditor>, objectNodeId = "object-a"): void {
  const result = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId,
    queryId: "query-a",
    parameterOverrides: { areaId: "B" },
    deviceId: "pump-01",
    enabled: true,
    details: [{ key: "temperature", label: "Temperature", precision: 1 }],
    color: {
      propertyKey: "temperature",
      rules: [{ operator: "gte", value: 40, max: null, color: "#ef4444" }]
    }
  });
  if (!result.ok) throw new Error(result.problems.map((problem) => problem.message).join("\n"));
  const dispatched = editor.dispatch(result.command);
  if (!dispatched.ok) throw new Error(dispatched.error);
}

function renameObjectNode(
  editor: ReturnType<typeof createEditor>,
  objectId: string,
  nodeId: string
): ReturnType<typeof createEditor> {
  const snapshot = editor.serialize();
  const node = snapshot.nodes[objectId];
  if (!node || node.kind !== "object") {
    throw new Error(`Object node ${objectId} does not exist.`);
  }
  const nodes = Object.fromEntries(
    Object.entries(snapshot.nodes)
      .filter(([id]) => id !== objectId)
      .map(([id, entry]) => [
        id === objectId ? nodeId : id,
        {
          ...entry,
          ...(entry.parentId === objectId ? { parentId: nodeId } : {}),
          children: entry.children.map((childId) => childId === objectId ? nodeId : childId)
        }
      ])
  );
  nodes[nodeId] = { ...node, id: nodeId };
  const bindings = Object.fromEntries(Object.entries(snapshot.dataSources.bindings).map(([key, binding]) =>
    key === objectId ? [nodeId, { ...binding, objectNodeId: nodeId }] : [key, binding]
  ));
  return createEditor({
    snapshot: {
      ...snapshot,
      nodes,
      rootNodeIds: snapshot.rootNodeIds.map((id) => id === objectId ? nodeId : id),
      selection: {
        ...snapshot.selection,
        nodeId: snapshot.selection.nodeId === objectId ? nodeId : snapshot.selection.nodeId,
        nodeIds: snapshot.selection.nodeIds.map((id) => id === objectId ? nodeId : id)
      },
      dataSources: {
        ...snapshot.dataSources,
        bindings
      }
    }
  });
}

function queryDefinition(
  connectionId: string,
  patch: { name?: string; path?: string } = {}
): DataQueryDefinition {  return {
    connectionId,
    name: patch.name ?? "Pump status",
    path: patch.path ?? "/pumps",
    parameters: [{ name: "areaId", type: "string", defaultValue: "A" }],
    mapping: {
      mode: "array",
      root: [{ kind: "key", key: "items" }],
      identity: { kind: "path", path: [{ kind: "key", key: "deviceCode" }], valueType: "string" },
      displayName: [{ kind: "key", key: "name" }],
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
  };
}
