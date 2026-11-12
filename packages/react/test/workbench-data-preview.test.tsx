import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataBindingDetailFieldInput,
  type DataRequestExecutor,
  type DataResponseDescriptor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

describe("React object data preview", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs only after an explicit start or refresh and shows device details for the picked object", async () => {
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
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);

    expect(executor).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Device details" })).toBeNull();

    fireEvent.click(screen.getByTitle("Pump object"));
    const snapshotBefore = editor.getSnapshot();
    const historyBefore = editor.getHistoryState();
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));

    const card = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(within(card).getByText("Current")).toBeTruthy());
    expect(within(card).getByRole("heading", { name: "Pump object" })).toBeTruthy();
    expect(card.textContent).toContain("Pump 1 · pump-1");
    expect(card.textContent).toContain("Pump status");
    expect(detailValue(card, "Temperature")).toBe("25.1");
    expect(within(card).getByText(/Temperature/).textContent).toContain("°C");
    expect(detailValue(card, "Running")).toBe("true");
    expect(detailValue(card, "Received")).not.toBe("Unknown");
    expect(detailValue(card, "Sampled")).not.toBe("Unknown");
    expect(detailValue(card, "Source quality")).toBe("Good");
    expect(urls).toEqual([
      "https://api.example.test/v1/pumps?areaId=A"
    ]);
    const controls = screen.getByRole("group", { name: "Data preview" });
    expect(within(controls).getByText("Enabled bindings: 2 · Shared requests: 1")).toBeTruthy();
    expect(controls.textContent).toContain("Pump status");
    expect(controls.textContent).toContain("areaId=A");
    expect(controls.textContent).toContain("Objects: 2");
    expect(card.textContent).toContain("Shared request · objects: 2 · areaId=A");
    expect(editor.getSnapshot()).toBe(snapshotBefore);
    expect(editor.getHistoryState()).toEqual(historyBefore);

    tempRaw = 262;
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    await waitFor(() => expect(detailValue(card, "Temperature")).toBe("26.2"));
    expect(urls).toHaveLength(2);
    expect(editor.getSnapshot()).toBe(snapshotBefore);
    expect(editor.getHistoryState()).toEqual(historyBefore);

    fireEvent.click(screen.getByTitle("Valve object"));
    const historyAfterValvePick = editor.getHistoryState();
    const valveCard = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(within(valveCard).getByText("Current")).toBeTruthy());
    expect(within(valveCard).getByRole("heading", { name: "Valve object" })).toBeTruthy();
    expect(valveCard.textContent).toContain("Valve 2 · pump-2");
    expect(detailValue(valveCard, "Temperature")).toBe("18.0");
    expect(detailValue(valveCard, "Running")).toBe("false");
    expect(detailValue(valveCard, "Source quality")).toBe("Uncertain");

    fireEvent.click(screen.getByRole("button", { name: "Stop data preview" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Device details" })).toBeNull());
    const stopped = editor.getDataService().getObjectDataState();
    expect(stopped.preview.enabled).toBe(false);
    expect(stopped.objects).toEqual({});
    expect(editor.getSnapshot().dataSources.bindings["object-b"]).toBeTruthy();
    expect(editor.getHistoryState()).toEqual(historyAfterValvePick);

    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));
    expect(await screen.findByRole("region", { name: "Device details" })).toBeTruthy();
    expect(editor.getHistoryState()).toEqual(historyAfterValvePick);

    view.unmount();
    editor.dispose();
  });

  it("shows refreshing while keeping the current values until the next response", async () => {
    let resolveRefresh!: (response: DataResponseDescriptor) => void;
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(deviceBody(251)));
    const editor = createPreviewEditor(executor, [{
      objectNodeId: "object-a",
      deviceId: "pump-1"
    }]);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));
    const card = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(detailValue(card, "Temperature")).toBe("25.1"));

    executor.mockImplementation(() => new Promise((resolve) => {
      resolveRefresh = resolve;
    }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    await waitFor(() => expect(within(card).getByText("Refreshing...")).toBeTruthy());
    expect(detailValue(card, "Temperature")).toBe("25.1");

    resolveRefresh(jsonResponse(deviceBody(262)));
    await waitFor(() => expect(detailValue(card, "Temperature")).toBe("26.2"));
    expect(within(card).getByText("Current")).toBeTruthy();

    view.unmount();
    editor.dispose();
  });

  it("reuses the shared context when the binding selects another device", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(deviceBody(251)));
    const editor = createPreviewEditor(executor, [{
      objectNodeId: "object-a",
      deviceId: "pump-1"
    }]);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));

    const card = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(detailValue(card, "Temperature")).toBe("25.1"));
    const callsAfterStart = executor.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Device ID"), { target: { value: "pump-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save binding" }));
    await screen.findByText("Binding updated. Undo to revert.");

    await waitFor(() => expect(detailValue(card, "Temperature")).toBe("18.0"));
    expect(card.textContent).toContain("pump-2");
    expect(within(card).getByText("Current")).toBeTruthy();
    expect(executor.mock.calls.length).toBe(callsAfterStart);
    expect(editor.getHistoryState().undoCount).toBeGreaterThan(0);

    view.unmount();
    editor.dispose();
  });

  it("reopens dismissed device details when the object is selected again without restarting preview", async () => {
    const editor = createPreviewEditor(async () => jsonResponse(deviceBody(251)), [
      { objectNodeId: "object-a", deviceId: "pump-1" },
      { objectNodeId: "object-b", deviceId: "pump-2" }
    ]);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));
    const card = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(detailValue(card, "Temperature")).toBe("25.1"));
    const current = editor.getDataService().getObjectDataState();

    fireEvent.click(within(card).getByRole("button", { name: "Close device details" }));
    expect(screen.queryByRole("region", { name: "Device details" })).toBeNull();
    fireEvent.click(screen.getByTitle("Valve object"));
    expect(await screen.findByRole("region", { name: "Device details" })).toBeTruthy();
    fireEvent.click(screen.getByTitle("Pump object"));
    const reopened = await screen.findByRole("region", { name: "Device details" });
    expect(within(reopened).getByRole("heading", { name: "Pump object" })).toBeTruthy();
    expect(detailValue(reopened, "Temperature")).toBe("25.1");
    expect(editor.getDataService().getObjectDataState()).toBe(current);

    view.unmount();
    editor.dispose();
  });

  it("marks partial results and shows the missing field reason without a fake value", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => {
      const body = deviceBody(251);
      delete (body.items[0] as Record<string, unknown>).flowRaw;
      return jsonResponse(body);
    });
    const editor = createPreviewEditor(executor, [{
      objectNodeId: "object-a",
      deviceId: "pump-1",
      details: [
        { key: "temperature", precision: 1 },
        { key: "running" },
        { key: "flow" }
      ]
    }]);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByTitle("Pump object"));
    const historyBefore = editor.getHistoryState();
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));

    const card = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(within(card).getByText("Some fields are unavailable")).toBeTruthy());
    expect(detailValue(card, "Temperature")).toBe("25.1");
    expect(detailValue(card, "Running")).toBe("true");
    expect(detailValue(card, "Flow")).toBe("—");
    expect(within(card).getByText("Property flow source field is missing.")).toBeTruthy();
    expect(previewStatus()).toBe("Partial");
    expect(editor.getHistoryState()).toEqual(historyBefore);

    fireEvent.click(screen.getByTitle("Valve object"));
    await waitFor(() => expect(editor.getSnapshot().selection.nodeId).toBe("object-b"));
    fireEvent.click(screen.getByRole("button", { name: "Problem details" }));
    const drawer = screen.getByRole("region", { name: "Problem details" });
    const fieldProblem = [...drawer.querySelectorAll("li")]
      .find((item) => item.textContent?.includes("Data field"));
    expect(fieldProblem).toBeTruthy();
    fireEvent.click(within(fieldProblem!).getByRole("button", { name: "Locate" }));
    await waitFor(() => expect(editor.getSnapshot().selection.nodeId).toBe("object-a"));
    const pumpCard = await screen.findByRole("region", { name: "Device details" });
    await screen.findByRole("heading", { name: "Pump object" });
    expect(pumpCard.querySelector('[data-field-key="flow"]')?.getAttribute("data-focused")).toBe("true");

    view.unmount();
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
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));
    const card = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(within(card).getByText("Some fields are unavailable")).toBeTruthy());

    for (const attempt of [1, 2]) {
      fireEvent.click(screen.getByRole("button", { name: "Close device details" }));
      expect(screen.queryByRole("region", { name: "Device details" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Problem details" }));
      const drawer = screen.getByRole("region", { name: "Problem details" });
      const fieldProblem = [...drawer.querySelectorAll("li")]
        .find((item) => item.textContent?.includes("Data field"));
      expect(fieldProblem, `field problem for locate attempt ${attempt}`).toBeTruthy();
      fireEvent.click(within(fieldProblem!).getByRole("button", { name: "Locate" }));
      const reopened = await screen.findByRole("region", { name: "Device details" });
      expect(editor.getSnapshot().selection.nodeId).toBe("object-a");
      expect(reopened.querySelector('[data-field-key="flow"]')?.getAttribute("data-focused")).toBe("true");
      expect(reopened.contains(document.activeElement)).toBe(true);
    }

    view.unmount();
    editor.dispose();
  });

  it("reports a device that is absent from the current result", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(deviceBody(251)));
    const editor = createPreviewEditor(executor, [{
      objectNodeId: "object-a",
      deviceId: "pump-404"
    }]);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));

    const card = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(within(card).getByText("Device not in current result")).toBeTruthy());
    expect(card.textContent).toContain("Device pump-404 is not in the current result.");
    expect(detailValue(card, "Temperature")).toBe("—");
    expect(detailValue(card, "Running")).toBe("—");
    expect(previewStatus()).toBe("Error");

    for (const attempt of [1, 2]) {
      fireEvent.click(screen.getByRole("button", { name: "Close device details" }));
      fireEvent.click(screen.getByRole("button", { name: "Problem details" }));
      const drawer = screen.getByRole("region", { name: "Problem details" });
      const problem = within(drawer).getAllByRole("listitem")
        .find((item) => item.textContent?.includes("Data object"));
      expect(problem, `object problem for locate attempt ${attempt}`).toBeTruthy();
      fireEvent.click(within(problem!).getByRole("button", { name: "Locate" }));
      const reopened = await screen.findByRole("region", { name: "Device details" });
      expect(within(reopened).getByText("Device not in current result")).toBeTruthy();
      expect(reopened.contains(document.activeElement)).toBe(true);
    }

    view.unmount();
    editor.dispose();
  });

  it("reports query failures without inventing values", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => ({ status: 500, body: "{\"error\":true}" }));
    const editor = createPreviewEditor(executor, [{
      objectNodeId: "object-a",
      deviceId: "pump-1"
    }]);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));

    const card = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(within(card).getByText("Query failed")).toBeTruthy());
    expect(card.textContent).toContain("The service returned HTTP 500.");
    expect(detailValue(card, "Temperature")).toBe("—");
    expect(previewStatus()).toBe("Error");

    fireEvent.click(screen.getByRole("button", { name: "Problem details" }));
    const drawer = screen.getByRole("region", { name: "Problem details" });
    expect(drawer.textContent).toContain("Data query");
    const queryProblem = [...drawer.querySelectorAll("li")]
      .find((item) => item.textContent?.includes("Data query"));
    fireEvent.click(within(queryProblem!).getByRole("button", { name: "Locate" }));
    const dialog = await screen.findByRole("dialog", { name: "Query configuration" });
    expect(within(dialog).getByDisplayValue("Pump status")).toBeTruthy();

    view.unmount();
    editor.dispose();
  });

  it("pauses on authentication failures and only retries on demand", async () => {
    let status = 403;
    const executor = vi.fn<DataRequestExecutor>(async () => status === 403
      ? { status: 403, body: "{}" }
      : jsonResponse(deviceBody(251)));
    const editor = createPreviewEditor(executor, [{
      objectNodeId: "object-a",
      deviceId: "pump-1"
    }]);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));

    const card = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(within(card).getByText("Authentication paused")).toBeTruthy());
    expect(card.textContent).toContain("The service returned HTTP 403. Fix credentials, then retry.");
    expect(detailValue(card, "Temperature")).toBe("—");
    expect(previewStatus()).toBe("Authentication paused");
    expect(executor).toHaveBeenCalledTimes(1);

    status = 200;
    fireEvent.click(within(card).getByRole("button", { name: "Retry now" }));
    await waitFor(() => expect(detailValue(card, "Temperature")).toBe("25.1"));
    expect(within(card).getByText("Current")).toBeTruthy();
    expect(executor).toHaveBeenCalledTimes(2);

    view.unmount();
    editor.dispose();
  });

  it("shows expired values separately and marks the stale problem", async () => {
    const staleSample = new Date(Date.now() - 5 * 60_000).toISOString();
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(deviceBody(251, staleSample)));
    const editor = createPreviewEditor(executor, [{
      objectNodeId: "object-a",
      deviceId: "pump-1"
    }]);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));

    const card = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(card.getAttribute("data-freshness")).toBe("expired"));
    expect(within(card).getByText("Expired")).toBeTruthy();
    expect(card.textContent).toContain("The last value was not refreshed within 120 s.");
    expect(detailValue(card, "Temperature")).toBe("25.1");
    expect(previewStatus()).toBe("Expired");

    fireEvent.click(screen.getByRole("button", { name: "Problem details" }));
    const drawer = screen.getByRole("region", { name: "Problem details" });
    expect(drawer.textContent).toContain("Target · Data object");
    expect(drawer.textContent).toContain("The last value was not refreshed within 120 s.");

    view.unmount();
    editor.dispose();
  });

  it("clears a field that disappears and keeps its last valid value marked as history", async () => {
    let omitTemperature = false;
    const executor = vi.fn<DataRequestExecutor>(async () => {
      const body = deviceBody(251);
      if (omitTemperature) {
        delete (body.items[0] as Record<string, unknown>).tempRaw;
      }
      return jsonResponse(body);
    });
    const editor = createPreviewEditor(executor, [{
      objectNodeId: "object-a",
      deviceId: "pump-1"
    }]);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));

    const card = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(detailValue(card, "Temperature")).toBe("25.1"));

    omitTemperature = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    await waitFor(() => expect(detailValue(card, "Temperature")).toBe("—"));
    expect(card.textContent).toContain("Last value 25.1");
    expect(within(card).getByText("Property temperature source field is missing.")).toBeTruthy();
    expect(previewStatus()).toBe("Partial");

    view.unmount();
    editor.dispose();
  });

  it("removes current values for an empty result while keeping history", async () => {
    let empty = false;
    const executor = vi.fn<DataRequestExecutor>(async () =>
      jsonResponse(empty ? { items: [] } : deviceBody(251)));
    const editor = createPreviewEditor(executor, [{
      objectNodeId: "object-a",
      deviceId: "pump-1"
    }]);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));

    const card = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(detailValue(card, "Temperature")).toBe("25.1"));

    empty = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    await waitFor(() => expect(within(card).getByText("No data in current result")).toBeTruthy());
    expect(detailValue(card, "Temperature")).toBe("—");
    expect(card.textContent).toContain("Last value 25.1");
    expect(previewStatus()).toBe("No data");

    view.unmount();
    editor.dispose();
  });

  it("keeps disabled bindings out of the preview", () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(deviceBody(251)));
    const editor = createPreviewEditor(executor, [{
      objectNodeId: "object-a",
      deviceId: "pump-1",
      enabled: false
    }]);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByTitle("Pump object"));

    const controls = screen.getByRole("group", { name: "Data preview" });
    expect(within(controls).getByText("Enabled bindings: 0 · Shared requests: 0")).toBeTruthy();
    expect((within(controls).getByRole("button", { name: "Start data preview" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(screen.queryByRole("region", { name: "Device details" })).toBeNull();
    expect(executor).not.toHaveBeenCalled();

    view.unmount();
    editor.dispose();
  });

  it("closes the card for a disabled binding and keeps preview controls until stopped after unbinding", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse(deviceBody(251)));
    const editor = createPreviewEditor(executor, [{
      objectNodeId: "object-a",
      deviceId: "pump-1"
    }]);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));
    const card = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(within(card).getByText("Current")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Enabled"));
    fireEvent.click(screen.getByRole("button", { name: "Save binding" }));
    await screen.findByText("Binding updated. Undo to revert.");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Device details" })).toBeNull());
    const controls = screen.getByRole("group", { name: "Data preview" });
    expect(within(controls).getByText("Enabled bindings: 0 · Shared requests: 0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove binding" }));
    await screen.findByText("Binding removed. Undo to restore.");
    expect(screen.getByRole("group", { name: "Data preview" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop data preview" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Data preview" })).toBeNull());
    expect(editor.getDataService().getObjectDataState().preview.enabled).toBe(false);

    view.unmount();
    editor.dispose();
  });
});

interface PreviewBindingInput {
  objectNodeId: string;
  deviceId: string;
  enabled?: boolean;
  details?: readonly DataBindingDetailFieldInput[];
}

function createPreviewEditor(
  executor: DataRequestExecutor,
  bindings: readonly PreviewBindingInput[]
) {
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
  const queryId = Object.keys(saved.snapshot.dataSources.queries)[0];
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

function jsonResponse(body: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body)
  };
}

function detailValue(card: HTMLElement, label: string): string | null {
  const term = within(card).getAllByRole("term")
    .find((candidate) => candidate.textContent?.startsWith(label));
  const description = term?.nextElementSibling;
  return description?.querySelector("strong")?.textContent ?? description?.textContent ?? null;
}

function previewStatus(): string {
  const controls = screen.getByRole("group", { name: "Data preview" });
  return within(controls).getByRole("status").textContent ?? "";
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
