import { describe, expect, it } from "vitest";
import {
  buildDataGetRequest,
  buildDataQueryRequest,
  buildDataSourcesWorkspaceModel,
  buildSaveDataConnectionCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataQueryMapping
} from "../index";

describe("HTTP read request contract", () => {
  it("builds a read-only POST with typed body values, overridden query headers, and auth by reference", () => {
    const editor = createEditor({
      credentials: [{ ref: "credential-ops", label: "Operations key", available: true }]
    });
    const connection = editor.dispatch({
      type: "create-data-connection",
      connection: {
        id: "connection-a",
        name: "Plant API",
        baseUrl: "https://api.example.test/v1",
        auth: { kind: "api-key", credentialRef: "credential-ops", headerName: "X-Api-Key" },
        headers: { "X-Tenant": "plant-a", "X-Source": "connection" },
        timeoutMs: 12_000
      }
    });
    expect(connection.ok).toBe(true);

    const result = buildDataQueryRequest(editor.getSnapshot(), {
      connectionId: "connection-a",
      method: "POST",
      readOnly: true,
      path: "/search/{areaId}/pumps",
      headers: { "x-tenant": "override", "X-Trace": "trace-1" },
      parameters: [
        { name: "areaId", type: "string", defaultValue: "A B", location: "path" },
        { name: "tag", type: "string", defaultValue: "a b", location: "query" },
        { name: "enabled", type: "boolean", defaultValue: false, location: "body" },
        { name: "offset", type: "number", defaultValue: 0, location: "body" },
        { name: "note", type: "string", defaultValue: "", location: "body" }
      ],
      successCondition: {
        path: [{ kind: "key", key: "code" }],
        equals: 0
      }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.problems.map((problem) => problem.message).join("\n"));
    expect(result.summary.method).toBe("POST");
    expect(result.summary.url).toBe("https://api.example.test/v1/search/A%20B/pumps?tag=a+b");
    expect(result.summary.body).toEqual({ enabled: false, offset: 0, note: "" });
    expect(result.summary.headers).toEqual({
      "X-Source": "connection",
      "x-tenant": "override",
      "X-Trace": "trace-1",
      "Content-Type": "application/json"
    });
    expect(result.summary.auth).toEqual({
      kind: "api-key",
      credentialRef: "credential-ops",
      headerName: "X-Api-Key"
    });
    expect(result.summary.credentialRef).toBe("credential-ops");
    expect(result.summary.parameters).toEqual({
      areaId: "A B",
      tag: "a b",
      enabled: false,
      offset: 0,
      note: ""
    });
    expect(result.summary.successCondition).toEqual({
      path: [{ kind: "key", key: "code" }],
      equals: 0
    });
    expect(JSON.stringify(result.summary)).not.toContain("secret");
    editor.dispose();
  });

  it("refuses unconfirmed POST, misplaced parameters, auth header overrides, and invalid success conditions", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "create-data-connection",
      connection: {
        id: "connection-a",
        name: "Plant API",
        baseUrl: "https://api.example.test/v1",
        auth: { kind: "api-key", credentialRef: "credential-ops", headerName: "X-Api-Key" },
        headers: {},
        timeoutMs: 10_000
      }
    });

    const build = (draft: Parameters<typeof buildDataQueryRequest>[1]) =>
      buildDataQueryRequest(editor.getSnapshot(), draft);

    expect(problemCodes(build({
      connectionId: "connection-a",
      method: "POST",
      path: "/devices",
      parameters: []
    }))).toEqual(["post-read-only-required"]);

    expect(problemCodes(build({
      connectionId: "connection-a",
      path: "/devices",
      parameters: [{ name: "payload", type: "string", defaultValue: "x", location: "body" }]
    }))).toEqual(["parameter-location-invalid"]);

    expect(problemCodes(build({
      connectionId: "connection-a",
      path: "/devices",
      parameters: [{ name: "area", type: "string", defaultValue: "A", location: "path" }]
    }))).toEqual(["parameter-location-invalid"]);

    expect(problemCodes(build({
      connectionId: "connection-a",
      method: "POST",
      readOnly: true,
      path: "/devices",
      headers: { Authorization: "Bearer raw-secret", "x-api-key": "raw-secret" },
      parameters: []
    }))).toEqual(["header-reserved", "header-reserved"]);

    expect(problemCodes(build({
      connectionId: "connection-a",
      path: "/devices",
      parameters: [],
      successCondition: { path: [], equals: 0 }
    }))).toEqual(["success-condition-invalid"]);

    expect(problemCodes(build({
      connectionId: "connection-a",
      path: "/devices",
      parameters: [],
      successCondition: { path: [{ kind: "key", key: "code" }], equals: { nested: true } as never }
    }))).toEqual(["success-condition-invalid"]);
    editor.dispose();
  });

  it("keeps GET path/query encoding and typed 0, false, and empty values unchanged", () => {
    const editor = createEditor();
    editor.dispatch({
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

    const result = buildDataQueryRequest(editor.getSnapshot(), {
      connectionId: "connection-a",
      path: "/devices/{area}",
      parameters: [
        { name: "area", type: "string", defaultValue: "A/B" },
        { name: "offset", type: "number", defaultValue: 0 },
        { name: "enabled", type: "boolean", defaultValue: false },
        { name: "q", type: "string", defaultValue: "" }
      ]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a built request.");
    expect(result.summary.method).toBe("GET");
    expect(result.summary.body).toBeNull();
    expect(result.summary.readOnly).toBe(true);
    expect(result.summary.url).toBe(
      "https://api.example.test/v1/devices/A%2FB?offset=0&enabled=false&q="
    );
    expect(result.summary.parameters).toEqual({
      area: "A/B",
      offset: 0,
      enabled: false,
      q: ""
    });
    editor.dispose();
  });

  it("keeps the pre-POST GET request builder export working", () => {
    const editor = createEditor();
    editor.dispatch({
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

    const legacy = buildDataGetRequest(editor.getSnapshot(), {
      connectionId: "connection-a",
      path: "/devices/{area}",
      parameters: [{ name: "area", type: "string", defaultValue: "A" }]
    });

    expect(legacy.ok).toBe(true);
    if (!legacy.ok) throw new Error("Expected the legacy builder to succeed.");
    expect(legacy.summary.method).toBe("GET");
    expect(legacy.summary.url).toBe("https://api.example.test/v1/devices/A");
    editor.dispose();
  });

  it("validates API key connections and exposes their reference through the workspace model", () => {
    const editor = createEditor({
      credentials: [{ ref: "credential-zone", label: "Zone key", available: false }]
    });
    const missingHeader = buildSaveDataConnectionCommand(editor.getSnapshot(), {
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      auth: { kind: "api-key", credentialRef: "credential-zone", headerName: " " },
      headers: {},
      timeoutMs: 10_000
    });
    expect(missingHeader.ok).toBe(false);
    expect(!missingHeader.ok && missingHeader.problems.map((problem) => problem.code)).toEqual(["auth-invalid"]);

    const reservedHeader = buildSaveDataConnectionCommand(editor.getSnapshot(), {
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      auth: { kind: "api-key", credentialRef: "credential-zone", headerName: "X-Zone-Key" },
      headers: { "x-zone-key": "raw-secret" },
      timeoutMs: 10_000
    });
    expect(reservedHeader.ok).toBe(false);
    expect(!reservedHeader.ok && reservedHeader.problems.map((problem) => problem.code)).toEqual(["header-reserved"]);

    const saved = editor.dispatch({
      type: "create-data-connection",
      connection: {
        id: "connection-a",
        name: "Plant API",
        baseUrl: "https://api.example.test/v1",
        auth: { kind: "api-key", credentialRef: "credential-zone", headerName: "X-Zone-Key" },
        headers: { "X-Tenant": "plant-a" },
        timeoutMs: 10_000
      }
    });
    expect(saved.ok).toBe(true);
    const model = buildDataSourcesWorkspaceModel(editor.getSnapshot(), {
      credentials: editor.getDataCredentials()
    });
    expect(model.connections[0]).toMatchObject({
      authKind: "api-key",
      credentialRef: "credential-zone",
      credentialHeaderName: "X-Zone-Key",
      credentialLabel: "Zone key",
      credentialAvailable: false,
      missingCredential: true
    });
    expect(JSON.stringify(editor.serialize())).not.toContain("raw-secret");
    editor.dispose();
  });

  it("refuses connection auth changes that would reserve an existing query header", () => {
    const editor = createEditor();
    editor.dispatch({
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
    const query = buildSaveDataQueryCommand(editor.getSnapshot(), {
      connectionId: "connection-a",
      name: "Traced search",
      path: "/search",
      headers: { "X-Trace": "trace-1" },
      parameters: [],
      mapping: minimalMapping(),
      updatePolicy: { refreshIntervalMs: 5_000, maxAgeMs: 15_000 }
    });
    if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
    expect(editor.dispatch(query.command).ok).toBe(true);

    const auth = {
      kind: "api-key" as const,
      credentialRef: "credential-ops",
      headerName: "x-trace"
    };
    const update = buildSaveDataConnectionCommand(editor.getSnapshot(), {
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      auth,
      headers: {},
      timeoutMs: 10_000
    }, { connectionId: "connection-a" });
    expect(update.ok).toBe(false);
    expect(!update.ok && update.problems.map((problem) => problem.code)).toEqual(["header-reserved"]);
    expect(!update.ok && update.problems[0]?.field).toBe("auth");

    const history = editor.getHistoryState();
    const applied = editor.dispatch({
      type: "update-data-connection",
      connectionId: "connection-a",
      connection: {
        name: "Plant API",
        baseUrl: "https://api.example.test/v1",
        auth,
        headers: {},
        timeoutMs: 10_000
      }
    });
    expect(applied.ok).toBe(false);
    expect(editor.getSnapshot().dataSources.connections["connection-a"]?.auth).toEqual({ kind: "none" });
    expect(editor.getHistoryState()).toEqual(history);
    editor.dispose();
  });

  it("normalizes and persists POST request fields and the business success condition", () => {
    const editor = createEditor();
    editor.dispatch({
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

    const unconfirmed = buildSaveDataQueryCommand(editor.getSnapshot(), {
      connectionId: "connection-a",
      name: "Unconfirmed",
      method: "POST",
      path: "/search",
      parameters: [],
      mapping: minimalMapping(),
      updatePolicy: { refreshIntervalMs: 5_000, maxAgeMs: 15_000 }
    });
    expect(unconfirmed.ok).toBe(false);
    expect(!unconfirmed.ok && unconfirmed.problems.map((problem) => problem.code)).toEqual([
      "post-read-only-required"
    ]);

    const saved = buildSaveDataQueryCommand(editor.getSnapshot(), {
      connectionId: "connection-a",
      name: "Search",
      method: "POST",
      readOnly: true,
      path: "/search/{areaId}",
      headers: { "X-Trace": "trace-1" },
      parameters: [
        { name: "areaId", type: "string", defaultValue: "A" },
        { name: "tag", type: "string", defaultValue: "a b", location: "query" },
        { name: "enabled", type: "boolean", defaultValue: false, location: "body" }
      ],
      successCondition: { path: [{ kind: "key", key: "code" }], equals: 0 },
      mapping: minimalMapping(),
      updatePolicy: { refreshIntervalMs: 5_000, maxAgeMs: 15_000 }
    });
    if (!saved.ok) throw new Error(saved.problems.map((problem) => problem.message).join("\n"));
    expect(editor.dispatch(saved.command).ok).toBe(true);
    const query = Object.values(editor.getSnapshot().dataSources.queries)[0];
    expect(query).toMatchObject({
      method: "POST",
      readOnly: true,
      headers: { "X-Trace": "trace-1" },
      successCondition: { path: [{ kind: "key", key: "code" }], equals: 0 }
    });
    expect(query.parameters).toEqual([
      { name: "areaId", type: "string", defaultValue: "A", location: "path" },
      { name: "tag", type: "string", defaultValue: "a b", location: "query" },
      { name: "enabled", type: "boolean", defaultValue: false, location: "body" }
    ]);

    const roundTrip = createEditor({ snapshot: editor.serialize() });
    expect(Object.values(roundTrip.getSnapshot().dataSources.queries)[0]).toMatchObject({
      method: "POST",
      readOnly: true,
      headers: { "X-Trace": "trace-1" },
      successCondition: { path: [{ kind: "key", key: "code" }], equals: 0 }
    });
    roundTrip.dispose();
    editor.dispose();
  });

  it("allows a read-only POST to expire sooner than its unused polling interval", () => {
    const editor = createEditor();
    editor.dispatch({
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

    const post = buildSaveDataQueryCommand(editor.getSnapshot(), {
      connectionId: "connection-a",
      name: "Manual search",
      method: "POST",
      readOnly: true,
      path: "/search",
      parameters: [],
      mapping: minimalMapping(),
      updatePolicy: { refreshIntervalMs: 5_000, maxAgeMs: 1_000 }
    });
    expect(post.ok).toBe(true);

    const get = buildSaveDataQueryCommand(editor.getSnapshot(), {
      connectionId: "connection-a",
      name: "Polled search",
      method: "GET",
      path: "/search",
      parameters: [],
      mapping: minimalMapping(),
      updatePolicy: { refreshIntervalMs: 5_000, maxAgeMs: 1_000 }
    });
    expect(!get.ok && get.problems.map((problem) => problem.code)).toEqual(["update-policy-invalid"]);
    editor.dispose();
  });

  it("reports a malformed legacy v9 query path as validation instead of crashing", () => {
    const editor = createEditor();
    editor.dispatch({
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
    const saved = buildSaveDataQueryCommand(editor.getSnapshot(), {
      connectionId: "connection-a",
      name: "Legacy GET",
      path: "/pumps",
      parameters: [],
      mapping: minimalMapping(),
      updatePolicy: { refreshIntervalMs: 5_000, maxAgeMs: 15_000 }
    });
    if (!saved.ok) throw new Error(saved.problems.map((problem) => problem.message).join("\n"));
    editor.dispatch(saved.command);

    const malformed = JSON.parse(JSON.stringify(editor.serialize()));
    const query = Object.values(malformed.dataSources.queries)[0] as Record<string, unknown>;
    delete query.method;
    delete query.readOnly;
    delete query.headers;
    delete query.successCondition;
    query.path = 42;

    expect(() => createEditor({ snapshot: malformed })).toThrow(/path-invalid/);
    editor.dispose();
  });

  it("restores v9 queries saved before request fields and infers their parameter locations", () => {
    const editor = createEditor();
    editor.dispatch({
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
    const saved = buildSaveDataQueryCommand(editor.getSnapshot(), {
      connectionId: "connection-a",
      name: "Legacy GET",
      path: "/pumps/{areaId}",
      parameters: [
        { name: "areaId", type: "string", defaultValue: "A" },
        { name: "tag", type: "string", defaultValue: "a b" }
      ],
      mapping: minimalMapping(),
      updatePolicy: { refreshIntervalMs: 5_000, maxAgeMs: 15_000 }
    });
    if (!saved.ok) throw new Error(saved.problems.map((problem) => problem.message).join("\n"));
    editor.dispatch(saved.command);

    const legacy = JSON.parse(JSON.stringify(editor.serialize()));
    for (const query of Object.values(legacy.dataSources.queries) as Array<Record<string, unknown>>) {
      delete query.method;
      delete query.readOnly;
      delete query.headers;
      delete query.successCondition;
      for (const parameter of query.parameters as Array<Record<string, unknown>>) {
        delete parameter.location;
      }
    }
    const restored = createEditor({ snapshot: legacy });
    const query = Object.values(restored.getSnapshot().dataSources.queries)[0];
    expect(query).toMatchObject({ method: "GET", readOnly: true, headers: {}, successCondition: null });
    expect(query.parameters).toEqual([
      { name: "areaId", type: "string", defaultValue: "A", location: "path" },
      { name: "tag", type: "string", defaultValue: "a b", location: "query" }
    ]);
    restored.dispose();
    editor.dispose();
  });
});

function minimalMapping(): DataQueryMapping {
  return {
    mode: "single",
    root: [],
    identity: { kind: "literal", value: "device-1" },
    displayName: null,
    properties: [{
      key: "value",
      label: "Value",
      type: "number",
      nullable: false,
      unit: null,
      source: [{ kind: "key", key: "value" }],
      transform: { kind: "number" },
      range: null,
      allowed: null
    }],
    observedAt: null,
    sourceQuality: null
  };
}

function problemCodes(result: ReturnType<typeof buildDataQueryRequest>): string[] {
  return result.ok ? [] : result.problems.map((problem) => problem.code);
}
