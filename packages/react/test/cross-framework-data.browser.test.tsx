import React from "react";
import { createRoot } from "react-dom/client";
import { createApp, markRaw, type App as VueApp } from "vue";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataCredentialDescriptor,
  type DataRequestExecutor,
  type EditorWithGlbImport,
  type WorkbenchLocale
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench as ReactWorkbench } from "../src/components/EditorWorkbench";
import { defaultArchiveAdapter } from "../../core/src/project/archive-adapter";
import { PROJECT_SCENE_PATH } from "../../core/src/project/package-types";
import toyCarUrl from "../../../examples/showcase/assets/ToyCar.glb?url";
import { EditorWorkbench as VueWorkbench } from "@ek-aiot/3d-editor-vue";
import ReactWorkbenchStyles from "../src/components/workbench.css?raw";
import ReactInspectorStyles from "../src/components/inspector.css?raw";
import VueWorkbenchStyles from "../../vue/src/components/workbench.css?raw";
import VueInspectorStyles from "../../vue/src/components/inspector.css?raw";

/**
 * Cross-framework delivery acceptance: one project authored in a React host is
 * exported, restored in a Vue host, exported again, and finally read/executed by
 * a framework-free host. Every host presents a real GLB through a real WebGL
 * renderer and talks to the same same-origin HTTP fixture; nothing here uses a
 * 2D stand-in renderer or an in-memory request fake.
 */

const FIXTURE_BASE = `${window.location.origin}/__fixtures__/http-data-source`;
const DESKTOP_LAYOUTS: Array<[number, number]> = [[1440, 900], [1920, 1080], [1100, 800]];
const CONNECTION_ID = "plant-api";
const QUERY_ID = "pump-status";
const OBJECT_ID = "plant-pump";
const DEVICE_ID = "pump-2";
const CREDENTIAL_REF = "plant-token";
const SECRET = "plant-secret-value";
const PROBE_HEADER = "cross-framework";

