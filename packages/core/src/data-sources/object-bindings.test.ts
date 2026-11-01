import { describe, expect, it } from "vitest";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createDefaultDataQueryUpdatePolicy,
  createEditor,
  resolveDataObjectBindingParameters,
  validateSceneSnapshot,
  type DataObjectBindingInput,
  type DataQueryDefinition
} from "../index";

describe("durable object bindings", () => {
  it("saves one query context with device details as a single undoable transaction", () => {
    const editor = createEditor();
    const { queryId } = createQuery(editor);
    importObject(editor, "object-a");
    const before = editor.getSnapshot();

    const result = buildSaveDataObjectBindingCommand(editor.getSnapshot(), bindingInput(queryId));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a binding command.");
    const dispatched = editor.dispatch(result.command);

    expect(dispatched.ok).toBe(true);
    expect(editor.getHistoryState()).toEqual({ undoCount: 4, redoCount: 0 });
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toEqual({
      objectNodeId: "object-a",
      queryId,
      parameterOverrides: { areaId: "B" },
      deviceId: "pump-01",
      enabled: true,
      details: [
        { key: "running", label: "Running state", precision: null },
        { key: "temperature", label: null, precision: 1 }
      ],
      color: null
    });
    expect(editor.getSnapshot().dataSources.queries[queryId].parameters).toEqual([
      { name: "areaId", type: "string", defaultValue: "A", location: "query" }
    ]);

    const restored = createEditor({ snapshot: editor.serialize() });
    expect(restored.getSnapshot().dataSources.bindings).toEqual(editor.getSnapshot().dataSources.bindings);
    expect(restored.serialize()).toEqual(editor.serialize());
    restored.dispose();

    editor.undo();
    expect(editor.getSnapshot().dataSources.bindings).toEqual({});
    expect(editor.getSnapshot().dataSources.queries).toEqual(before.dataSources.queries);
    editor.redo();
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toBeTruthy();
    editor.dispose();
  });

  it("keeps defaults, binding overrides, and test overrides isolated", () => {
    const editor = createEditor();
    const { queryId, connectionId } = createQuery(editor, {
      parameters: [
        { name: "areaId", type: "string", defaultValue: "A" },
        { name: "deviceId", type: "string" }
      ]
    });
    importObject(editor, "object-a");
    const result = buildSaveDataObjectBindingCommand(editor.getSnapshot(), bindingInput(queryId, {
      parameterOverrides: { areaId: "B", deviceId: "pump-01" }
    }));
    if (!result.ok) throw new Error("Expected a binding command.");
    editor.dispatch(result.command);

    const binding = editor.getSnapshot().dataSources.bindings["object-a"];
    expect(resolveDataObjectBindingParameters(editor.getSnapshot(), binding)).toMatchObject({
      ok: true,
      values: { areaId: "B", deviceId: "pump-01" }
    });
    expect(editor.getSnapshot().dataSources.queries[queryId].parameters).toEqual([
      { name: "areaId", type: "string", defaultValue: "A", location: "query" },
      { name: "deviceId", type: "string", location: "query" }
    ]);
    expect(connectionId).toBe("connection-a");
    editor.dispose();
  });

  it("accepts a manually entered device that is absent from current results", () => {
    const editor = createEditor();
    const { queryId } = createQuery(editor);
    importObject(editor, "object-a");

    const result = buildSaveDataObjectBindingCommand(editor.getSnapshot(), bindingInput(queryId, {
      deviceId: "pump-manual-99"
    }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      editor.dispatch(result.command);
    }
    expect(editor.getSnapshot().dataSources.bindings["object-a"].deviceId).toBe("pump-manual-99");
    editor.dispose();
  });

  it("explains unsupported targets instead of silently rebinding", () => {
    const editor = createEditor();
    const { queryId } = createQuery(editor);
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Group A" });
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });

    expect(buildSaveDataObjectBindingCommand(editor.getSnapshot(), bindingInput(queryId, {
      objectNodeId: "missing"
    }))).toMatchObject({
      ok: false,
      problems: [expect.objectContaining({ code: "target-not-found", field: "object" })]
    });
    expect(buildSaveDataObjectBindingCommand(editor.getSnapshot(), bindingInput(queryId, {
      objectNodeId: "group-a"
    }))).toMatchObject({
      ok: false,
      problems: [expect.objectContaining({ code: "target-unsupported", targetKind: "group" })]
    });

    const imported = createEditor({ snapshot: withImportedNode(editor.serialize()) });
    expect(buildSaveDataObjectBindingCommand(imported.getSnapshot(), bindingInput(queryId, {
      objectNodeId: "imported-a"
    }))).toMatchObject({
      ok: false,
      problems: [expect.objectContaining({
        code: "target-imported",
        ownerObjectId: "object-a"
      })]
    });
    expect(imported.getSnapshot().dataSources.bindings).toEqual({});
    editor.dispose();
    imported.dispose();
  });

  it.each([
    [{ deviceId: "  " }, "device-required"],
    [{ details: [] }, "detail-required"],
    [{ details: [{ key: "temperature", label: null, precision: null }, { key: "temperature", label: null, precision: null }] }, "detail-duplicate"],
    [{ details: [{ key: "missing", label: null, precision: null }] }, "detail-unknown"],
    [{ details: [{ key: "temperature", label: null, precision: 7 }] }, "detail-precision"],
    [{ details: [{ key: "temperature", label: null, precision: 1.5 }] }, "detail-precision"],
    [{ details: [{ key: "running", label: null, precision: 1 }] }, "detail-precision"],
    [{ parameterOverrides: { missing: "x" } }, "parameter-unknown"],
    [{ parameterOverrides: { areaId: 1 } }, "parameter-type"],
    [{ parameterOverrides: { areaId: null as never } }, "parameter-type"],
    [{ enabled: "yes" as never }, "binding-invalid"]
  ])("rejects invalid binding input %j with %s", (patch, code) => {
    const editor = createEditor();
    const { queryId } = createQuery(editor);
    importObject(editor, "object-a");
    const before = editor.serialize();

    const result = buildSaveDataObjectBindingCommand(editor.getSnapshot(), bindingInput(queryId, patch as Partial<DataObjectBindingInput>));

    expect(result).toMatchObject({
      ok: false,
      problems: [expect.objectContaining({ code })]
    });
    expect(editor.serialize()).toEqual(before);
    expect(editor.getHistoryState()).toEqual({ undoCount: 3, redoCount: 0 });
    editor.dispose();
  });

  it("rejects a binding when the query requires a value with no default or binding override", () => {
    const editor = createEditor();
    const { queryId } = createQuery(editor, {
      parameters: [{ name: "deviceId", type: "string" }]
    });
    importObject(editor, "object-a");

    expect(buildSaveDataObjectBindingCommand(editor.getSnapshot(), bindingInput(queryId, {
      parameterOverrides: {}
    }))).toMatchObject({
      ok: false,
      problems: [expect.objectContaining({ code: "parameter-missing", parameterName: "deviceId" })]
    });
    editor.dispose();
  });

  it("blocks incompatible query edits that bindings still reference but allows compatible metadata edits", () => {
    const editor = createEditor();
    const { queryId } = createQuery(editor);
    importObject(editor, "object-a");
    saveBinding(editor, queryId);

    const removeProperty = buildSaveDataQueryCommand(editor.getSnapshot(), queryUpdate(editor, queryId, {
      properties: [runningProperty()]
    }), { queryId });
    expect(removeProperty).toMatchObject({
      ok: false,
      problems: expect.arrayContaining([expect.objectContaining({ code: "binding-property-in-use", propertyKey: "temperature" })])
    });

    const changeType = buildSaveDataQueryCommand(editor.getSnapshot(), queryUpdate(editor, queryId, {
      properties: [
        temperatureProperty({ type: "string", transform: { kind: "raw" } }),
        runningProperty()
      ]
    }), { queryId });
    expect(changeType).toMatchObject({
      ok: false,
      problems: expect.arrayContaining([expect.objectContaining({ code: "binding-property-in-use", propertyKey: "temperature" })])
    });

    const removeParameter = buildSaveDataQueryCommand(editor.getSnapshot(), queryUpdate(editor, queryId, {
      parameters: []
    }), { queryId });
    expect(removeParameter).toMatchObject({
      ok: false,
      problems: expect.arrayContaining([expect.objectContaining({ code: "binding-parameter-in-use", parameterName: "areaId" })])
    });

    const changeParameterType = buildSaveDataQueryCommand(editor.getSnapshot(), queryUpdate(editor, queryId, {
      parameters: [{ name: "areaId", type: "number", defaultValue: 1 }]
    }), { queryId });
    expect(changeParameterType).toMatchObject({
      ok: false,
      problems: expect.arrayContaining([expect.objectContaining({ code: "binding-parameter-in-use", parameterName: "areaId" })])
    });

    const compatible = buildSaveDataQueryCommand(editor.getSnapshot(), queryUpdate(editor, queryId, {
      properties: [
        temperatureProperty({ label: "Temperature", unit: "°C", transform: { kind: "scale", factor: 0.2, offset: 0 } }),
        runningProperty()
      ]
    }), { queryId });
    expect(compatible.ok).toBe(true);
    if (compatible.ok) {
      expect(editor.dispatch(compatible.command).ok).toBe(true);
    }
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toBeTruthy();
    editor.dispose();
  });

  it("removes bindings with deleted object subtrees and restores them with one undo", () => {
    const editor = createEditor();
    const { queryId } = createQuery(editor);
    importObject(editor, "object-a");
    importObject(editor, "object-b");
    saveBinding(editor, queryId, "object-a");
    saveBinding(editor, queryId, "object-b");
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Group A", parentId: "object-a" });

    const deleted = editor.dispatch({ type: "delete-nodes", nodeIds: ["object-a"] });
    expect(deleted.ok).toBe(true);
    expect(editor.getSnapshot().dataSources.bindings).toEqual({
      "object-b": expect.objectContaining({ objectNodeId: "object-b" })
    });
    editor.undo();
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toBeTruthy();
    expect(editor.getSnapshot().dataSources.bindings["object-b"]).toBeTruthy();
    editor.dispose();
  });

  it.each([null, { properties: [null] }])("reports malformed query mappings referenced by bindings: %j", (mapping) => {
    const editor = createEditor();
    const { queryId } = createQuery(editor);
    importObject(editor, "object-a");
    saveBinding(editor, queryId);
    const snapshot = editor.serialize();

    expect(validateSceneSnapshot({
      ...snapshot,
      dataSources: {
        ...snapshot.dataSources,
        queries: {
          [queryId]: { ...snapshot.dataSources.queries[queryId], mapping }
        }
      }
    })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([expect.stringContaining("Data query")])
    });
    editor.dispose();
  });

  it("rejects dangling and unnormalized bindings when restoring a snapshot", () => {
    const editor = createEditor();
    const { queryId } = createQuery(editor);
    importObject(editor, "object-a");
    saveBinding(editor, queryId);
    const valid = editor.serialize();
    expect(validateSceneSnapshot(valid).ok).toBe(true);

    const missingTarget = {
      ...valid,
      dataSources: {
        ...valid.dataSources,
        bindings: {
          ...valid.dataSources.bindings,
          missing: { ...valid.dataSources.bindings["object-a"], objectNodeId: "missing" }
        }
      }
    };
    expect(validateSceneSnapshot(missingTarget).ok).toBe(false);

    const danglingQuery = {
      ...valid,
      dataSources: {
        ...valid.dataSources,
        bindings: {
          "object-a": { ...valid.dataSources.bindings["object-a"], queryId: "missing" }
        }
      }
    };
    expect(validateSceneSnapshot(danglingQuery).errors.join("\n")).toContain("query");

    const omittedDefaults = {
      ...valid,
      dataSources: {
        ...valid.dataSources,
        bindings: {
          "object-a": {
            objectNodeId: "object-a",
            queryId,
            parameterOverrides: { areaId: "B" },
            deviceId: "pump-01",
            enabled: true,
            details: [{ key: "temperature", precision: 1 }]
          }
        }
      }
    };
    expect(validateSceneSnapshot(omittedDefaults)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([expect.stringContaining("normalized binding fields")])
    });

    const extraField = {
      ...valid,
      dataSources: {
        ...valid.dataSources,
        bindings: {
          "object-a": {
            ...valid.dataSources.bindings["object-a"],
            unexpected: true
          }
        }
      }
    };
    expect(validateSceneSnapshot(extraField)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([expect.stringContaining("normalized binding fields")])
    });
    editor.dispose();
  });
});

