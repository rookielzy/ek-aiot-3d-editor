import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDataObjectDetailModel,
  buildDataRuntimeProblems,
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataQueryUpdatePolicy,
  type DataRequestDescriptor,
  type DataRequestExecutor,
  type DataResponseDescriptor,
  type EditorDataService
} from "../index";

const INTERVAL_POLICY: DataQueryUpdatePolicy = { refreshIntervalMs: 60_000, maxAgeMs: 120_000 };

describe("shared preview runtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one request for equal effective parameters and keeps regions isolated", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(freshBody()));
    const harness = createHarness(executor, [
      binding("object-a", "pump-01", { areaId: "A" }),
      binding("object-b", "pump-02", { areaId: "A" }),
      binding("object-c", "pump-01", { areaId: "B" })
    ]);

    await harness.service.startPreview();
    expect(executor).toHaveBeenCalledTimes(2);
    const state = harness.service.getObjectDataState();
    expect(state.preview.contextCount).toBe(2);
    expect(state.objects["object-a"].contextKey).toBe(state.objects["object-b"].contextKey);
    expect(state.objects["object-c"].contextKey).not.toBe(state.objects["object-a"].contextKey);
    expect(state.objects["object-a"]).toMatchObject({ status: "ready", entityId: "pump-01" });
    expect(state.objects["object-b"]).toMatchObject({ status: "ready", entityId: "pump-02" });

    const objectB = harness.editor.getSnapshot().dataSources.bindings["object-b"];
    const reselect = buildSaveDataObjectBindingCommand(harness.editor.getSnapshot(), {
      ...objectB,
      deviceId: "pump-01"
    });
    if (!reselect.ok) throw new Error("Expected a valid binding update.");
    expect(harness.editor.dispatch(reselect.command).ok).toBe(true);

    expect(executor).toHaveBeenCalledTimes(2);
    expect(harness.service.getObjectDataState().objects["object-b"]).toMatchObject({
      deviceId: "pump-01",
      entityId: "pump-01",
      status: "ready"
    });

    await vi.advanceTimersByTimeAsync(INTERVAL_POLICY.refreshIntervalMs);
    expect(executor).toHaveBeenCalledTimes(4);
    harness.editor.dispose();
  });

  it("caps in-flight contexts at four and drains a deduplicated queue", async () => {
    const pending: Array<(response: DataResponseDescriptor) => void> = [];
    const executor = vi.fn<DataRequestExecutor>((_request: DataRequestDescriptor) =>
      new Promise<DataResponseDescriptor>((resolve) => {
        pending.push(resolve);
      })
    );
    const harness = createHarness(executor, [
      binding("object-a", "pump-01", { areaId: "A" }),
      binding("object-b", "pump-01", { areaId: "B" }),
      binding("object-c", "pump-01", { areaId: "C" }),
      binding("object-d", "pump-01", { areaId: "D" }),
      binding("object-e", "pump-01", { areaId: "E" })
    ]);

    const starting = harness.service.startPreview();
    await flush();
    expect(executor).toHaveBeenCalledTimes(4);
    expect(harness.service.getObjectDataState().contexts["queued"]).toBeUndefined();
    expect(Object.values(harness.service.getObjectDataState().contexts)
      .filter((context) => context.phase === "queued")).toHaveLength(1);

    for (const resolve of pending.splice(0, 4)) {
      resolve(jsonResponse(freshBody()));
    }
    await flush();
    expect(executor).toHaveBeenCalledTimes(5);
    pending.shift()?.(jsonResponse(freshBody()));
    await starting;

    const state = harness.service.getObjectDataState();
    expect(Object.values(state.objects).every((object) => object.status === "ready")).toBe(true);
    expect(state.preview.refreshing).toBe(false);
    harness.editor.dispose();
  });

  it("does not queue another request when refresh is requested during a request", async () => {
    let resolveResponse!: (response: DataResponseDescriptor) => void;
    const executor = vi.fn<DataRequestExecutor>(() =>
      new Promise<DataResponseDescriptor>((resolve) => {
        resolveResponse = resolve;
      })
    );
    const harness = createHarness(executor, [binding("object-a", "pump-01")]);

    const starting = harness.service.startPreview();
    await flush();
    expect(harness.service.getObjectDataState().objects["object-a"]).toMatchObject({
      phase: "requesting",
      refreshing: true
    });
    const refreshing = harness.service.refreshPreview();
    await flush();
    expect(executor).toHaveBeenCalledTimes(1);

    resolveResponse(jsonResponse(freshBody()));
    await Promise.all([starting, refreshing]);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(harness.service.getObjectDataState().objects["object-a"].refreshing).toBe(false);
    harness.editor.dispose();
  });

  it("rejects a late response after the query configuration changes", async () => {
    const pending: Array<(response: DataResponseDescriptor) => void> = [];
    const executor = vi.fn<DataRequestExecutor>(() =>
      new Promise<DataResponseDescriptor>((resolve) => {
        pending.push(resolve);
      })
    );
    const harness = createHarness(executor, [binding("object-a", "pump-01")]);

    const starting = harness.service.startPreview();
    await flush();
    expect(executor).toHaveBeenCalledTimes(1);

    const query = harness.editor.getSnapshot().dataSources.queries[harness.queryId];
    const update = buildSaveDataQueryCommand(harness.editor.getSnapshot(), {
      connectionId: query.connectionId,
      name: query.name,
      path: "/pumps/v2",
      parameters: query.parameters,
      mapping: query.mapping,
      updatePolicy: query.updatePolicy
    }, { queryId: harness.queryId });
    if (!update.ok) throw new Error(update.problems.map((problem) => problem.message).join("\n"));
    expect(harness.editor.dispatch(update.command).ok).toBe(true);
    await flush();
    expect(executor).toHaveBeenCalledTimes(2);

    pending[0](jsonResponse(freshBody({ "pump-01": 426 })));
    await flush();
    expect(harness.service.getObjectDataState().objects["object-a"]).toMatchObject({ status: "loading" });

    pending[1](jsonResponse(freshBody({ "pump-01": 999 })));
    await starting;
    expect(harness.service.getObjectDataState().objects["object-a"]).toMatchObject({
      status: "ready",
      fields: expect.arrayContaining([expect.objectContaining({ key: "temperature", value: 99.9 })])
    });
    harness.editor.dispose();
  });

  it("pauses on 401 until an explicit retry or an auth revision change", async () => {
    let authorized = false;
    const executor = vi.fn<DataRequestExecutor>(async () => authorized
      ? jsonResponse(freshBody())
      : { status: 401, body: "{\"error\":\"token\"}" });
    const harness = createHarness(executor, [binding("object-a", "pump-01")]);

    await harness.service.startPreview();
    expect(harness.service.getObjectDataState().objects["object-a"]).toMatchObject({
      status: "error",
      phase: "paused",
      paused: { kind: "authentication", status: 401 }
    });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(executor).toHaveBeenCalledTimes(1);

    authorized = true;
    await harness.service.refreshPreview();
    expect(executor).toHaveBeenCalledTimes(2);
    expect(harness.service.getObjectDataState().objects["object-a"]).toMatchObject({
      status: "ready",
      phase: "waiting",
      paused: null
    });
    harness.editor.dispose();
  });

  it("restarts the context automatically when the host auth revision changes", async () => {
    let authorized = false;
    const executor = vi.fn<DataRequestExecutor>(async () => authorized
      ? jsonResponse(freshBody())
      : { status: 403, body: "{}" });
    const harness = createHarness(executor, [binding("object-a", "pump-01")]);

    await harness.service.startPreview();
    expect(harness.service.getObjectDataState().preview.pausedCount).toBe(1);

    authorized = true;
    harness.service.setHostCapabilities({ authRevision: 1 });
    await flush();
    expect(executor).toHaveBeenCalledTimes(2);
    expect(harness.service.getObjectDataState().objects["object-a"]).toMatchObject({
      status: "ready",
      paused: null
    });
    expect(harness.service.getAuthRevision()).toBe(1);
    harness.editor.dispose();
  });

  it("ignores late responses from a replaced executor", async () => {
    let resolveOld!: (response: DataResponseDescriptor) => void;
    const oldExecutor = vi.fn<DataRequestExecutor>(() =>
      new Promise<DataResponseDescriptor>((resolve) => {
        resolveOld = resolve;
      })
    );
    const newExecutor = vi.fn<DataRequestExecutor>(async () => jsonResponse(freshBody({ "pump-01": 999 })));
    const harness = createHarness(oldExecutor, [binding("object-a", "pump-01")]);

    const starting = harness.service.startPreview();
    await flush();
    expect(oldExecutor).toHaveBeenCalledTimes(1);

    harness.service.setHostCapabilities({ executor: newExecutor, authRevision: 1 });
    await flush();
    expect(newExecutor).toHaveBeenCalledTimes(1);
    expect(harness.service.getObjectDataState().objects["object-a"]).toMatchObject({
      status: "ready",
      fields: expect.arrayContaining([expect.objectContaining({ key: "temperature", value: 99.9 })])
    });

    resolveOld(jsonResponse(freshBody({ "pump-01": 426 })));
    await flush();
    expect(harness.service.getObjectDataState().objects["object-a"]).toMatchObject({
      fields: expect.arrayContaining([expect.objectContaining({ key: "temperature", value: 99.9 })])
    });
    await starting;
    harness.editor.dispose();
  });

  it("backs off with Retry-After and stops polling after a non-retryable error", async () => {
    const attempts: number[] = [];
    let response: DataResponseDescriptor = {
      status: 503,
      headers: { "Retry-After": "3" },
      body: "{}"
    };
    const later = createHarness(async () => {
      attempts.push(Date.now());
      return response;
    }, [binding("object-a", "pump-01")], { refreshIntervalMs: 1_000, maxAgeMs: 5_000 });

    await later.service.startPreview();
    expect(attempts).toHaveLength(1);
    expect(later.service.getObjectDataState().contexts[
      Object.keys(later.service.getObjectDataState().contexts)[0]
    ]).toMatchObject({ retryBackoffMs: 3_000, phase: "waiting" });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(attempts).toHaveLength(1);

    response = { status: 503, body: "{}" };
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts).toHaveLength(2);
    expect(later.service.getObjectDataState().contexts[
      Object.keys(later.service.getObjectDataState().contexts)[0]
    ]).toMatchObject({ retryBackoffMs: 2_000, phase: "waiting" });

    response = { status: 400, body: "{}" };
    await vi.advanceTimersByTimeAsync(1_999);
    expect(attempts).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts).toHaveLength(3);
    const attemptsAfterFatal = attempts.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(attempts).toHaveLength(attemptsAfterFatal);
    later.editor.dispose();

    const fatal = createHarness(async () => ({ status: 400, body: "{}" }), [
      binding("object-a", "pump-01")
    ], { refreshIntervalMs: 1_000, maxAgeMs: 5_000 });
    await fatal.service.startPreview();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fatal.service.getObjectDataState().objects["object-a"]).toMatchObject({
      status: "error",
      phase: "waiting"
    });
    fatal.editor.dispose();
  });

  it("honors an HTTP-date Retry-After", async () => {
    const retryAt = new Date(Date.now() + 4_000).toUTCString();
    const executor = vi.fn<DataRequestExecutor>(async () => ({
      status: 503,
      headers: { "retry-after": retryAt },
      body: "{}"
    }));
    const harness = createHarness(executor, [binding("object-a", "pump-01")], {
      refreshIntervalMs: 1_000,
      maxAgeMs: 5_000
    });

    await harness.service.startPreview();
    expect(harness.service.getObjectDataState().contexts[
      Object.keys(harness.service.getObjectDataState().contexts)[0]
    ]).toMatchObject({ retryBackoffMs: 4_000 });
    await vi.advanceTimersByTimeAsync(3_999);
    expect(executor).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(executor).toHaveBeenCalledTimes(2);
    harness.editor.dispose();
  });

  it("expires from receive and sample age without letting repeated old samples extend life", async () => {
    const sampledAt = new Date(Date.now() - 2_500).toISOString();
    const pending: Array<(response: DataResponseDescriptor) => void> = [];
    let requests = 0;
    const executor = vi.fn<DataRequestExecutor>(() => {
      requests += 1;
      if (requests === 1) {
        return Promise.resolve(jsonResponse(freshBody({ "pump-01": 426 }, sampledAt)));
      }
      return new Promise<DataResponseDescriptor>((resolve) => {
        pending.push(resolve);
      });
    });
    const harness = createHarness(executor, [binding("object-a", "pump-01")], {
      refreshIntervalMs: 1_000,
      maxAgeMs: 3_000
    });

    await harness.service.startPreview();
    expect(harness.service.getObjectDataState().objects["object-a"].freshness).toMatchObject({
      fresh: true,
      maxAgeMs: 3_000
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(harness.service.getObjectDataState().objects["object-a"].freshness.fresh).toBe(false);
    expect(harness.service.getObjectDataState().objects["object-a"].status).toBe("ready");

    await vi.advanceTimersByTimeAsync(500);
    expect(requests).toBe(2);
    pending[0](jsonResponse(freshBody({ "pump-01": 426 }, sampledAt)));
    await flush();
    expect(harness.service.getObjectDataState().objects["object-a"].freshness.fresh).toBe(false);
    harness.editor.dispose();
  });

  it("expires a current value from receive age while a later request is in flight", async () => {
    const futureSample = new Date(Date.now() + 60_000).toISOString();
    let requests = 0;
    const executor = vi.fn<DataRequestExecutor>(() => {
      requests += 1;
      if (requests === 1) {
        return Promise.resolve(jsonResponse(freshBody(undefined, futureSample)));
      }
      return new Promise<DataResponseDescriptor>(() => {});
    });
    const harness = createHarness(executor, [binding("object-a", "pump-01")], {
      refreshIntervalMs: 1_000,
      maxAgeMs: 3_000
    });

    await harness.service.startPreview();
    expect(harness.service.getObjectDataState().objects["object-a"].freshness.fresh).toBe(true);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(requests).toBe(2);
    expect(harness.service.getObjectDataState().objects["object-a"].freshness.fresh).toBe(true);

    await vi.advanceTimersByTimeAsync(1_001);
    expect(harness.service.getObjectDataState().objects["object-a"]).toMatchObject({
      status: "ready",
      phase: "requesting"
    });
    expect(harness.service.getObjectDataState().objects["object-a"].freshness.fresh).toBe(false);
    harness.editor.dispose();
  });

  it("stamps each retained history value with the time it was received", async () => {
    const firstReceivedAt = Date.now();
    let request = 0;
    const executor = vi.fn<DataRequestExecutor>(async () => {
      request += 1;
      return jsonResponse(request === 1
        ? freshBody()
        : freshBody(undefined, undefined, { omitTemperature: true }));
    });
    const harness = createHarness(executor, [binding("object-a", "pump-01")]);
    await harness.service.startPreview();

    await vi.advanceTimersByTimeAsync(5_000);
    await harness.service.refreshPreview();
    const model = buildDataObjectDetailModel(
      harness.editor.getSnapshot(),
      "object-a",
      harness.service.getObjectDataState().objects["object-a"]
    );
    expect(model?.fields.find((field) => field.key === "temperature")).toMatchObject({
      value: null,
      historyValue: 42.6,
      historyReceivedAt: firstReceivedAt
    });
    expect(model?.fields.find((field) => field.key === "temperature")?.historyReceivedAt)
      .toBeLessThan(model?.historyReceivedAt ?? 0);
    harness.editor.dispose();
  });

  it("aborts in-flight requests on stop and dispose and ignores their responses", async () => {
    const pending: Array<{
      signal: AbortSignal;
      resolve(response: DataResponseDescriptor): void;
    }> = [];
    const executor = vi.fn<DataRequestExecutor>((request) =>
      new Promise<DataResponseDescriptor>((resolve) => {
        pending.push({ signal: request.signal, resolve });
      }));
    const harness = createHarness(executor, [binding("object-a", "pump-01")]);

    const starting = harness.service.startPreview();
    await flush();
    expect(pending).toHaveLength(1);
    expect(pending[0].signal.aborted).toBe(false);

    harness.service.stopPreview();
    expect(pending[0].signal.aborted).toBe(true);
    await starting;
    pending[0].resolve(jsonResponse(freshBody({ "pump-01": 999 })));
    await flush();
    expect(harness.service.getObjectDataState().objects).toEqual({});

    const restarting = harness.service.startPreview();
    await flush();
    expect(pending).toHaveLength(2);
    harness.editor.dispose();
    expect(pending[1].signal.aborted).toBe(true);
    pending[1].resolve(jsonResponse(freshBody({ "pump-01": 999 })));
    await restarting;
    expect(harness.service.getObjectDataState().objects).toEqual({});
  });

  it("clears missing fields and devices immediately while keeping history separately", async () => {
    const responses = [
      jsonResponse(freshBody({ "pump-01": 426 })),
      jsonResponse(freshBody({ "pump-01": 426 }, undefined, { omitFlow: true })),
      jsonResponse(deviceBody([{ deviceCode: "pump-02", tempRaw: 380, run: false, flowRaw: 8 }])),
      jsonResponse({ items: [] })
    ];
    const executor = vi.fn<DataRequestExecutor>(async () => responses.shift()!);
    const harness = createHarness(executor, [binding("object-a", "pump-01", undefined, [
      { key: "temperature", precision: 1 },
      { key: "running" },
      { key: "flow" }
    ])]);

    await harness.service.startPreview();
    expect(harness.service.getObjectDataState().objects["object-a"].status).toBe("ready");

    await harness.service.refreshPreview();
    const partial = harness.service.getObjectDataState().objects["object-a"];
    expect(partial.status).toBe("partial");
    const partialModel = buildDataObjectDetailModel(harness.editor.getSnapshot(), "object-a", partial);
    expect(partialModel?.fields.find((field) => field.key === "flow")).toMatchObject({
      value: null,
      displayValue: null,
      historyValue: 12,
      historyDisplayValue: "12.00"
    });

    await harness.service.refreshPreview();
    const missing = harness.service.getObjectDataState().objects["object-a"];
    expect(missing).toMatchObject({ status: "missing-device", fields: [] });
    const missingModel = buildDataObjectDetailModel(harness.editor.getSnapshot(), "object-a", missing);
    expect(missingModel?.fields[0]).toMatchObject({ value: null, historyValue: 42.6 });
    expect(missingModel?.fields[2]).toMatchObject({ value: null, historyValue: 12 });

    await harness.service.refreshPreview();
    const empty = harness.service.getObjectDataState().objects["object-a"];
    expect(empty.status).toBe("empty");
    const emptyModel = buildDataObjectDetailModel(harness.editor.getSnapshot(), "object-a", empty);
    expect(emptyModel?.fields[0]).toMatchObject({ value: null, historyValue: 42.6 });
    harness.editor.dispose();
  });

  it("isolates bad fields between devices and keeps problem locations stable", async () => {
    let devices = [
      { deviceCode: "pump-01", tempRaw: "not-a-number", run: true, flowRaw: 12 },
      { deviceCode: "pump-02", tempRaw: 380, run: false, flowRaw: 8 }
    ];
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(deviceBody(devices)));
    const harness = createHarness(executor, [
      binding("object-a", "pump-01"),
      binding("object-b", "pump-02")
    ]);

    await harness.service.startPreview();
    const state = harness.service.getObjectDataState();
    expect(state.objects["object-a"].status).toBe("partial");
    expect(state.objects["object-a"].fields.find((field) => field.key === "temperature")?.status).toBe("invalid");
    expect(state.objects["object-b"].status).toBe("ready");
    expect(state.objects["object-b"].fields.find((field) => field.key === "temperature")?.value).toBe(38);

    const firstProblems = buildDataRuntimeProblems(state);
    expect(firstProblems.some((problem) =>
      problem.target.kind === "data-field" &&
      problem.target.nodeId === "object-a" &&
      problem.target.propertyKey === "temperature"
    )).toBe(true);
    expect(firstProblems.some((problem) => problem.target.kind === "data-object" && problem.target.nodeId === "object-b"))
      .toBe(false);

    await harness.service.refreshPreview();
    const secondProblems = buildDataRuntimeProblems(harness.service.getObjectDataState());
    expect(secondProblems.map((problem) => problem.id)).toEqual(firstProblems.map((problem) => problem.id));

    devices = [
      { deviceCode: "pump-01", tempRaw: 426, run: true, flowRaw: 12 },
      { deviceCode: "pump-02", tempRaw: 380, run: false, flowRaw: 8 }
    ];
    await harness.service.refreshPreview();
    expect(harness.service.getObjectDataState().objects["object-a"].status).toBe("ready");
    expect(buildDataRuntimeProblems(harness.service.getObjectDataState()).some((problem) =>
      problem.target.kind === "data-field" &&
      problem.target.nodeId === "object-a" &&
      problem.target.propertyKey === "temperature"
    )).toBe(false);
    harness.editor.dispose();
  });

  it("stops the context when the last binding reference is disabled", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(freshBody()));
    const harness = createHarness(executor, [
      binding("object-a", "pump-01"),
      binding("object-b", "pump-02")
    ], { refreshIntervalMs: 1_000, maxAgeMs: 5_000 });

    await harness.service.startPreview();
    expect(executor).toHaveBeenCalledTimes(1);
    expect(harness.service.getObjectDataState().preview.contextCount).toBe(1);

    for (const objectNodeId of ["object-a", "object-b"]) {
      const current = harness.editor.getSnapshot().dataSources.bindings[objectNodeId];
      const disable = buildSaveDataObjectBindingCommand(harness.editor.getSnapshot(), {
        ...current,
        enabled: false
      });
      if (!disable.ok) throw new Error(disable.problems.map((problem) => problem.message).join("\n"));
      expect(harness.editor.dispatch(disable.command).ok).toBe(true);
      await flush();
    }

    expect(harness.service.getObjectDataState().preview.contextCount).toBe(0);
    expect(harness.service.getObjectDataState().objects).toEqual({});
    await vi.advanceTimersByTimeAsync(20_000);
    expect(executor).toHaveBeenCalledTimes(1);
    harness.editor.dispose();
  });

  it("stops timers and requests after stop and dispose", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(freshBody()));
    const harness = createHarness(executor, [binding("object-a", "pump-01")], {
      refreshIntervalMs: 1_000,
      maxAgeMs: 5_000
    });

    await harness.service.startPreview();
    expect(executor).toHaveBeenCalledTimes(1);
    harness.service.stopPreview();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(executor).toHaveBeenCalledTimes(1);

    await harness.service.startPreview();
    expect(executor).toHaveBeenCalledTimes(2);
    harness.editor.dispose();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("validates refresh interval and maximum age together", () => {
    const editor = createEditor();
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
    const invalidFast = buildSaveDataQueryCommand(editor.getSnapshot(), queryDefinition({
      refreshIntervalMs: 500,
      maxAgeMs: 1_000
    }));
    expect(invalidFast).toMatchObject({
      ok: false,
      problems: [expect.objectContaining({ code: "update-policy-invalid", field: "updatePolicy" })]
    });
    const invalidAge = buildSaveDataQueryCommand(editor.getSnapshot(), queryDefinition({
      refreshIntervalMs: 2_000,
      maxAgeMs: 1_000
    }));
    expect(invalidAge).toMatchObject({
      ok: false,
      problems: [expect.objectContaining({ code: "update-policy-invalid" })]
    });
    const valid = buildSaveDataQueryCommand(editor.getSnapshot(), queryDefinition());
    expect(valid.ok).toBe(true);
    editor.dispose();
  });
});

