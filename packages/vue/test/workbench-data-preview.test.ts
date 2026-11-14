import { runMenuCommand } from "./support/workbench-menu";
import { mount, type VueWrapper } from "@vue/test-utils";
import { markRaw, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataBindingDetailFieldInput,
  type DataRequestExecutor,
  type DataRequestResult,
  type DataResponseDescriptor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";

describe("Vue object data preview", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("runs only after an explicit start, shares one context, and keeps the snapshot untouched", async () => {
    let tempRaw = 251;
    const urls: string[] = [];
    const executor = vi.fn<DataRequestExecutor>(async (request) => {
      urls.push(request.url);
      return jsonResponse(deviceBody(tempRaw));
    });
    const editor = createPreviewEditor(executor, [
      { objectNodeId: "object-a", deviceId: "pump-1" },
      { objectNodeId: "object-b", deviceId: "pump-2" }
    ]);
    const wrapper = mountWorkbench(editor);

    expect(executor).not.toHaveBeenCalled();
    expect(findCard(wrapper)).toBeNull();
    expect(previewSummary(wrapper)).toBe("Enabled bindings: 2 · Shared requests: 0");

    await selectNode(wrapper, "Pump object");
    const snapshotBefore = editor.getSnapshot();
    const historyBefore = editor.getHistoryState();
    await clickButton(wrapper, "Start data preview");
    const card = await cardWhen(wrapper, (current) => detailValue(current, "Temperature") === "25.1");

    expect(heading(wrapper)).toBe("Pump object");
    expect(card.text()).toContain("Pump 1 · pump-1");
    expect(card.text()).toContain("Pump status");
    expect(card.text()).toContain("Current");
    expect(detailValue(card, "Temperature")).toBe("25.1");
    expect(detailTerm(card, "Temperature")).toContain("°C");
    expect(detailValue(card, "Running")).toBe("true");
    expect(detailValue(card, "Received")).not.toBe("Unknown");
    expect(detailValue(card, "Sampled")).not.toBe("Unknown");
    expect(detailValue(card, "Source quality")).toBe("Good");
    expect(urls).toEqual(["https://api.example.test/v1/pumps?areaId=A"]);
    expect(previewSummary(wrapper)).toBe("Enabled bindings: 2 · Shared requests: 1");
    expect(previewStatus(wrapper)).toBe("Ready");
    const previewText = controls(wrapper).text();
    expect(previewText).toContain("Pump status");
    expect(previewText).toContain("areaId=A");
    expect(previewText).toContain("Objects: 2");
    expect(card.text()).toContain("Shared request · objects: 2 · areaId=A");
    expect(editor.getSnapshot()).toBe(snapshotBefore);
    expect(editor.getHistoryState()).toEqual(historyBefore);

    tempRaw = 262;
    await clickButton(wrapper, "Refresh data");
    await cardWhen(wrapper, (current) => detailValue(current, "Temperature") === "26.2");
    expect(urls).toHaveLength(2);
    expect(editor.getSnapshot()).toBe(snapshotBefore);
    expect(editor.getHistoryState()).toEqual(historyBefore);

    await selectNode(wrapper, "Valve object");
    const valveCard = await cardWhen(wrapper, (current) => detailValue(current, "Temperature") === "18.0");
    expect(heading(wrapper)).toBe("Valve object");
    expect(valveCard.text()).toContain("Valve 2 · pump-2");
    expect(detailValue(valveCard, "Running")).toBe("false");
    expect(detailValue(valveCard, "Source quality")).toBe("Uncertain");

    const historyAfterValvePick = editor.getHistoryState();
    await clickButton(wrapper, "Stop data preview");
    await settle();
    expect(findCard(wrapper)).toBeNull();
    const stopped = editor.getDataService().getObjectDataState();
    expect(stopped.preview.enabled).toBe(false);
    expect(stopped.objects).toEqual({});
    expect(editor.getSnapshot().dataSources.bindings["object-b"]).toBeTruthy();
    expect(editor.getHistoryState()).toEqual(historyAfterValvePick);

    await clickButton(wrapper, "Start data preview");
    await cardWhen(wrapper, (current) => detailValue(current, "Temperature") === "18.0");
    expect(editor.getHistoryState()).toEqual(historyAfterValvePick);

    wrapper.unmount();
    editor.dispose();
  });

  it("shows refreshing while keeping the current values until the next response", async () => {
    let resolveRefresh!: (response: DataResponseDescriptor) => void;
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(deviceBody(251)));
    const editor = createPreviewEditor(executor, [{ objectNodeId: "object-a", deviceId: "pump-1" }]);
    const wrapper = mountWorkbench(editor);
    await selectNode(wrapper, "Pump object");
    await clickButton(wrapper, "Start data preview");
    await cardWhen(wrapper, (current) => detailValue(current, "Temperature") === "25.1");

    executor.mockImplementation(() => new Promise((resolve) => {
      resolveRefresh = resolve;
    }));
    await clickButton(wrapper, "Refresh data");
    await cardWhen(wrapper, (current) => current.text().includes("Refreshing..."));
    expect(detailValue(findCard(wrapper)!, "Temperature")).toBe("25.1");

    resolveRefresh(jsonResponse(deviceBody(262)) as DataResponseDescriptor);
    await cardWhen(wrapper, (current) => detailValue(current, "Temperature") === "26.2");
    expect(findCard(wrapper)!.text()).toContain("Current");

    wrapper.unmount();
    editor.dispose();
  });

  it("reuses the shared context when the binding selects another device", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(deviceBody(251)));
    const editor = createPreviewEditor(executor, [{ objectNodeId: "object-a", deviceId: "pump-1" }]);
    const wrapper = mountWorkbench(editor);
    await selectNode(wrapper, "Pump object");
    await clickButton(wrapper, "Start data preview");
    await cardWhen(wrapper, (current) => detailValue(current, "Temperature") === "25.1");
    const callsAfterStart = executor.mock.calls.length;
    const contextsAfterStart = editor.getDataService().getObjectDataState().preview.contextCount;

    await setInput(wrapper, "Device ID", "pump-2");
    await clickButton(wrapper, "Save binding");
    expect(wrapper.text()).toContain("Binding updated. Undo to revert.");

    const card = await cardWhen(wrapper, (current) => detailValue(current, "Temperature") === "18.0");
    expect(card.text()).toContain("pump-2");
    expect(executor.mock.calls.length).toBe(callsAfterStart);
    expect(editor.getDataService().getObjectDataState().preview.contextCount).toBe(contextsAfterStart);

    wrapper.unmount();
    editor.dispose();
  });

  it("reopens dismissed details each time the same field problem is located", async () => {
    const editor = createPreviewEditor(async () => jsonResponse({
      items: [{
        deviceCode: "pump-1",
        name: "Pump 1",
        tempRaw: 251,
        run: 1,
        quality: "ok",
        sampledAt: new Date().toISOString()
      }]
    }), [{
      objectNodeId: "object-a",
      deviceId: "pump-1",
      details: [{ key: "temperature" }, { key: "flow" }]
    }]);
    const wrapper = mountWorkbench(editor);
    await selectNode(wrapper, "Pump object");
    await clickButton(wrapper, "Start data preview");
    await cardWhen(wrapper, (current) => current.text().includes("Some fields are unavailable"));

    for (const attempt of [1, 2]) {
      await clickButton(wrapper, "Close device details");
      expect(findCard(wrapper)).toBeNull();
      await clickButton(wrapper, "Problem details");
      const problem = problemItem(wrapper, "Data field");
      expect(problem, `field problem for locate attempt ${attempt}`).toBeTruthy();
      await clickIn(problem!, "Locate");
      const reopened = await cardWhen(wrapper, (current) => current.find('[data-field-key="flow"]').exists());
      expect(editor.getSnapshot().selection.nodeId).toBe("object-a");
      expect(reopened.get('[data-field-key="flow"]').attributes("data-focused")).toBe("true");
    }

    wrapper.unmount();
    editor.dispose();
  });

  it("reports a device that is absent from the current result", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(deviceBody(251)));
    const editor = createPreviewEditor(executor, [{ objectNodeId: "object-a", deviceId: "pump-404" }]);
    const wrapper = mountWorkbench(editor);
    await selectNode(wrapper, "Pump object");
    await clickButton(wrapper, "Start data preview");
    const card = await cardWhen(wrapper, (current) => current.text().includes("Device not in current result"));

    expect(card.text()).toContain("Device pump-404 is not in the current result.");
    expect(detailValue(card, "Temperature")).toBe("—");
    expect(detailValue(card, "Running")).toBe("—");
    expect(previewStatus(wrapper)).toBe("Error");

    wrapper.unmount();
    editor.dispose();
  });

  it("reports query failures and pauses on authentication failures until retried", async () => {
    let status = 403;
    const executor = vi.fn<DataRequestExecutor>(async () => status === 403
      ? { status: 403, body: "{}" }
      : jsonResponse(deviceBody(251)));
    const editor = createPreviewEditor(executor, [{ objectNodeId: "object-a", deviceId: "pump-1" }]);
    const wrapper = mountWorkbench(editor);
    await selectNode(wrapper, "Pump object");
    await clickButton(wrapper, "Start data preview");
    const card = await cardWhen(wrapper, (current) => current.text().includes("Authentication paused"));

    expect(card.text()).toContain("The service returned HTTP 403. Fix credentials, then retry.");
    expect(detailValue(card, "Temperature")).toBe("—");
    expect(previewStatus(wrapper)).toBe("Authentication paused");
    expect(executor).toHaveBeenCalledTimes(1);

    status = 200;
    await clickIn(card, "Retry now");
    const recovered = await cardWhen(wrapper, (current) => detailValue(current, "Temperature") === "25.1");
    expect(recovered.text()).toContain("Current");
    expect(executor).toHaveBeenCalledTimes(2);

    wrapper.unmount();
    editor.dispose();
  });

  it("shows expired values separately and marks the stale problem", async () => {
    const staleSample = new Date(Date.now() - 5 * 60_000).toISOString();
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(deviceBody(251, staleSample)));
    const editor = createPreviewEditor(executor, [{ objectNodeId: "object-a", deviceId: "pump-1" }]);
    const wrapper = mountWorkbench(editor);
    await selectNode(wrapper, "Pump object");
    await clickButton(wrapper, "Start data preview");
    const card = await cardWhen(wrapper, (current) => current.attributes("data-freshness") === "expired");

    expect(card.text()).toContain("Expired");
    expect(card.text()).toContain("The last value was not refreshed within 120 s.");
    expect(detailValue(card, "Temperature")).toBe("25.1");
    expect(previewStatus(wrapper)).toBe("Expired");

    wrapper.unmount();
    editor.dispose();
  });

  it("keeps disabled bindings out of the preview", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(deviceBody(251)));
    const editor = createPreviewEditor(executor, [
      { objectNodeId: "object-a", deviceId: "pump-1", enabled: false }
    ]);
    const wrapper = mountWorkbench(editor);
    await selectNode(wrapper, "Pump object");

    expect(previewSummary(wrapper)).toBe("Enabled bindings: 0 · Shared requests: 0");
    expect(startButton(wrapper).attributes("disabled")).toBeDefined();
    expect(findCard(wrapper)).toBeNull();
    expect(executor).not.toHaveBeenCalled();

    wrapper.unmount();
    editor.dispose();
  });

  it("locks transform and material editing while preview runs", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(deviceBody(251)));
    const editor = createPreviewEditor(executor, [{ objectNodeId: "object-a", deviceId: "pump-1" }]);
    const wrapper = mountWorkbench(editor);
    await selectNode(wrapper, "Pump object");

    const positionX = wrapper.get('input[aria-label="Position X"]');
    expect(positionX.attributes("disabled")).toBeUndefined();
    expect(wrapper.text()).not.toContain("Editing is paused while data preview runs. Stop preview to change transforms or materials.");

    await clickButton(wrapper, "Start data preview");
    await cardWhen(wrapper, (current) => detailValue(current, "Temperature") === "25.1");
    expect(wrapper.get('input[aria-label="Position X"]').attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("Editing is paused while data preview runs. Stop preview to change transforms or materials.");

    await clickButton(wrapper, "Stop data preview");
    await settle();
    expect(wrapper.get('input[aria-label="Position X"]').attributes("disabled")).toBeUndefined();

    wrapper.unmount();
    editor.dispose();
  });

  it("tells the user that a duplicated object stays linked to the same device", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(deviceBody(251)));
    const editor = createPreviewEditor(executor, [{ objectNodeId: "object-a", deviceId: "pump-01" }]);
    const wrapper = mountWorkbench(editor);

    await selectNode(wrapper, "Pump object");
    await runMenuCommand(wrapper, "Node operations", "Duplicate");

    const bindings = editor.getSnapshot().dataSources.bindings;
    expect(Object.keys(bindings)).toHaveLength(2);
    expect(Object.values(bindings).map((binding) => binding.deviceId)).toEqual(["pump-01", "pump-01"]);
    const notice = "This copy stays linked to the same device: pump-01. Change it in Device data if needed.";
    expect(wrapper.text()).toContain(notice);
    await clickButton(wrapper, "Dismiss");
    expect(wrapper.text()).not.toContain(notice);

    wrapper.unmount();
    editor.dispose();
  });
});