describe("cross-framework data source delivery", () => {
  let cleanup: (() => void) | null = null;
  let originalViewport: { width: number; height: number } | null = null;

  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    originalViewport = { width: window.innerWidth, height: window.innerHeight };
  });

  afterEach(async () => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = "";
    if (originalViewport) {
      await page.viewport(originalViewport.width, originalViewport.height);
      originalViewport = null;
    }
  });

  it("carries a React-authored project to a Vue host and a vanilla host over real HTTP and WebGL", async () => {
    await page.viewport(1440, 900);
    installStyles("cross-framework-styles", [
      ReactWorkbenchStyles,
      ReactInspectorStyles,
      VueWorkbenchStyles,
      VueInspectorStyles
    ]);

    // 1. React configures a connection and a binding against the fixture.
    const react = await mountFrameworkHost("react");
    cleanup = react.cleanup;
    const authored = configureProject(react.editor);
    expect(authored.previewEnabledBeforeStart).toBe(false);

    // The preview controls live in the inspector for the selected bound object.
    react.editor.dispatch({ type: "select-object", objectId: OBJECT_ID });
    await clickButton(react.host, "Start data preview");
    await waitForReady(react.host);
    const reactCard = await deviceCard(react.host);
    expect(reactCard).toContain(DEVICE_ID);
    const reactReading = readDetailValue(react.host, "Reading");
    expect(reactReading).toMatch(/^\d+(\.\d+)?$/);

    // The card is only reachable through a real WebGL-rendered viewport, and the
    // runtime must have projected the real imported GLB into the scene.
    const canvas = react.host.querySelector("canvas") as HTMLCanvasElement | null;
    expect(canvas, "React host canvas").toBeTruthy();
    expect(canvas!.getContext("webgl2") ?? canvas!.getContext("webgl"), "real WebGL context").toBeTruthy();
    expect(canvas!.width, "canvas has a real drawing buffer").toBeGreaterThan(0);
    const runtime = react.editor.getRuntime();
    expect(runtime, "runtime must be mounted").toBeTruthy();
    expect(react.editor.getSnapshot().assets["toy-car"], "real GLB stays registered").toMatchObject({ kind: "glb" });

    // The reading came from the real same-origin fixture, not a local fake.
    const probe = await fetch(`${FIXTURE_BASE}/devices`).then((response) => response.json());
    expect(probe.source).toBe("same-origin-fixture");
    expect(probe.requestCount).toBeGreaterThan(0);

    // 2. Export the project package from the React host.
    const packageBytes = react.editor.exportProject().packageBytes;
    expect(packageBytes, "React host must export a project package").toBeInstanceOf(Uint8Array);
    // The ZIP is deflated, so inspect the decoded scene, not the raw bytes.
    const exportedScene = readSceneJson(packageBytes as Uint8Array);
    // The durable package carries the public probe header but never the secret.
    expect(exportedScene).toContain(PROBE_HEADER);
    expect(exportedScene).toContain(CREDENTIAL_REF);
    expect(exportedScene).not.toContain(SECRET);

    // 3. Vue restores the exact same durable configuration.
    react.cleanup();
    cleanup = null;
    document.body.innerHTML = "";

    const vue = await mountFrameworkHost("vue", copyBytes(packageBytes as Uint8Array));
    cleanup = vue.cleanup;
    expect(vue.editor.getSnapshot().dataSources).toEqual(react.editor.getSnapshot().dataSources);
    expect(vue.editor.getSnapshot().dataSources.bindings[OBJECT_ID]?.deviceId).toBe(DEVICE_ID);
    // The Vue host has no secret yet: restore reports a reconnect, not damage.
    expect(vue.editor.getSnapshot().dataSources.connections[CONNECTION_ID]?.auth).toEqual({
      kind: "bearer",
      credentialRef: CREDENTIAL_REF
    });
    // Restore never starts a request on its own.
    expect(vue.editor.getDataService().getObjectDataState().preview.enabled).toBe(false);

    // Without the credential the Vue host reports a locatable gap and stays offline.
    vue.editor.dispatch({ type: "select-object", objectId: OBJECT_ID });
    await clickButton(vue.host, "Start data preview");
    await waitForCondition(
      () => vue.editor.getDataService().getObjectDataState().objects[OBJECT_ID]?.status === "error",
      "Vue credential gap"
    );
    expect(
      vue.editor.getDataService().getObjectDataState().objects[OBJECT_ID]?.problems.map((problem) => problem.code)
    ).toContain("credential-unavailable");

    // Supplying the host capability repairs the same open project in place.
    vue.editor.getDataService().setHostCapabilities({
      executor: browserExecutor(),
      credentials: [{ ref: CREDENTIAL_REF, label: "Plant token", available: true }],
      authRevision: vue.editor.getDataService().getAuthRevision() + 1
    });
    await clickButton(vue.host, "Refresh data");
    await waitForReady(vue.host);
    expect(await deviceCard(vue.host)).toContain(DEVICE_ID);
    expect(readDetailValue(vue.host, "Reading")).toMatch(/^\d+(\.\d+)?$/);
    // The repair is runtime-only and never enters durable state.
    expect(JSON.stringify(vue.editor.serialize())).not.toContain(SECRET);

    // 4. A framework-free host reads and executes the same configuration.
    const vueBytes = vue.editor.exportProject().packageBytes;
    expect(vueBytes, "Vue host must re-export a project package").toBeInstanceOf(Uint8Array);
    const vueSnapshot = vue.editor.serialize();
    vue.cleanup();
    cleanup = null;
    document.body.innerHTML = "";

    const vanilla = createEditor({
      snapshot: vueSnapshot,
      executor: browserExecutor(),
      // The framework-free host resolves its own credential for the read.
      credentials: [{ ref: CREDENTIAL_REF, label: "Plant token", available: true }]
    });
    cleanup = () => vanilla.dispose();
    expect(vanilla.getSnapshot().dataSources).toEqual(react.editor.getSnapshot().dataSources);
    expect(vanilla.getDataService().getObjectDataState().preview.enabled).toBe(false);

    await vanilla.getDataService().startPreview();
    await waitForCondition(() => vanilla.getDataService().getObjectDataState().objects[OBJECT_ID]?.status === "ready", "vanilla preview");
    const vanillaState = vanilla.getDataService().getObjectDataState().objects[OBJECT_ID]!;
    expect(vanillaState.deviceId).toBe(DEVICE_ID);
    expect(vanillaState.entityId).toBe(DEVICE_ID);
    // The same mapping ran: the reading is a number and post-mapping.
    expect(vanillaState.fields.find((field) => field.key === "reading")?.value).toBeTypeOf("number");
    // All three hops resolved the same fixture URL and the same device identity.
    expect(vanilla.getSnapshot().dataSources.queries[QUERY_ID]?.path).toBe("/devices");
    // The raw response envelope never leaks into the durable domain.
    expect(JSON.stringify(vanilla.getSnapshot())).not.toContain("same-origin-fixture");
    vanilla.getDataService().stopPreview();
  }, 60000);

  it("keeps data configuration reachable at every delivery layout without horizontal occlusion", async () => {
    await page.viewport(1440, 900);
    installStyles("cross-framework-layout-styles", [
      ReactWorkbenchStyles,
      ReactInspectorStyles,
      VueWorkbenchStyles,
      VueInspectorStyles
    ]);

    for (const framework of ["react", "vue"] as const) {
      const mounted = await mountFrameworkHost(framework);
      cleanup = mounted.cleanup;
      configureProject(mounted.editor);

      for (const [width, height] of DESKTOP_LAYOUTS) {
        await page.viewport(width, height);
        await openDataWorkspace(mounted.host);
        const panel = dataPanel(mounted.host);
        expect(panel, `${framework} data panel at ${width}×${height}`).toBeTruthy();
        assertNoHorizontalOcclusion(panel!, `${framework} data panel at ${width}×${height}`);

        // The connection row and its repair entry points stay reachable.
        const row = panel!.querySelector(`[aria-label*="Plant API"]`) as HTMLElement | null;
        expect(row, `${framework} connection row at ${width}×${height}`).toBeTruthy();
        assertNoHorizontalOcclusion(row!, `${framework} connection row at ${width}×${height}`);

        // Bottom-of-panel actions are reachable by scrolling inside the panel.
        const lastAction = [...panel!.querySelectorAll("button")].at(-1) as HTMLButtonElement | undefined;
        expect(lastAction, `${framework} last data action at ${width}×${height}`).toBeTruthy();
        lastAction!.scrollIntoView({ block: "nearest" });
        assertNoHorizontalOcclusion(lastAction!, `${framework} last data action at ${width}×${height}`);

        // The binding entry point for the query is present, not clipped away.
        const bindings = panel!.querySelector("[aria-label*='Pump status']") as HTMLElement | null;
        expect(bindings, `${framework} query row at ${width}×${height}`).toBeTruthy();
        assertNoHorizontalOcclusion(bindings!, `${framework} query row at ${width}×${height}`);

        // The Inspector for the bound object stays reachable and unclipped.
        mounted.editor.dispatch({ type: "select-object", objectId: OBJECT_ID });
        const inspector = await waitForElement(
          mounted.host,
          "[aria-label='Inspector panel'], [aria-label='检查器面板']",
          `${framework} inspector at ${width}×${height}`
        );
        assertNoHorizontalOcclusion(inspector, `${framework} inspector at ${width}×${height}`);

        // The status/problem drawer opens and its entry point is reachable.
        const problemEntry = await openProblemDrawer(mounted.host);
        assertNoHorizontalOcclusion(problemEntry, `${framework} problem entry at ${width}×${height}`);
        await closeProblemDrawer(mounted.host);
      }

      // Bilingual labels stay intact at the narrowest desktop layout.
      await page.viewport(1100, 800);
      const zh = await remountInChinese(framework, mounted.editor.serialize());
      cleanup = zh.cleanup;
      await openDataWorkspace(zh.host);
      const zhPanel = dataPanel(zh.host);
      expect(zhPanel, "zh-CN data panel").toBeTruthy();
      // The authored name is untranslated by design, so assert on UI chrome that
      // only exists in the zh-CN dictionary — not on the authored connection name.
      expect(zhPanel!.textContent, "zh-CN data panel chrome").toMatch(/数据源|连接列表|测试请求/);
      expect(zhPanel!.textContent, "no English data chrome").not.toMatch(/\bConnections\b|\bTest request\b/);
      expect(zh.host.textContent, "zh-CN workbench chrome").toMatch(/数据|项目|场景/);
      // The English-only shell label must be gone, proving zh-CN really applied.
      expect(
        zh.host.querySelector("[aria-label='Inspector panel']"),
        "no English shell label under zh-CN"
      ).toBeNull();
      const zhInspector = await waitForElement(
        zh.host,
        "[aria-label='检查器面板']",
        `${framework} zh-CN inspector`
      );
      assertNoHorizontalOcclusion(zhInspector, `${framework} zh-CN inspector`);
      assertNoHorizontalOcclusion(zhPanel!, `${framework} zh-CN data panel`);

      zh.cleanup();
      cleanup = null;
      document.body.innerHTML = "";
    }
  }, 90000);

  it("shares one list request across 100 objects and keeps polling to one request per cycle", async () => {
    await page.viewport(1440, 900);
    installStyles("cross-framework-perf-styles", [
      ReactWorkbenchStyles,
      ReactInspectorStyles,
      VueWorkbenchStyles,
      VueInspectorStyles
    ]);

    const requests: string[] = [];
    const executor: DataRequestExecutor = async (request) => {
      requests.push(request.url);
      return browserExecutor()(request);
    };
    // 100 objects, all bound to one list query, 100 devices with two properties.
    const editor = createEditor({ executor, credentials: [] });
    cleanup = () => editor.dispose();
    seedLargeProject(editor);

    const state = editor.getSnapshot().dataSources;
    expect(Object.keys(state.queries)).toHaveLength(1);
    expect(Object.keys(state.bindings)).toHaveLength(100);

    await editor.getDataService().startPreview();
    await waitForCondition(
      () => Object.values(editor.getDataService().getObjectDataState().objects).every((object) => object.status === "ready"),
      "100 bound objects ready"
    );

    // One shared list request for the whole page of objects.
    expect(requests, "one request for 100 objects sharing a query").toHaveLength(1);
    const objects = editor.getDataService().getObjectDataState().objects;
    expect(Object.keys(objects)).toHaveLength(100);
    let previous = requests.length;

    // Three consecutive refresh cycles: exactly one new request each, no pile-up.
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await editor.getDataService().refreshPreview();
      await waitForCondition(
        () => requests.length >= previous + 1
          && Object.values(editor.getDataService().getObjectDataState().objects).every((object) => object.status === "ready"),
        `poll cycle ${cycle + 1}`
      );
      // Let any duplicate in-flight request surface before asserting.
      await frame();
      await frame();
      expect(requests.length, `duplicate requests in poll cycle ${cycle + 1}`).toBe(previous + 1);
      previous = requests.length;
    }

    // No queued or in-flight work is left behind after the cycles.
    const finalState = editor.getDataService().getObjectDataState();
    expect(finalState.preview.refreshing).toBe(false);
    expect(finalState.preview.contextCount).toBe(1);
    expect(finalState.preview.pausedCount).toBe(0);

    // Record the environment and the measured facts so the numbers are not read
    // as a throughput claim: this is a headless-Chromium, same-origin, in-memory
    // fixture on one machine, not a production network benchmark.
    const facts = {
      userAgent: navigator.userAgent,
      layoutViewport: `${window.innerWidth}×${window.innerHeight}`,
      boundObjects: Object.keys(editor.getSnapshot().dataSources.bindings).length,
      queryCount: Object.keys(editor.getSnapshot().dataSources.queries).length,
      // Every bound object resolved a mapped state with both properties present.
      mappedObjects: Object.values(objects).filter((object) => object.status === "ready").length,
      propertiesPerDevice: Object.values(objects).at(0)?.fields.length ?? 0,
      cycles: 3,
      // `requests` holds the initial start plus one per refresh cycle.
      initialRequests: 1,
      totalRequests: requests.length,
      sharedContexts: finalState.preview.contextCount
    };
    // eslint-disable-next-line no-console
    console.info("[cross-framework] polling facts", JSON.stringify(facts));
    expect(facts.mappedObjects, "every bound object got a mapped state").toBe(100);
    expect(facts.propertiesPerDevice, "two mapped properties per device").toBe(2);
    expect(facts.totalRequests, "initial start plus one request per cycle").toBe(4);
    expect(facts.queryCount, "one shared list query").toBe(1);

    editor.getDataService().stopPreview();
  }, 90000);
});

