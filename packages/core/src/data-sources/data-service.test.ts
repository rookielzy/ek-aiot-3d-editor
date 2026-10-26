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

  it.each([
    {
      label: "HTTP failure",
      response: { status: 503, contentType: "application/json", body: "{\"error\":\"down\"}" },
      status: "error",
      codes: ["response-http"],
      bodyKind: "json"
    },
    {
      label: "non-JSON body",
      response: { status: 200, contentType: "text/plain", body: "not-json" },
      status: "error",
      codes: ["response-json-invalid"],
      bodyKind: "text"
    },
    {
      label: "empty body",
      response: { status: 204, body: "" },
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
  timeoutMs?: number;
} = {}): {
  editor: ReturnType<typeof createEditor>;
  service: EditorDataService;
  draft: DataQueryDraft;
} {
  const editor = createEditor({
    executor: options.executor ?? null,
    credentials: options.credentials,
    snapshot: {
      ...createEmptySnapshot("scene-a"),
      dataSources: {
        connections: {
          "connection-a": {
            id: "connection-a",
            name: "Plant API",
            baseUrl: "https://api.example.test/v1",
            auth: options.auth ?? { kind: "none" },
            headers: {},
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
