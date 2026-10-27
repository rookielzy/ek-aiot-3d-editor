import { describe, expect, it } from "vitest";
import {
  buildDeleteDataQueryCommand,
  buildDuplicateDataQueryCommand,
  buildSaveDataQueryCommand,
  createEditor,
  mapDataQueryBody,
  parseDataPath,
  validateDataQueryDefinition,
  validateSceneSnapshot,
  validateSerializedSceneSnapshot,
  type DataPropertyMapping,
  type DataQueryDefinition,
  type DataQueryMapping
} from "../index";

describe("durable query authoring", () => {
  it("saves request and mapping together as one undoable transaction and round-trips through JSON", () => {
    const editor = createEditor();
    createConnection(editor, "Plant API");
    const before = editor.serialize();
    const history = editor.getHistoryState();

    const result = buildSaveDataQueryCommand(editor.getSnapshot(), queryDefinition());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a query command.");
    const dispatched = editor.dispatch(result.command);
    expect(dispatched.ok).toBe(true);
    expect(editor.getHistoryState()).toEqual({ undoCount: 2, redoCount: 0 });

    const queries = Object.values(editor.getSnapshot().dataSources.queries);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      name: "Pump status",
      path: "/pumps",
      parameters: [{ name: "areaId", type: "string", defaultValue: "A" }],
      mapping: {
        mode: "array"
      }
    });
    expect(queries[0].mapping.properties[0]).toMatchObject({
      key: "temperature",
      type: "number",
      transform: { kind: "scale", factor: 0.1, offset: 0 }
    });

    const restored = createEditor({ snapshot: editor.serialize() });
    expect(restored.getSnapshot().dataSources.queries).toEqual(editor.getSnapshot().dataSources.queries);
    restored.dispose();

    editor.undo();
    expect(editor.serialize()).toEqual(before);
    editor.undo();
    expect(editor.getSnapshot().dataSources.queries).toEqual({});
    editor.dispose();
  });

  it("updates, duplicates, deletes, and restores queries with stable references", () => {
    const editor = createEditor();
    createConnection(editor, "Plant API");
    const created = buildSaveDataQueryCommand(editor.getSnapshot(), queryDefinition());
    if (!created.ok) throw new Error("Expected a query command.");
    editor.dispatch(created.command);
    const queryId = Object.keys(editor.getSnapshot().dataSources.queries)[0];
    const connectionId = editor.getSnapshot().dataSources.queries[queryId].connectionId;

    const update = buildSaveDataQueryCommand(editor.getSnapshot(), {
      ...queryDefinition(),
      name: "Pump status v2",
      path: "/pumps/latest",
      mapping: baseMapping({
        properties: [
          property("temperature", "tempRaw", "number", { kind: "scale", factor: 1, offset: -32 }),
          property("running", "run", "boolean", { kind: "raw" })
        ]
      })
    }, { queryId });
    expect(update.ok).toBe(true);
    if (!update.ok) throw new Error("Expected an update command.");
    editor.dispatch(update.command);
    expect(editor.getHistoryState()).toEqual({ undoCount: 3, redoCount: 0 });
    expect(editor.getSnapshot().dataSources.queries[queryId]).toMatchObject({
      name: "Pump status v2",
      path: "/pumps/latest",
      mapping: {
        properties: [
          { key: "temperature", transform: { kind: "scale", factor: 1, offset: -32 } },
          { key: "running", transform: { kind: "raw" } }
        ]
      }
    });

    editor.undo();
    expect(editor.getSnapshot().dataSources.queries[queryId]).toMatchObject({
      name: "Pump status",
      path: "/pumps"
    });

    const duplicate = buildDuplicateDataQueryCommand(editor.getSnapshot(), queryId);
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) throw new Error("Expected a duplicate command.");
    editor.dispatch(duplicate.command);
    const all = Object.values(editor.getSnapshot().dataSources.queries);
    expect(all).toHaveLength(2);
    const copy = all.find((query) => query.id !== queryId);
    expect(copy?.id).not.toBe(queryId);
    expect(copy?.name).toBe("Pump status copy");
    expect(copy?.connectionId).toBe(connectionId);
    expect(copy?.path).toBe("/pumps");
    expect(copy?.mapping).toEqual(editor.getSnapshot().dataSources.queries[queryId].mapping);

    const deleteResult = buildDeleteDataQueryCommand(editor.getSnapshot(), copy!.id);
    expect(deleteResult.ok).toBe(true);
    if (!deleteResult.ok) throw new Error("Expected a delete command.");
    editor.dispatch(deleteResult.command);
    expect(Object.keys(editor.getSnapshot().dataSources.queries)).toEqual([queryId]);
    editor.undo();
    expect(Object.keys(editor.getSnapshot().dataSources.queries)).toHaveLength(2);
    editor.dispose();
  });

  it("enforces unique query names per connection while allowing the same name elsewhere", () => {
    const editor = createEditor();
    createConnection(editor, "Plant A");
    createConnection(editor, "Plant B");
    const [connectionA, connectionB] = Object.keys(editor.getSnapshot().dataSources.connections);

    const first = buildSaveDataQueryCommand(editor.getSnapshot(), {
      ...queryDefinition(),
      connectionId: connectionA
    });
    if (!first.ok) throw new Error("Expected a query command.");
    editor.dispatch(first.command);

    const duplicateName = buildSaveDataQueryCommand(editor.getSnapshot(), {
      ...queryDefinition(),
      connectionId: connectionA
    });
    expect(duplicateName).toMatchObject({
      ok: false,
      problems: [expect.objectContaining({ code: "name-duplicate", field: "name" })]
    });

    const otherConnection = buildSaveDataQueryCommand(editor.getSnapshot(), {
      ...queryDefinition(),
      connectionId: connectionB
    });
    expect(otherConnection.ok).toBe(true);
    if (!otherConnection.ok) throw new Error("Expected a query command.");
    editor.dispatch(otherConnection.command);
    expect(Object.keys(editor.getSnapshot().dataSources.queries)).toHaveLength(2);
    editor.dispose();
  });

  it("rejects incomplete mapping and identity rules without touching history", () => {
    const editor = createEditor();
    createConnection(editor, "Plant API");
    const before = editor.serialize();
    const history = editor.getHistoryState();

    const noProperties = buildSaveDataQueryCommand(editor.getSnapshot(), {
      ...queryDefinition(),
      mapping: baseMapping({ properties: [] })
    });
    expect(noProperties).toMatchObject({
      ok: false,
      problems: expect.arrayContaining([expect.objectContaining({ code: "mapping-property-required" })])
    });

    const noIdentity = buildSaveDataQueryCommand(editor.getSnapshot(), {
      ...queryDefinition(),
      mapping: baseMapping({ identity: undefined as never })
    });
    expect(noIdentity).toMatchObject({
      ok: false,
      problems: expect.arrayContaining([expect.objectContaining({ code: "mapping-invalid" })])
    });

    const duplicateKeys = buildSaveDataQueryCommand(editor.getSnapshot(), {
      ...queryDefinition(),
      mapping: baseMapping({
        properties: [
          property("temperature", "tempRaw", "number", { kind: "scale", factor: 0.1, offset: 0 }),
          property("temperature", "run", "number", { kind: "raw" })
        ]
      })
    });
    expect(duplicateKeys.ok).toBe(false);

    expect(editor.serialize()).toEqual(before);
    expect(editor.getHistoryState()).toEqual(history);
    editor.dispose();
  });

  it("blocks deleting a referenced query and keeps bindings off duplicated queries", () => {
    const editor = createEditor();
    createConnection(editor, "Plant API");
    const created = buildSaveDataQueryCommand(editor.getSnapshot(), queryDefinition());
    if (!created.ok) throw new Error("Expected a query command.");
    editor.dispatch(created.command);
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const queryId = Object.keys(editor.getSnapshot().dataSources.queries)[0];

    const serialized = editor.serialize();
    editor.restore({
      ...serialized,
      dataSources: {
        ...serialized.dataSources,
        bindings: {
          "object-a": {
            objectNodeId: "object-a",
            queryId,
            parameterOverrides: {},
            deviceId: "pump-01",
            enabled: true,
            details: [{ key: "temperature", label: null, precision: null }]
          }
        }
      }
    });

    const blocked = buildDeleteDataQueryCommand(editor.getSnapshot(), queryId);
    expect(blocked).toMatchObject({
      ok: false,
      problems: [expect.objectContaining({ code: "query-in-use" })]
    });
    const before = editor.serialize();
    const directDelete = editor.dispatch({ type: "delete-data-query", queryId });
    expect(directDelete.ok).toBe(false);
    expect(directDelete.error).toContain("query-in-use");
    expect(editor.serialize()).toEqual(before);

    const duplicate = buildDuplicateDataQueryCommand(editor.getSnapshot(), queryId);
    if (!duplicate.ok) throw new Error("Expected a duplicate command.");
    editor.dispatch(duplicate.command);
    const copyId = Object.keys(editor.getSnapshot().dataSources.queries).find((id) => id !== queryId)!;
    expect(editor.getSnapshot().dataSources.bindings["object-a"].queryId).toBe(queryId);
    expect(buildDeleteDataQueryCommand(editor.getSnapshot(), copyId).ok).toBe(true);
    editor.dispose();
  });

  it.each([
    { auth: null },
    { auth: { kind: "bearer" } },
    { headers: null },
    { baseUrl: "invalid" }
  ])("reports invalid referenced connections without throwing: %j", (patch) => {
    const editor = createEditor();
    createConnection(editor, "Plant API");
    const snapshot = editor.serialize();
    const invalid = {
      ...snapshot,
      dataSources: {
        ...snapshot.dataSources,
        connections: {
          "connection-a": { ...snapshot.dataSources.connections["connection-a"], ...patch }
        },
        queries: { "query-a": { id: "query-a", ...queryDefinition() } }
      }
    };

    const result = validateSceneSnapshot(invalid);
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("Data connection connection-a"));
    expect(result.errors).toContainEqual(expect.stringContaining("Data query query-a connection-not-found"));
    expect(validateSerializedSceneSnapshot(invalid).ok).toBe(false);
    editor.dispose();
  });

  it.each([
    { label: "scale offset", transform: { kind: "scale", factor: 0.1 }, range: { min: 0, max: null } },
    { label: "range maximum", transform: { kind: "scale", factor: 0.1, offset: 0 }, range: { min: 0 } }
  ])("requires stored queries to contain the $label supplied during authoring", ({ transform, range }) => {
    const editor = createEditor();
    createConnection(editor, "Plant API");
    const definition = {
      ...queryDefinition(),
      mapping: {
        ...baseMapping(),
        properties: [{
          ...property("temperature", "tempRaw", "number", { kind: "raw" }),
          transform,
          range
        }]
      }
    };
    const snapshot = editor.serialize();
    const incomplete = {
      ...snapshot,
      dataSources: {
        ...snapshot.dataSources,
        queries: { "query-a": { id: "query-a", ...definition } }
      }
    };

    expect(validateSceneSnapshot(incomplete)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([expect.stringContaining("explicit mapping defaults")])
    });
    expect(validateSerializedSceneSnapshot(incomplete).ok).toBe(false);

    const validation = validateDataQueryDefinition(definition, {
      connection: snapshot.dataSources.connections["connection-a"]
    });
    if (!validation.value) throw new Error("Expected a normalized query definition.");
    const command = buildSaveDataQueryCommand(editor.getSnapshot(), { id: "query-a", ...validation.value });
    if (!command.ok) throw new Error("Expected a save command.");
    expect(editor.dispatch(command.command).ok).toBe(true);
    const restored = createEditor({ snapshot: JSON.parse(JSON.stringify(editor.serialize())) });
    const mapping = restored.getSnapshot().dataSources.queries["query-a"].mapping;

    expect(mapping.properties[0]).toMatchObject({
      transform: { kind: "scale", factor: 0.1, offset: 0 },
      range: { min: 0, max: null }
    });
    expect(mapDataQueryBody(mapping, {
      data: { items: [{ deviceCode: "001", tempRaw: 426 }] }
    }, { connectionId: "connection-a", queryId: "query-a", receivedAt: 0 }).samples).toContainEqual(
      expect.objectContaining({ propertyKey: "temperature", value: 42.6 })
    );
    restored.dispose();
    editor.dispose();
  });

  it("accepts stored query fields regardless of JSON object key order", () => {
    const editor = createEditor();
    createConnection(editor, "Plant API");
    const snapshot = editor.serialize();
    const definition = queryDefinition();

    expect(validateSceneSnapshot({
      ...snapshot,
      dataSources: {
        ...snapshot.dataSources,
        queries: {
          "query-a": {
            id: "query-a",
            ...definition,
            mapping: {
              ...definition.mapping,
              properties: definition.mapping.properties.map((property) =>
                Object.fromEntries(Object.entries(property).reverse())
              )
            }
          }
        }
      }
    }).ok).toBe(true);
    editor.dispose();
  });

  it("validates stored query structure when restoring a snapshot", () => {
    const editor = createEditor();
    createConnection(editor, "Plant API");
    const created = buildSaveDataQueryCommand(editor.getSnapshot(), queryDefinition());
    if (!created.ok) throw new Error("Expected a query command.");
    editor.dispatch(created.command);
    const valid = editor.serialize();
    expect(validateSceneSnapshot(valid).ok).toBe(true);

    const broken = editor.getSnapshot().dataSources.queries[Object.keys(editor.getSnapshot().dataSources.queries)[0]];
    const invalid = {
      ...valid,
      dataSources: {
        ...valid.dataSources,
        queries: {
          [broken.id]: {
            id: broken.id,
            connectionId: broken.connectionId,
            name: broken.name,
            path: "https://evil.example.test/data",
            parameters: [],
            mapping: baseMapping()
          }
        }
      }
    };
    const result = validateSceneSnapshot(invalid);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("path-invalid");
    editor.dispose();
  });
});

