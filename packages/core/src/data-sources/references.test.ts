import { describe, expect, it } from "vitest";
import {
  buildDataConnectionReferenceModel,
  buildDataQueryReferenceModel,
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createDefaultDataQueryUpdatePolicy,
  createEditor,
  type DataQueryDefinition
} from "../index";

describe("data source reference locations", () => {
  it("locates every object, property, and parameter using a query", () => {
    const editor = createEditor();
    const { queryId } = createQuery(editor);
    importObject(editor, "object-a");
    importObject(editor, "object-b");
    saveBinding(editor, queryId, "object-a", {
      parameterOverrides: { areaId: "B" },
      details: [
        { key: "temperature", label: null, precision: 1 },
        { key: "running", label: null, precision: null }
      ],
      color: { propertyKey: "running", rules: [{ operator: "eq", value: true, max: null, color: "#22c55e" }] }
    });
    saveBinding(editor, queryId, "object-b", {
      parameterOverrides: {},
      details: [{ key: "temperature", label: null, precision: null }]
    });

    const model = buildDataQueryReferenceModel(editor.getSnapshot(), queryId);

    expect(model.bindings).toEqual([
      expect.objectContaining({
        objectNodeId: "object-a",
        objectName: "Pump A",
        deviceId: "pump-01"
      }),
      expect.objectContaining({
        objectNodeId: "object-b",
        objectName: "Pump B",
        deviceId: "pump-01"
      })
    ]);
    expect(model.properties).toEqual([
      {
        propertyKey: "temperature",
        objects: [
          { objectNodeId: "object-a", objectName: "Pump A", usage: "detail" },
          { objectNodeId: "object-b", objectName: "Pump B", usage: "detail" }
        ]
      },
      {
        propertyKey: "running",
        objects: [
          { objectNodeId: "object-a", objectName: "Pump A", usage: "detail" },
          { objectNodeId: "object-a", objectName: "Pump A", usage: "color" }
        ]
      }
    ]);
    expect(model.parameters).toEqual([
      {
        parameterName: "areaId",
        objects: [{ objectNodeId: "object-a", objectName: "Pump A" }]
      }
    ]);
    editor.dispose();
  });

  it("locates queries and bound objects for a connection", () => {
    const editor = createEditor();
    const { queryId, connectionId } = createQuery(editor);
    importObject(editor, "object-a");
    saveBinding(editor, queryId, "object-a");

    const model = buildDataConnectionReferenceModel(editor.getSnapshot(), connectionId);

    expect(model.connectionId).toBe(connectionId);
    expect(model.queries).toEqual([{ id: queryId, name: "Pump status" }]);
    expect(model.bindings).toEqual([
      expect.objectContaining({ objectNodeId: "object-a", queryId, deviceId: "pump-01" })
    ]);
    editor.dispose();
  });

  it("returns empty reference models for unknown identifiers", () => {
    const editor = createEditor();

    expect(buildDataQueryReferenceModel(editor.getSnapshot(), "query-missing")).toEqual({
      bindings: [],
      properties: [],
      parameters: []
    });
    expect(buildDataConnectionReferenceModel(editor.getSnapshot(), "connection-missing")).toEqual({
      connectionId: "connection-missing",
      queries: [],
      bindings: []
    });
    editor.dispose();
  });
});

function createQuery(
  editor: ReturnType<typeof createEditor>
): { queryId: string; connectionId: string } {
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
  const result = buildSaveDataQueryCommand(
    editor.getSnapshot(),
    queryDefinition("connection-a")
  );
  if (!result.ok) throw new Error(result.problems.map((problem) => problem.message).join("\n"));
  const dispatched = editor.dispatch(result.command);
  if (!dispatched.ok) throw new Error(dispatched.error);
  const queryId = Object.keys(editor.getSnapshot().dataSources.queries)[0];
  return { queryId, connectionId: "connection-a" };
}

function importObject(editor: ReturnType<typeof createEditor>, objectId: string): void {
  const result = editor.dispatch({
    type: "import-glb",
    objectId,
    name: objectId === "object-a" ? "Pump A" : "Pump B",
    asset: { id: `asset-${objectId}` }
  });
  if (!result.ok) throw new Error(result.error);
}

function saveBinding(
  editor: ReturnType<typeof createEditor>,
  queryId: string,
  objectNodeId: string,
  patch: Partial<Parameters<typeof buildSaveDataObjectBindingCommand>[1]> = {}
): void {
  const result = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId,
    queryId,
    parameterOverrides: { areaId: "A" },
    deviceId: "pump-01",
    enabled: true,
    details: [{ key: "temperature", label: null, precision: null }],
    ...patch
  });
  if (!result.ok) throw new Error(result.problems.map((problem) => problem.message).join("\n"));
  const dispatched = editor.dispatch(result.command);
  if (!dispatched.ok) throw new Error(dispatched.error);
}

function queryDefinition(connectionId: string): DataQueryDefinition {
  return {
    connectionId,
    name: "Pump status",
    path: "/pumps",
    parameters: [{ name: "areaId", type: "string", defaultValue: "A" }],
    mapping: {
      mode: "array",
      root: [{ kind: "key", key: "items" }],
      identity: { kind: "path", path: [{ kind: "key", key: "deviceCode" }], valueType: "string" },
      displayName: [{ kind: "key", key: "name" }],
      properties: [
        {
          key: "temperature",
          label: "Temperature",
          type: "number",
          nullable: false,
          unit: "°C",
          source: [{ kind: "key", key: "temp" }],
          transform: { kind: "raw" },
          range: null,
          allowed: null
        },
        {
          key: "running",
          label: "Running",
          type: "boolean",
          nullable: false,
          unit: null,
          source: [{ kind: "key", key: "run" }],
          transform: { kind: "raw" },
          range: null,
          allowed: null
        }
      ],
      observedAt: null,
      sourceQuality: null
    },
    updatePolicy: createDefaultDataQueryUpdatePolicy()
  };
}