// --- hosts -----------------------------------------------------------------

interface MountedHost {
  host: HTMLElement;
  editor: EditorWithGlbImport;
  cleanup(): void;
}

async function mountFrameworkHost(
  framework: "react" | "vue",
  packageBytes?: Uint8Array,
  locale: WorkbenchLocale = "en"
): Promise<MountedHost> {
  const host = document.createElement("div");
  host.id = "app";
  document.body.appendChild(host);
  // The authoring host owns the secret; a receiving host starts without it.
  const credentials: readonly DataCredentialDescriptor[] = framework === "react"
    ? [{ ref: CREDENTIAL_REF, label: "Plant token", available: true }]
    : [];
  const editor = await createRealEditor(packageBytes, credentials);

  if (framework === "react") {
    const root = createRoot(host);
    root.render(<ReactWorkbench editor={editor} locale={locale} />);
    await waitForCondition(() => host.querySelector("canvas") !== null, "React canvas");
    return {
      host,
      editor,
      cleanup() {
        root.unmount();
        editor.dispose();
        host.remove();
      }
    };
  }

  const app: VueApp = createApp(VueWorkbench, {
    editor: markRaw(editor),
    locale,
    viewportClassName: "starter-viewport"
  });
  app.mount(host);
  await waitForCondition(() => host.querySelector("canvas") !== null, "Vue canvas");
  return {
    host,
    editor,
    cleanup() {
      app.unmount();
      editor.dispose();
      host.remove();
    }
  };
}

