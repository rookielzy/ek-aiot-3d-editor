import { BoxGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetResolverBridge } from "../assets/resolver";
import type { RendererLike } from "../runtime/editor-runtime";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataBindingColor,
  type DataRequestExecutor,
  type DataResponseDescriptor,
  type EditorDataColorService,
  type EditorDataService,
  type EditorRuntime,
  type EditorWithGlbImport
} from "../index";

const UPDATE_POLICY = { refreshIntervalMs: 120_000, maxAgeMs: 120_000 };

const RUNNING_COLOR: DataBindingColor = {
  propertyKey: "running",
  rules: [
    { operator: "eq", value: true, max: null, color: "#00ff00" },
    { operator: "ne", value: true, max: null, color: "#888888" }
  ]
};

describe("data color preview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies preview colors to the target object only and restores the authored material on stop", async () => {
    const shared = new MeshStandardMaterial({ color: "#ffffff" });
    const harness = await createHarness(async () => jsonResponse(body()), {
      objects: ["object-a", "object-b"],
      material: () => shared
    });
    await saveColorBinding(harness.editor, harness.queryId, "object-a", RUNNING_COLOR);
    await saveColorBinding(harness.editor, harness.queryId, "object-b", RUNNING_COLOR, { deviceId: "pump-02" });
    await harness.runtime.project();

    await harness.service.startPreview();

    expect(materialOf(harness.runtime, "object-a").color.getHexString()).toBe("00ff00");
    expect(materialOf(harness.runtime, "object-b").color.getHexString()).toBe("888888");
    expect(shared.color.getHexString()).toBe("ffffff");
    expect(harness.colorService.getState().objects["object-a"]).toMatchObject({
      source: "preview",
      status: "applied",
      color: "#00ff00",
      value: true,
      capabilities: { status: "applied", supportedSlotCount: 1 }
    });

    harness.service.stopPreview();

    expect(materialOf(harness.runtime, "object-a")).toBe(shared);
    expect(materialOf(harness.runtime, "object-b")).toBe(shared);
    expect(shared.color.getHexString()).toBe("ffffff");
    expect(harness.colorService.getState().objects["object-a"]).toMatchObject({
      source: "preview",
      color: null,
      reason: "preview-off",
      capabilities: { status: "supported" }
    });
    harness.editor.dispose();
  });

  it("restores the authored color for errors, empty results, bad or uncertain quality, and expiry, while unknown quality stays usable", async () => {
    let response: DataResponseDescriptor = jsonResponse(body());
    let expire = false;
    const harness = await createHarness(async () =>
      expire ? new Promise<DataResponseDescriptor>(() => {}) : response, { objects: ["object-a"] });
    await saveColorBinding(harness.editor, harness.qualityQueryId, "object-a", RUNNING_COLOR);
    await harness.runtime.project();
    await harness.service.startPreview();
    expect(colorOf(harness.runtime, "object-a")).toBe("00ff00");

    response = { status: 500, body: "{}" };
    await harness.service.refreshPreview();
    expect(colorOf(harness.runtime, "object-a")).toBe("ffffff");
    expect(harness.colorService.getState().objects["object-a"]).toMatchObject({ reason: "error" });

    response = jsonResponse({ items: [] });
    await harness.service.refreshPreview();
    expect(colorOf(harness.runtime, "object-a")).toBe("ffffff");
    expect(harness.colorService.getState().objects["object-a"]).toMatchObject({ reason: "empty" });

    response = jsonResponse(body({ quality: "bad" }));
    await harness.service.refreshPreview();
    expect(colorOf(harness.runtime, "object-a")).toBe("ffffff");
    expect(harness.colorService.getState().objects["object-a"]).toMatchObject({ reason: "quality" });

    response = jsonResponse(body({ quality: "uncertain" }));
    await harness.service.refreshPreview();
    expect(colorOf(harness.runtime, "object-a")).toBe("ffffff");
    expect(harness.colorService.getState().objects["object-a"]).toMatchObject({ reason: "quality" });

    // No quality mapping means unknown, which is a usable value.
    await saveColorBinding(harness.editor, harness.queryId, "object-a", RUNNING_COLOR);
    response = jsonResponse(body());
    await harness.service.refreshPreview();
    expect(colorOf(harness.runtime, "object-a")).toBe("00ff00");

    expire = true;
    await vi.advanceTimersByTimeAsync(UPDATE_POLICY.maxAgeMs);
    expect(colorOf(harness.runtime, "object-a")).toBe("ffffff");
    expect(harness.colorService.getState().objects["object-a"]).toMatchObject({ reason: "stale" });
    harness.editor.dispose();
  });

  it("keeps active colors through selection and normal reprojection", async () => {
    const harness = await createHarness(async () => jsonResponse(body()), { objects: ["object-a"] });
    await saveColorBinding(harness.editor, harness.queryId, "object-a", RUNNING_COLOR);
    await harness.runtime.project();
    await harness.service.startPreview();
    expect(colorOf(harness.runtime, "object-a")).toBe("00ff00");

    harness.editor.dispatch({ type: "select-node", nodeId: "object-a" });
    await harness.runtime.project();
    expect(colorOf(harness.runtime, "object-a")).toBe("00ff00");

    harness.editor.dispatch({ type: "select-node", nodeId: null });
    await harness.runtime.project();
    expect(colorOf(harness.runtime, "object-a")).toBe("00ff00");
    expect(harness.editor.getSnapshot().selection.nodeId).toBeNull();
    harness.editor.dispose();
  });

  it("reapplies the color after reprojection and releases the previous projection", async () => {
    const authored = new MeshStandardMaterial({ color: "#ffffff" });
    const harness = await createHarness(async () => jsonResponse(body()), {
      objects: ["object-a"],
      material: () => authored
    });
    await saveColorBinding(harness.editor, harness.queryId, "object-a", RUNNING_COLOR);
    await harness.runtime.project();
    await harness.service.startPreview();
    const firstApplied = materialOf(harness.runtime, "object-a");
    const disposeFirstApplied = vi.spyOn(firstApplied, "dispose");

    await harness.runtime.project();

    const secondApplied = materialOf(harness.runtime, "object-a");
    expect(secondApplied.color.getHexString()).toBe("00ff00");
    expect(secondApplied).not.toBe(firstApplied);
    expect(disposeFirstApplied).toHaveBeenCalledTimes(1);
    expect(authored.color.getHexString()).toBe("ffffff");

    harness.service.stopPreview();
    expect(materialOf(harness.runtime, "object-a")).toBe(authored);
    harness.editor.dispose();
  });

  it("applies data colors once a late model load completes", async () => {
    const harness = await createHarness(async () => jsonResponse(body()), { objects: ["object-a"], deferRuntime: true });
    await saveColorBinding(harness.editor, harness.queryId, "object-a", RUNNING_COLOR);
    await harness.service.startPreview();
    expect(harness.colorService.getState().objects["object-a"]).toMatchObject({
      status: "unavailable",
      color: "#00ff00"
    });

    harness.attachRuntime();
    await harness.runtime.project();

    expect(materialOf(harness.runtime, "object-a").color.getHexString()).toBe("00ff00");
    expect(harness.colorService.getState().objects["object-a"].capabilities.status).toBe("applied");
    harness.editor.dispose();
  });

  it("trials draft colors only while global preview is off, without requests or history", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(body()));
    const harness = await createHarness(executor, { objects: ["object-a", "object-b"] });
    await saveColorBinding(harness.editor, harness.queryId, "object-a", RUNNING_COLOR);
    await harness.runtime.project();
    const history = harness.editor.getHistoryState();
    const requests = executor.mock.calls.length;

    const trial = harness.colorService.startTrial({
      objectNodeId: "object-a",
      color: RUNNING_COLOR,
      value: true,
      source: "test"
    });
    expect(trial.ok).toBe(true);
    expect(colorOf(harness.runtime, "object-a")).toBe("00ff00");
    expect(colorOf(harness.runtime, "object-b")).toBe("ffffff");
    expect(harness.colorService.getState().trial).toMatchObject({
      objectNodeId: "object-a",
      source: "test",
      color: "#00ff00",
      ruleIndex: 0
    });

    harness.colorService.endTrial();
    expect(colorOf(harness.runtime, "object-a")).toBe("ffffff");
    expect(harness.colorService.getState().trial).toBeNull();
    expect(executor.mock.calls.length).toBe(requests);
    expect(harness.editor.getHistoryState()).toEqual(history);

    harness.colorService.startTrial({
      objectNodeId: "object-a",
      color: RUNNING_COLOR,
      value: false,
      source: "sample"
    });
    expect(colorOf(harness.runtime, "object-a")).toBe("888888");
    harness.colorService.startTrial({
      objectNodeId: "object-b",
      color: RUNNING_COLOR,
      value: true,
      source: "sample"
    });
    expect(colorOf(harness.runtime, "object-a")).toBe("ffffff");
    expect(colorOf(harness.runtime, "object-b")).toBe("00ff00");

    await harness.service.startPreview();
    expect(harness.colorService.getState().trial).toBeNull();
    expect(harness.colorService.startTrial({
      objectNodeId: "object-a",
      color: RUNNING_COLOR,
      value: true,
      source: "test"
    })).toMatchObject({
      ok: false,
      problems: [expect.objectContaining({ code: "preview-active" })]
    });
    harness.editor.dispose();
  });

  it("ends a trial when the binding configuration changes", async () => {
    const harness = await createHarness(async () => jsonResponse(body()), { objects: ["object-a"] });
    await saveColorBinding(harness.editor, harness.queryId, "object-a", RUNNING_COLOR);
    await harness.runtime.project();
    harness.colorService.startTrial({
      objectNodeId: "object-a",
      color: RUNNING_COLOR,
      value: true,
      source: "test"
    });
    expect(colorOf(harness.runtime, "object-a")).toBe("00ff00");

    await saveColorBinding(harness.editor, harness.queryId, "object-a", RUNNING_COLOR, { deviceId: "pump-02" });
    await flush();

    expect(harness.colorService.getState().trial).toBeNull();
    expect(colorOf(harness.runtime, "object-a")).toBe("ffffff");
    harness.editor.dispose();
  });

  it("ends a trial when its target object is removed", async () => {
    const harness = await createHarness(async () => jsonResponse(body()), { objects: ["object-a", "object-b"] });
    await harness.runtime.project();
    harness.colorService.startTrial({
      objectNodeId: "object-a",
      color: RUNNING_COLOR,
      value: true,
      source: "test"
    });
    expect(colorOf(harness.runtime, "object-a")).toBe("00ff00");

    expect(harness.editor.dispatch({ type: "delete-objects", objectIds: ["object-a"] }).ok).toBe(true);

    expect(harness.colorService.getState().trial).toBeNull();
    expect(harness.colorService.getState().objects["object-a"]).toBeUndefined();
    expect(colorOf(harness.runtime, "object-b")).toBe("ffffff");
    harness.editor.dispose();
  });

  it("stops global preview before an import command continues", async () => {
    const harness = await createHarness(async () => jsonResponse(body()), { objects: ["object-a"] });
    await saveColorBinding(harness.editor, harness.queryId, "object-a", RUNNING_COLOR);
    await harness.runtime.project();
    await harness.service.startPreview();
    expect(colorOf(harness.runtime, "object-a")).toBe("00ff00");

    const imported = harness.editor.dispatch({
      type: "import-glb",
      objectId: "object-b",
      asset: { id: "asset-object-b" }
    });

    expect(imported.ok).toBe(true);
    expect(harness.service.getObjectDataState().preview.enabled).toBe(false);
    expect(colorOf(harness.runtime, "object-a")).toBe("ffffff");
    harness.editor.dispose();
  });

  it("rejects transform and material commands during global preview while allowing selection and data edits", async () => {
    const harness = await createHarness(async () => jsonResponse(body()), { objects: ["object-a"] });
    await saveColorBinding(harness.editor, harness.queryId, "object-a", RUNNING_COLOR);
    await harness.runtime.project();
    await harness.service.startPreview();

    const transform = harness.editor.dispatch({
      type: "set-transform",
      objectId: "object-a",
      transform: { position: [2, 0, 0] }
    });
    expect(transform.ok).toBe(false);
    expect(transform.error).toContain("data-preview-locked");
    expect(harness.editor.getSnapshot().objects["object-a"].transform.position).toEqual([0, 0, 0]);

    const material = harness.editor.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { color: "#ff0000" }
    });
    expect(material.ok).toBe(false);
    expect(material.error).toContain("data-preview-locked");

    expect(harness.editor.dispatch({ type: "select-node", nodeId: "object-a" }).ok).toBe(true);
    await saveColorBinding(harness.editor, harness.queryId, "object-a", {
      propertyKey: "temperature",
      rules: [{ operator: "gte", value: 40, max: null, color: "#ff0000" }]
    });
    expect(harness.service.getObjectDataState().preview.enabled).toBe(true);

    const undo = harness.editor.undo();
    expect(undo.ok).toBe(true);
    expect(harness.service.getObjectDataState().preview.enabled).toBe(false);
    expect(harness.editor.dispatch({
      type: "set-transform",
      objectId: "object-a",
      transform: { position: [1, 0, 0] }
    }).ok).toBe(true);
    harness.editor.dispose();
  });

  it("restores authored colors when a binding is disabled or removed during preview", async () => {
    const harness = await createHarness(async () => jsonResponse(body()), { objects: ["object-a"] });
    await saveColorBinding(harness.editor, harness.queryId, "object-a", RUNNING_COLOR);
    await harness.runtime.project();
    await harness.service.startPreview();
    expect(colorOf(harness.runtime, "object-a")).toBe("00ff00");

    const disable = buildSaveDataObjectBindingCommand(harness.editor.getSnapshot(), {
      ...harness.editor.getSnapshot().dataSources.bindings["object-a"],
      enabled: false
    });
    if (!disable.ok) throw new Error("Expected a valid binding update.");
    expect(harness.editor.dispatch(disable.command).ok).toBe(true);
    await flush();
    expect(colorOf(harness.runtime, "object-a")).toBe("ffffff");

    const enable = buildSaveDataObjectBindingCommand(harness.editor.getSnapshot(), {
      ...harness.editor.getSnapshot().dataSources.bindings["object-a"],
      enabled: true
    });
    if (!enable.ok) throw new Error("Expected a valid binding update.");
    expect(harness.editor.dispatch(enable.command).ok).toBe(true);
    await flush();
    expect(colorOf(harness.runtime, "object-a")).toBe("00ff00");

    expect(harness.editor.dispatch({ type: "delete-data-object-binding", objectNodeId: "object-a" }).ok).toBe(true);
    await flush();
    expect(colorOf(harness.runtime, "object-a")).toBe("ffffff");
    expect(harness.colorService.getState().objects["object-a"]).toBeUndefined();
    harness.editor.dispose();
  });

  it("reports unsupported material capabilities without failing the binding", async () => {
    const harness = await createHarness(async () => jsonResponse(body()), {
      objects: ["object-a"],
      mesh: () => new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: "#123456" }))
    });
    await saveColorBinding(harness.editor, harness.queryId, "object-a", RUNNING_COLOR);
    await harness.runtime.project();
    await harness.service.startPreview();

    expect(harness.colorService.getState().objects["object-a"]).toMatchObject({
      color: "#00ff00",
      status: "unsupported",
      capabilities: {
        status: "unsupported",
        meshCount: 1,
        supportedSlotCount: 0,
        problems: [{ code: "color-material-unsupported", materialType: "MeshBasicMaterial" }]
      }
    });
    const root = harness.runtime.getNodeTarget("object-a")!;
    const mesh = root as unknown as Mesh;
    expect((mesh.material as MeshBasicMaterial).color.getHexString()).toBe("123456");
    expect(harness.editor.getSnapshot().dataSources.bindings["object-a"].color).toEqual(RUNNING_COLOR);
    harness.editor.dispose();
  });

  it("stops preview before restore", async () => {
    const harness = await createHarness(async () => jsonResponse(body()), { objects: ["object-a"] });
    await saveColorBinding(harness.editor, harness.queryId, "object-a", RUNNING_COLOR);
    await harness.runtime.project();
    await harness.service.startPreview();

    harness.editor.restore(harness.editor.serialize());

    expect(harness.service.getObjectDataState().preview.enabled).toBe(false);
    expect(harness.colorService.getState().previewEnabled).toBe(false);
    expect(harness.colorService.getState().objects["object-a"]).toMatchObject({
      color: null,
      reason: "preview-off"
    });
    harness.editor.dispose();
  });
});

