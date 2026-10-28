import { describe, expect, it } from "vitest";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createDefaultDataQueryUpdatePolicy,
  createEditor,
  evaluateDataColorRules,
  type DataBindingColor,
  type DataObjectBindingInput,
  type DataQueryDefinition
} from "../index";

describe("data color rules", () => {
  it("uses the first matching boolean or string rule and falls back to the authored color", () => {
    const running: DataBindingColor = {
      propertyKey: "running",
      rules: [
        { operator: "eq", value: false, max: null, color: "#ff0000" },
        { operator: "ne", value: false, max: null, color: "#00ff00" }
      ]
    };
    expect(evaluateDataColorRules(running, true)).toEqual({ color: "#00ff00", ruleIndex: 1 });
    expect(evaluateDataColorRules(running, false)).toEqual({ color: "#ff0000", ruleIndex: 0 });
    expect(evaluateDataColorRules(running, null)).toBeNull();
    expect(evaluateDataColorRules(running, undefined)).toBeNull();

    const state: DataBindingColor = {
      propertyKey: "state",
      rules: [
        { operator: "eq", value: "running", max: null, color: "#00ff00" },
        { operator: "ne", value: "running", max: null, color: "#888888" }
      ]
    };
    expect(evaluateDataColorRules(state, "running")).toEqual({ color: "#00ff00", ruleIndex: 0 });
    expect(evaluateDataColorRules(state, "stopped")).toEqual({ color: "#888888", ruleIndex: 1 });
    expect(evaluateDataColorRules(state, 1)).toBeNull();
  });

  it("compares numbers and treats one interval as inclusive", () => {
    const temperature: DataBindingColor = {
      propertyKey: "temperature",
      rules: [
        { operator: "between", value: 30, max: 50, color: "#ffcc00" },
        { operator: "gte", value: 80, max: null, color: "#ff0000" },
        { operator: "lt", value: 0, max: null, color: "#0000ff" }
      ]
    };
    expect(evaluateDataColorRules(temperature, 30)).toEqual({ color: "#ffcc00", ruleIndex: 0 });
    expect(evaluateDataColorRules(temperature, 50)).toEqual({ color: "#ffcc00", ruleIndex: 0 });
    expect(evaluateDataColorRules(temperature, 80)).toEqual({ color: "#ff0000", ruleIndex: 1 });
    expect(evaluateDataColorRules(temperature, -1)).toEqual({ color: "#0000ff", ruleIndex: 2 });
    expect(evaluateDataColorRules(temperature, 20)).toBeNull();
    expect(evaluateDataColorRules(temperature, "42")).toBeNull();
    expect(evaluateDataColorRules(temperature, Number.NaN)).toBeNull();
  });

  it("saves normalized color rules with the binding and rejects rules that do not match the mapped property", () => {
    const editor = createEditor();
    const { queryId } = createQuery(editor);
    importObject(editor, "object-a");

    const invalid = [
      [{ propertyKey: "missing", rules: [rule({ value: 1 })] }, "color-property-unknown"],
      [{ propertyKey: "temperature", rules: [rule({ operator: "eq", value: 1 })] }, "color-operator"],
      [{ propertyKey: "temperature", rules: [rule({ value: "hot" })] }, "color-value"],
      [{ propertyKey: "temperature", rules: [rule({ operator: "between", value: 10, max: 5 })] }, "color-value"],
      [{ propertyKey: "running", rules: [rule({ operator: "between", value: 1, max: 2 })] }, "color-operator"],
      [{ propertyKey: "running", rules: [rule({ operator: "eq", value: "true" })] }, "color-value"],
      [{ propertyKey: "temperature", rules: [] }, "color-rules-required"],
      [{ propertyKey: "temperature", rules: [rule({ color: "red" })] }, "color-value"]
    ] as const;
    for (const [color, code] of invalid) {
      expect(buildSaveDataObjectBindingCommand(editor.getSnapshot(), bindingInput(queryId, {
        color: color as DataObjectBindingInput["color"]
      }))).toMatchObject({
        ok: false,
        problems: [expect.objectContaining({ code, field: "colors" })]
      });
    }

    const valid = buildSaveDataObjectBindingCommand(editor.getSnapshot(), bindingInput(queryId, {
      color: {
        propertyKey: "temperature",
        rules: [
          { operator: "between", value: 30, max: 50, color: "#FFCC00" },
          { operator: "gte", value: 80, max: null, color: "#ff0000" }
        ]
      }
    }));
    if (!valid.ok) throw new Error(valid.problems.map((problem) => problem.message).join("\n"));
    expect(valid.command.type).toBe("set-data-object-binding");
    if (valid.command.type === "set-data-object-binding") {
      expect(valid.command.binding.color).toEqual({
        propertyKey: "temperature",
        rules: [
          { operator: "between", value: 30, max: 50, color: "#ffcc00" },
          { operator: "gte", value: 80, max: null, color: "#ff0000" }
        ]
      });
    }
    editor.dispose();
  });

  it("restores snapshots saved before color rules existed", () => {
    const editor = createEditor();
    const { queryId } = createQuery(editor);
    importObject(editor, "object-a");
    const saved = buildSaveDataObjectBindingCommand(editor.getSnapshot(), bindingInput(queryId));
    if (!saved.ok) throw new Error("Expected a binding command.");
    editor.dispatch(saved.command);
    const serialized = editor.serialize();
    const { color: _color, ...legacyBinding } = serialized.dataSources.bindings["object-a"] as Record<string, unknown>;
    const restored = createEditor({
      snapshot: {
        ...serialized,
        dataSources: {
          ...serialized.dataSources,
          bindings: { "object-a": legacyBinding as never }
        }
      }
    });
    expect(restored.getSnapshot().dataSources.bindings["object-a"].color).toBeNull();
    expect(restored.serialize().dataSources.bindings["object-a"]).toHaveProperty("color", null);
    restored.dispose();
    editor.dispose();
  });
});

function rule(patch: Partial<{ operator: string; value: unknown; max: number | null; color: string }> = {}) {
  return {
    operator: "gt",
    value: 10,
    max: null,
    color: "#00ff00",
    ...patch
  };
}

function importObject(editor: ReturnType<typeof createEditor>, objectId: string): void {
  const result = editor.dispatch({ type: "import-glb", objectId, asset: { id: `asset-${objectId}` } });
  if (!result.ok) throw new Error(result.error);
}

function createQuery(editor: ReturnType<typeof createEditor>): { queryId: string } {
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
  const query = buildSaveDataQueryCommand(editor.getSnapshot(), queryDefinition());
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  const dispatched = editor.dispatch(query.command);
  if (!dispatched.ok) throw new Error(dispatched.error);
  return { queryId: Object.keys(editor.getSnapshot().dataSources.queries)[0]! };
}

function queryDefinition(): DataQueryDefinition {
  return {
    connectionId: "connection-a",
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
          source: [{ kind: "key", key: "tempRaw" }],
          transform: { kind: "scale", factor: 0.1, offset: 0 },
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
          transform: { kind: "map", entries: [{ from: 1, to: true }, { from: 0, to: false }] },
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

function bindingInput(queryId: string, patch: Partial<DataObjectBindingInput> = {}): DataObjectBindingInput {
  return {
    objectNodeId: "object-a",
    queryId,
    parameterOverrides: { areaId: "B" },
    deviceId: "pump-01",
    enabled: true,
    details: [{ key: "temperature", precision: 1 }],
    ...patch
  };
}