function createQuery(
  editor: ReturnType<typeof createEditor>,
  patch: { parameters?: DataQueryDefinition["parameters"] } = {}
): { queryId: string; connectionId: string } {
  const connectionResult = editor.dispatch({
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
  if (!connectionResult.ok) throw new Error(connectionResult.error);
  const connectionId = "connection-a";
  const result = buildSaveDataQueryCommand(editor.getSnapshot(), queryDefinition(connectionId, patch));
  if (!result.ok) throw new Error(result.problems.map((problem) => problem.message).join("\n"));
  const dispatched = editor.dispatch(result.command);
  if (!dispatched.ok) throw new Error(dispatched.error);
  const queryId = Object.keys(editor.getSnapshot().dataSources.queries)[0];
  return { queryId, connectionId };
}

function importObject(editor: ReturnType<typeof createEditor>, objectId: string): void {
  const result = editor.dispatch({ type: "import-glb", objectId, asset: { id: `asset-${objectId}` } });
  if (!result.ok) throw new Error(result.error);
}

function saveBinding(editor: ReturnType<typeof createEditor>, queryId: string, objectNodeId = "object-a"): void {
  const result = buildSaveDataObjectBindingCommand(editor.getSnapshot(), bindingInput(queryId, { objectNodeId }));
  if (!result.ok) throw new Error(result.problems.map((problem) => problem.message).join("\n"));
  const dispatched = editor.dispatch(result.command);
  if (!dispatched.ok) throw new Error(dispatched.error);
}

function bindingInput(queryId: string, patch: Partial<DataObjectBindingInput> = {}): DataObjectBindingInput {
  return {
    objectNodeId: "object-a",
    queryId,
    parameterOverrides: { areaId: "B" },
    deviceId: "pump-01",
    enabled: true,
    details: [
      { key: "running", label: "Running state", precision: null },
      { key: "temperature", label: null, precision: 1 }
    ],
    ...patch
  };
}

function queryUpdate(
  editor: ReturnType<typeof createEditor>,
  queryId: string,
  patch: { properties?: readonly ReturnType<typeof temperatureProperty>[]; parameters?: DataQueryDefinition["parameters"] }
): DataQueryDefinition {
  const query = editor.getSnapshot().dataSources.queries[queryId];
  return {
    connectionId: query.connectionId,
    name: query.name,
    path: query.path,
    parameters: patch.parameters ?? query.parameters,
    mapping: {
      ...query.mapping,
      properties: patch.properties ?? query.mapping.properties
    }
  };
}

function queryDefinition(
  connectionId = "connection-a",
  patch: { parameters?: DataQueryDefinition["parameters"] } = {}
): DataQueryDefinition {
  return {
    connectionId,
    name: "Pump status",
    path: "/pumps",
    parameters: patch.parameters ?? [{ name: "areaId", type: "string", defaultValue: "A" }],
    mapping: {
      mode: "array",
      root: [{ kind: "key", key: "items" }],
      identity: { kind: "path", path: [{ kind: "key", key: "deviceCode" }], valueType: "string" },
      displayName: [{ kind: "key", key: "name" }],
      properties: [temperatureProperty(), runningProperty()],
      observedAt: null,
      sourceQuality: null
    },
    updatePolicy: createDefaultDataQueryUpdatePolicy()
  };
}

function temperatureProperty(patch: Record<string, unknown> = {}) {
  return {
    key: "temperature",
    label: "temperature",
    type: "number" as const,
    nullable: false,
    unit: "°C",
    source: [{ kind: "key" as const, key: "tempRaw" }],
    transform: { kind: "scale" as const, factor: 0.1, offset: 0 },
    range: null,
    allowed: null,
    ...patch
  };
}

function runningProperty() {
  return {
    key: "running",
    label: "running",
    type: "boolean" as const,
    nullable: false,
    unit: null,
    source: [{ kind: "key" as const, key: "run" }],
    transform: { kind: "map" as const, entries: [{ from: 1, to: true }, { from: 0, to: false }] },
    range: null,
    allowed: null
  };
}

function withImportedNode(snapshot: ReturnType<ReturnType<typeof createEditor>["serialize"]>) {
  const imported = {
    id: "imported-a",
    name: "Imported mesh",
    parentId: "object-a",
    children: [],
    kind: "imported" as const,
    ownerObjectId: "object-a",
    importKey: "mesh-0",
    source: { kind: "mesh" as const, path: "Mesh" }
  };
  const objectNode = snapshot.nodes["object-a"] as { children: string[] };
  return {
    ...snapshot,
    nodes: {
      ...snapshot.nodes,
      "object-a": { ...objectNode, children: [...objectNode.children, "imported-a"] },
      "imported-a": imported
    }
  };
}
