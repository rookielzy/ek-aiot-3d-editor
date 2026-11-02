import { mount, type VueWrapper } from "@vue/test-utils";
import { markRaw, nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Mesh, MeshStandardMaterial } from "three";
import {
  AssetResolverBridge,
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataRequestExecutor,
  type DataRequestResult,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";

describe("Vue data color authoring", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  it("saves ordered color rules and reports material capability", async () => {
    const editor = createSeedEditor();
    const wrapper = mountWorkbench(editor);
    await selectNode(wrapper, "Pump object");

    const section = colorSection(wrapper);
    await section.get('input[aria-label="Use status color"]').setValue(true);
    await settle();
    expect((section.get('select[aria-label="Color property"]').element as HTMLSelectElement).value).toBe("temperature");

    await section.get('select[aria-label="Color property"]').setValue("running");
    await settle();
    // Switching property rebuilds the rule controls, so re-query the section wrapper.
    const booleanSection = colorSection(wrapper);
    await booleanSection.get('input[aria-label="Color rule 1 · Color"]');
    await clickIn(booleanSection, "Use color #3b82f6");
    expect((booleanSection.get('input[aria-label="Color rule 1 · Color"]').element as HTMLInputElement).value).toBe("#3b82f6");

    await clickIn(section, "Add rule");
    await section.get('select[aria-label="Color rule 2 · Operator"]').setValue("ne");
    await settle();
    await section.get('input[aria-label="Color rule 2 · Color"]').setValue("#00ff00");
    await settle();
    await clickIn(section, "Move color rule 2 up");
    await setInput(wrapper, "Device ID", "pump-1");

    await clickButton(wrapper, "Create binding");
    expect(wrapper.text()).toContain("Binding saved. Undo to discard.");
    await textWhen(section, "All materials support status color.");

    expect(editor.getSnapshot().dataSources.bindings["object-a"]!.color).toEqual({
      propertyKey: "running",
      rules: [
        { operator: "ne", value: true, max: null, color: "#00ff00" },
        { operator: "eq", value: true, max: null, color: "#3b82f6" }
      ]
    });
    expect(findButton(section, "Try draft on object")!.attributes("disabled")).toBeDefined();

    wrapper.unmount();
    editor.dispose();
  });

  it("trials the draft once and ends it on a target change", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse());
    const editor = createSeedEditor(executor);
    importObject(editor, "object-b", "Pump object B");
    const wrapper = mountWorkbench(editor);
    await selectNode(wrapper, "Pump object");

    const section = colorSection(wrapper);
    await section.get('input[aria-label="Use status color"]').setValue(true);
    await settle();
    await section.get('select[aria-label="Color property"]').setValue("running");
    await settle();
    await clickButton(wrapper, "Load devices");
    await wrapper.find('[aria-label="Devices in current result"]');
    await wrapper.get('select[aria-label="Devices in current result"]').setValue("pump-1");
    await settle();

    await clickIn(section, "Try draft on object");
    await waitFor(() => editor.getDataColorService?.().getState().trial !== null);
    expect(editor.getDataColorService?.().getState().trial).toMatchObject({
      objectNodeId: "object-a",
      source: "test",
      propertyKey: "running",
      color: "#22c55e"
    });
    expect(section.text()).toContain("Draft trial is showing on this object — not saved.");
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toBeUndefined();

    await selectNode(wrapper, "Pump object B");
    await waitFor(() => editor.getDataColorService?.().getState().trial === null);
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toBeUndefined();

    wrapper.unmount();
    editor.dispose();
  });

  it("blocks the draft trial while preview runs", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse());
    const editor = createSeedEditor(executor);
    saveBasicBinding(editor);
    const wrapper = mountWorkbench(editor);
    await selectNode(wrapper, "Pump object");

    const section = colorSection(wrapper);
    await section.get('input[aria-label="Use status color"]').setValue(true);
    await settle();
    expect(findButton(section, "Try draft on object")!.attributes("disabled")).toBe("");

    await clickButton(wrapper, "Start data preview");
    await textWhen(section, "Stop data preview to try draft colors.");
    expect(findButton(section, "Try draft on object")!.attributes("disabled")).toBe("");

    await clickButton(wrapper, "Stop data preview");
    await settle();
    expect(section.text()).not.toContain("Stop data preview to try draft colors.");

    wrapper.unmount();
    editor.dispose();
  });
});

function createSeedEditor(executor?: DataRequestExecutor) {
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
    }
  });
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  if (!editor.dispatch(query.command).ok) throw new Error("Failed to save query.");
  importObject(editor, "object-a", "Pump object");
  return editor;
}

function saveBasicBinding(editor: ReturnType<typeof createEditor>): void {
  const queryId = Object.keys(editor.getSnapshot().dataSources.queries)[0]!;
  const binding = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId: "object-a",
    queryId,
    deviceId: "pump-1",
    enabled: true,
    details: [{ key: "temperature" }],
    color: null
  });
  if (!binding.ok) throw new Error(binding.problems.map((problem) => problem.message).join("\n"));
  if (!editor.dispatch(binding.command).ok) throw new Error("Failed to save binding.");
}

function importObject(editor: ReturnType<typeof createEditor>, objectId: string, name: string): void {
  const imported = editor.dispatch({
    type: "import-glb",
    objectId,
    name,
    asset: { id: `asset-${objectId}` }
  });
  if (!imported.ok) throw new Error(imported.error);
}

function jsonResponse(): DataRequestResult {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      items: [{ deviceCode: "pump-1", name: "Pump 1", tempRaw: 426, run: 1 }]
    })
  } as DataRequestResult;
}

const fakeLoader = {
  load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: "#ffffff" }))
};

const fakeResolver = new AssetResolverBridge(() => ({ uri: "/box.glb" }));

function mountWorkbench(editor: ReturnType<typeof createEditor>): VueWrapper {
  return mount(EditorWorkbench, {
    props: {
      editor: markRaw(editor),
      rendererFactory: fakeRenderer,
      loader: fakeLoader,
      resolver: fakeResolver,
      locale: "en"
    },
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

function colorSection(wrapper: VueWrapper): VueWrapper {
  const section = wrapper.findAll("fieldset.ek-workbench__binding-colors")[0];
  if (!section) {
    throw new Error("Status color section not found");
  }
  return section as VueWrapper;
}

function findButton(root: { findAll: (selector: string) => Array<VueWrapper<Element>> }, label: string) {
  return root.findAll("button")
    .find((button) => button.attributes("aria-label") === label || button.text().trim() === label) ?? null;
}

async function clickIn(root: VueWrapper, label: string): Promise<void> {
  const button = findButton(root as unknown as { findAll: (selector: string) => Array<VueWrapper<Element>> }, label);
  if (!button) {
    throw new Error(`Button "${label}" not found in section`);
  }
  await button.trigger("click");
  await settle();
}

async function clickButton(wrapper: VueWrapper, label: string): Promise<void> {
  const button = findButton(wrapper, label);
  if (!button) {
    throw new Error(`Button "${label}" not found. Buttons: ${
      wrapper.findAll("button").map((item) => item.attributes("aria-label") ?? item.text().trim()).join(" | ")
    }`);
  }
  await button.trigger("click");
  await settle();
}

async function setInput(wrapper: VueWrapper, label: string, value: string): Promise<void> {
  await wrapper.get(`[aria-label="${label}"]`).setValue(value);
  await settle();
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) {
      return;
    }
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Condition never became true");
}

async function textWhen(root: VueWrapper, text: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await settle();
    if (root.text().includes(text)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Text "${text}" never appeared. Current: ${root.text()}`);
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
