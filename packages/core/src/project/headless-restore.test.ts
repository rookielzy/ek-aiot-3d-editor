import { describe, expect, it, vi } from "vitest";
import {
  buildDataSourcesWorkspaceModel,
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataRequestExecutor
} from "../index";

describe("headless host restore", () => {
  it("restores a data configuration in a new host without a DOM or WebGL", async () => {
    const source = createEditor();
    seedConfiguration(source);
    const packageBytes = source.exportProject().packageBytes as Uint8Array;
    source.dispose();

    // A fresh host: no container, no renderer, no runtime.
    const host = createEditor({ credentials: [{ ref: "plant-token", label: "Plant token", available: true }] });
    expect(host.getRuntime()).toBeNull();
    const result = host.importProject(packageBytes);

    expect(result.ok).toBe(true);
    expect(host.getRuntime()).toBeNull();
    expect(host.getSnapshot().dataSources.connections["connection-a"]).toMatchObject({ name: "Plant API" });
    expect(buildDataSourcesWorkspaceModel(host.getSnapshot(), {
      credentials: host.getDataCredentials()
    })).toMatchObject({
      totalCount: 1,
      missingCredentialCount: 0
    });

    const executor = vi.fn<DataRequestExecutor>(async () => ({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [{ deviceCode: "pump-01", name: "Pump 1", tempRaw: 426 }] })
    }));
    host.getDataService().setHostCapabilities({ executor });
    await host.getDataService().startPreview();

    expect(executor).toHaveBeenCalledTimes(1);
    expect(host.getDataService().getObjectDataState().objects["object-a"]).toMatchObject({
      status: "ready",
      entityId: "pump-01"
    });
    host.dispose();
  });
});

function seedConfiguration(editor: ReturnType<typeof createEditor>): void {
  const connection = editor.dispatch({
    type: "create-data-connection",
    connection: {
      id: "connection-a",
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      auth: { kind: "bearer", credentialRef: "plant-token" },
      headers: {},
      timeoutMs: 10_000
    }
  });
  if (!connection.ok) throw new Error(connection.error);
  const query = buildSaveDataQueryCommand(editor.getSnapshot(), {
    id: "query-a",
    connectionId: "connection-a",
    name: "Pump status",
    path: "/pumps",
    parameters: [],
    mapping: {
      mode: "array",
      root: [{ kind: "key", key: "items" }],
      identity: { kind: "path", path: [{ kind: "key", key: "deviceCode" }], valueType: "string" },
      displayName: null,
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
  });
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  const savedQuery = editor.dispatch(query.command);
  if (!savedQuery.ok) throw new Error(savedQuery.error);
  const imported = editor.dispatch({
    type: "import-glb",
    objectId: "object-a",
    asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) }
  });
  if (!imported.ok) throw new Error(imported.error);
  const binding = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId: "object-a",
    queryId: "query-a",
    parameterOverrides: {},
    deviceId: "pump-01",
    enabled: true,
    details: [{ key: "temperature", precision: 1 }]
  });
  if (!binding.ok) throw new Error(binding.problems.map((problem) => problem.message).join("\n"));
  const savedBinding = editor.dispatch(binding.command);
  if (!savedBinding.ok) throw new Error(savedBinding.error);
}
