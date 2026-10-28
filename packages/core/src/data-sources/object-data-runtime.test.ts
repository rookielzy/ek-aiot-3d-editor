import { describe, expect, it, vi } from "vitest";
import {
  buildDataObjectDetailModel,
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataRequestDescriptor,
  type DataRequestExecutor,
  type EditorDataService
} from "../index";

const QUERY_DEFINITION = {
  name: "Pump status",
  path: "/pumps",
  parameters: [{ name: "areaId", type: "string" as const, defaultValue: "A" }],
  mapping: {
    mode: "array" as const,
    root: [{ kind: "key" as const, key: "items" }],
    identity: { kind: "path" as const, path: [{ kind: "key" as const, key: "deviceCode" }], valueType: "string" as const },
    displayName: [{ kind: "key" as const, key: "name" }],
    properties: [
      property("temperature", "Temperature", "number", "tempRaw", { kind: "scale", factor: 0.1, offset: 0 }, "°C"),
      property("running", "Running", "boolean", "run", { kind: "raw" }),
      property("flow", "Flow", "number", "flowRaw", { kind: "raw" }, "m³/h")
    ],
    observedAt: { path: [{ kind: "key" as const, key: "sampledAt" }], format: "iso" as const },
    sourceQuality: {
      path: [{ kind: "key" as const, key: "quality" }],
      entries: [{ from: "ok", quality: "good" as const }, { from: "degraded", quality: "uncertain" as const }]
    }
  }
};