interface HarnessBinding {
  objectNodeId: string;
  deviceId: string;
  parameterOverrides?: Record<string, string>;
  details?: Array<{ key: string; precision?: number }>;
}

function createHarness(
  executor: DataRequestExecutor,
  bindings: readonly HarnessBinding[],
  updatePolicy: DataQueryUpdatePolicy = INTERVAL_POLICY
): { editor: ReturnType<typeof createEditor>; service: EditorDataService; queryId: string } {
  const editor = createEditor({ executor });
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
  const query = buildSaveDataQueryCommand(editor.getSnapshot(), queryDefinition(updatePolicy));
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  if (!editor.dispatch(query.command).ok) throw new Error("Failed to save query.");
  const queryId = Object.keys(editor.getSnapshot().dataSources.queries)[0];

  for (const entry of bindings) {
    const imported = editor.dispatch({
      type: "import-glb",
      objectId: entry.objectNodeId,
      name: entry.objectNodeId,
      asset: { id: `asset-${entry.objectNodeId}` }
    });
    if (!imported.ok) throw new Error(imported.error);
    const saved = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
      objectNodeId: entry.objectNodeId,
      queryId,
      parameterOverrides: entry.parameterOverrides ?? {},
      deviceId: entry.deviceId,
      enabled: true,
      details: entry.details ?? [{ key: "temperature" }, { key: "running" }, { key: "flow" }]
    });
    if (!saved.ok) throw new Error(saved.problems.map((problem) => problem.message).join("\n"));
    if (!editor.dispatch(saved.command).ok) throw new Error("Failed to save binding.");
  }
  return { editor, service: editor.getDataService(), queryId };
}

