import { mount, type VueWrapper } from "@vue/test-utils";
import { h, markRaw, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataRequestExecutor,
  type DataRequestResult,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";

describe("Vue data binding lifecycle and references", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("unbinds a referenced object from the query bindings dialog", async () => {
    const editor = createSeedEditor();
    saveBinding(editor, "object-a");
    const wrapper = mountWorkbench(editor);
    await openDataPanel(wrapper);
    expect(wrapper.find(".ek-workbench__data-queries").text()).toContain("1 bound object");

    await clickButton(wrapper, "Manage bindings for Pump status");
    expect(dialog(wrapper).attributes("aria-labelledby")).toBeTruthy();
    await clickIn(dialog(wrapper), "Unbind Pump object");

    expect(dialog(wrapper).text()).toContain("Binding for Pump object removed. Undo to restore.");
    expect(editor.getSnapshot().dataSources.bindings).toEqual({});
    expect(editor.getSnapshot().dataSources.queries["query-a"]).toBeTruthy();
    expect(editor.getSnapshot().dataSources.connections["connection-a"]).toBeTruthy();

    // The reference summary drops the query's bound-object badge once nothing points at it.
    await clickIn(dialog(wrapper), "Close bindings");
    expect(wrapper.find(".ek-workbench__data-queries").text()).not.toContain("1 bound object");

    wrapper.unmount();
    editor.dispose();
  });

  it("keeps an unsaved draft behind the discard prompt before closing", async () => {
    const editor = createSeedEditor();
    saveBinding(editor, "object-a");
    importObject(editor, "object-b", "Pump B");
    const wrapper = mountWorkbench(editor);
    await openDataPanel(wrapper);
    await clickButton(wrapper, "Manage bindings for Pump status");

    await setInputIn(dialog(wrapper), "Device ID", "pump-draft");
    await clickIn(dialog(wrapper), "Close bindings");
    const prompt = dialog(wrapper).find('[role="alertdialog"]');
    expect(prompt.exists()).toBe(true);

    await clickIn(prompt as unknown as VueWrapper, "Keep editing");
    expect(dialog(wrapper).find('[role="alertdialog"]').exists()).toBe(false);
    expect((dialog(wrapper).get('[aria-label="Device ID"]').element as HTMLInputElement).value).toBe("pump-draft");
    expect(editor.getSnapshot().dataSources.bindings["object-a"]!.deviceId).toBe("pump-01");

    await clickIn(dialog(wrapper), "Close bindings");
    await clickIn(dialog(wrapper).find('[role="alertdialog"]') as unknown as VueWrapper, "Discard changes");
    expect(wrapper.findAll("dialog.ek-workbench__binding-dialog")).toHaveLength(0);

    wrapper.unmount();
    editor.dispose();
  });

  it("drives preview from a scoped-slot panel without duplicating requests", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse());
    const editor = createSeedEditor(executor);
    saveBinding(editor, "object-a");
    const wrapper = mount(EditorWorkbench, {
      props: { editor: markRaw(editor), rendererFactory: fakeRenderer, locale: "en" },
      slots: {
        rightPanel: (slotProps: Record<string, unknown>) => {
          const dataState = slotProps.dataState as { preview: { enabled: boolean } };
          const dataColorState = slotProps.dataColorState as { trial: unknown };
          return h("div", { class: "custom-inspector" }, [
            h("span", { class: "custom-preview" }, dataState.preview.enabled ? "preview-on" : "preview-off"),
            h("span", { class: "custom-trial" }, dataColorState.trial ? "trialing" : "idle")
          ]);
        }
      },
      attachTo: document.body
    });

    await selectNode(wrapper, "Pump object");
    expect(wrapper.find(".custom-inspector").exists()).toBe(true);
    expect(wrapper.find(".custom-preview").text()).toBe("preview-off");
    expect(wrapper.find(".custom-trial").text()).toBe("idle");
    expect(wrapper.find(".ek-workbench__binding-form").exists()).toBe(false);

    await clickButton(wrapper, "Start data preview");
    await textWhen(wrapper, "Pump 1 \u00b7 pump-01");
    expect(wrapper.find(".custom-preview").text()).toBe("preview-on");
    expect(executor).toHaveBeenCalledTimes(1);
    expect(editor.getDataColorService?.().getState().trial).toBeNull();

    await clickButton(wrapper, "Stop data preview");
    await settle();
    expect(wrapper.find(".custom-preview").text()).toBe("preview-off");
    expect(executor).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    editor.dispose();
  });

  it("re-subscribes data state when the editor reference is replaced", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse());
    const first = createSeedEditor(executor);
    const second = createSeedEditor(executor);
    saveBinding(first, "object-a", { deviceId: "pump-01" });
    saveBinding(second, "object-a", { deviceId: "pump-02" });
    const wrapper = mount(EditorWorkbench, {
      props: { editor: markRaw(first), rendererFactory: fakeRenderer, locale: "en" },
      attachTo: document.body
    });

    await selectNode(wrapper, "Pump object");
    expect((wrapper.get('input[aria-label="Device ID"]').element as HTMLInputElement).value).toBe("pump-01");

    await wrapper.setProps({ editor: markRaw(second) });
    await settle();
    await settle();

    // A replaced editor starts from its own selection, so the inspector follows it.
    expect(wrapper.find('input[aria-label="Device ID"]').exists()).toBe(false);
    await selectNode(wrapper, "Pump object");
    expect((wrapper.get('input[aria-label="Device ID"]').element as HTMLInputElement).value).toBe("pump-02");
    // The replaced editor keeps its own services alive; nothing is disposed behind our back.
    expect(first.getDataColorService?.().getState()).toBeTruthy();

    wrapper.unmount();
    // An external editor must survive unmount so the host can keep using it.
    expect(first.getSnapshot().dataSources.queries["query-a"]).toBeTruthy();
    expect(second.getSnapshot().dataSources.queries["query-a"]).toBeTruthy();
    first.dispose();
    second.dispose();
  });

  it("leaves no duplicate requests or stale cards across repeated mount and unmount", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse());
    const editor = createSeedEditor(executor);
    saveBinding(editor, "object-a");

    for (let round = 0; round < 3; round += 1) {
      const current = mountWorkbench(editor);
      await selectNode(current, "Pump object");
      if (round === 0) {
        await clickButton(current, "Start data preview");
      }
      await textWhen(current, "Pump 1 \u00b7 pump-01");
      current.unmount();
      expect(document.querySelectorAll(".ek-workbench__detail-card")).toHaveLength(0);
    }

    expect(editor.getDataService().getObjectDataState().preview.enabled).toBe(true);
    const callsBeforeStop = executor.mock.calls.length;
    editor.getDataService().stopPreview();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(executor.mock.calls.length).toBe(callsBeforeStop);
    expect(editor.getDataService().getObjectDataState().objects).toEqual({});

    editor.dispose();
  });

  it("renders the binding form in zh-CN and switches back to en without touching the snapshot", async () => {
    const editor = createSeedEditor();
    const dataSourcesBefore = editor.getSnapshot().dataSources;
    const deviceLabel = "\u8bbe\u5907 ID";
    const wrapper = mountWorkbench(editor, { locale: "zh-CN" });
    await selectNode(wrapper, "Pump object");

    expect(wrapper.text()).toContain("\u8bbe\u5907\u6570\u636e");
    expect(wrapper.find(`[aria-label="${deviceLabel}"]`).exists()).toBe(true);
    expect(editor.getSnapshot().dataSources.bindings).toEqual(dataSourcesBefore.bindings);
    expect(editor.getSnapshot().dataSources.queries).toEqual(dataSourcesBefore.queries);
    const serialized = JSON.stringify(editor.getSnapshot());
    expect(serialized).not.toContain("Device ID");
    expect(serialized).not.toContain("Device data");

    await wrapper.setProps({ locale: "en" });
    await settle();
    expect(wrapper.text()).toContain("Device data");
    expect(wrapper.find('[aria-label="Device ID"]').exists()).toBe(true);
    expect(editor.getSnapshot().dataSources.bindings).toEqual(dataSourcesBefore.bindings);
    expect(JSON.stringify(editor.getSnapshot())).not.toContain("Device ID");

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
    id: "query-a",
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
  importObject(editor, "object-a", "Pump object");
  return editor;
}

function saveBinding(
  editor: ReturnType<typeof createEditor>,
  objectNodeId: string,
  input: { deviceId?: string } = {}
): void {
  const binding = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId,
    queryId: "query-a",
    deviceId: input.deviceId ?? "pump-01",
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
      items: [{ deviceCode: "pump-01", name: "Pump 1", tempRaw: 426, run: 1 }]
    })
  } as DataRequestResult;
}