function property(
  key: string,
  label: string,
  type: "number" | "boolean",
  sourceKey: string,
  transform: { kind: "raw" } | { kind: "scale"; factor: number; offset: number },
  unit: string | null
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

describe("object data preview runtime", () => {
  it("executes only while preview is enabled, refreshes explicitly, and never edits durable state", async () => {
    const requests: DataRequestDescriptor[] = [];
    const executor: DataRequestExecutor = async (request) => {
      requests.push(request);
      return jsonResponse(deviceBody());
    };
    const { editor, service } = createBoundEditor(executor);
    const snapshotBefore = editor.serialize();
    const historyBefore = editor.getHistoryState();

    await service.refreshPreview();
    expect(requests).toHaveLength(0);
    expect(service.getObjectDataState()).toMatchObject({
      preview: { enabled: false, refreshing: false },
      objects: {}
    });

    await service.startPreview();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.example.test/v1/pumps?areaId=B");
    const state = service.getObjectDataState();
    expect(state.preview).toMatchObject({ enabled: true, refreshing: false });
    expect(state.preview.lastRefreshAt).toEqual(expect.any(Number));
    expect(state.objects["object-a"]).toMatchObject({
      objectNodeId: "object-a",
      status: "partial",
      deviceId: "pump-01",
      entityId: "pump-01",
      displayName: "Pump 1",
      sourceQuality: "good",
      fields: expect.arrayContaining([
        expect.objectContaining({ key: "temperature", value: 42.6, status: "ok" })
      ])
    });
    expect(state.objects["object-disabled"]).toBeUndefined();

    await service.refreshPreview();
    expect(requests).toHaveLength(2);

    service.stopPreview();
    expect(service.getObjectDataState()).toEqual({
      preview: {
        enabled: false,
        refreshing: false,
        lastRefreshAt: null,
        contextCount: 0,
        pausedCount: 0
      },
      contexts: {},
      objects: {}
    });
    expect(editor.serialize()).toEqual(snapshotBefore);
    expect(editor.getHistoryState()).toEqual(historyBefore);
    editor.dispose();
  });

  it("builds an ordered detail model from query definitions and current device values", async () => {
    const { editor, service } = createBoundEditor(async () => jsonResponse(deviceBody()));
    await service.startPreview();
    const state = service.getObjectDataState().objects["object-a"];

    const model = buildDataObjectDetailModel(editor.getSnapshot(), "object-a", state);
    expect(model).toMatchObject({
      objectNodeId: "object-a",
      objectName: "Pump object",
      queryName: "Pump status",
      deviceId: "pump-01",
      displayName: "Pump 1",
      status: "partial",
      sourceQuality: "good",
      observedAt: Date.parse(SAMPLE_AT),
      receivedAt: state.receivedAt
    });
    expect(model?.fields).toEqual([
      {
        key: "temperature",
        label: "Temperature",
        type: "number",
        unit: "°C",
        precision: 1,
        value: 42.6,
        displayValue: "42.6",
        status: "ok",
        problems: [],
        historyValue: null,
        historyDisplayValue: null,
        historyReceivedAt: null
      },
      {
        key: "running",
        label: "Run state",
        type: "boolean",
        unit: null,
        precision: null,
        value: true,
        displayValue: "true",
        status: "ok",
        problems: [],
        historyValue: null,
        historyDisplayValue: null,
        historyReceivedAt: null
      },
      {
        key: "flow",
        label: "Flow",
        type: "number",
        unit: "m³/h",
        precision: 2,
        value: null,
        displayValue: null,
        status: "missing",
        problems: [expect.objectContaining({ code: "property-missing" })],
        historyValue: null,
        historyDisplayValue: null,
        historyReceivedAt: null
      }
    ]);
    expect(model?.status).toBe("partial");
    expect(JSON.stringify(editor.serialize())).not.toContain("Pump 1");
    editor.dispose();
  });

  it("reports a missing device without inventing values", async () => {
    const { editor, service } = createBoundEditor(async () => jsonResponse({
      items: [deviceRecord({ deviceCode: "pump-02", name: "Pump 2" })]
    }));
    await service.startPreview();
    const state = service.getObjectDataState().objects["object-a"];
    expect(state).toMatchObject({
      status: "missing-device",
      entityId: null,
      fields: [],
      sourceQuality: null,
      problems: [expect.objectContaining({ kind: "device", code: "device-missing" })]
    });
    const model = buildDataObjectDetailModel(editor.getSnapshot(), "object-a", state);
    expect(model?.fields.every((field) => field.displayValue === null && field.status === "missing")).toBe(true);
    expect(model?.fields.every((field) => field.problems.length === 0)).toBe(true);
    expect(state?.problems[0]?.message).toContain("pump-01");
    editor.dispose();
  });

  it("preserves whitespace in device identities when saving and matching a binding", async () => {
    const { editor, service } = createBoundEditor(async () => jsonResponse({
      items: [deviceRecord({ deviceCode: " pump-01 " })]
    }));
    const result = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
      ...editor.getSnapshot().dataSources.bindings["object-a"],
      deviceId: " pump-01 "
    });
    if (!result.ok) throw new Error("Expected a valid device identity.");
    expect(editor.dispatch(result.command).ok).toBe(true);

    await service.startPreview();
    expect(service.getObjectDataState().objects["object-a"]).toMatchObject({
      deviceId: " pump-01 ",
      entityId: " pump-01 ",
      status: "partial"
    });
    const restored = createEditor({ snapshot: editor.serialize() });
    expect(restored.serialize()).toEqual(editor.serialize());
    restored.dispose();
    editor.dispose();
  });

  it("finishes the refresh when the executor ignores abort after a timeout", async () => {
    let signal: AbortSignal | undefined;
    const executor: DataRequestExecutor = (request) => {
      signal = request.signal;
      return new Promise(() => {});
    };
    const { editor, service } = createBoundEditor(executor, { timeoutMs: 20 });
    await service.startPreview();
    const state = service.getObjectDataState();
    expect(state.preview.refreshing).toBe(false);
    expect(state.objects["object-a"]).toMatchObject({
      status: "error",
      problems: [expect.objectContaining({ code: "request-timeout" })]
    });
    expect(signal?.aborted).toBe(true);
    editor.dispose();
  });

  it("reports identity mapping failures instead of treating them as a missing device", async () => {
    const { editor, service } = createBoundEditor(async () => jsonResponse({
      items: [{ name: "Pump without id" }]
    }));
    await service.startPreview();
    const state = service.getObjectDataState().objects["object-a"];
    expect(state).toMatchObject({
      status: "error",
      entityId: null,
      fields: [],
      problems: [expect.objectContaining({ kind: "mapping", code: "entity-id-missing" })]
    });
    editor.dispose();
  });

  it("surfaces HTTP and body failures with explicit reasons and no values", async () => {
    const { editor, service } = createBoundEditor(async () => ({
      status: 503,
      contentType: "application/json",
      body: "{\"error\":\"unavailable\"}"
    }));
    await service.startPreview();
    const failed = service.getObjectDataState().objects["object-a"];
    expect(failed).toMatchObject({
      status: "error",
      fields: [],
      problems: [expect.objectContaining({ code: "response-http", status: 503 })]
    });
    expect(buildDataObjectDetailModel(editor.getSnapshot(), "object-a", failed)?.fields.every(
      (field) => field.value === null && field.displayValue === null
    )).toBe(true);
    service.stopPreview();

    const invalid = createBoundEditor(async () => ({
      status: 200,
      contentType: "application/json",
      body: "not json"
    }));
    await invalid.service.startPreview();
    expect(invalid.service.getObjectDataState().objects["object-a"].problems).toEqual([
      expect.objectContaining({ code: "response-json-invalid" })
    ]);
    expect(invalid.service.getObjectDataState().objects["object-a"].status).toBe("error");
    invalid.editor.dispose();
    editor.dispose();
  });

  it("cancels on stop and ignores late responses", async () => {
    let resolveResponse!: (value: ReturnType<typeof jsonResponse>) => void;
    let signal: AbortSignal | undefined;
    const executor: DataRequestExecutor = (request) => {
      signal = request.signal;
      return new Promise((resolve) => {
        resolveResponse = resolve;
      });
    };
    const { editor, service } = createBoundEditor(executor);
    const starting = service.startPreview();
    await waitFor(() => expect(signal).toBeTruthy());

    service.stopPreview();
    expect(signal?.aborted).toBe(true);
    resolveResponse(jsonResponse(deviceBody()));
    await starting;
    await Promise.resolve();
    expect(service.getObjectDataState().objects).toEqual({});
    editor.dispose();
  });

  it("reuses the shared context when a binding selects another device and waits for an explicit refresh only for new requests", async () => {
    let requests = 0;
    const executor: DataRequestExecutor = async () => {
      requests += 1;
      return jsonResponse(deviceBody());
    };
    const { editor, service } = createBoundEditor(executor);
    const second = editor.getSnapshot().dataSources.bindings["object-disabled"];
    const enabledSecond = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
      ...second,
      enabled: true
    });
    if (!enabledSecond.ok) throw new Error("Expected an enabled binding.");
    expect(editor.dispatch(enabledSecond.command).ok).toBe(true);
    await service.startPreview();
    expect(service.getObjectDataState().objects["object-a"].status).toBe("partial");
    expect(service.getObjectDataState().objects["object-disabled"].status).toBe("ready");
    expect(requests).toBe(2);

    const binding = editor.getSnapshot().dataSources.bindings["object-a"];
    const updated = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
      ...binding,
      deviceId: "pump-02"
    });
    if (!updated.ok) throw new Error("Expected an updated binding.");
    expect(editor.dispatch(updated.command).ok).toBe(true);

    const state = service.getObjectDataState();
    expect(state.preview).toMatchObject({ enabled: true, refreshing: false });
    expect(state.objects["object-a"]).toMatchObject({
      deviceId: "pump-02",
      entityId: "pump-02",
      status: "partial"
    });
    expect(state.objects["object-disabled"]).toMatchObject({
      deviceId: "pump-02",
      status: "ready"
    });
    expect(requests).toBe(2);

    await service.refreshPreview();
    expect(requests).toBe(4);
    expect(service.getObjectDataState().objects["object-a"]).toMatchObject({
      deviceId: "pump-02",
      status: "partial"
    });
    expect(service.getObjectDataState().objects["object-disabled"]).toMatchObject({
      deviceId: "pump-02",
      status: "ready"
    });
    editor.dispose();
  });
});