function queryDefinition(updatePolicy: Partial<DataQueryUpdatePolicy> = {}) {
  return {
    connectionId: "connection-a",
    name: "Pump status",
    path: "/pumps",
    parameters: [{ name: "areaId", type: "string" as const, defaultValue: "A" }],
    mapping: {
      mode: "array" as const,
      root: [{ kind: "key" as const, key: "items" }],
      identity: { kind: "path" as const, path: [{ kind: "key" as const, key: "deviceCode" }], valueType: "string" as const },
      displayName: [{ kind: "key" as const, key: "name" }],
      properties: [
        property("temperature", "Temperature", "number", "tempRaw", { kind: "scale" as const, factor: 0.1, offset: 0 }, "°C"),
        property("running", "Running", "boolean", "run", { kind: "raw" as const }),
        property("flow", "Flow", "number", "flowRaw", { kind: "number" as const }, "m³/h")
      ],
      observedAt: { path: [{ kind: "key" as const, key: "sampledAt" }], format: "iso" as const },
      sourceQuality: null
    },
    updatePolicy: {
      refreshIntervalMs: updatePolicy.refreshIntervalMs ?? INTERVAL_POLICY.refreshIntervalMs,
      maxAgeMs: updatePolicy.maxAgeMs ?? INTERVAL_POLICY.maxAgeMs
    }
  };
}