function mountWorkbench(
  editor: ReturnType<typeof createEditor>,
  props: Record<string, unknown> = {}
): VueWrapper {
  return mount(EditorWorkbench, {
    props: { editor: markRaw(editor), rendererFactory: fakeRenderer, locale: "en", ...props },
    attachTo: document.body
  });
}

async function openDataPanel(wrapper: VueWrapper): Promise<void> {
  const navigation = wrapper.get('[aria-label="Workspace views"]');
  const button = navigation.findAll("button")
    .find((candidate) => /^Data \d/.test((candidate.attributes("aria-label") ?? "").trim()));
  if (!button) {
    throw new Error("Data navigation button not found");
  }
  await button.trigger("click");
  await settle();
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

function dialog(wrapper: VueWrapper) {
  const element = wrapper.findAll("dialog.ek-workbench__binding-dialog")[0];
  if (!element) {
    throw new Error("Bindings dialog not found");
  }
  return element;
}

function findButton(root: { findAll: (selector: string) => Array<VueWrapper<Element>> }, label: string) {
  return root.findAll("button")
    .find((button) => button.attributes("aria-label") === label || button.text().trim() === label) ?? null;
}

async function clickIn(root: VueWrapper, label: string): Promise<void> {
  const button = findButton(root as unknown as { findAll: (selector: string) => Array<VueWrapper<Element>> }, label);
  if (!button) {
    throw new Error(`Button "${label}" not found in region. Buttons: ${
      root.findAll("button").map((item) => item.attributes("aria-label") ?? item.text().trim()).join(" | ")
    }`);
  }
  await button.trigger("click");
  await settle();
}

async function clickButton(wrapper: VueWrapper, label: string): Promise<void> {
  await clickIn(wrapper, label);
}

async function setInputIn(root: VueWrapper, label: string, value: string): Promise<void> {
  await root.get(`[aria-label="${label}"]`).setValue(value);
  await settle();
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

async function textWhen(root: VueWrapper, text: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await settle();
    if (root.text().includes(text)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Text "${text}" never appeared`);
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}