function createBoundEditor(
  executor: DataRequestExecutor,
  options: { timeoutMs?: number } = {}
): { editor: ReturnType<typeof createEditor>; service: EditorDataService } {
  const editor = createEditor({ executor });
  const connection = editor.dispatch({
    type: "create-data-connection",
    connection: {
      id: "connection-a",
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      auth: { kind: "none" },
      headers: {},
      timeoutMs: options.timeoutMs ?? 10_000
    }
  });
  if (!connection.ok) throw new Error(connection.error);
  const query = buildSaveDataQueryCommand(editor.getSnapshot(), {
    connectionId: "connection-a",
    ...QUERY_DEFINITION
  });
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  if (editor.dispatch(query.command).ok === false) throw new Error("Failed to save query.");
  const queryId = Object.keys(editor.getSnapshot().dataSources.queries)[0];

  for (const [objectNodeId, name] of [["object-a", "Pump object"], ["object-disabled", "Disabled pump"]] as const) {
    const imported = editor.dispatch({
      type: "import-glb",
      objectId: objectNodeId,
      name,
      asset: { id: `asset-${objectNodeId}` }
    });
    if (!imported.ok) throw new Error(imported.error);
  }

  const saved = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId: "object-a",
    queryId,
    parameterOverrides: { areaId: "B" },
    deviceId: "pump-01",
    enabled: true,
    details: [
      { key: "temperature", label: null, precision: 1 },
      { key: "running", label: "Run state", precision: null },
      { key: "flow", label: null, precision: null }
    ]
  });
  if (!saved.ok) throw new Error(saved.problems.map((problem) => problem.message).join("\n"));
  if (!editor.dispatch(saved.command).ok) throw new Error("Failed to save binding.");
  const disabled = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId: "object-disabled",
    queryId,
    deviceId: "pump-02",
    enabled: false,
    details: [{ key: "temperature", label: null, precision: null }]
  });
  if (!disabled.ok) throw new Error(disabled.problems.map((problem) => problem.message).join("\n"));
  if (!editor.dispatch(disabled.command).ok) throw new Error("Failed to save disabled binding.");

  return { editor, service: editor.getDataService() };
}

function deviceBody() {
  return {
    items: [
      deviceRecord({
        deviceCode: "pump-01",
        name: "Pump 1",
        tempRaw: 426,
        run: true,
        quality: "ok",
        sampledAt: SAMPLE_AT
      }),
      deviceRecord({
        deviceCode: "pump-02",
        name: "Pump 2",
        tempRaw: 380,
        run: false,
        quality: "degraded",
        sampledAt: SAMPLE_AT
      })
    ]
  };
}

const SAMPLE_AT = new Date(Date.now() - 1_000).toISOString();

function deviceRecord(patch: Record<string, unknown>): Record<string, unknown> {
  return {
    deviceCode: "pump-01",
    name: "Pump 1",
    tempRaw: 426,
    run: true,
    quality: "ok",
    sampledAt: SAMPLE_AT,
    ...patch
  };
}

function jsonResponse(body: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body)
  };
}

async function waitFor(assertion: () => void, timeout = 2000): Promise<void> {
  const startedAt = performance.now();
  let lastError: unknown;
  while (performance.now() - startedAt < timeout) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  throw lastError;
}
