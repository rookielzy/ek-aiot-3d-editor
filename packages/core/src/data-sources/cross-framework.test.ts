import { describe, expect, it } from "vitest";
import {
  buildDataObjectDetailModel,
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  createEmptySnapshot,
  type DataObjectDetailModel,
  type DataQueryDefinition,
  type DataRequestDescriptor,
  type DataRequestExecutor,
  type DataResponseDescriptor,
  type Editor,
  type SceneDataSources
} from "../index";
import { decodeArchiveJson, defaultArchiveAdapter } from "../project/archive-adapter";
import { PROJECT_SCENE_PATH } from "../project/package-types";

/**
 * Cross-framework delivery contract.
 *
 * No framework appears in this file on purpose. React, Vue, and vanilla hosts
 * are all clients of the same durable `dataSources` domain, the same host
 * executor seam, and the same runtime state. A project configured in one host
 * must restore in the next one with identical ids, identity, and values, and a
 * restored project must stay offline until a host explicitly connects.
 *
 * The wire format is identical across hosts, so this file is the shipped
 * cross-framework proof. The browser suite repeats the same three-hop journey
 * through the real Workbench UI against a real same-origin HTTP fixture.
 */
const CONNECTION_ID = "plant-api";
const QUERY_ID = "pump-status";
const OBJECT_ID = "plant-pump";
const DEVICE_ID = "plant-pump";
const SECRET = "plant-secret";