interface Harness {
  editor: EditorWithGlbImport;
  service: EditorDataService;
  colorService: EditorDataColorService;
  runtime: EditorRuntime;
  queryId: string;
  qualityQueryId: string;
  attachRuntime(): void;
}

async function createHarness(
  executor: DataRequestExecutor,
  options: {
    objects: string[];
    material?: () => MeshStandardMaterial;
    mesh?: () => Mesh;
    deferRuntime?: boolean;
  }
): Promise<Harness> {
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
  const query = buildSaveDataQueryCommand(editor.getSnapshot(), queryDefinition());
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  if (!editor.dispatch(query.command).ok) throw new Error("Failed to save query.");
  const queryId = Object.keys(editor.getSnapshot().dataSources.queries)[0]!;
  const qualityQuery = buildSaveDataQueryCommand(editor.getSnapshot(), queryDefinition(true));
  if (!qualityQuery.ok) throw new Error(qualityQuery.problems.map((problem) => problem.message).join("\n"));
  if (!editor.dispatch(qualityQuery.command).ok) throw new Error("Failed to save quality query.");
  const qualityQueryId = Object.keys(editor.getSnapshot().dataSources.queries)
    .find((candidate) => candidate !== queryId)!;
  for (const objectId of options.objects) {
    const imported = editor.dispatch({ type: "import-glb", objectId, asset: { id: `asset-${objectId}` } });
    if (!imported.ok) throw new Error(imported.error);
  }

  const container = document.createElement("div");
  let runtime: EditorRuntime | null = null;
  const attachRuntime = () => {
    runtime = editor.mountRuntime({
      container,
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: {
        load: async () => options.mesh
          ? options.mesh()
          : new Mesh(
              new BoxGeometry(),
              options.material ? options.material() : new MeshStandardMaterial({ color: "#ffffff" })
            )
      },
      rendererFactory: createFakeRenderer,
      interactions: false,
      scheduleFrame: () => 0,
      cancelFrame: () => {}
    });
  };
  if (!options.deferRuntime) {
    attachRuntime();
  }

  return {
    editor,
    service: editor.getDataService(),
    colorService: editor.getDataColorService()!,
    get runtime() {
      return runtime!;
    },
    queryId,
    qualityQueryId,
    attachRuntime
  };
}

