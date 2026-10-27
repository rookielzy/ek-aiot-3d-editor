import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataBindingDetailFieldInput,
  type DataRequestExecutor,
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
      "https://api.example.test/v1/pumps?areaId=A",
      "https://api.example.test/v1/pumps?areaId=A"
    ]);
    expect(editor.getSnapshot()).toBe(snapshotBefore);
    expect(editor.getHistoryState()).toEqual(historyBefore);

    tempRaw = 262;
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    await waitFor(() => expect(detailValue(card, "Temperature")).toBe("26.2"));
    expect(urls).toHaveLength(4);
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
    expect(within(controls).getByText("0 enabled bindings")).toBeTruthy();
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
    expect(within(controls).getByText("0 enabled bindings")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove binding" }));
    await screen.findByText("Binding removed. Undo to restore.");
    expect(screen.getByRole("group", { name: "Data preview" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop data preview" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Data preview" })).toBeNull());
    expect(editor.getDataService().getObjectDataState().preview.enabled).toBe(false);

    view.unmount();
    editor.dispose();
  });

  it("clears runtime data when the binding changes and waits for the next explicit refresh", async () => {
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

    fireEvent.change(screen.getByLabelText("Device ID"), { target: { value: "pump-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save binding" }));
    await screen.findByText("Binding updated. Undo to revert.");

    expect(within(card).queryByText("25.1")).toBeNull();
    expect(within(card).getByText("Refresh")).toBeTruthy();
    expect(within(card).getByText("Refresh to load device data.")).toBeTruthy();
    expect(card.textContent).toContain("pump-2");
    expect(previewStatus()).toBe("Refresh to load device data.");
    const callsAfterSave = executor.mock.calls.length;
    const historyAfterSave = editor.getHistoryState();

    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    await waitFor(() => expect(detailValue(card, "Temperature")).toBe("18.0"));
    expect(within(card).getByText("Current")).toBeTruthy();
    expect(executor.mock.calls.length).toBe(callsAfterSave + 1);
    expect(editor.getHistoryState()).toEqual(historyAfterSave);

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
    }
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

function deviceBody(tempRaw: number) {
  return {
    items: [
      {
        deviceCode: "pump-1",
        name: "Pump 1",
        tempRaw,
        run: 1,
        flowRaw: 12,
        sampledAt: "2026-10-27T02:00:00.000Z",
        quality: "ok"
      },
      {
        deviceCode: "pump-2",
        name: "Valve 2",
        tempRaw: 180,
        run: 0,
        flowRaw: 8,
        sampledAt: "2026-10-27T01:00:00.000Z",
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