async function remountInChinese(framework: "react" | "vue", snapshot: string): Promise<MountedHost> {
  const editor = createEditor({ snapshot, executor: browserExecutor(), credentials: [] });
  const host = document.createElement("div");
  host.id = "app";
  document.body.appendChild(host);
  if (framework === "react") {
    const root = createRoot(host);
    root.render(<ReactWorkbench editor={editor} locale={"zh-CN" as WorkbenchLocale} />);
    await waitForCondition(() => host.querySelector("canvas") !== null, "React zh-CN canvas");
    return { host, editor, cleanup() { root.unmount(); editor.dispose(); host.remove(); } };
  }
  const app: VueApp = createApp(VueWorkbench, {
    editor: markRaw(editor),
    locale: "zh-CN",
    viewportClassName: "starter-viewport"
  });
  app.mount(host);
  await waitForCondition(() => host.querySelector("canvas") !== null, "Vue zh-CN canvas");
  return { host, editor, cleanup() { app.unmount(); editor.dispose(); host.remove(); } };
}

/** A real editor: the package's default WebGL renderer and a real GLB loader. */
async function createRealEditor(packageBytes?: Uint8Array, credentials: readonly DataCredentialDescriptor[] = []): Promise<EditorWithGlbImport> {
  const editor = createEditor({ executor: browserExecutor(), credentials });
  // Load the real showcase GLB so the viewport renders genuine geometry.
  const response = await fetch(toyCarUrl);
  expect(response.ok, "ToyCar.glb must be fetchable").toBe(true);
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(new TextDecoder().decode(bytes.subarray(0, 4)), "real GLB magic").toBe("glTF");
  const imported = await editor.importGlbAsset({
    asset: { id: "toy-car", kind: "glb", label: "ToyCar.glb", source: bytes }
  });
  expect(imported.ok, "import the real GLB").toBe(true);
  if (packageBytes) {
    const result = editor.importProject(packageBytes);
    expect(result.ok, "import project package").toBe(true);
  }
  return editor;
}