interface PreviewBindingInput {
  objectNodeId: string;
  deviceId: string;
  enabled?: boolean;
  details?: readonly DataBindingDetailFieldInput[];
}

function createPreviewEditor(executor: DataRequestExecutor, bindings: readonly PreviewBindingInput[]) {
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
        },
        {
          key: "flow",
          label: "Flow",
          type: "number",
          nullable: false,
          unit: "m³/h",
          source: [{ kind: "key", key: "flowRaw" }],
          transform: { kind: "number" },
          range: null,
          allowed: null
        }
      ],
      observedAt: { path: [{ kind: "key", key: "sampledAt" }], format: "iso" },
      sourceQuality: {
        path: [{ kind: "key", key: "quality" }],
        entries: [{ from: "ok", quality: "good" }, { from: "warn", quality: "uncertain" }]
      }
    },
    updatePolicy: { refreshIntervalMs: 60_000, maxAgeMs: 120_000 }
  });
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  const saved = editor.dispatch(query.command);
  if (!saved.ok) throw new Error("Failed to save query.");
  const queryId = Object.keys(saved.snapshot.dataSources.queries)[0]!;
  for (const objectId of ["object-a", "object-b"]) {
    const imported = editor.dispatch({
      type: "import-glb",
      objectId,
      name: objectId === "object-a" ? "Pump object" : "Valve object",
      asset: { id: `asset-${objectId}` }
    });
    if (!imported.ok) throw new Error(imported.error);
  }
  for (const binding of bindings) {
    const result = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
      objectNodeId: binding.objectNodeId,
      queryId,
      parameterOverrides: {},
      deviceId: binding.deviceId,
      enabled: binding.enabled ?? true,
      details: binding.details ?? [{ key: "temperature", precision: 1 }, { key: "running" }]
    });
    if (!result.ok) throw new Error(result.problems.map((problem) => problem.message).join("\n"));
    const dispatched = editor.dispatch(result.command);
    if (!dispatched.ok) throw new Error(dispatched.error);
  }
  return editor;
}