describe("cross-framework data source delivery", () => {
  it("carries a React-authored project into a Vue host and a vanilla host with the same ids and identity", async () => {
    const reactHost = createConnectedHost();
    const authored = await authorDataProject(reactHost);
    const projectBytes = reactHost.editor.exportProject().packageBytes;
    expect(projectBytes).toBeInstanceOf(Uint8Array);

    // Vue receives the project package, not a reference to React's editor state.
    // The Vue host knows the credential reference but not the secret yet.
    const vueHost = createEditor({ credentials: [{ ref: "plant-token", label: "Plant token", available: false }] });
    const vueImport = vueHost.importProject(copyBytes(projectBytes as Uint8Array));
    expect(vueImport.ok).toBe(true);
    expect(vueImport.outcome).toEqual({ kind: "reconnect", missingCredentialCount: 1 });
    expect(vueHost.getSnapshot().dataSources).toEqual(authored.dataSources);
    expect(previewEnabled(vueHost)).toBe(false);
    expect(reactHost.urls).toHaveLength(1);

    // Vue has no executor yet: configuration stays editable and the missing
    // host capability is a locatable runtime problem, not a broken snapshot.
    await vueHost.getDataService().startPreview();
    const offline = objectState(vueHost);
    expect(offline.status).toBe("error");
    expect(problemsOf(offline)).toContain("executor-unavailable");
    expect(reactHost.urls).toHaveLength(1);
    vueHost.getDataService().stopPreview();
    expect(previewEnabled(vueHost)).toBe(false);

    // Supplying the host capability repairs the same configuration in place.
    const vueUrls: string[] = [];
    vueHost.getDataService().setHostCapabilities({
      executor: credentialCheckingExecutor(vueUrls),
      credentials: CREDENTIALS
    });
    await vueHost.getDataService().startPreview();
    await waitForReady(vueHost);
    expect(vueUrls).toEqual([authored.url]);
    expectDetail(vueHost, authored);
    expect(vueHost.getSnapshot().dataSources).toEqual(authored.dataSources);
    // The descriptor each host builds is the same request, not a reimplementation.
    expect(reactHost.requests).toHaveLength(1);
    expect(reactHost.requests[0]).toMatchObject({
      method: "GET",
      credentialRef: "plant-token",
      auth: { kind: "bearer", credentialRef: "plant-token" }
    });

    // The same v9 JSON snapshot is all a vanilla (no DOM, no framework) host needs.
    const vanillaUrls: string[] = [];
    const vanilla = createEditor({
      snapshot: vueHost.serialize(),
      executor: credentialCheckingExecutor(vanillaUrls),
      credentials: CREDENTIALS
    });
    expect(vanilla.getSnapshot()).toEqual(vueHost.getSnapshot());
    expect(previewEnabled(vanilla)).toBe(false);
    expect(vanillaUrls).toEqual([]);

    await vanilla.getDataService().startPreview();
    await waitForReady(vanilla);
    expect(vanillaUrls).toEqual([authored.url]);
    expectDetail(vanilla, authored);
    expect(vanilla.getSnapshot().dataSources).toEqual(authored.dataSources);

    reactHost.editor.dispose();
    vueHost.dispose();
    vanilla.dispose();
  });

  it.each(["react", "vue", "vanilla"] as const)(
    "keeps a project arriving from a %s host repairable when its credential is missing",
    async (origin) => {
      const source = createConnectedHost();
      await authorDataProject(source);
      const bytes = copyBytes(source.editor.exportProject().packageBytes as Uint8Array);
      // Exercise both arrival paths: project package bytes and the JSON snapshot.
      const arrivingSnapshot = origin === "vanilla" ? source.editor.serialize() : undefined;
      source.editor.dispose();

      // The receiving host knows the reference but cannot resolve the secret.
      const receiving = createEditor({
        ...(arrivingSnapshot ? { snapshot: arrivingSnapshot } : {}),
        credentials: [{ ref: "plant-token", label: "Plant token", available: false }]
      });
      if (!arrivingSnapshot) {
        const imported = receiving.importProject(bytes);
        expect(imported.ok).toBe(true);
        expect(imported.outcome).toEqual({ kind: "reconnect", missingCredentialCount: 1 });
      }
      expect(receiving.getSnapshot().dataSources.connections[CONNECTION_ID]?.auth).toEqual({
        kind: "bearer",
        credentialRef: "plant-token"
      });
      const urls: string[] = [];
      receiving.getDataService().setHostCapabilities({ executor: credentialCheckingExecutor(urls), credentials: [] });

      await receiving.getDataService().startPreview();
      const blocked = objectState(receiving);
      expect(blocked.status).toBe("error");
      expect(problemsOf(blocked)).toContain("credential-unavailable");
      // A missing credential is a host capability gap, not a network call.
      expect(urls).toEqual([]);

      // Repair: the host supplies the credential and bumps the auth revision.
      receiving.getDataService().setHostCapabilities({
        credentials: [{ ref: "plant-token", label: "Plant token", available: true }],
        authRevision: receiving.getDataService().getAuthRevision() + 1
      });
      await receiving.getDataService().refreshPreview();
      await waitForReady(receiving);
      expect(urls).toHaveLength(1);
      expect(fieldValue(detailsOf(receiving), "temperature")).toBe("41.50");

      const serialized = JSON.stringify(receiving.serialize());
      expect(serialized).not.toContain(SECRET);
      expect(serialized).not.toContain("fixture-request-");
      receiving.dispose();
    }
  );

  it("keeps hosts without connections at zero requests on every entry point", async () => {
    const requestedUrls: string[] = [];
    const countingExecutor: DataRequestExecutor = async (request) => {
      requestedUrls.push(request.url);
      return okResponse();
    };
    const emptySnapshotEditor = createEditor({ snapshot: createEmptySnapshot("empty-restored") });
    const legacySnapshot = emptySnapshotEditor.serialize();
    emptySnapshotEditor.dispose();
    const editors = ["fresh", "empty", "legacy"].map((label) => createEditor({
      executor: countingExecutor,
      ...(label === "empty" ? { snapshot: createEmptySnapshot("empty-host") } : {}),
      ...(label === "legacy" ? { snapshot: legacySnapshot } : {})
    }));
    for (const editor of editors) {
      expect(editor.getSnapshot().dataSources).toEqual({ connections: {}, queries: {}, bindings: {} });
      // Explicitly asking an empty host to preview must not create work: no
      // contexts, no object state, and no executor call.
      expect(previewEnabled(editor)).toBe(false);
      await editor.getDataService().startPreview();
      await editor.getDataService().refreshPreview();
      expect(editor.getDataService().getObjectDataState()).toMatchObject({
        preview: { contextCount: 0 },
        objects: {},
        contexts: {}
      });
      editor.getDataService().stopPreview();
      expect(previewEnabled(editor)).toBe(false);
      editor.dispose();
    }
    // The default editor (no host executor at all) is equally inert.
    const bare = createEditor();
    expect(bare.getDataService().getState().executorAvailable).toBe(false);
    await bare.getDataService().startPreview();
    expect(bare.getDataService().getObjectDataState().preview.contextCount).toBe(0);
    bare.dispose();
    expect(requestedUrls).toEqual([]);
  });

  it("keeps runtime samples, preview state, trials, and secrets out of snapshot, project, and clipboard", async () => {
    const host = createConnectedHost();
    const authored = await authorDataProject(host);
    // authorDataProject already ran one preview; the durable domain must be
    // byte-identical to the authored configuration afterwards.
    expect(host.editor.getSnapshot().dataSources).toEqual(authored.dataSources);

    const durable = JSON.stringify(host.editor.serialize());
    for (const forbidden of [SECRET, "fixture-request-"]) {
      expect(durable).not.toContain(forbidden);
    }

    // The project package carries only the durable scene, never runtime values.
    const packageBytes = host.editor.exportProject().packageBytes;
    expect(packageBytes).toBeInstanceOf(Uint8Array);
    const packageEntries = defaultArchiveAdapter.read(packageBytes as Uint8Array);
    const sceneEntry = packageEntries.find((entry) => entry.path === PROJECT_SCENE_PATH)!;
    expect(decodeArchiveJson(sceneEntry.bytes)).toEqual(JSON.parse(durable));
    const packageText = new TextDecoder().decode(packageBytes as Uint8Array);
    for (const forbidden of [SECRET, "fixture-request-"]) {
      expect(packageText).not.toContain(forbidden);
    }

    // The runtime state genuinely holds the received sample and raw fields
    // while the durable domain above does not.
    const runtime = host.editor.getDataService().getObjectDataState();
    expect(runtime.preview.enabled).toBe(true);
    expect(runtime.objects[OBJECT_ID]?.status).toBe("ready");
    expect(JSON.stringify(runtime)).toContain("\"receivedAt\"");
    expect(JSON.stringify(runtime.objects[OBJECT_ID])).toContain("\"value\":41.5");

    host.editor.dispatch({ type: "select-node", nodeId: OBJECT_ID });
    const clipboardPayload = host.editor.operations.copy();
    expect(clipboardPayload).not.toBeNull();
    expect(clipboardPayload?.dataSources?.connections[CONNECTION_ID]?.auth).toEqual({
      kind: "bearer",
      credentialRef: "plant-token"
    });
    const clipboardText = JSON.stringify(clipboardPayload);
    for (const forbidden of [SECRET, "fixture-request-"]) {
      expect(clipboardText).not.toContain(forbidden);
    }
    expect(host.editor.getSnapshot().dataSources).toEqual(authored.dataSources);
    host.editor.dispose();
  });
});

