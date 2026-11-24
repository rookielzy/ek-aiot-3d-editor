import { describe, expect, it } from "vitest";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataObjectBindingInput,
  type DataQueryDefinition
} from "../index";
import { createLegacyProofLoopSnapshot } from "../../test/fixtures/legacy-proof-loop";
import { decodeArchiveJson, defaultArchiveAdapter } from "./archive-adapter";
import { PROJECT_MANIFEST_PATH, PROJECT_SCENE_PATH } from "./package-types";

describe("data configuration project round-trip", () => {
  it("keeps multiple connections, queries, and bindings equivalent through JSON and .ek3d", () => {
    const source = createEditor();
    seedMultiSourceConfiguration(source);
    const serialized = source.serialize();

    const fromJson = createEditor({ snapshot: JSON.parse(JSON.stringify(serialized)) });
    const packageBytes = source.exportProject().packageBytes as Uint8Array;
    const fromPackage = createEditor();
    expect(fromPackage.importProject(packageBytes).ok).toBe(true);

    expect(fromJson.getSnapshot().dataSources).toEqual(serialized.dataSources);
    expect(fromPackage.getSnapshot().dataSources).toEqual(serialized.dataSources);
    expect(fromJson.serialize().dataSources).toEqual(serialized.dataSources);
    expect(fromPackage.serialize().dataSources).toEqual(serialized.dataSources);

    // Bindings keep identity across all three paths.
    expect(Object.keys(fromPackage.getSnapshot().dataSources.bindings).sort()).toEqual(["object-a", "object-b"]);
    expect(fromPackage.getSnapshot().dataSources.connections["connection-b"].auth).toEqual({
      kind: "api-key",
      credentialRef: "line-token",
      headerName: "X-API-Key"
    });

    fromJson.dispose();
    fromPackage.dispose();
    source.dispose();
  });

  it("keeps the project container layout unchanged while carrying data configuration", () => {
    const source = createEditor();
    seedMultiSourceConfiguration(source);

    const exported = source.exportProject();

    expect(exported.manifest).toMatchObject({ version: 1, scenePath: "scene.json", completeness: "complete" });
    const entries = defaultArchiveAdapter.read(exported.packageBytes as Uint8Array);
    expect(entries.map((entry) => entry.path).sort()).toEqual([
      "assets/asset-a.glb",
      "assets/asset-b.glb",
      PROJECT_MANIFEST_PATH,
      PROJECT_SCENE_PATH
    ]);
    const scene = decodeArchiveJson(entries.find((entry) => entry.path === PROJECT_SCENE_PATH)!.bytes) as {
      version: number;
      dataSources: unknown;
    };
    expect(scene.version).toBe(10);
    expect(scene.dataSources).toEqual(source.serialize().dataSources);
    source.dispose();
  });

  it("exports no samples, test parameters, health marks, secrets, or runtime values", async () => {
    const source = createEditor({
      credentials: [{ ref: "plant-token", label: "Plant token", available: true }],
      executor: async () => ({ status: 200, contentType: "application/json", body: JSON.stringify(freshBody()) })
    });
    seedMultiSourceConfiguration(source);
    await source.getDataService().startPreview();
    expect(source.getDataService().getObjectDataState().objects["object-a"].status).toBe("ready");
    const run = source.getDataService().executeQueryDraft({
      ...queryDefinition("connection-a", "query-a", "Pump status"),
      name: "Draft probe"
    }, { overrides: { areaId: "SECRET-TEST-PARAM" } });
    expect(run.id).toBeTruthy();
    source.getDataService().stopPreview();

    const exported = source.exportProject();
    const text = packageText(exported.packageBytes as Uint8Array);

    expect(exported.ok).toBe(true);
    expect(text).not.toContain("SECRET-TEST-PARAM");
    expect(text).not.toContain("pump-token-value");
    expect(text).not.toContain("receivedAt");
    expect(text).not.toContain("lastRefreshAt");
    expect(text).not.toContain("executor");
    expect(text).not.toContain("AbortController");
    expect(text).toContain("plant-token");
    source.dispose();
  });

  it("exports a valid configuration while the service is unreachable", async () => {
    const source = createEditor({
      executor: async () => {
        throw new Error("network is down");
      }
    });
    seedMultiSourceConfiguration(source);
    await source.getDataService().startPreview();
    expect(source.getDataService().getObjectDataState().objects["object-a"]).toMatchObject({ status: "error" });

    const exported = source.exportProject();
    const restored = createEditor();
    const imported = restored.importProject(exported.packageBytes as Uint8Array);

    expect(exported.ok).toBe(true);
    expect(imported.ok).toBe(true);
    expect(restored.getSnapshot().dataSources).toEqual(source.getSnapshot().dataSources);
    expect(restored.getDataService().getObjectDataState().preview.enabled).toBe(false);
    restored.dispose();
    source.dispose();
  });

  it("keeps previously authored assets, materials, and camera views through the same round-trip", () => {
    const source = createEditor();
    seedMultiSourceConfiguration(source);
    source.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { color: "#123456" }
    });
    source.dispatch({
      type: "create-camera-view",
      view: {
        id: "view-a",
        name: "Hero view",
        projection: { kind: "perspective", fov: 50 },
        position: [1, 2, 3],
        target: [0, 0, 0],
        near: 0.1,
        far: 100
      }
    });
    const packageBytes = source.exportProject().packageBytes as Uint8Array;
    const restored = createEditor();

    expect(restored.importProject(packageBytes).ok).toBe(true);
    expect(restored.getSnapshot().materials.assignments["object:object-a"]).toBeTruthy();
    expect(restored.getSnapshot().cameras["view-a"]).toMatchObject({ name: "Hero view" });
    expect(restored.getSnapshot().assets["asset-a"]).toMatchObject({ kind: "glb" });
    restored.dispose();
    source.dispose();
  });
});