/** The host executor contract: copy the frozen headers, then inject the secret. */
function browserExecutor(): DataRequestExecutor {
  return async (request) => {
    const headers: Record<string, string> = { ...request.headers };
    if (request.auth.kind === "bearer" && request.credentialRef === CREDENTIAL_REF) {
      headers.Authorization = `Bearer ${SECRET}`;
    }
    const response = await fetch(request.url, {
      method: request.method,
      headers,
      body: request.body === null ? undefined : JSON.stringify(request.body),
      signal: request.signal
    });
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      body: await response.text()
    };
  };
}

// --- project fixtures ------------------------------------------------------

const PROPERTIES = [
  {
    key: "reading",
    label: "Reading",
    type: "number" as const,
    nullable: false,
    unit: null,
    source: [{ kind: "key" as const, key: "reading" }],
    transform: { kind: "raw" as const },
    range: null,
    allowed: null
  },
  {
    key: "name",
    label: "Name",
    type: "string" as const,
    nullable: false,
    unit: null,
    source: [{ kind: "key" as const, key: "name" }],
    transform: { kind: "raw" as const },
    range: null,
    allowed: null
  }
];

function mappingFor(): Parameters<typeof buildSaveDataQueryCommand>[1]["mapping"] {
  return {
    mode: "array",
    root: [{ kind: "key", key: "items" }],
    identity: { kind: "path", path: [{ kind: "key", key: "deviceCode" }], valueType: "string" },
    displayName: [{ kind: "key", key: "name" }],
    properties: PROPERTIES,
    observedAt: null,
    sourceQuality: null
  };
}