interface ConnectedHost {
  editor: Editor;
  urls: string[];
  requests: DataRequestDescriptor[];
}

const CREDENTIALS = [{ ref: "plant-token", label: "Plant token", available: true }] as const;

function createConnectedHost(): ConnectedHost {
  const urls: string[] = [];
  const requests: DataRequestDescriptor[] = [];
  const executor: DataRequestExecutor = async (request) => {
    requests.push(request);
    return credentialCheckingExecutor(urls)(request);
  };
  return { editor: createEditor({ executor, credentials: CREDENTIALS }), urls, requests };
}

async function authorDataProject(host: ConnectedHost): Promise<{
  dataSources: SceneDataSources;
  url: string;
  deviceId: string;
  value: string;
  running: string;
}> {
  const editor = host.editor;
  const connection = editor.dispatch({
    type: "create-data-connection",
    connection: {
      id: CONNECTION_ID,
      name: "Plant API",
      baseUrl: "https://plant.example.test/__fixtures__/http-data-source",
      auth: { kind: "bearer", credentialRef: "plant-token" },
      headers: { "X-Fixture-Probe": "cross-framework" },
      timeoutMs: 10_000
    }
  });
  if (!connection.ok) throw new Error(connection.error);
  const imported = editor.dispatch({
    type: "import-glb",
    objectId: OBJECT_ID,
    name: "Plant pump",
    asset: { id: "plant-pump-model" }
  });
  if (!imported.ok) throw new Error(imported.error);
  // Give the GLB a real payload so the exported project package is complete.
  editor.registerAsset({ id: "plant-pump-model", kind: "glb", label: "Plant pump.glb", source: new Uint8Array([103, 108, 84, 70]) });
  const query = buildSaveDataQueryCommand(editor.getSnapshot(), {
    id: QUERY_ID,
    connectionId: CONNECTION_ID,
    name: "Pump status",
    path: "/devices",
    parameters: [],
    mapping: queryMapping(),
    updatePolicy: { refreshIntervalMs: 60_000, maxAgeMs: 120_000 }
  });
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  if (!editor.dispatch(query.command).ok) throw new Error("Failed to save the query.");
  const binding = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId: OBJECT_ID,
    queryId: QUERY_ID,
    deviceId: DEVICE_ID,
    enabled: true,
    details: [{ key: "temperature" }, { key: "running" }]
  });
  if (!binding.ok) throw new Error(binding.problems.map((problem) => problem.message).join("\n"));
  if (!editor.dispatch(binding.command).ok) throw new Error("Failed to save the binding.");

  await editor.getDataService().startPreview();
  await waitForReady(editor);
  const details = detailsOf(editor);
  return {
    dataSources: editor.getSnapshot().dataSources,
    url: host.urls[0]!,
    deviceId: details.deviceId,
    value: fieldValue(details, "temperature")!,
    running: fieldValue(details, "running")!
  };
}

