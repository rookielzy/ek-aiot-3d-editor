import { runMenuCommand } from "./support/workbench-menu";
import { mount, type VueWrapper } from "@vue/test-utils";
import { markRaw, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { decodeArchiveJson, defaultArchiveAdapter, encodeArchiveJson } from "../../core/src/project/archive-adapter";
import { PROJECT_SCENE_PATH } from "../../core/src/project/package-types";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";

/**
 * Mirror of the React suite: the same authored project must open in the Vue
 * Workbench, report the reconnect, stay editable, and be repairable through
 * host capabilities without duplicating any core algorithm in the adapter.
 */
describe("Vue Workbench receives a project authored in another host", () => {
  let wrapper: VueWrapper | null = null;
  let editor: ReturnType<typeof createEditor> | null = null;

  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    editor?.dispose();
    editor = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("opens a foreign project, reports the reconnect, and repairs it with host capabilities", async () => {
    const packageBytes = authoredProjectPackage();
    const urls: string[] = [];
    editor = createEditor({ credentials: [{ ref: "plant-token", label: "Plant token", available: false }] });
    wrapper = mount(EditorWorkbench, {
      props: { editor: markRaw(editor), rendererFactory: fakeRenderer, locale: "en" },
      attachTo: document.body
    });

    await openPackage(wrapper, packageBytes);

    // Restore feedback names a reconnect and keeps preview off.
    expect(projectStatus(wrapper).textContent).toMatch(/reconnection required/i);
    expect(editor.getDataService().getObjectDataState().preview.enabled).toBe(false);
    expect(editor.getSnapshot().dataSources.bindings["plant-pump"]).toMatchObject({
      queryId: "pump-status",
      deviceId: "plant-pump"
    });

    // The data panel opens for repair.
    await clickButton(wrapper, /^Data \d/);
    expect(wrapper.text()).toContain("Plant API");
    expect(wrapper.text()).toContain("Pump status");

    // Starting preview with the capability gap: a locatable problem, no request.
    await clickButton(wrapper, "Start data preview");
    await waitFor(() => editor!.getDataService().getObjectDataState().objects["plant-pump"]?.status === "error");
    expect(urls).toEqual([]);

    // Host repair happens outside reactive props; the workbench follows core.
    editor.getDataService().setHostCapabilities({
      executor: async (request) => {
        urls.push(request.url);
        const headers: Record<string, string> = { ...request.headers };
        if (request.credentialRef === "plant-token") headers.Authorization = "Bearer plant-secret";
        return okResponse();
      },
      credentials: [{ ref: "plant-token", label: "Plant token", available: true }]
    });
    await selectNode(wrapper, "Plant pump");

    await waitFor(() => detailValue(wrapper!, "Temperature") === "41.50");
    expect(detailValue(wrapper, "Running")).toBe("true");
    expect(urls).toEqual(["https://plant.example.test/__fixtures__/http-data-source/devices"]);
    expect(wrapper.text()).toContain("plant-pump");

    expect(editor.getSnapshot().dataSources.connections["plant-api"]?.auth).toEqual({
      kind: "bearer",
      credentialRef: "plant-token"
    });
    expect(JSON.stringify(editor.serialize())).not.toContain("plant-secret");
  }, 20000);

  it("reports damaged durable data configuration as repairable damage, not a bad file", async () => {
    // A binding whose query was dropped is repairable authoring damage, and the
    // Vue toolbar must say so instead of "Project open failed".
    const bytes = authoredProjectPackage();
    const broken = stripQueryFromPackage(bytes);
    editor = createEditor({ credentials: [] });
    wrapper = mount(EditorWorkbench, {
      props: { editor: markRaw(editor), rendererFactory: fakeRenderer, locale: "en" },
      attachTo: document.body
    });

    await openPackage(wrapper, broken);

    const status = projectStatus(wrapper);
    expect(status.textContent).toMatch(/damaged/i);
    expect(status.textContent).toMatch(/1 broken reference/i);
    expect(status.textContent).not.toMatch(/Project open failed/i);
    // The scene still opens so the user can repair it.
    expect(editor.getSnapshot().objects["plant-pump"]).toBeDefined();
  }, 20000);
});

/** Remove the saved query so the binding dangles, keeping everything else intact. */
function stripQueryFromPackage(bytes: Uint8Array): Uint8Array {
  const entries = defaultArchiveAdapter.read(bytes);
  const sceneEntry = entries.find((entry) => entry.path === PROJECT_SCENE_PATH)!;
  const scene = decodeArchiveJson(sceneEntry.bytes) as {
    dataSources: { queries: Record<string, unknown> };
  };
  scene.dataSources.queries = {};
  return defaultArchiveAdapter.write(entries.map((entry) => entry.path === PROJECT_SCENE_PATH
    ? { path: entry.path, bytes: encodeArchiveJson(scene) }
    : entry));
}

function authoredProjectPackage(): Uint8Array {
  const source = createEditor();
  const connection = source.dispatch({
    type: "create-data-connection",
    connection: {
      id: "plant-api",
      name: "Plant API",
      baseUrl: "https://plant.example.test/__fixtures__/http-data-source",
      auth: { kind: "bearer", credentialRef: "plant-token" },
      headers: {},
      timeoutMs: 10_000
    }
  });
  if (!connection.ok) throw new Error(connection.error);
  const imported = source.dispatch({
    type: "import-glb",
    objectId: "plant-pump",
    name: "Plant pump",
    asset: { id: "plant-pump-model", source: new Uint8Array([103, 108, 84, 70]) }
  });
  if (!imported.ok) throw new Error(imported.error);
  const query = buildSaveDataQueryCommand(source.getSnapshot(), {
    id: "pump-status",
    connectionId: "plant-api",
    name: "Pump status",
    path: "/devices",
    parameters: [],
    mapping: {
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
          unit: "°C",
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
    },
    updatePolicy: { refreshIntervalMs: 60_000, maxAgeMs: 120_000 }
  });
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  if (!source.dispatch(query.command).ok) throw new Error("Failed to save the query.");
  const binding = buildSaveDataObjectBindingCommand(source.getSnapshot(), {
    objectNodeId: "plant-pump",
    queryId: "pump-status",
    deviceId: "plant-pump",
    enabled: true,
    details: [{ key: "temperature" }, { key: "running" }]
  });
  if (!binding.ok) throw new Error(binding.problems.map((problem) => problem.message).join("\n"));
  if (!source.dispatch(binding.command).ok) throw new Error("Failed to save the binding.");
  const bytes = source.exportProject().packageBytes;
  if (!(bytes instanceof Uint8Array)) throw new Error("Expected a synchronous project package.");
  source.dispose();
  return bytes;
}

function okResponse() {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      items: [
        { deviceCode: "valve-2", name: "Valve 2", tempRaw: 180, run: 0 },
        { deviceCode: "plant-pump", name: "Plant pump", tempRaw: 415, run: 1 }
      ]
    })
  };
}