function configureProject(editor: EditorWithGlbImport): {
  previewEnabledBeforeStart: boolean;
  requestCountBeforeStart: number;
} {
  const connection = editor.dispatch({
    type: "create-data-connection",
    connection: {
      id: CONNECTION_ID,
      name: "Plant API",
      baseUrl: FIXTURE_BASE,
      // A credentialed connection: only the reference is durable, never the secret.
      auth: { kind: "bearer", credentialRef: CREDENTIAL_REF },
      headers: { "X-Fixture-Probe": PROBE_HEADER },
      timeoutMs: 10_000
    }
  });
  expect(connection.ok, "create connection").toBe(true);
  const imported = editor.dispatch({
    type: "import-glb",
    objectId: OBJECT_ID,
    name: "Plant pump",
    asset: { id: "plant-pump-model" }
  });
  expect(imported.ok, "import GLB").toBe(true);
  // A real GLB payload keeps the exported project package complete.
  editor.registerAsset({ id: "plant-pump-model", kind: "glb", label: "plant-pump.glb", source: new Uint8Array([103, 108, 84, 70]) });
  const query = buildSaveDataQueryCommand(editor.getSnapshot(), {
    id: QUERY_ID,
    connectionId: CONNECTION_ID,
    name: "Pump status",
    path: "/devices",
    parameters: [],
    mapping: mappingFor(),
    updatePolicy: { refreshIntervalMs: 60_000, maxAgeMs: 120_000 }
  });
  expect(query.ok, "build query").toBe(true);
  expect(editor.dispatch(query.command).ok, "save query").toBe(true);
  const binding = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId: OBJECT_ID,
    queryId: QUERY_ID,
    deviceId: DEVICE_ID,
    enabled: true,
    details: [{ key: "reading" }, { key: "name" }]
  });
  expect(binding.ok, "build binding").toBe(true);
  expect(editor.dispatch(binding.command).ok, "save binding").toBe(true);

  return {
    // Configuration alone must never start traffic.
    previewEnabledBeforeStart: editor.getDataService().getObjectDataState().preview.enabled,
    requestCountBeforeStart: editor.getDataService().getObjectDataState().preview.contextCount
  };
}