async function saveColorBinding(
  editor: EditorWithGlbImport,
  queryId: string,
  objectNodeId: string,
  color: DataBindingColor,
  patch: { deviceId?: string } = {}
) {
  const result = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId,
    queryId,
    deviceId: patch.deviceId ?? "pump-01",
    enabled: true,
    details: [{ key: "temperature" }, { key: "running" }],
    color
  });
  if (!result.ok) return result;
  return editor.dispatch(result.command);
}

function materialOf(runtime: Harness["runtime"], nodeId: string): MeshStandardMaterial {
  const root = runtime.getNodeTarget(nodeId);
  if (!root) throw new Error(`Missing runtime object ${nodeId}`);
  let found: MeshStandardMaterial | null = null;
  root.traverse((object) => {
    if (!found && object instanceof Mesh && object.material instanceof MeshStandardMaterial) {
      found = object.material;
    }
  });
  if (!found) throw new Error(`Missing standard material on ${nodeId}`);
  return found;
}

function colorOf(runtime: Harness["runtime"], nodeId: string): string {
  return materialOf(runtime, nodeId).color.getHexString();
}

function queryDefinition(withQuality = false) {
  return {
    connectionId: "connection-a",
    name: withQuality ? "Pump quality" : "Pump status",
    path: "/pumps",
    parameters: [{ name: "areaId", type: "string" as const, defaultValue: "A" }],
    mapping: {
      mode: "array" as const,
      root: [{ kind: "key" as const, key: "items" }],
      identity: { kind: "path" as const, path: [{ kind: "key" as const, key: "deviceCode" }], valueType: "string" as const },
      displayName: [{ kind: "key" as const, key: "name" }],
      properties: [
        {
          key: "temperature",
          label: "Temperature",
          type: "number" as const,
          nullable: false,
          unit: "°C",
          source: [{ kind: "key" as const, key: "tempRaw" }],
          transform: { kind: "scale" as const, factor: 0.1, offset: 0 },
          range: null,
          allowed: null
        },
        {
          key: "running",
          label: "Running",
          type: "boolean" as const,
          nullable: false,
          unit: null,
          source: [{ kind: "key" as const, key: "run" }],
          transform: { kind: "map" as const, entries: [{ from: 1, to: true }, { from: 0, to: false }] },
          range: null,
          allowed: null
        }
      ],
      observedAt: null,
      sourceQuality: withQuality
        ? {
            path: [{ kind: "key" as const, key: "quality" }],
            entries: [
              { from: "good", quality: "good" as const },
              { from: "uncertain", quality: "uncertain" as const },
              { from: "bad", quality: "bad" as const }
            ]
          }
        : null
    },
    updatePolicy: { ...UPDATE_POLICY }
  };
}

function body(patch: { quality?: string } = {}): Record<string, unknown> {
  return {
    items: [
      {
        deviceCode: "pump-01",
        name: "Pump 1",
        tempRaw: 426,
        run: 1,
        observedAt: new Date(Date.now() - 1_000).toISOString(),
        ...(patch.quality ? { quality: patch.quality } : {})
      },
      {
        deviceCode: "pump-02",
        name: "Pump 2",
        tempRaw: 380,
        run: 0,
        observedAt: new Date(Date.now() - 1_000).toISOString(),
        ...(patch.quality ? { quality: patch.quality } : {})
      }
    ]
  };
}

function jsonResponse(value: unknown): DataResponseDescriptor {
  return { status: 200, contentType: "application/json", body: JSON.stringify(value) };
}

function createFakeRenderer(): RendererLike {
  return {
    domElement: document.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
  await vi.advanceTimersByTimeAsync(0);
}