function createConnection(editor: ReturnType<typeof createEditor>, name: string): void {
  const connectionId = Object.keys(editor.getSnapshot().dataSources.connections).length === 0
    ? "connection-a"
    : "connection-b";
  const result = editor.dispatch({
    type: "create-data-connection",
    connection: {
      id: connectionId,
      name,
      baseUrl: "https://api.example.test/v1",
      auth: { kind: "none" },
      headers: {},
      timeoutMs: 10_000
    }
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
}

function queryDefinition(connectionId = "connection-a"): DataQueryDefinition {
  return {
    connectionId,
    name: "Pump status",
    path: "/pumps",
    parameters: [{ name: "areaId", type: "string", defaultValue: "A" }],
    mapping: baseMapping()
  };
}

function baseMapping(patch: Partial<DataQueryMapping> = {}): DataQueryMapping {
  return {
    mode: "array",
    root: path("data.items"),
    identity: { kind: "path", path: path("deviceCode"), valueType: "string" },
    displayName: path("name"),
    properties: [
      property("temperature", "tempRaw", "number", { kind: "scale", factor: 0.1, offset: 0 }, { unit: "°C" }),
      property("running", "run", "boolean", {
        kind: "map",
        entries: [{ from: 1, to: true }, { from: 0, to: false }]
      })
    ],
    observedAt: { path: path("sampledAt"), format: "iso" },
    sourceQuality: null,
    ...patch
  };
}

function property(
  key: string,
  source: string,
  type: DataPropertyMapping["type"],
  transform: DataPropertyMapping["transform"],
  patch: Partial<DataPropertyMapping> = {}
): DataPropertyMapping {
  return {
    key,
    label: key,
    type,
    nullable: false,
    unit: null,
    source: path(source),
    transform,
    range: null,
    allowed: null,
    ...patch
  };
}

function path(text: string) {
  const parsed = parseDataPath(text);
  if (!parsed) {
    throw new Error(`Invalid test path: ${text}`);
  }
  return parsed;
}