async function openPackage(wrapper: VueWrapper, bytes: Uint8Array): Promise<void> {
  await runMenuCommand(wrapper, "Project menu", "Open");
  const input = wrapper.get(".ek-workbench__file-input");
  const file = new File([bytes], "handoff.ek3d", { type: "application/octet-stream" });
  Object.defineProperty(input.element, "files", { value: [file as unknown as File], configurable: true });
  await input.trigger("change");
  await waitFor(() => !/Opening/.test(projectStatus(wrapper).textContent ?? ""));
}

function projectStatus(wrapper: VueWrapper): HTMLElement {
  return wrapper.get(".ek-workbench__toolbar-status").element as HTMLElement;
}

async function selectNode(wrapper: VueWrapper, title: string): Promise<void> {
  const row = wrapper.findAll("button.ek-workbench__tree-row")
    .find((candidate) => candidate.attributes("title") === title);
  if (!row) throw new Error(`Node row "${title}" not found`);
  await row.trigger("click");
  await settle();
}

function detailValue(wrapper: VueWrapper, label: string): string | null {
  const card = wrapper.findAll("section.ek-workbench__detail-card")
    .find((candidate) => candidate.attributes("aria-label") === "Device details");
  if (!card) return null;
  const term = card.findAll("dt").find((candidate) => candidate.text().startsWith(label));
  const description = term?.element.nextElementSibling as HTMLElement | null;
  return description?.querySelector("strong")?.textContent ?? description?.textContent ?? null;
}

async function clickButton(wrapper: VueWrapper, label: string | RegExp): Promise<void> {
  const button = wrapper.findAll("button").find((candidate) => {
    const accessible = candidate.attributes("aria-label") ?? candidate.text().trim();
    return typeof label === "string" ? accessible === label : label.test(accessible);
  });
  if (!button) {
    throw new Error(`Button ${String(label)} not found. Buttons: ${
      wrapper.findAll("button").map((item) => item.attributes("aria-label") ?? item.text().trim()).join(" | ")
    }`);
  }
  await button.trigger("click");
  await settle();
}

async function waitFor(assertion: () => boolean, timeout = 4000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (assertion()) return;
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await settle();
  if (!assertion()) {
    throw new Error("Condition never became true");
  }
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