function deviceBody(tempRaw: number, sampledAt = new Date(Date.now() - 1_000).toISOString()) {
  return {
    items: [
      {
        deviceCode: "pump-1",
        name: "Pump 1",
        tempRaw,
        run: 1,
        flowRaw: 12,
        sampledAt,
        quality: "ok"
      },
      {
        deviceCode: "pump-2",
        name: "Valve 2",
        tempRaw: 180,
        run: 0,
        flowRaw: 8,
        sampledAt,
        quality: "warn"
      }
    ]
  };
}

function jsonResponse(body: unknown): DataRequestResult {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body)
  } as DataRequestResult;
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

function findCard(wrapper: VueWrapper) {
  return wrapper.findAll("section.ek-workbench__detail-card")
    .find((card) => card.attributes("aria-label") === "Device details") ?? null;
}

function controls(wrapper: VueWrapper) {
  const group = wrapper.findAll('[role="group"]')
    .find((candidate) => candidate.attributes("aria-label") === "Data preview");
  if (!group) {
    throw new Error("Data preview controls not found");
  }
  return group;
}

function previewStatus(wrapper: VueWrapper): string {
  const status = controls(wrapper).find('[role="status"]');
  return status.text();
}

function previewSummary(wrapper: VueWrapper): string {
  return controls(wrapper).findAll("small")
    .map((small) => small.text())
    .find((text) => text.startsWith("Enabled bindings:")) ?? "";
}