function queryMapping(): DataQueryDefinition["mapping"] {
  return {
    mode: "array",
    root: [{ kind: "key", key: "items" }],
    identity: { kind: "path", path: [{ kind: "key", key: "deviceCode" }], valueType: "string" },
    displayName: [{ kind: "key", key: "name" }],
    properties: [
      {
        key: "temperature",
        label: "Temperature",
        type: "number",
        nullable: false,
        unit: "掳C",
        source: [{ kind: "key", key: "tempRaw" }],
        transform: { kind: "scale", factor: 0.1, offset: 0 },
        range: null,
        allowed: null
      },
      {
        key: "running",
        label: "Running",
        type: "boolean",
        nullable: false,
        unit: null,
        source: [{ kind: "key", key: "run" }],
        transform: { kind: "map", entries: [{ from: 1, to: true }, { from: 0, to: false }] },
        range: null,
        allowed: null
      }
    ],
    observedAt: null,
    sourceQuality: null
  };
}

function credentialCheckingExecutor(urls: string[]): DataRequestExecutor {
  return async (request) => {
    urls.push(request.url);
    // Every host (React, Vue, vanilla) resolves the reference the same way.
    const headers: Record<string, string> = { ...request.headers };
    if (request.auth.kind === "bearer" && request.credentialRef === "plant-token") {
      headers.Authorization = `Bearer ${SECRET}`;
    }
    if (headers.Authorization !== `Bearer ${SECRET}`) {
      return { status: 401, contentType: "application/json", body: JSON.stringify({ error: "unauthorized" }) };
    }
    return okResponse(urls.length);
  };
}

/**
 * One shared response shape for every receiving host. The pump is deliberately
 * not the first row, so identity must come from the configured device id rather
 * than from row order or position.
 */
function okResponse(requestCount = 1): DataResponseDescriptor {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      source: "cross-framework-fixture",
      requestCount,
      marker: `fixture-request-${requestCount}`,
      items: [
        { deviceCode: "valve-2", name: "Valve 2", tempRaw: 180, run: 0 },
        { deviceCode: DEVICE_ID, name: "Plant pump", tempRaw: 415, run: 1 },
        { deviceCode: "tank-1", name: "Tank 1", tempRaw: 205, run: 0 }
      ]
    })
  };
}

function expectDetail(editor: Editor, expected: { deviceId: string; value: string; running: string }): void {
  const details = detailsOf(editor);
  expect(details.deviceId).toBe(expected.deviceId);
  expect(details.queryName).toBe("Pump status");
  expect(details.displayName).toBe("Plant pump");
  expect(fieldValue(details, "temperature")).toBe(expected.value);
  expect(fieldValue(details, "running")).toBe(expected.running);
}

function detailsOf(editor: Editor): DataObjectDetailModel {
  const state = editor.getDataService().getObjectDataState();
  const details = buildDataObjectDetailModel(editor.getSnapshot(), OBJECT_ID, state.objects[OBJECT_ID]);
  if (!details) throw new Error(`No data details for ${OBJECT_ID}.`);
  return details;
}

function objectState(editor: Editor) {
  const state = editor.getDataService().getObjectDataState();
  const objectState = state.objects[OBJECT_ID];
  if (!objectState) throw new Error(`No runtime state for ${OBJECT_ID}.`);
  return objectState;
}

function problemsOf(state: ReturnType<typeof objectState>): string[] {
  return state.problems.map((problem) => problem.code);
}

function previewEnabled(editor: Editor): boolean {
  return editor.getDataService().getObjectDataState().preview.enabled;
}

function fieldValue(details: DataObjectDetailModel, key: string): string | null {
  const field = details.fields.find((candidate) => candidate.key === key);
  if (!field) throw new Error(`Field ${key} is not part of the detail model.`);
  return field.displayValue;
}

async function waitForReady(editor: Editor): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 2_000) {
    if (objectState(editor).status === "ready") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Object ${OBJECT_ID} never became ready: ${JSON.stringify(editor.getDataService().getObjectDataState())}`);
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}