describe("data configuration migration", () => {
  it("migrates a v1 scene without data sources and keeps the old scene", () => {
    const migrated = createEditor({ snapshot: createLegacyProofLoopSnapshot() }).getSnapshot();

    expect(migrated.version).toBe(10);
    expect(migrated.dataSources).toEqual({ connections: {}, queries: {}, bindings: {} });
    expect(migrated.objects["object-a"]).toMatchObject({ asset: { id: "asset-a" } });
    expect(migrated.nodes["object-a"].transform.position).toEqual([4, 5, 6]);
  });

  it("does not synthesize connections or bindings for any previous version", () => {
    const editor = createEditor();
    seedMultiSourceConfiguration(editor);
    const current = editor.serialize();
    const previousVersions = [8, 7, 6, 5, 4, 3, 2] as const;

    for (const version of previousVersions) {
      const { dataSources: _dataSources, ...rest } = current as unknown as Record<string, unknown>;
      const snapshot = { ...rest, version };
      const restored = createEditor({ snapshot: snapshot as never });
      expect(restored.getSnapshot().dataSources).toEqual({ connections: {}, queries: {}, bindings: {} });
      expect(restored.getSnapshot().objects["object-a"]).toMatchObject({ asset: { id: "asset-a" } });
      expect(restored.getSnapshot().cameras["view-a"]).toBeUndefined();
      restored.dispose();
    }
    editor.dispose();
  });
});

function seedMultiSourceConfiguration(editor: ReturnType<typeof createEditor>): void {
  createConnection(editor, {
    id: "connection-a",
    name: "Plant API",
    baseUrl: "https://api.example.test/v1",
    auth: { kind: "bearer", credentialRef: "plant-token" }
  });
  createConnection(editor, {
    id: "connection-b",
    name: "Line API",
    baseUrl: "https://line.example.test",
    auth: { kind: "api-key", credentialRef: "line-token", headerName: "X-API-Key" }
  });

  for (const [connectionId, queryId, name] of [
    ["connection-a", "query-a", "Pump status"],
    ["connection-b", "query-b", "Line metrics"]
  ] as const) {
    const query = buildSaveDataQueryCommand(editor.getSnapshot(), queryDefinition(connectionId, queryId, name));
    if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
    const saved = editor.dispatch(query.command);
    if (!saved.ok) throw new Error(saved.error);
  }

  for (const [objectId, queryId, deviceId] of [
    ["object-a", "query-a", "pump-01"],
    ["object-b", "query-b", "line-01"]
  ] as const) {
    const imported = editor.dispatch({
      type: "import-glb",
      objectId,
      name: objectId === "object-a" ? "Pump A" : "Line B",
      asset: { id: `asset-${objectId.slice(-1)}`, source: new Uint8Array([1, 2, 3]) }
    });
    if (!imported.ok) throw new Error(imported.error);
    const bindingInput: DataObjectBindingInput = {
      objectNodeId: objectId,
      queryId,
      parameterOverrides: { areaId: "A" },
      deviceId,
      enabled: true,
      details: [{ key: "temperature", precision: 1 }],
      color: { propertyKey: "temperature", rules: [{ operator: "gte", value: 40, color: "#ff0000" }] }
    };
    const binding = buildSaveDataObjectBindingCommand(editor.getSnapshot(), bindingInput);
    if (!binding.ok) throw new Error(binding.problems.map((problem) => problem.message).join("\n"));
    const savedBinding = editor.dispatch(binding.command);
    if (!savedBinding.ok) throw new Error(savedBinding.error);
  }
}

function createConnection(
  editor: ReturnType<typeof createEditor>,
  connection: {
    id: string;
    name: string;
    baseUrl: string;
    auth: { kind: "bearer"; credentialRef: string } | { kind: "api-key"; credentialRef: string; headerName: string };
  }
): void {
  const result = editor.dispatch({
    type: "create-data-connection",
    connection: { ...connection, headers: {}, timeoutMs: 10_000 }
  });
  if (!result.ok) throw new Error(result.error);
}

function queryDefinition(connectionId: string, queryId: string, name: string): DataQueryDefinition & { id: string } {
  return {
    id: queryId,
    connectionId,
    name,
    path: "/pumps",
    parameters: [{ name: "areaId", type: "string", defaultValue: "A" }],
    mapping: {
      mode: "array",
      root: [{ kind: "key", key: "items" }],
      identity: { kind: "path", path: [{ kind: "key", key: "deviceCode" }], valueType: "string" },
      displayName: [{ kind: "key", key: "name" }],
      properties: [{
        key: "temperature",
        label: "Temperature",
        type: "number",
        nullable: false,
        unit: "°C",
        source: [{ kind: "key", key: "tempRaw" }],
        transform: { kind: "scale", factor: 0.1, offset: 0 },
        range: null,
        allowed: null
      }],
      observedAt: null,
      sourceQuality: null
    },
    updatePolicy: { refreshIntervalMs: 5_000, maxAgeMs: 15_000 }
  };
}

function packageText(packageBytes: Uint8Array): string {
  return defaultArchiveAdapter.read(packageBytes)
    .map((entry) => decodeJsonText(entry.bytes))
    .join("\n");
}

function decodeJsonText(bytes: Uint8Array): string {
  try {
    return JSON.stringify(decodeArchiveJson(bytes));
  } catch {
    return "";
  }
}

function freshBody(): Record<string, unknown> {
  return {
    items: [{
      deviceCode: "pump-01",
      name: "Pump 1",
      tempRaw: 426
    }]
  };
}