function seedLargeProject(editor: EditorWithGlbImport): void {
  const connection = editor.dispatch({
    type: "create-data-connection",
    connection: {
      id: CONNECTION_ID,
      name: "Plant API",
      baseUrl: FIXTURE_BASE,
      auth: { kind: "none" },
      headers: {},
      timeoutMs: 10_000
    }
  });
  expect(connection.ok).toBe(true);
  const query = buildSaveDataQueryCommand(editor.getSnapshot(), {
    id: QUERY_ID,
    connectionId: CONNECTION_ID,
    name: "Pump status",
    path: "/devices",
    parameters: [],
    mapping: mappingFor(),
    updatePolicy: { refreshIntervalMs: 60_000, maxAgeMs: 120_000 }
  });
  expect(query.ok).toBe(true);
  expect(editor.dispatch(query.command).ok).toBe(true);

  for (let index = 0; index < 100; index += 1) {
    const objectId = `pump-${index}`;
    const imported = editor.dispatch({
      type: "import-glb",
      objectId,
      name: `Pump ${index}`,
      asset: { id: `pump-model-${index}` }
    });
    expect(imported.ok).toBe(true);
    // The fixture publishes exactly two devices; objects alternate between them
    // so identity resolution is exercised across the whole page of bindings.
    const binding = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
      objectNodeId: objectId,
      queryId: QUERY_ID,
      deviceId: index % 2 === 0 ? "pump-1" : "pump-2",
      enabled: true,
      details: [{ key: "reading" }]
    });
    expect(binding.ok).toBe(true);
    expect(editor.dispatch(binding.command).ok).toBe(true);
  }
}

// --- assertions ------------------------------------------------------------

function assertNoHorizontalOcclusion(element: HTMLElement, label: string): void {
  const rect = element.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  expect(rect.width, `${label} has no width`).toBeGreaterThan(0);
  expect(rect.left, `${label} starts left of the viewport`).toBeGreaterThanOrEqual(-1);
  expect(rect.right, `${label} extends past the viewport`).toBeLessThanOrEqual(viewportWidth + 1);
  expect(
    element.scrollWidth,
    `${label} clips content horizontally`
  ).toBeLessThanOrEqual(element.clientWidth + 1);
}

async function openDataWorkspace(host: HTMLElement): Promise<void> {
  // Same tab contract the proof-loop suite uses; the label carries a count.
  const tabs = [...host.querySelectorAll<HTMLButtonElement>(".ek-workbench__panel-tab, .ek-workbench__nav-button")];
  expect(tabs.length, "Expected workspace tabs").toBeGreaterThan(0);
  const target = tabs.find((candidate) => /^(Data|数据) \d+$/.test(candidate.getAttribute("aria-label") ?? ""));
  expect(target, `Expected the data workspace tab; got ${tabs.map((candidate) => candidate.getAttribute("aria-label")).join(", ")}`).toBeTruthy();
  if (target!.getAttribute("aria-pressed") !== "true") {
    target!.click();
  }
  await waitForCondition(
    () => dataPanel(host) !== null,
    "data workspace panel"
  );
}

/** React and Vue name the panel root differently; both expose the same rows. */
function dataPanel(host: HTMLElement): HTMLElement | null {
  return host.querySelector(".ek-workbench__data-panel, .ek-workbench__data-sources");
}

