import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataColorSink,
  type DataRequestExecutor,
  type DataResponseDescriptor
} from "../index";

describe("data runtime across project restore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops preview, ends the trial, and drops colors when a snapshot is restored", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(freshBody()));
    const harness = createHarness({ executor });
    const sink = createColorSink();
    harness.editor.getDataColorService().setSink(sink);

    await harness.editor.getDataService().startPreview();
    expect(harness.editor.getDataService().getObjectDataState().preview.enabled).toBe(true);
    expect(sink.assignments.length).toBeGreaterThan(0);

    const trial = harness.editor.getDataColorService().startTrial({
      objectNodeId: "object-a",
      source: "sample",
      color: { propertyKey: "temperature", rules: [{ operator: "gte", value: 0, max: null, color: "#00ff00" }] },
      value: 1
    });
    expect(trial).toMatchObject({ ok: false, problems: [expect.objectContaining({ code: "preview-active" })] });

    harness.editor.restore(harness.editor.serialize());

    const state = harness.editor.getDataService().getObjectDataState();
    expect(state.preview.enabled).toBe(false);
    expect(state.objects).toEqual({});
    expect(state.contexts).toEqual({});
    expect(sink.appliedColors()).toEqual([]);
    expect(harness.editor.getDataColorService().getTrial()).toBeNull();
  });

  it("cancels an in-flight request and ignores its late response after restore", async () => {
    const pending: Array<(response: DataResponseDescriptor) => void> = [];
    const signals: AbortSignal[] = [];
    const executor = vi.fn<DataRequestExecutor>((request) => {
      signals.push(request.signal);
      return new Promise((resolve) => pending.push(resolve));
    });
    const harness = createHarness({ executor });
    const starting = harness.editor.getDataService().startPreview();
    expect(pending).toHaveLength(1);

    const restored = withDifferentBindingQuery(harness.editor.serialize());
    harness.editor.restore(restored);
    expect(signals[0]!.aborted).toBe(true);

    pending[0]!(jsonResponse(freshBody({ "pump-01": 999 })));
    await starting;
    await flush();

    const state = harness.editor.getDataService().getObjectDataState();
    expect(state.preview.enabled).toBe(false);
    expect(state.objects).toEqual({});
    expect(harness.editor.getSnapshot().dataSources.bindings["object-a"].deviceId).toBe("pump-restored");
  });

  it("ignores a late old response that arrives after a project import replaced the scene", async () => {
    const pending: Array<(response: DataResponseDescriptor) => void> = [];
    const executor = vi.fn<DataRequestExecutor>(() => new Promise((resolve) => pending.push(resolve)));
    const harness = createHarness({ executor });
    const starting = harness.editor.getDataService().startPreview();

    const other = createEditor();
    other.dispatch({ type: "import-glb", objectId: "object-z", asset: { id: "asset-z", source: new Uint8Array([1]) } });
    const packageBytes = other.exportProject().packageBytes as Uint8Array;
    other.dispose();

    const imported = harness.editor.importProject(packageBytes);
    expect(imported.ok).toBe(true);
    pending[0]!(jsonResponse(freshBody({ "pump-01": 999 })));
    await starting;
    await flush();

    expect(harness.editor.getSnapshot().objects["object-z"]).toBeTruthy();
    expect(harness.editor.getSnapshot().objects["object-a"]).toBeUndefined();
    expect(harness.editor.getDataService().getObjectDataState()).toMatchObject({
      preview: { enabled: false },
      objects: {}
    });
  });

  it("obtains current values again after the host re-provides an executor and preview is explicitly started", async () => {
    const source = createHarness({ executor: null });
    const packageBytes = source.editor.exportProject({ partial: true }).packageBytes as Uint8Array;
    expect(packageBytes).toBeInstanceOf(Uint8Array);

    const restored = createEditor();
    const imported = restored.importProject(packageBytes);
    expect(imported.ok).toBe(true);
    expect(restored.getDataService().getState().executorAvailable).toBe(false);
    expect(restored.getDataService().getObjectDataState().preview.enabled).toBe(false);

    await restored.getDataService().startPreview();
    const withoutExecutor = restored.getDataService().getObjectDataState();
    expect(withoutExecutor.objects["object-a"].problems).toMatchObject([
      expect.objectContaining({ code: "executor-unavailable" })
    ]);
    expect(restored.getSnapshot().dataSources.bindings["object-a"]).toBeTruthy();

    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(freshBody()));
    restored.getDataService().setHostCapabilities({ executor });
    await restored.getDataService().startPreview();
    await flush();

    expect(executor).toHaveBeenCalledTimes(1);
    expect(restored.getDataService().getObjectDataState().objects["object-a"]).toMatchObject({
      status: "ready",
      entityId: "pump-01"
    });
    restored.dispose();
    source.editor.dispose();
  });
});

