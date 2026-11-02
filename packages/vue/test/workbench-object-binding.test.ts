import { mount, type VueWrapper } from "@vue/test-utils";
import { markRaw, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachGlbImportManifestMetadata,
  buildSaveDataConnectionCommand,
  buildSaveDataQueryCommand,
  createEditor,
  createGlbImportManifest,
  type DataRequestExecutor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";

describe("Vue object binding authoring", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves one query, device overrides, and ordered details as one undoable binding", async () => {
    const editor = createSeedEditor();
    const wrapper = mountWorkbench(editor);
    await selectNode(wrapper, "Pump object");

    expect(wrapper.text()).toContain("Bind one saved query and one device to this object.");
    expect(selectValue(wrapper, "Query")).toBe(Object.keys(editor.getSnapshot().dataSources.queries)[0]);

    await setInput(wrapper, "Device ID", "pump-manual-99");
    await clickCheckbox(wrapper, "Override areaId for this object");
    await setInput(wrapper, "Override value for areaId", "B");
    await setInput(wrapper, "Decimal places for Temperature", "1");
    await setInput(wrapper, "Label override for Temperature", "Temperature C");
    await clickButton(wrapper, "Move detail field Running up");

    const before = editor.getHistoryState();
    await clickButton(wrapper, "Create binding");

    expect(wrapper.text()).toContain("Binding saved. Undo to discard.");
    expect(editor.getHistoryState()).toEqual({ undoCount: before.undoCount + 1, redoCount: 0 });
    const binding = editor.getSnapshot().dataSources.bindings["object-a"];
    expect(binding).toMatchObject({
      objectNodeId: "object-a",
      deviceId: "pump-manual-99",
      parameterOverrides: { areaId: "B" },
      enabled: true
    });
    const query = editor.getSnapshot().dataSources.queries[binding.queryId];
    expect(query.parameters).toEqual([{ name: "areaId", type: "string", defaultValue: "A", location: "query" }]);
    expect(binding.details).toEqual([
      { key: "running", label: null, precision: null },
      { key: "temperature", label: "Temperature C", precision: 1 }
    ]);

    await clickButton(wrapper, "Remove binding");
    expect(wrapper.text()).toContain("Binding removed. Undo to restore.");
    expect(editor.getSnapshot().dataSources.bindings).toEqual({});
    editor.undo();
    await settle();
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toBeTruthy();

    wrapper.unmount();
    editor.dispose();
  });

  it("resets details and overrides when the draft switches to another query", async () => {
    const editor = createSeedEditor();
    saveSecondQuery(editor);
    const wrapper = mountWorkbench(editor);
    await selectNode(wrapper, "Pump object");
    const historyBeforeEditing = editor.getHistoryState();

    // With more than one saved query no default is assumed, matching React.
    expect(selectValue(wrapper, "Query")).toBe("");
    const firstQueryId = Object.values(editor.getSnapshot().dataSources.queries)
      .find((query) => query.name === "Pump status")!.id;
    expect(wrapper.find('[aria-label="Decimal places for Temperature"]').exists()).toBe(false);

    await wrapper.get('select[aria-label="Query"]').setValue(firstQueryId);
    await settle();

    // A fresh draft starts with every mapped field; only numbers get a precision input.
    expect(detailRowNames(wrapper)).toEqual(["Temperature", "Running"]);
    expect(wrapper.findAll('[aria-label^="Decimal places"]').map((input) => input.attributes("aria-label")))
      .toEqual(["Decimal places for Temperature"]);
    await clickButton(wrapper, "Remove detail field Running");
    expect(detailRowNames(wrapper)).toEqual(["Temperature"]);
    const addLabels = wrapper.findAll(".ek-workbench__binding-add-details button")
      .map((button) => button.attributes("aria-label"));
    expect(addLabels).toEqual(["Add detail field Running"]);
    await clickButton(wrapper, "Add detail field Running");
    expect(detailRowNames(wrapper)).toEqual(["Temperature", "Running"]);
    const secondQueryId = Object.values(editor.getSnapshot().dataSources.queries)
      .find((query) => query.name === "Valve status")!.id;
    await wrapper.get('select[aria-label="Query"]').setValue(secondQueryId);
    await settle();

    // The second query maps one field and declares no parameters, so the draft follows it fresh.
    expect(wrapper.find('[aria-label="Override areaId for this object"]').exists()).toBe(false);
    expect(detailRowNames(wrapper)).toEqual(["Pressure"]);
    expect(editor.getSnapshot().dataSources.bindings).toEqual({});
    // Draft edits stay local; nothing is committed until the binding is saved.
    expect(editor.getHistoryState()).toEqual(historyBeforeEditing);

    await setInput(wrapper, "Device ID", "valve-07");
    await clickButton(wrapper, "Create binding");
    const binding = editor.getSnapshot().dataSources.bindings["object-a"]!;
    expect(binding.queryId).toBe(secondQueryId);
    expect(binding.deviceId).toBe("valve-07");
    expect(binding.details).toEqual([{ key: "pressure", label: null, precision: null }]);
    expect(binding.color).toBeNull();

    wrapper.unmount();
    editor.dispose();
  });

  it("points an imported sub-node at the object that owns the binding", async () => {
    const editor = createSeedEditor(undefined, true);
    const wrapper = mountWorkbench(editor);
    const imported = Object.values(editor.getSnapshot().nodes)
      .find((node) => node.kind === "imported");
    expect(imported).toBeTruthy();

    const row = wrapper.findAll("button.ek-workbench__tree-row")
      .find((candidate) => candidate.attributes("title") === imported!.name);
    expect(row, `tree row for ${imported!.name}`).toBeTruthy();
    await row!.trigger("click");
    await settle();

    expect(wrapper.text()).toContain("Imported nodes cannot be bound directly. Bind the owner object instead.");
    expect(wrapper.find('[aria-label="Device ID"]').exists()).toBe(false);

    await clickButton(wrapper, `Select owner ${editor.getSnapshot().nodes["object-a"]!.name}`);
    expect(editor.getSnapshot().selection.nodeId).toBe("object-a");
    expect(wrapper.find('[aria-label="Device ID"]').exists()).toBe(true);

    wrapper.unmount();
    editor.dispose();
  });
});

