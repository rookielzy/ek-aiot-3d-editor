import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import type { SceneSnapshot } from "../snapshot/types";
import { buildSaveDataObjectBindingCommand, buildSaveDataQueryCommand } from "../index";
import { encodeArchiveJson } from "./archive-adapter";
import { defaultArchiveAdapter } from "./archive-adapter";
import type { DataCredentialDescriptor } from "../data-sources/types";

const PROJECT_MANIFEST = {
  version: 1,
  scenePath: "scene.json",
  completeness: "complete",
  assets: {}
};

describe("project restore reporting", () => {
  it("reports a scene with a dangling query reference as damaged data configuration", () => {
    const editor = createEditor();
    const packageBytes = packageWithScene(withDanglingBinding(healthyScene()));

    const result = editor.importProject(packageBytes);

    expect(result.ok).toBe(false);
    expect(result.outcome?.kind).toBe("config-error");
    expect(result.problems).toMatchObject([expect.objectContaining({
      code: "project-data-config-invalid",
      source: "validation"
    })]);
    expect(result.problems[0]!.message).toContain("query-missing");
    expect(editor.getSnapshot().objects["object-a"]).toBeUndefined();
    editor.dispose();
  });

  it("reports a corrupt archive as a package problem rather than a config error", () => {
    const editor = createEditor();

    const result = editor.importProject(new Uint8Array([0, 1, 2]));

    expect(result.ok).toBe(false);
    expect(result.outcome?.kind).toBe("package-error");
    expect(result.problems).toMatchObject([expect.objectContaining({ code: "project-archive-invalid" })]);
    editor.dispose();
  });

  it("keeps structurally corrupt data configuration a package problem, not a repairable one", () => {
    const editor = createEditor();
    const scene = healthyScene();
    // A connection whose own id does not match its key is corruption, not a dangling reference.
    const corrupt = {
      ...scene,
      dataSources: {
        ...scene.dataSources,
        connections: {
          "connection-a": { ...scene.dataSources.connections["connection-a"]!, id: "connection-other" }
        }
      }
    };

    const result = editor.importProject(packageWithScene(corrupt));

    expect(result.ok).toBe(false);
    expect(result.outcome?.kind).toBe("package-error");
    expect(result.problems).toMatchObject([expect.objectContaining({ code: "project-scene-invalid" })]);
    editor.dispose();
  });

  it("restores a valid configuration without credentials and reports that a reconnect is required", () => {
    const source = createEditor();
    seedRestorableConfiguration(source);
    const packageBytes = source.exportProject().packageBytes as Uint8Array;
    source.dispose();

    const editor = createEditor({ credentials: [] });
    const result = editor.importProject(packageBytes);

    expect(result.ok).toBe(true);
    expect(result.outcome).toMatchObject({ kind: "reconnect", missingCredentialCount: 1 });
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toMatchObject({ deviceId: "pump-01" });
    expect(editor.getDataService().getObjectDataState().preview.enabled).toBe(false);
    editor.dispose();
  });

  it("restores a valid configuration with its credential as clean", () => {
    const source = createEditor();
    seedRestorableConfiguration(source);
    const packageBytes = source.exportProject().packageBytes as Uint8Array;
    source.dispose();

    const editor = createEditor({
      credentials: [credential(true)]
    });
    const result = editor.importProject(packageBytes);

    expect(result.ok).toBe(true);
    expect(result.outcome).toMatchObject({ kind: "none", missingCredentialCount: 0 });
    editor.dispose();
  });

  it("reports a restored configuration as clean when it needs no credential", () => {
    const source = createEditor();
    seedRestorableConfiguration(source, { auth: { kind: "none" } });
    const packageBytes = source.exportProject().packageBytes as Uint8Array;
    source.dispose();

    const editor = createEditor();
    const result = editor.importProject(packageBytes);

    expect(result.outcome).toMatchObject({ kind: "none", missingCredentialCount: 0 });
    editor.dispose();
  });
});

function credential(available: boolean): DataCredentialDescriptor {
  return { ref: "plant-token", label: "Plant token", available };
}

function healthyScene(): SceneSnapshot {
  const editor = createEditor();
  seedRestorableConfiguration(editor);
  const snapshot = editor.getSnapshot();
  editor.dispose();
  return snapshot;
}

function seedRestorableConfiguration(
  editor: ReturnType<typeof createEditor>,
  options: { auth?: { kind: "none" } | { kind: "bearer"; credentialRef: string } } = {}
): void {
  const connection = editor.dispatch({
    type: "create-data-connection",
    connection: {
      id: "connection-a",
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      auth: options.auth ?? { kind: "bearer", credentialRef: "plant-token" },
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
  editor.dispatch({
    type: "import-glb",
    objectId: "object-a",
    name: "Pump A",
    asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) }
  });
  const binding = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId: "object-a",
    queryId: "query-a",
    parameterOverrides: {},
    deviceId: "pump-01",
    enabled: true,
    details: [{ key: "temperature", precision: 1 }],
    color: { propertyKey: "temperature", rules: [{ operator: "gte", value: 40, color: "#ff0000" }] }
  });
  if (!binding.ok) throw new Error(binding.problems.map((problem) => problem.message).join("\n"));
  const savedBinding = editor.dispatch(binding.command);
  if (!savedBinding.ok) throw new Error(savedBinding.error);
}

function withDanglingBinding(scene: SceneSnapshot): SceneSnapshot {
  return {
    ...scene,
    dataSources: {
      ...scene.dataSources,
      bindings: {
        "object-a": {
          ...scene.dataSources.bindings["object-a"],
          queryId: "query-missing"
        }
      }
    }
  };
}

function packageWithScene(scene: unknown): Uint8Array {
  return defaultArchiveAdapter.write([
    { path: "project.json", bytes: encodeArchiveJson(PROJECT_MANIFEST) },
    { path: "scene.json", bytes: encodeArchiveJson(scene) }
  ]);
}