interface HarnessOptions {
  executor: DataRequestExecutor | null;
}

function createHarness(options: HarnessOptions) {
  const editor = createEditor({ executor: options.executor });
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
  const savedQuery = editor.dispatch(query.command);
  if (!savedQuery.ok) throw new Error(savedQuery.error);
  const queryId = Object.keys(editor.getSnapshot().dataSources.queries)[0]!;

  const imported = editor.dispatch({
    type: "import-glb",
    objectId: "object-a",
    name: "Pump A",
    asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) }
  });
  if (!imported.ok) throw new Error(imported.error);

  const binding = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId: "object-a",
    queryId,
    parameterOverrides: {},
    deviceId: "pump-01",
    enabled: true,
    details: [{ key: "temperature", precision: 1 }],
    color: { propertyKey: "temperature", rules: [{ operator: "gte", value: 40, max: null, color: "#ff0000" }] }
  });
  if (!binding.ok) throw new Error(binding.problems.map((problem) => problem.message).join("\n"));
  const savedBinding = editor.dispatch(binding.command);
  if (!savedBinding.ok) throw new Error(savedBinding.error);
  return { editor, queryId };
}

function queryDefinition() {
  return {
    connectionId: "connection-a",
    name: "Pump status",
    path: "/pumps",
    parameters: [],
    mapping: {
      mode: "array" as const,
      root: [{ kind: "key" as const, key: "items" }],
      identity: { kind: "path" as const, path: [{ kind: "key" as const, key: "deviceCode" }], valueType: "string" as const },
      displayName: [{ kind: "key" as const, key: "name" }],
      properties: [{
        key: "temperature",
        label: "Temperature",
        type: "number" as const,
        nullable: false,
        unit: "°C",
        source: [{ kind: "key" as const, key: "tempRaw" }],
        transform: { kind: "scale" as const, factor: 0.1, offset: 0 },
        range: null,
        allowed: null
      }],
      observedAt: null,
      sourceQuality: null
    },
    updatePolicy: { refreshIntervalMs: 60_000, maxAgeMs: 120_000 }
  };
}

function withDifferentBindingQuery(
  serialized: ReturnType<ReturnType<typeof createEditor>["serialize"]>
) {
  return {
    ...serialized,
    dataSources: {
      ...serialized.dataSources,
      bindings: {
        "object-a": {
          ...serialized.dataSources.bindings["object-a"]!,
          deviceId: "pump-restored"
        }
      }
    }
  };
}

function createColorSink(): DataColorSink & {
  assignments: Array<readonly { objectNodeId: string; color: string | null }[]>;
  appliedColors(): Array<{ objectNodeId: string; color: string }>;
} {
  const assignments: Array<readonly { objectNodeId: string; color: string | null }[]> = [];
  return {
    assignments,
    appliedColors() {
      return (assignments.at(-1) ?? [])
        .filter((entry): entry is { objectNodeId: string; color: string } => entry.color !== null)
        .map((entry) => ({ objectNodeId: entry.objectNodeId, color: entry.color }));
    },
    setDataColors(next) {
      assignments.push(next);
      return next.map((entry) => ({
        objectNodeId: entry.objectNodeId,
        supported: true,
        reason: null,
        problems: []
      }));
    }
  };
}

function freshBody(temperatures: Record<string, number> = { "pump-01": 426 }): Record<string, unknown> {
  return {
    items: Object.entries(temperatures).map(([deviceCode, tempRaw]) => ({
      deviceCode,
      name: `Device ${deviceCode}`,
      tempRaw
    }))
  };
}

function jsonResponse(body: unknown): DataResponseDescriptor {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
  await vi.advanceTimersByTimeAsync(0);
}