function startButton(wrapper: VueWrapper) {
  const button = controls(wrapper).findAll("button")
    .find((candidate) => candidate.text() === "Start data preview");
  if (!button) {
    throw new Error("Start data preview button not found");
  }
  return button;
}

function heading(wrapper: VueWrapper): string {
  const card = findCard(wrapper);
  return card?.find("h3").text() ?? "";
}

function detailTerm(card: ReturnType<typeof findCard>, label: string): string {
  const term = card?.findAll("dt").find((candidate) => candidate.text().startsWith(label));
  return term?.text() ?? "";
}

function detailValue(card: NonNullable<ReturnType<typeof findCard>>, label: string): string | null {
  const term = card.findAll("dt").find((candidate) => candidate.text().startsWith(label));
  if (!term) {
    return null;
  }
  const description = term.element.nextElementSibling as HTMLElement | null;
  return description?.querySelector("strong")?.textContent ?? description?.textContent ?? null;
}

function problemItem(wrapper: VueWrapper, text: string) {
  return wrapper.findAll("li")
    .find((item) => item.text().includes(text)) ?? null;
}

function findButtonIn(root: { findAll: (selector: string) => Array<VueWrapper<Element>> }, label: string) {
  return root.findAll("button")
    .find((button) => button.attributes("aria-label") === label || button.text().trim() === label);
}

async function clickButton(wrapper: VueWrapper, label: string): Promise<void> {
  const button = findButtonIn(wrapper, label);
  if (!button) {
    throw new Error(`Button "${label}" not found. Buttons: ${
      wrapper.findAll("button").map((item) => item.attributes("aria-label") ?? item.text().trim()).join(" | ")
    }`);
  }
  await button.trigger("click");
  await settle();
}

async function clickIn(root: VueWrapper, label: string): Promise<void> {
  const button = findButtonIn(root as unknown as { findAll: (selector: string) => Array<VueWrapper<Element>> }, label);
  if (!button) {
    throw new Error(`Button "${label}" not found in region`);
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

async function cardWhen(
  wrapper: VueWrapper,
  predicate: (card: NonNullable<ReturnType<typeof findCard>>) => boolean
) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const card = findCard(wrapper);
    if (card && predicate(card)) {
      return card;
    }
  }
  throw new Error(`Device details card never satisfied the condition. Current text: ${findCard(wrapper)?.text() ?? "(no card)"}`);
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