function createSeedEditor(executor?: DataRequestExecutor, expandImportedTargets = false) {
  const editor = createEditor({ executor });
  seedConnection(editor);
  const query = buildSaveDataQueryCommand(editor.getSnapshot(), {
    connectionId: "connection-a",
    name: "Pump status",
    path: "/pumps",
    parameters: [{ name: "areaId", type: "string", defaultValue: "A" }],
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
          unit: "C",
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
    }
  });
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  if (!editor.dispatch(query.command).ok) throw new Error("Failed to save query.");
  seedObject(editor, expandImportedTargets);
  return editor;
}

function detailRowNames(wrapper: VueWrapper): string[] {
  return wrapper.findAll(".ek-workbench__binding-detail-row .ek-workbench__binding-detail-name strong")
    .map((name) => name.text().trim());
}

function seedConnection(editor: ReturnType<typeof createEditor>): void {
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
}

function saveSecondQuery(editor: ReturnType<typeof createEditor>): void {
  const query = buildSaveDataQueryCommand(editor.getSnapshot(), {
    connectionId: "connection-a",
    name: "Valve status",
    path: "/valves",
    parameters: [],
    mapping: {
      mode: "array",
      root: [{ kind: "key", key: "items" }],
      identity: { kind: "path", path: [{ kind: "key", key: "deviceCode" }], valueType: "string" },
      displayName: [{ kind: "key", key: "name" }],
      properties: [
        {
          key: "pressure",
          label: "Pressure",
          type: "string",
          nullable: false,
          unit: "bar",
          source: [{ kind: "key", key: "gauge" }],
          transform: { kind: "raw" },
          range: null,
          allowed: null
        }
      ],
      observedAt: null,
      sourceQuality: null
    }
  });
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  if (!editor.dispatch(query.command).ok) throw new Error("Failed to save the second query.");
}

function seedObject(editor: ReturnType<typeof createEditor>, expandImportedTargets = false): void {
  const asset = expandImportedTargets
    ? {
        id: "asset-a",
        metadata: attachGlbImportManifestMetadata(undefined, createGlbImportManifest({
          gltf: {
            parser: {
              json: {
                nodes: [{ name: "Root", mesh: 0 }],
                meshes: [{ name: "Panel", primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
                materials: [{ name: "Red" }]
              }
            }
          }
        }))
      }
    : { id: "asset-a" };
  const imported = editor.dispatch({
    type: "import-glb",
    objectId: "object-a",
    name: "Pump object",
    asset,
    ...(expandImportedTargets ? { expandImportedTargets: true } : {})
  });
  if (!imported.ok) throw new Error(imported.error);
}

function mountWorkbench(editor: ReturnType<typeof createEditor>): VueWrapper {
  return mount(EditorWorkbench, {
    props: { editor: markRaw(editor), rendererFactory: fakeRenderer, locale: "en" },
    attachTo: document.body
  });
}

async function selectNode(wrapper: VueWrapper, title: string): Promise<void> {
  const row = wrapper.findAll("button.ek-workbench__tree-row")
    .find((candidate) => candidate.attributes("title") === title);
  if (!row) {
    throw new Error(`Node row "${title}" not found`);
  }
  await row.trigger("click");
  await settle();
}

function findButton(wrapper: VueWrapper, label: string) {
  return wrapper.findAll("button").find((button) => button.attributes("aria-label") === label || button.text().trim() === label);
}

async function clickButton(wrapper: VueWrapper, label: string): Promise<void> {
  const button = findButton(wrapper, label);
  if (!button) {
    throw new Error(`Button "${label}" not found. Buttons: ${wrapper.findAll("button").map((item) => item.attributes("aria-label") ?? item.text().trim()).join(" | ")}`);
  }
  await button.trigger("click");
  await settle();
}

async function clickCheckbox(wrapper: VueWrapper, label: string): Promise<void> {
  const input = wrapper.get(`input[aria-label="${label}"]`);
  await input.setValue(true);
  await settle();
}

function selectValue(wrapper: VueWrapper, label: string): string {
  return (wrapper.get(`select[aria-label="${label}"]`).element as HTMLSelectElement).value;
}

async function setInput(wrapper: VueWrapper, label: string, value: string): Promise<void> {
  const input = wrapper.get(`[aria-label="${label}"]`);
  await input.setValue(value);
  await settle();
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