function property(
  key: string,
  label: string,
  type: "number" | "boolean",
  sourceKey: string,
  transform: { kind: "raw" } | { kind: "number" } | { kind: "scale"; factor: number; offset: number },
  unit: string | null = null
) {
  return {
    key,
    label,
    type,
    nullable: false,
    unit,
    source: [{ kind: "key" as const, key: sourceKey }],
    transform,
    range: null,
    allowed: null
  };
}

function binding(
  objectNodeId: string,
  deviceId: string,
  parameterOverrides?: Record<string, string>,
  details?: Array<{ key: string; precision?: number }>
): HarnessBinding {
  return { objectNodeId, deviceId, parameterOverrides, details };
}

function freshBody(
  temperatures: Record<string, number> = { "pump-01": 426, "pump-02": 380 },
  sampledAt = new Date(Date.now() - 1_000).toISOString(),
  options: { omitFlow?: boolean; omitTemperature?: boolean } = {}
): Record<string, unknown> {
  return deviceBody(
    Object.entries(temperatures).map(([deviceCode, tempRaw]) => ({
      deviceCode,
      tempRaw: options.omitTemperature ? undefined : tempRaw,
      run: deviceCode === "pump-01",
      flowRaw: options.omitFlow ? undefined : 12
    })),
    sampledAt
  );
}

function deviceBody(
  devices: Array<{ deviceCode: string; tempRaw: unknown; run: boolean; flowRaw?: number }>,
  sampledAt = new Date(Date.now() - 1_000).toISOString()
): Record<string, unknown> {
  return {
    items: devices.map((device, index) => ({
      deviceCode: device.deviceCode,
      name: `Device ${index + 1}`,
      ...(device.tempRaw !== undefined ? { tempRaw: device.tempRaw } : {}),
      run: device.run,
      ...(device.flowRaw !== undefined ? { flowRaw: device.flowRaw } : {}),
      sampledAt,
      quality: "ok"
    }))
  };
}

function jsonResponse(body: unknown): DataResponseDescriptor {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body)
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
  await vi.advanceTimersByTimeAsync(0);
}