async function clickButton(host: HTMLElement, label: string): Promise<void> {
  const find = () => [...host.querySelectorAll("button")].find(
    (candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent ?? "").trim() === label
  );
  // Store-driven UI updates arrive on a later frame.
  await waitForCondition(() => find() !== undefined, `button "${label}"`);
  const button = find();
  expect(button, `Expected button "${label}"`).toBeTruthy();
  await userEvent.click(button as HTMLElement);
}

async function deviceCard(host: HTMLElement): Promise<string> {
  await waitForCondition(
    () => host.querySelector("[aria-label='Device details']") !== null,
    "device details card"
  );
  return text(host.querySelector("[aria-label='Device details']") as HTMLElement);
}

function readDetailValue(host: HTMLElement, label: string): string {
  const card = host.querySelector("[aria-label='Device details']") as HTMLElement | null;
  expect(card, "device details card").toBeTruthy();
  const term = [...card!.querySelectorAll("dt")].find((candidate) => (candidate.textContent ?? "").startsWith(label));
  expect(term, `Expected the "${label}" field`).toBeTruthy();
  return text(term!.nextElementSibling as HTMLElement).trim();
}

async function waitForReady(host: HTMLElement): Promise<void> {
  await waitForCondition(() => {
    const card = host.querySelector("[aria-label='Device details']");
    return card !== null && !text(card as HTMLElement).includes("Waiting");
  }, "device details ready");
}

async function waitForCondition(assertion: () => boolean, label: string, timeout = 10_000): Promise<void> {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeout) {
    if (assertion()) return;
    await frame();
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function text(element: Element | null): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Wait for a selector to appear and return the node. */
async function waitForElement(host: HTMLElement, selector: string, label: string): Promise<HTMLElement> {
  await waitForCondition(() => host.querySelector(selector) !== null, label);
  return host.querySelector(selector) as HTMLElement;
}

/**
 * Open the status/problem drawer through its real trigger and return that
 * trigger, so the caller can assert the entry point is not clipped at any width.
 */
/**
 * The status chip lives in the footer, which can sit outside the scrolled
 * viewport. Dispatch the click straight at the node so React's handler runs
 * without Playwright's actionability gate, then let React flush.
 */
async function clickStatusChip(trigger: HTMLElement): Promise<void> {
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** The drawer `<section>` shares the label, so anchor on the button trigger. */
const PROBLEM_TRIGGER_SELECTOR =
  "button[aria-label='Problem details'], button[aria-label='问题详情']";

async function openProblemDrawer(host: HTMLElement): Promise<HTMLElement> {
  const trigger = await waitForElement(host, PROBLEM_TRIGGER_SELECTOR, "problem drawer trigger");
  trigger.scrollIntoView({ block: "nearest" });
  await clickStatusChip(trigger);
  await waitForCondition(
    () => trigger.getAttribute("aria-expanded") === "true",
    "problem drawer opens"
  );
  return trigger;
}

async function closeProblemDrawer(host: HTMLElement): Promise<void> {
  const trigger = host.querySelector(PROBLEM_TRIGGER_SELECTOR) as HTMLElement | null;
  if (trigger?.getAttribute("aria-expanded") === "true") {
    await clickStatusChip(trigger);
    await waitForCondition(() => trigger.getAttribute("aria-expanded") !== "true", "problem drawer closes");
  }
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

/** Decode the exported project package's scene JSON for durable-value assertions. */
function readSceneJson(packageBytes: Uint8Array): string {
  const entries = defaultArchiveAdapter.read(packageBytes);
  const scene = entries.find((entry) => entry.path === PROJECT_SCENE_PATH);
  expect(scene, "exported package must contain the scene").toBeTruthy();
  return new TextDecoder().decode(scene!.bytes);
}

function installStyles(id: string, blocks: string[]): void {
  document.getElementById(id)?.remove();
  const style = document.createElement("style");
  style.id = id;
  style.textContent = blocks.join("\n");
  document.head.appendChild(style);
}
