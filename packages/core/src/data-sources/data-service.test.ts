import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEditor,
  createEmptySnapshot,
  type DataConnectionAuth,
  type DataCredentialDescriptor,
  type DataQueryDraft,
  type DataRequestDescriptor,
  type DataRequestExecutor,
  type DataResponseDescriptor,
  type EditorDataService
} from "../index";

describe("Editor data service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("executes a GET draft through the injected host executor without touching durable state", async () => {
    const requests: DataRequestDescriptor[] = [];
    const executor: DataRequestExecutor = async (request) => {
      requests.push(request);
      return {
        status: 200,
        contentType: "application/json; charset=utf-8",
        headers: { "X-Fixture": "plant-a" },
        body: "{\"ok\":true,\"items\":[1]}"
      };
    };
    const editor = createEditor({
      executor,
      snapshot: {
        ...createEmptySnapshot("scene-a"),
        dataSources: {
          connections: {
            "connection-a": {
              id: "connection-a",
              name: "Plant API",
              baseUrl: "https://api.example.test/v1",
              auth: { kind: "none" },
              headers: { "X-Tenant": "plant-a" },
              timeoutMs: 12_000
            }
          },
          queries: {},
          bindings: {}
        }
      }
    });
    const before = editor.serialize();
    const history = editor.getHistoryState();
    const service = editor.getDataService?.();
    expect(service).toBeTruthy();
    const statuses: string[] = [];
    const unsubscribe = service!.subscribe((state) => statuses.push(state.run?.status ?? "none"));

    const handle = service!.executeQueryDraft({
      connectionId: "connection-a",
      path: "/devices/{deviceId}/events",
      parameters: [
        { name: "deviceId", type: "string", defaultValue: "pump 1" },
        { name: "include", type: "boolean" }
      ]
    }, { overrides: { include: true } });
    const result = await handle.result;

    expect(result.status).toBe("success");
    expect(result.current).toBe(true);
    expect(result.configRevision).toBe(0);
    expect(result.problems).toEqual([]);
    expect(result.request).toMatchObject({
      method: "GET",
      url: "https://api.example.test/v1/devices/pump%201/events?include=true",
      headers: { "X-Tenant": "plant-a" },
      credentialRef: null,
      timeoutMs: 12_000
    });
    expect(result.response).toMatchObject({
      status: 200,
      ok: true,
      contentType: "application/json; charset=utf-8",
      headers: { "X-Fixture": "plant-a" },
      bodyText: "{\"ok\":true,\"items\":[1]}",
      bodyKind: "json",
      json: { ok: true, items: [1] }
    });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "GET",
      url: "https://api.example.test/v1/devices/pump%201/events?include=true",
      headers: { "X-Tenant": "plant-a" },
      credentialRef: null,
      timeoutMs: 12_000
    });
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
    expect(statuses).toEqual(["running", "success"]);
    expect(service!.getState()).toMatchObject({
      executorAvailable: true,
      configRevision: 0,
      run: { status: "success", configRevision: 0 }
    });
    expect(editor.serialize()).toEqual(before);
    expect(editor.getHistoryState()).toEqual(history);
    expect(editor.getSnapshot().dataSources.queries).toEqual({});
    expect(globalThis.fetch).not.toHaveBeenCalled();

    unsubscribe();
    editor.dispose();
  });

  it("reports a locatable executor problem and never falls back to fetch", async () => {
    const { editor, service, draft } = createDataEditor();

    const result = await service.executeQueryDraft(draft).result;

    expect(result.status).toBe("error");
    expect(result.problems).toEqual([
      expect.objectContaining({ code: "executor-unavailable", field: "executor", connectionId: "connection-a" })
    ]);
    expect(result.request?.url).toBe("https://api.example.test/v1/devices");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    editor.dispose();
  });

  it("requires an available host credential for bearer connections", async () => {
    const requests: DataRequestDescriptor[] = [];
    const executor = vi.fn<DataRequestExecutor>(async (request) => {
      requests.push(request);
      return okResponse();
    });
    const missing = createDataEditor({
      executor,
      auth: { kind: "bearer", credentialRef: "credential-missing" }
    });

    const rejected = await missing.service.executeQueryDraft(missing.draft).result;

    expect(rejected.status).toBe("error");
    expect(rejected.problems).toEqual([
      expect.objectContaining({
        code: "credential-unavailable",
        field: "credential",
        credentialRef: "credential-missing"
      })
    ]);
    expect(executor).not.toHaveBeenCalled();
    missing.editor.dispose();

    const available = createDataEditor({
      executor,
      auth: { kind: "bearer", credentialRef: "credential-ops" },
      credentials: [{ ref: "credential-ops", label: "Operations token", available: true }]
    });
    const result = await available.service.executeQueryDraft(available.draft).result;

    expect(result.status).toBe("success");
    expect(requests[0].credentialRef).toBe("credential-ops");
    expect(Object.keys(requests[0].headers).map((name) => name.toLowerCase())).not.toContain("authorization");
    expect(JSON.stringify(available.service.getState())).not.toContain("Operations token");
    expect(JSON.stringify(available.editor.serialize())).not.toContain("Operations token");
    available.editor.dispose();
  });

  it("times out, aborts the signal, and reports elapsed time", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const executor: DataRequestExecutor = (request) => {
      signal = request.signal;
      return new Promise<DataResponseDescriptor>(() => {});
    };
    const { editor, service, draft } = createDataEditor({ executor, timeoutMs: 250 });

    const handle = service.executeQueryDraft(draft);
    await vi.advanceTimersByTimeAsync(250);
    const result = await handle.result;

    expect(signal?.aborted).toBe(true);
    expect(result.status).toBe("error");
    expect(result.problems.map((problem) => problem.code)).toEqual(["request-timeout"]);
    expect(result.elapsedMs).toBe(250);
    expect(service.getState().run).toMatchObject({ status: "error", elapsedMs: 250 });
    editor.dispose();
  });

  it.each([
    ["/devices/{id}/events", "."],
    ["/devices/{id}/events", ".."],
    ["/devices/%2e{id}/events", "."],
    ["/devices/{id}%2E/events", "."]
  ])("rejects a dot segment formed by %s with parameter %s before execution", async (path, value) => {
    const requests: DataRequestDescriptor[] = [];
    const context = createDataEditor({
      executor: (request) => {
        requests.push(request);
        return okResponse();
      }
    });

    const result = await context.service.executeQueryDraft({
      ...context.draft,
      path,
      parameters: [{ name: "id", type: "string", defaultValue: value }]
    }).result;

    expect(result.status).toBe("error");
    expect(result.problems).toEqual([
      expect.objectContaining({ code: "path-traversal", field: "path", connectionId: "connection-a" })
    ]);
    expect(requests).toEqual([]);
    context.editor.dispose();
  });

  it.each(["cancel", "invalidate", "dispose"] as const)(
    "does not start an executor or timeout after a running subscriber requests %s",
    async (action) => {
      vi.useFakeTimers();
      const requests: DataRequestDescriptor[] = [];
      const context = createDataEditor({
        executor: (request) => {
          requests.push(request);
          return new Promise<DataResponseDescriptor>(() => {});
        }
      });
      context.service.subscribe((state) => {
        if (state.run?.status !== "running") return;
        if (action === "cancel") context.service.cancelQueryRun(state.run.id);
        if (action === "invalidate") context.service.invalidateQueryRuns();
        if (action === "dispose") context.editor.dispose();
      });

      const result = await context.service.executeQueryDraft(context.draft).result;

      expect(result.status).toBe(action === "cancel" ? "cancelled" : "stale");
      expect(requests).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
      context.editor.dispose();
    }
  );

  it("cancels a run and ignores a late response that the host still delivers", async () => {
    let signal: AbortSignal | undefined;
    let deliver!: (response: DataResponseDescriptor) => void;
    const executor: DataRequestExecutor = (request) => {
      signal = request.signal;
      return new Promise<DataResponseDescriptor>((resolve) => {
        deliver = resolve;
      });
    };
    const { editor, service, draft } = createDataEditor({ executor });

    const handle = service.executeQueryDraft(draft);
    expect(service.cancelQueryRun(handle.id)).toBe(true);
    const result = await handle.result;

    expect(signal?.aborted).toBe(true);
    expect(result.status).toBe("cancelled");
    expect(result.current).toBe(true);
    expect(result.problems.map((problem) => problem.code)).toEqual(["request-aborted"]);
    expect(service.getState().run).toMatchObject({ status: "cancelled", response: null });

    deliver({ status: 200, body: "{\"late\":true}" });
    await flushPromises();
    expect(service.getState().run).toMatchObject({ status: "cancelled", response: null });
    expect(service.cancelQueryRun(handle.id)).toBe(false);
    editor.dispose();
  });

  it("treats draft invalidation and disposal as stale even when the executor ignores abort", async () => {
    let deliver!: (response: DataResponseDescriptor) => void;
    const executor: DataRequestExecutor = () => new Promise<DataResponseDescriptor>((resolve) => {
      deliver = resolve;
    });
    const { editor, service, draft } = createDataEditor({ executor });

    const invalidated = service.executeQueryDraft(draft);
    service.invalidateQueryRuns();
    const stale = await invalidated.result;
    expect(stale.status).toBe("stale");
    expect(stale.current).toBe(false);
    expect(service.getState().run).toBeNull();

    deliver({ status: 200, body: "{\"late\":true}" });
    await flushPromises();
    expect(service.getState().run).toBeNull();

    const disposed = service.executeQueryDraft(draft);
    editor.dispose();
    const disposedResult = await disposed.result;
    expect(disposedResult.status).toBe("stale");
    expect(disposedResult.current).toBe(false);
    expect(service.disposed).toBe(true);
    expect(service.getState().run).toBeNull();

    deliver({ status: 200, body: "{\"late\":true}" });
    await flushPromises();
    expect(service.getState().run).toBeNull();
  });

  it("invalidates results and stamps a new config revision when connection configuration changes", async () => {
    let deliver!: (response: DataResponseDescriptor) => void;
    const { editor, service, draft } = createDataEditor({
      executor: () => new Promise<DataResponseDescriptor>((resolve) => {
        deliver = resolve;
      })
    });
    const first = service.executeQueryDraft(draft);
    deliver(okResponse());
    const firstResult = await first.result;
    expect(firstResult.status).toBe("success");
    expect(firstResult.configRevision).toBe(0);

    editor.dispatch({
      type: "update-data-connection",
      connectionId: "connection-a",
      connection: {
        name: "Plant API v2",
        baseUrl: "https://api.example.test/v2",
        auth: { kind: "none" },
        headers: {},
        timeoutMs: 10_000
      }
    });
    expect(service.getState()).toMatchObject({ configRevision: 1, run: null });

    const second = service.executeQueryDraft(draft);
    deliver(okResponse());
    const secondResult = await second.result;
    expect(secondResult.status).toBe("success");
    expect(secondResult.configRevision).toBe(1);
    expect(secondResult.request?.url).toBe("https://api.example.test/v2/devices");
    editor.dispose();
  });

  it("invalidates a pending draft when a query changes on the same connection", async () => {
    let deliver!: (response: DataResponseDescriptor) => void;
    const context = createDataEditor({
      executor: () => new Promise<DataResponseDescriptor>((resolve) => {
        deliver = resolve;
      })
    });
    const handle = context.service.executeQueryDraft(context.draft);

    expect(context.editor.dispatch({
      type: "create-data-query",
      query: {
        connectionId: "connection-a",
        name: "Saved query",
        path: "/saved",
        parameters: [],
        mapping: {
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
        },
        updatePolicy: { refreshIntervalMs: 5_000, maxAgeMs: 15_000 }
      }
    }).ok).toBe(true);

    expect(await handle.result).toMatchObject({ status: "stale", current: false });
    expect(context.service.getState().run).toBeNull();
    deliver(okResponse());
    await flushPromises();
    expect(context.service.getState().run).toBeNull();
    context.editor.dispose();
  });

  it.each(["running", "success"] as const)("preserves a %s run when an unrelated connection changes", async (status) => {
    const requests: DataRequestDescriptor[] = [];
    let deliver!: (response: DataResponseDescriptor) => void;
    const context = createDataEditor({
      executor: (request) => {
        requests.push(request);
        return new Promise<DataResponseDescriptor>((resolve) => {
          deliver = resolve;
        });
      }
    });
    expect(context.editor.dispatch({
      type: "create-data-connection",
      connection: {
        ...context.editor.getSnapshot().dataSources.connections["connection-a"],
        id: "connection-b",
        name: "Other API"
      }
    }).ok).toBe(true);
    const handle = context.service.executeQueryDraft(context.draft);
    if (status === "success") {
      deliver(okResponse());
      await handle.result;
    }
    const run = context.service.getState().run;

    expect(context.editor.dispatch({
      type: "update-data-connection",
      connectionId: "connection-b",
      connection: {
        ...context.editor.getSnapshot().dataSources.connections["connection-b"],
        baseUrl: "https://other.example.test/v2"
      }
    }).ok).toBe(true);
    expect(context.service.getState().run).toEqual(run);
    context.editor.undo();
    expect(context.service.getState().run).toEqual(run);
    context.editor.redo();
    expect(context.service.getState().run).toEqual(run);
    expect(context.service.getState().configRevision).toBe(handle.configRevision + 3);
    expect(requests[0].signal.aborted).toBe(false);

    if (status === "running") deliver(okResponse());
    expect(await handle.result).toMatchObject({
      status: "success",
      current: true,
      configRevision: handle.configRevision
    });
    context.editor.dispose();
  });

  it.each(["update", "delete"] as const)("invalidates an in-flight run on a related connection %s", async (action) => {
    const requests: DataRequestDescriptor[] = [];
    let deliver!: (response: DataResponseDescriptor) => void;
    const context = createDataEditor({
      executor: (request) => {
        requests.push(request);
        return new Promise<DataResponseDescriptor>((resolve) => {
          deliver = resolve;
        });
      }
    });
    const handle = context.service.executeQueryDraft(context.draft);

    expect(context.editor.dispatch(action === "delete" ? {
      type: "delete-data-connection",
      connectionId: "connection-a"
    } : {
      type: "update-data-connection",
      connectionId: "connection-a",
      connection: {
        ...context.editor.getSnapshot().dataSources.connections["connection-a"],
        baseUrl: "https://api.example.test/v2"
      }
    }).ok).toBe(true);

    expect(await handle.result).toMatchObject({ status: "stale", current: false });
    expect(requests[0].signal.aborted).toBe(true);
    expect(context.service.getState().run).toBeNull();
    deliver(okResponse());
    await flushPromises();
    expect(context.service.getState().run).toBeNull();
    context.editor.dispose();
  });

  it.each([
    {
      label: "HTTP failure",
      response: { status: 503, contentType: "application/json", body: "{\"error\":\"down\"}" },
      status: "error",
      codes: ["response-http"],
      bodyKind: "json"
    },
    {
      label: "non-JSON content type",
      response: { status: 200, contentType: "text/plain", body: "not-json" },
      status: "error",
      codes: ["response-not-json"],
      bodyKind: "text"
    },
    {
      label: "JSON parse failure",
      response: { status: 200, contentType: "application/json", body: "{not-json" },
      status: "error",
      codes: ["response-json-invalid"],
      bodyKind: "text"
    },
    {
      label: "204 response",
      response: { status: 204, body: "" },
      status: "success",
      codes: [],
      bodyKind: "empty"
    },
    {
      label: "successful empty body",
      response: { status: 200, contentType: "application/json", body: "  " },
      status: "success",
      codes: [],
      bodyKind: "empty"
    }
  ])("reports $label responses without losing raw text", async ({ response, status, codes, bodyKind }) => {
    const { editor, service, draft } = createDataEditor({
      executor: async () => response
    });

    const result = await service.executeQueryDraft(draft).result;

    expect(result.status).toBe(status);
    expect(result.problems.map((problem) => problem.code)).toEqual(codes);
    expect(result.response).toMatchObject({
      status: response.status,
      bodyText: response.body,
      bodyKind
    });
    editor.dispose();
  });

  it("executes a read-only POST with typed body values, overridden query headers, and api key by reference", async () => {
    const requests: DataRequestDescriptor[] = [];
    const executor: DataRequestExecutor = async (request) => {
      requests.push(request);
      return {
        status: 200,
        contentType: "application/json",
        body: "{\"code\":0,\"items\":[{\"value\":\"7\"}]}"
      };
    };
    const { editor, service } = createDataEditor({
      executor,
      auth: { kind: "api-key", credentialRef: "credential-ops", headerName: "X-Api-Key" },
      credentials: [{ ref: "credential-ops", label: "Operations key", available: true }],
      headers: { "X-Tenant": "plant-a", "X-Source": "connection" }
    });

    const result = await service.executeQueryDraft({
      connectionId: "connection-a",
      method: "POST",
      readOnly: true,
      path: "/search/{area}",
      headers: { "x-tenant": "override", "X-Trace": "trace-1" },
      parameters: [
        { name: "area", type: "string", defaultValue: "A", location: "path" },
        { name: "tag", type: "string", defaultValue: "a b", location: "query" },
        { name: "limit", type: "number", defaultValue: 0, location: "body" },
        { name: "include", type: "boolean", defaultValue: false, location: "body" }
      ],
      successCondition: { path: [{ kind: "key", key: "code" }], equals: 0 }
    }).result;

    expect(result.status).toBe("success");
    expect(result.request).toMatchObject({
      method: "POST",
      readOnly: true,
      url: "https://api.example.test/v1/search/A?tag=a+b",
      body: { limit: 0, include: false },
      auth: { kind: "api-key", credentialRef: "credential-ops", headerName: "X-Api-Key" },
      credentialRef: "credential-ops"
    });
    expect(result.request?.headers).toEqual({
      "X-Source": "connection",
      "x-tenant": "override",
      "X-Trace": "trace-1",
      "Content-Type": "application/json"
    });
    expect(requests[0]).toMatchObject({
      method: "POST",
      body: { limit: 0, include: false },
      auth: { kind: "api-key", credentialRef: "credential-ops", headerName: "X-Api-Key" },
      maxResponseBytes: expect.any(Number)
    });
    expect(JSON.stringify(result.request)).not.toContain("Operations key");
    expect(JSON.stringify(editor.serialize())).not.toContain("Operations key");
    editor.dispose();
  });

  it("distinguishes business failure, response limits, and missing api key credentials", async () => {
    const business = createDataEditor({
      executor: async () => ({
        status: 200,
        contentType: "application/json",
        body: "{\"code\":\"0\"}"
      })
    });
    const businessResult = await business.service.executeQueryDraft({
      connectionId: "connection-a",
      method: "POST",
      readOnly: true,
      path: "/search",
      parameters: [],
      successCondition: { path: [{ kind: "key", key: "code" }], equals: 0 }
    }).result;
    expect(businessResult.status).toBe("error");
    expect(businessResult.problems.map((problem) => problem.code)).toEqual(["response-business"]);
    expect(businessResult.response?.json).toEqual({ code: "0" });
    business.editor.dispose();

    const large = createDataEditor({
      executor: async () => ({
        status: 200,
        contentType: "application/json",
        body: "{\"value\":\"0123456789\"}"
      }),
      maxResponseBytes: 10
    });
    const largeResult = await large.service.executeQueryDraft(large.draft).result;
    expect(largeResult.status).toBe("error");
    expect(largeResult.problems.map((problem) => problem.code)).toEqual(["response-too-large"]);
    expect(largeResult.response).toBeNull();
    large.editor.dispose();

    const executor = vi.fn<DataRequestExecutor>(async () => okResponse());
    const missing = createDataEditor({
      executor,
      auth: { kind: "api-key", credentialRef: "credential-missing", headerName: "X-Api-Key" }
    });
    const missingResult = await missing.service.executeQueryDraft(missing.draft).result;
    expect(missingResult.status).toBe("error");
    expect(missingResult.problems).toEqual([
      expect.objectContaining({
        code: "credential-unavailable",
        field: "credential",
        credentialRef: "credential-missing"
      })
    ]);
    expect(executor).not.toHaveBeenCalled();
    expect(missing.editor.getSnapshot().dataSources.connections["connection-a"]?.auth).toEqual({
      kind: "api-key",
      credentialRef: "credential-missing",
      headerName: "X-Api-Key"
    });
    missing.editor.dispose();
  });

  it("classifies oversized error responses by HTTP status before the size limit", async () => {
    const oversizedError = {
      status: 401,
      contentType: "application/json",
      body: "{\"error\":\"0123456789\"}"
    };
    const auth = createDataEditor({
      executor: async () => oversizedError,
      maxResponseBytes: 10
    });
    const authResult = await auth.service.executeQueryDraft(auth.draft).result;
    expect(authResult.status).toBe("error");
    expect(authResult.problems.map((problem) => problem.code)).toEqual(["response-auth"]);
    expect(authResult.response).toMatchObject({ status: 401, bodyKind: "text" });
    auth.editor.dispose();

    const unavailable = createDataEditor({
      executor: async () => ({ ...oversizedError, status: 503 }),
      maxResponseBytes: 10
    });
    const unavailableResult = await unavailable.service.executeQueryDraft(unavailable.draft).result;
    expect(unavailableResult.status).toBe("error");
    expect(unavailableResult.problems.map((problem) => problem.code)).toEqual(["response-http"]);
    expect(unavailableResult.response).toMatchObject({ status: 503, bodyKind: "text" });
    unavailable.editor.dispose();
  });

  it("does not call the executor for an unconfirmed POST draft", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => okResponse());
    const { editor, service, draft } = createDataEditor({ executor });

    const result = await service.executeQueryDraft({
      ...draft,
      method: "POST",
      readOnly: false
    }).result;

    expect(result.status).toBe("error");
    expect(result.problems.map((problem) => problem.code)).toEqual(["post-read-only-required"]);
    expect(result.request).toBeNull();
    expect(executor).not.toHaveBeenCalled();
    editor.dispose();
  });

  it("compares business success values strictly by JSON scalar type and path", async () => {
    let body = "{\"code\":false}";
    const { editor, service, draft } = createDataEditor({
      executor: async () => ({
        status: 200,
        contentType: "application/json",
        body
      })
    });
    const condition = (equals: string | number | boolean | null) => ({
      path: [{ kind: "key" as const, key: "code" }],
      equals
    });
    const run = () => service.executeQueryDraft({
      ...draft,
      successCondition: condition(0)
    }).result;

    expect((await run()).problems.map((problem) => problem.code)).toEqual(["response-business"]);
    body = "{\"code\":null}";
    const nullRun = await service.executeQueryDraft({
      ...draft,
      successCondition: condition("")
    }).result;
    expect(nullRun.problems.map((problem) => problem.code)).toEqual(["response-business"]);
    body = "{\"other\":0}";
    const missingRun = await service.executeQueryDraft({
      ...draft,
      successCondition: condition(0)
    }).result;
    expect(missingRun.problems.map((problem) => problem.code)).toEqual(["response-business"]);
    body = "{\"code\":0}";
    expect((await run()).status).toBe("success");
    editor.dispose();
  });

  it("rejects malformed host responses and executor failures as diagnostics", async () => {
    const malformed = createDataEditor({
      executor: async () => ({ status: Number.NaN, body: "{}" })
    });
    const invalid = await malformed.service.executeQueryDraft(malformed.draft).result;
    expect(invalid.status).toBe("error");
    expect(invalid.problems.map((problem) => problem.code)).toEqual(["response-invalid"]);
    expect(invalid.response).toBeNull();
    malformed.editor.dispose();

    const failed = createDataEditor({
      executor: async () => {
        throw new Error("gateway exploded");
      }
    });
    const failure = await failed.service.executeQueryDraft(failed.draft).result;
    expect(failure.status).toBe("error");
    expect(failure.problems).toEqual([
      expect.objectContaining({ code: "request-failed", message: "gateway exploded" })
    ]);
    failed.editor.dispose();
  });
});

function okResponse(): DataResponseDescriptor {
  return {
    status: 200,
    contentType: "application/json",
    body: "{\"ok\":true}"
  };
}

function createDataEditor(options: {
  executor?: DataRequestExecutor | null;
  credentials?: readonly DataCredentialDescriptor[];
  auth?: DataConnectionAuth;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxResponseBytes?: number;
} = {}): {
  editor: ReturnType<typeof createEditor>;
  service: EditorDataService;
  draft: DataQueryDraft;
} {
  const editor = createEditor({
    executor: options.executor ?? null,
    credentials: options.credentials,
    maxResponseBytes: options.maxResponseBytes,
    snapshot: {
      ...createEmptySnapshot("scene-a"),
      dataSources: {
        connections: {
          "connection-a": {
            id: "connection-a",
            name: "Plant API",
            baseUrl: "https://api.example.test/v1",
            auth: options.auth ?? { kind: "none" },
            headers: options.headers ?? {},
            timeoutMs: options.timeoutMs ?? 10_000
          }
        },
        queries: {},
        bindings: {}
      }
    }
  });
  return {
    editor,
    service: editor.getDataService!(),
    draft: {
      connectionId: "connection-a",
      path: "/devices",
      parameters: []
    }
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
