import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDataSourcesWorkspaceModel,
  buildDeleteDataConnectionCommand,
  buildDuplicateDataConnectionCommand,
  buildSaveDataConnectionCommand,
  buildWorkbenchModel,
  createEditor,
  createEmptySnapshot,
  filterDataConnectionItems,
  validateDataConnectionDraft,
  validateSceneSnapshot,
  type DataConnectionDraft,
  type DataConnectionProblemCode,
  type SerializedSceneSnapshot
} from "../index";

const BASE_CONNECTION = {
  name: "Plant API",
  baseUrl: "https://api.example.test/v1/",
  auth: { kind: "none" as const },
  headers: {},
  timeoutMs: 10_000
} satisfies DataConnectionDraft;

describe("data source connections", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a default editor empty and offline", () => {
    const editor = createEditor();
    const restored = createEditor({ snapshot: editor.serialize() });

    expect(editor.getSnapshot().version).toBe(9);
    expect(editor.getSnapshot().dataSources).toEqual({ connections: {}, queries: {}, bindings: {} });
    expect(restored.getSnapshot().dataSources).toEqual({ connections: {}, queries: {}, bindings: {} });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    editor.dispose();
    restored.dispose();
  });

  it("creates a connection as one history entry and round-trips it", () => {
    const editor = createEditor();
    const result = editor.dispatch({
      type: "create-data-connection",
      connection: { id: "connection-api", ...BASE_CONNECTION, name: "  Plant API  " }
    });

    expect(result.ok).toBe(true);
    expect(editor.getSnapshot().dataSources.connections["connection-api"]).toEqual({
      id: "connection-api",
      ...BASE_CONNECTION,
      name: "Plant API",
      baseUrl: "https://api.example.test/v1"
    });
    expect(editor.getHistoryState()).toEqual({ undoCount: 1, redoCount: 0 });

    const serialized = editor.serialize();
    const restored = createEditor({ snapshot: serialized });
    expect(restored.getSnapshot().dataSources).toEqual(editor.getSnapshot().dataSources);

    expect(editor.undo().ok).toBe(true);
    expect(editor.getSnapshot().dataSources.connections).toEqual({});
    expect(editor.redo().ok).toBe(true);
    expect(editor.getSnapshot().dataSources.connections["connection-api"]?.name).toBe("Plant API");
    editor.dispose();
    restored.dispose();
  });

  it.each<{
    label: string;
    draft: DataConnectionDraft;
    code: DataConnectionProblemCode;
  }>([
    { label: "empty name", draft: { ...BASE_CONNECTION, name: "   " }, code: "name-required" },
    { label: "relative URL", draft: { ...BASE_CONNECTION, baseUrl: "/api" }, code: "base-url-invalid" },
    { label: "non-HTTP URL", draft: { ...BASE_CONNECTION, baseUrl: "ftp://api.example.test" }, code: "base-url-invalid" },
    { label: "URL credentials", draft: { ...BASE_CONNECTION, baseUrl: "https://user:secret@api.example.test" }, code: "base-url-credentials" },
    { label: "URL query secret", draft: { ...BASE_CONNECTION, baseUrl: "https://api.example.test?api_key=secret" }, code: "base-url-query" },
    { label: "zero timeout", draft: { ...BASE_CONNECTION, timeoutMs: 0 }, code: "timeout-invalid" },
    { label: "negative timeout", draft: { ...BASE_CONNECTION, timeoutMs: -5 }, code: "timeout-invalid" },
    { label: "fractional timeout", draft: { ...BASE_CONNECTION, timeoutMs: 10.5 }, code: "timeout-invalid" },
    { label: "bearer without credential", draft: { ...BASE_CONNECTION, auth: { kind: "bearer", credentialRef: "  " } }, code: "credential-required" }
  ])("rejects $label without changing snapshot or history", ({ draft, code }) => {
    const editor = createEditor();
    editor.dispatch({ type: "create-data-connection", connection: { id: "connection-existing", ...BASE_CONNECTION } });
    const before = editor.serialize();
    const history = editor.getHistoryState();

    const result = editor.dispatch({
      type: "create-data-connection",
      connection: { id: "connection-new", ...BASE_CONNECTION, ...draft }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain(code);
    expect(editor.serialize()).toEqual(before);
    expect(editor.getHistoryState()).toEqual(history);
    editor.dispose();
  });

  it("rejects duplicate names case-insensitively on create and update", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-data-connection", connection: { id: "connection-a", ...BASE_CONNECTION } });

    const duplicate = editor.dispatch({
      type: "create-data-connection",
      connection: { id: "connection-b", ...BASE_CONNECTION, name: "plant api", baseUrl: "https://other.example.test" }
    });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.error).toContain("name-duplicate");

    editor.dispatch({ type: "create-data-connection", connection: { id: "connection-b", ...BASE_CONNECTION, name: "Other API", baseUrl: "https://other.example.test" } });
    const update = editor.dispatch({
      type: "update-data-connection",
      connectionId: "connection-b",
      connection: { ...BASE_CONNECTION, name: "PLANT API" }
    });
    expect(update.ok).toBe(false);
    expect(update.error).toContain("name-duplicate");

    expect(editor.getSnapshot().dataSources.connections["connection-a"].name).toBe("Plant API");
    expect(editor.getSnapshot().dataSources.connections["connection-b"].name).toBe("Other API");
    editor.dispose();
  });

  it("updates a connection atomically and restores it through undo and redo", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-data-connection", connection: { id: "connection-a", ...BASE_CONNECTION } });
    const update = editor.dispatch({
      type: "update-data-connection",
      connectionId: "connection-a",
      connection: {
        ...BASE_CONNECTION,
        name: "Plant API v2",
        auth: { kind: "bearer", credentialRef: "credential-ops" },
        timeoutMs: 15_000
      }
    });

    expect(update.ok).toBe(true);
    expect(editor.getSnapshot().dataSources.connections["connection-a"]).toMatchObject({
      id: "connection-a",
      name: "Plant API v2",
      auth: { kind: "bearer", credentialRef: "credential-ops" },
      timeoutMs: 15_000
    });
    expect(editor.getHistoryState()).toEqual({ undoCount: 2, redoCount: 0 });
    expect(createEditor({ snapshot: editor.serialize() }).getSnapshot().dataSources.connections["connection-a"].name).toBe("Plant API v2");

    editor.undo();
    expect(editor.getSnapshot().dataSources.connections["connection-a"].name).toBe("Plant API");
    editor.redo();
    expect(editor.getSnapshot().dataSources.connections["connection-a"].name).toBe("Plant API v2");
    editor.dispose();
  });

  it("duplicates a connection with a new id and unique name without copying queries", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-data-connection", connection: { id: "connection-a", ...BASE_CONNECTION } });

    const first = editor.dispatch({ type: "duplicate-data-connection", connectionId: "connection-a", id: "connection-b" });
    expect(first.ok).toBe(true);
    expect(editor.getSnapshot().dataSources.connections["connection-b"]).toMatchObject({
      name: "Plant API copy",
      baseUrl: "https://api.example.test/v1"
    });

    const second = editor.dispatch({ type: "duplicate-data-connection", connectionId: "connection-a", id: "connection-c" });
    expect(second.ok).toBe(true);
    expect(editor.getSnapshot().dataSources.connections["connection-c"]?.name).toBe("Plant API copy 2");
    expect(editor.getSnapshot().dataSources.queries).toEqual({});
    expect(editor.getHistoryState()).toEqual({ undoCount: 3, redoCount: 0 });

    editor.undo();
    expect(Object.keys(editor.getSnapshot().dataSources.connections).sort()).toEqual(["connection-a", "connection-b"]);
    editor.dispose();
  });

  it("deletes unreferenced connections and blocks referenced ones", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-data-connection", connection: { id: "connection-a", ...BASE_CONNECTION } });
    const deleted = editor.dispatch({ type: "delete-data-connection", connectionId: "connection-a" });
    expect(deleted.ok).toBe(true);
    expect(editor.getSnapshot().dataSources.connections).toEqual({});
    editor.undo();
    expect(editor.getSnapshot().dataSources.connections["connection-a"]).toBeTruthy();

    const referenced: SerializedSceneSnapshot = {
      ...editor.serialize(),
      dataSources: {
        ...editor.getSnapshot().dataSources,
        queries: {
          "query-devices": {
            id: "query-devices",
            connectionId: "connection-a",
            name: "Devices"
          }
        }
      }
    };
    editor.restore(referenced);
    const before = editor.serialize();
    const blocked = editor.dispatch({ type: "delete-data-connection", connectionId: "connection-a" });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toContain("connection-in-use");
    expect(editor.serialize()).toEqual(before);
    editor.dispose();
  });

  it("builds save, duplicate, and delete commands with field-level problems", () => {
    const editor = createEditor();
    const snapshot = editor.getSnapshot();
    const invalid = buildSaveDataConnectionCommand(snapshot, { ...BASE_CONNECTION, name: "" });
    expect(invalid.ok).toBe(false);
    expect(!invalid.ok && invalid.problems.map((problem) => problem.code)).toEqual(["name-required"]);

    const create = buildSaveDataConnectionCommand(snapshot, { id: "connection-a", ...BASE_CONNECTION });
    expect(create.ok && create.command.type).toBe("create-data-connection");
    if (!create.ok) throw new Error("Expected a create command.");
    editor.dispatch(create.command);

    const update = buildSaveDataConnectionCommand(editor.getSnapshot(), { ...BASE_CONNECTION, name: "Plant API 2" }, { connectionId: "connection-a" });
    expect(update.ok && update.command.type).toBe("update-data-connection");

    const duplicate = buildDuplicateDataConnectionCommand(editor.getSnapshot(), "connection-a", { name: "Plant API copy" });
    expect(duplicate.ok && duplicate.command.type).toBe("duplicate-data-connection");

    const remove = buildDeleteDataConnectionCommand(editor.getSnapshot(), "connection-a");
    expect(remove.ok && remove.command.type).toBe("delete-data-connection");
    editor.dispose();
  });

  it("keeps credential descriptions in host capabilities, never in the snapshot", () => {
    const editor = createEditor({
      credentials: [
        { ref: "credential-ops", label: "Operations token", available: true },
        { ref: "credential-retired", label: "Retired token", available: false }
      ]
    });

    expect(editor.getDataCredentials()).toEqual([
      { ref: "credential-ops", label: "Operations token", available: true },
      { ref: "credential-retired", label: "Retired token", available: false }
    ]);
    expect(JSON.stringify(editor.serialize())).not.toContain("Operations token");
    expect(editor.dispatch({
      type: "create-data-connection",
      connection: { id: "connection-a", ...BASE_CONNECTION, auth: { kind: "bearer", credentialRef: "credential-missing" } }
    }).ok).toBe(true);
    expect(JSON.stringify(editor.serialize())).not.toContain("credential-retired");
    editor.dispose();
  });

  it("reports connection usage, credential availability, and searchable fields", () => {
    const editor = createEditor({
      credentials: [
        { ref: "credential-ops", label: "Operations token", available: true },
        { ref: "credential-retired", label: "Retired token", available: false }
      ]
    });
    editor.dispatch({ type: "create-data-connection", connection: { id: "connection-a", ...BASE_CONNECTION, name: "Zone A", auth: { kind: "bearer", credentialRef: "credential-ops" } } });
    editor.dispatch({ type: "create-data-connection", connection: { id: "connection-b", ...BASE_CONNECTION, name: "Zone B", baseUrl: "https://zone-b.example.test", auth: { kind: "bearer", credentialRef: "credential-retired" } } });
    editor.dispatch({ type: "create-data-connection", connection: { id: "connection-c", ...BASE_CONNECTION, name: "Zone C", baseUrl: "https://zone-c.example.test" } });

    const model = buildDataSourcesWorkspaceModel(editor.getSnapshot(), { credentials: editor.getDataCredentials() });
    expect(model.totalCount).toBe(3);
    expect(model.empty).toBe(false);
    expect(model.connections.map((connection) => connection.name)).toEqual(["Zone A", "Zone B", "Zone C"]);
    expect(model.connections[0]).toMatchObject({ credentialLabel: "Operations token", credentialAvailable: true, missingCredential: false, queryCount: 0, referenced: false });
    expect(model.connections[1]).toMatchObject({ credentialLabel: "Retired token", credentialAvailable: false, missingCredential: true });
    expect(model.connections[2]).toMatchObject({ credentialLabel: null, credentialAvailable: null, missingCredential: false });
    expect(model.missingCredentialCount).toBe(1);
    expect(filterDataConnectionItems(model.connections, { query: "Retired token" }).map((connection) => connection.name)).toEqual(["Zone B"]);
    expect(filterDataConnectionItems(model.connections, { query: "zone-c" }).map((connection) => connection.name)).toEqual(["Zone C"]);
    expect(filterDataConnectionItems(model.connections, { query: "nothing" })).toEqual([]);
    editor.dispose();
  });

  it("exposes the connection workspace through the framework-neutral workbench model", () => {
    const editor = createEditor({
      credentials: [{ ref: "credential-ops", label: "Operations token", available: true }]
    });
    editor.dispatch({
      type: "create-data-connection",
      connection: {
        id: "connection-a",
        ...BASE_CONNECTION,
        auth: { kind: "bearer", credentialRef: "credential-ops" }
      }
    });

    const model = buildWorkbenchModel(editor.getSnapshot(), { dataCredentials: editor.getDataCredentials() });

    expect(model.dataSources.totalCount).toBe(1);
    expect(model.dataSources.connections[0]).toMatchObject({
      name: "Plant API",
      credentialLabel: "Operations token",
      credentialAvailable: true,
      referenced: false
    });
    editor.dispose();
  });

  it("returns field-level draft validation results with normalized values", () => {
    const editor = createEditor();
    const validated = validateDataConnectionDraft(editor.getSnapshot(), {
      ...BASE_CONNECTION,
      name: "  Plant API ",
      baseUrl: "https://api.example.test/v1/",
      headers: { "X-Client": "editor" }
    });

    expect(validated.ok).toBe(true);
    expect(validated.value).toEqual({
      ...BASE_CONNECTION,
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      headers: { "X-Client": "editor" }
    });
    expect(validateDataConnectionDraft(editor.getSnapshot(), {
      ...BASE_CONNECTION,
      headers: { Authorization: "secret" }
    }).problems.map((problem) => problem.code)).toEqual(["header-reserved"]);
    editor.dispose();
  });

  it("validates closed connection fields and references through the snapshot entry", () => {
    const base = createEmptySnapshot("scene-a");
    const connection = {
      id: "connection-a",
      ...BASE_CONNECTION,
      baseUrl: "https://api.example.test/v1"
    };
    const valid = {
      ...base,
      dataSources: {
        connections: { "connection-a": connection },
        queries: {},
        bindings: {}
      }
    };
    expect(validateSceneSnapshot(valid)).toEqual({ ok: true, errors: [] });

    const { dataSources: _missingDataSources, ...withoutDataSources } = base;
    expect(validateSceneSnapshot(withoutDataSources).ok).toBe(false);

    const missingAuth = {
      ...valid,
      dataSources: {
        ...valid.dataSources,
        connections: { "connection-a": { ...connection, auth: undefined } }
      }
    };
    expect(validateSceneSnapshot(missingAuth).ok).toBe(false);

    const duplicateNames = {
      ...valid,
      dataSources: {
        ...valid.dataSources,
        connections: {
          ...valid.dataSources.connections,
          "connection-b": {
            ...connection,
            id: "connection-b",
            name: "plant api",
            baseUrl: "https://b.example.test"
          }
        }
      }
    };
    expect(validateSceneSnapshot(duplicateNames).ok).toBe(false);
    expect(validateSceneSnapshot(duplicateNames).errors.join("\n")).toContain("name-duplicate");

    const reservedHeader = {
      ...valid,
      dataSources: {
        ...valid.dataSources,
        connections: {
          "connection-a": { ...connection, headers: { Authorization: "secret" } }
        }
      }
    };
    expect(validateSceneSnapshot(reservedHeader).ok).toBe(false);
    expect(validateSceneSnapshot(reservedHeader).errors.join("\n")).toContain("header-reserved");

    const invalidQueryReference = {
      ...valid,
      dataSources: {
        ...valid.dataSources,
        queries: {
          "query-a": { id: "query-a", connectionId: "connection-missing", name: "Devices" }
        }
      }
    };
    expect(validateSceneSnapshot(invalidQueryReference).ok).toBe(false);

    const invalidBindingTarget = {
      ...valid,
      dataSources: {
        ...valid.dataSources,
        queries: {
          "query-a": { id: "query-a", connectionId: "connection-a", name: "Devices" }
        },
        bindings: {
          "object-missing": { objectNodeId: "object-missing", queryId: "query-a" }
        }
      }
    };
    const bindingErrors = validateSceneSnapshot(invalidBindingTarget);
    expect(bindingErrors.ok).toBe(false);
    expect(bindingErrors.errors.join("\n")).toContain("existing object node");
  });

  it("migrates v1-v8 snapshots to an empty data domain", () => {
    const { dataSources: _dataSources, ...v8 } = createEmptySnapshot("scene-a");
    const editor = createEditor({ snapshot: { ...v8, version: 8 } });

    expect(editor.getSnapshot().version).toBe(9);
    expect(editor.getSnapshot().dataSources).toEqual({ connections: {}, queries: {}, bindings: {} });
    editor.dispose();
  });
});
