import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { createEmptySnapshot } from "../snapshot/defaults";
import type { SceneSnapshot } from "../snapshot/types";
import type { DataCredentialDescriptor } from "./types";
import { buildDataConfigProblems, classifyDataConfigProblems } from "./config-problems";

describe("data config problems", () => {
  it("reports a binding to an unknown query as a config error", () => {
    const snapshot = withBindings(withObject(createEmptySnapshot("scene-a")), {
      "object-a": binding("object-a", "query-missing")
    });

    const problems = buildDataConfigProblems(snapshot);

    expect(problems).toMatchObject([{
      severity: "error",
      code: "config-query-missing",
      source: "data",
      target: { kind: "data-object", nodeId: "object-a", queryId: "query-missing" },
      metadata: expect.objectContaining({ dataKind: "config", status: "config-query-missing" })
    }]);
    expect(problems[0]!.display?.titleDescriptor?.key).toBe("problem.dataConfigProblem.title.title");
    expect(problems[0]!.display?.detailDescriptor?.key).toBe("problem.dataConfigProblem.configQueryMissing.detail");
  });

  it("reports a binding whose target node is not an object as a config error", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a" });
    const snapshot = withBindings(editor.getSnapshot(), {
      "group-a": binding("group-a", "query-missing")
    });

    expect(buildDataConfigProblems(snapshot).map((problem) => problem.code)).toEqual([
      "config-query-missing",
      "config-target-not-object"
    ]);
    editor.dispose();
  });

  it("reports a query that points at a missing connection as a config error", () => {
    const snapshot = withQueries(createEmptySnapshot("scene-a"), {
      "query-a": query({ connectionId: "connection-missing" })
    });

    expect(buildDataConfigProblems(snapshot)).toMatchObject([{
      code: "config-connection-missing",
      target: { kind: "data-query", connectionId: "connection-missing", queryId: "query-a" }
    }]);
  });

  it("accepts a stored configuration without config problems", () => {
    const snapshot = withBindings(
      withQueries(withConnections(withObject(createEmptySnapshot("scene-a")), { "connection-a": connection() }), {
        "query-a": query()
      }),
      { "object-a": binding("object-a", "query-a") }
    );

    expect(buildDataConfigProblems(snapshot)).toEqual([]);
  });
});

describe("data restore outcome classification", () => {
  it("treats a configuration error as damaged configuration", () => {
    const snapshot = withBindings(withConnections(withObject(createEmptySnapshot("scene-a")), {
      "connection-a": connection()
    }), {
      "object-a": binding("object-a", "query-missing")
    });

    expect(classifyDataConfigProblems(snapshot, [credential(true)])).toEqual({
      kind: "config-error",
      configProblems: [expect.objectContaining({ code: "config-query-missing" })],
      missingCredentialCount: 0
    });
  });

  it("treats a valid configuration with an unavailable credential as reconnection", () => {
    const snapshot = restorableSnapshot();

    expect(classifyDataConfigProblems(snapshot, [credential(false)])).toEqual({
      kind: "reconnect",
      configProblems: [],
      missingCredentialCount: 1
    });
  });

  it("treats a valid configuration without credential descriptors as reconnection", () => {
    expect(classifyDataConfigProblems(restorableSnapshot(), [])).toMatchObject({
      kind: "reconnect",
      missingCredentialCount: 1
    });
  });

  it("treats a valid configuration with an available credential as clean", () => {
    expect(classifyDataConfigProblems(restorableSnapshot(), [credential(true)])).toEqual({
      kind: "none",
      configProblems: [],
      missingCredentialCount: 0
    });
  });

  it("treats an empty configuration as clean", () => {
    expect(classifyDataConfigProblems(createEmptySnapshot("scene-a"), [])).toEqual({
      kind: "none",
      configProblems: [],
      missingCredentialCount: 0
    });
  });
});

function restorableSnapshot(): SceneSnapshot {
  return withBindings(
    withQueries(withConnections(withObject(createEmptySnapshot("scene-a")), { "connection-a": connection() }), {
      "query-a": query()
    }),
    { "object-a": binding("object-a", "query-a") }
  );
}

function withObject(snapshot: SceneSnapshot): SceneSnapshot {
  return {
    ...snapshot,
    nodes: {
      "object-a": {
        id: "object-a",
        kind: "object",
        name: "Pump",
        objectId: "object-a",
        parentId: null,
        children: [],
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
      }
    },
    rootNodeIds: ["object-a"]
  };
}

function connection(): SceneSnapshot["dataSources"]["connections"][string] {
  return {
    id: "connection-a",
    name: "Plant API",
    baseUrl: "https://api.example.test/v1",
    auth: { kind: "bearer", credentialRef: "plant-token" },
    headers: {},
    timeoutMs: 10_000
  };
}

function credential(available: boolean): DataCredentialDescriptor {
  return { ref: "plant-token", label: "Plant token", available };
}

function query(options: { connectionId?: string } = {}): SceneSnapshot["dataSources"]["queries"][string] {
  return {
    id: "query-a",
    connectionId: options.connectionId ?? "connection-a",
    name: "Pump status",
    method: "GET",
    readOnly: true,
    path: "/pumps",
    headers: {},
    parameters: [],
    successCondition: null,
    mapping: {
      mode: "array",
      root: [],
      identity: { kind: "path", path: [{ kind: "key", key: "deviceCode" }], valueType: "string" },
      displayName: null,
      properties: [],
      observedAt: null,
      sourceQuality: null
    },
    updatePolicy: { refreshIntervalMs: 5_000, maxAgeMs: 15_000 }
  };
}

function binding(objectNodeId: string, queryId: string): SceneSnapshot["dataSources"]["bindings"][string] {
  return {
    objectNodeId,
    queryId,
    parameterOverrides: {},
    deviceId: "pump-01",
    enabled: true,
    details: [],
    color: null
  };
}

function withBindings(
  snapshot: SceneSnapshot,
  bindings: SceneSnapshot["dataSources"]["bindings"]
): SceneSnapshot {
  return { ...snapshot, dataSources: { ...snapshot.dataSources, bindings } };
}

function withQueries(
  snapshot: SceneSnapshot,
  queries: SceneSnapshot["dataSources"]["queries"]
): SceneSnapshot {
  return { ...snapshot, dataSources: { ...snapshot.dataSources, queries } };
}

function withConnections(
  snapshot: SceneSnapshot,
  connections: SceneSnapshot["dataSources"]["connections"]
): SceneSnapshot {
  return { ...snapshot, dataSources: { ...snapshot.dataSources, connections } };
}
