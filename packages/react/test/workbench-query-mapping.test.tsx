import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEditor,
  type DataRequestExecutor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import { seedSavedQuery } from "./support/saved-data-query";
import { selectWorkbenchOption } from "./support/workbench-select";

describe("React query authoring and mapping preview", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs a real request, previews standard properties, marks stale edits, and saves once", async () => {
    const executor: DataRequestExecutor = async () => ({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          items: [{
            deviceCode: "001",
            name: "Pump 001",
            tempRaw: 426,
            otherTemp: 500,
            run: 1,
            sampledAt: "2026-10-26T08:00:00+08:00",
            quality: "ok"
          }]
        }
      })
    });
    const editor = createEditor({ executor });
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Plant API", "https://api.example.test/v1");
    act(() => { seedSavedQuery(editor); });
    fireEvent.click(screen.getByRole("button", { name: "Edit query Saved query" }));

    expect(screen.getByRole("dialog", { name: "Query configuration" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Query name"), { target: { value: "Pump status" } });
    expect((screen.getByLabelText("Refresh interval (seconds)") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Expire after (seconds)") as HTMLInputElement).value).toBe("15");
    fireEvent.change(screen.getByLabelText("Refresh interval (seconds)"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Expire after (seconds)"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/pumps" } });
    fireEvent.change(screen.getByLabelText("Data root path"), { target: { value: "data.items" } });
    fireEvent.change(screen.getByLabelText("Device ID path"), { target: { value: "deviceCode" } });
    fireEvent.change(screen.getByLabelText("Display name path"), { target: { value: "name" } });

    fireEvent.change(screen.getByLabelText("Property 1 key"), { target: { value: "temperature" } });
    fireEvent.change(screen.getByLabelText("Property 1 label"), { target: { value: "Temperature" } });
    fireEvent.change(screen.getByLabelText("Property 1 source path"), { target: { value: "tempRaw" } });
    selectWorkbenchOption(screen.getByLabelText("Property 1 transform"), "Multiply and offset");
    fireEvent.change(screen.getByLabelText("Property 1 factor"), { target: { value: "0.1" } });
    fireEvent.change(screen.getByLabelText("Property 1 unit"), { target: { value: "°C" } });

    fireEvent.click(screen.getByRole("button", { name: "Add property" }));
    fireEvent.change(screen.getByLabelText("Property 2 key"), { target: { value: "running" } });
    selectWorkbenchOption(screen.getByLabelText("Property 2 type"), "Boolean");
    fireEvent.change(screen.getByLabelText("Property 2 source path"), { target: { value: "run" } });
    selectWorkbenchOption(screen.getByLabelText("Property 2 transform"), "Value table");
    fireEvent.change(screen.getByLabelText("Entry 1 source value"), { target: { value: "1" } });
    selectWorkbenchOption(screen.getByLabelText("Entry 1 output value"), "True");
    fireEvent.click(screen.getByRole("button", { name: "Add value table entry" }));
    fireEvent.change(screen.getByLabelText("Entry 2 source value"), { target: { value: "0" } });
    selectWorkbenchOption(screen.getByLabelText("Entry 2 output value"), "False");

    fireEvent.click(screen.getByRole("button", { name: "Run request" }));
    await screen.findByText("Tested with a real response");
    const entity = screen.getByLabelText("Device 001");
    expect(entity.textContent).toContain("Pump 001");
    expect(entity.textContent).toContain("42.6");
    expect(entity.textContent).toContain("°C");
    expect(entity.textContent).toContain("true");
    expect(entity.textContent).toContain("Unknown");
    expect(screen.getByLabelText("Standard samples").textContent).toContain("\"entityId\": \"001\"");
    expect(screen.getByLabelText("Standard samples").textContent).toContain("\"value\": 42.6");

    fireEvent.change(screen.getByLabelText("Property 1 factor"), { target: { value: "0.2" } });
    expect(screen.getByText("Draft changed after this sample")).toBeTruthy();
    const staleEntity = screen.getByLabelText("Device 001");
    expect(staleEntity.textContent).toContain("85.2");
    expect(screen.getByLabelText("Standard samples").textContent).toContain("\"value\": 85.2");

    fireEvent.change(screen.getByLabelText("Property 1 source path"), { target: { value: "otherTemp" } });
    expect(screen.getByLabelText("Device 001").textContent).toContain("100");
    selectWorkbenchOption(screen.getByLabelText("Property 1 transform"), "Strict number");
    expect(screen.getByLabelText("Device 001").textContent).toContain("500");
    fireEvent.change(screen.getByLabelText("Property 1 source path"), { target: { value: "tempRaw" } });
    selectWorkbenchOption(screen.getByLabelText("Property 1 transform"), "Multiply and offset");
    expect(screen.getByLabelText("Device 001").textContent).toContain("85.2");

    expect(editor.getHistoryState()).toEqual({ undoCount: 2, redoCount: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Save query" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Query configuration" })).toBeNull());
    expect(screen.getByText("Query updated. Undo to revert.")).toBeTruthy();
    expect(editor.getHistoryState()).toEqual({ undoCount: 3, redoCount: 0 });
    const query = Object.values(editor.getSnapshot().dataSources.queries)[0];
    expect(query).toMatchObject({
      name: "Pump status",
      path: "/pumps",
      updatePolicy: { refreshIntervalMs: 10_000, maxAgeMs: 30_000 },
      mapping: {
        mode: "array",
        identity: { kind: "path", valueType: "string" }
      }
    });
    expect(query.mapping.properties[0]).toMatchObject({
      key: "temperature",
      unit: "°C",
      transform: { kind: "scale", factor: 0.2, offset: 0 }
    });
    expect(query.mapping.properties[1]).toMatchObject({
      key: "running",
      type: "boolean",
      transform: {
        kind: "map",
        entries: [{ from: 1, to: true }, { from: 0, to: false }]
      }
    });
    expect(JSON.stringify(editor.serialize())).not.toContain("Pump 001");
    expect(JSON.stringify(editor.serialize())).not.toMatch(/"tempRaw":\s*426/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit query Pump status" })).toBeTruthy();
    view.unmount();
    editor.dispose();
  }, 20000);

  it("shows mapping problems and keeps history unchanged when saving invalid configuration", async () => {
    const editor = createEditor();
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Strict API", "https://strict.example.test");
    act(() => { seedSavedQuery(editor); });
    fireEvent.click(screen.getByRole("button", { name: "Edit query Saved query" }));

    fireEvent.change(screen.getByLabelText("Query name"), { target: { value: "Incomplete" } });
    fireEvent.change(screen.getByLabelText("Device ID path"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/devices" } });
    fireEvent.click(screen.getByRole("button", { name: "Save query" }));

    expect(screen.getByRole("dialog", { name: "Query configuration" })).toBeTruthy();
    expect(screen.getAllByText("The mapping is incomplete or invalid.").length).toBeGreaterThan(0);
    expect(editor.getHistoryState()).toEqual({ undoCount: 2, redoCount: 0 });
    expect(Object.values(editor.getSnapshot().dataSources.queries)[0].name).toBe("Saved query");
    view.unmount();
    editor.dispose();
  });

  it("maps single-object example JSON offline with a parameter identity and keeps the sample out of the snapshot", async () => {
    const editor = createEditor();
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Offline API", "https://offline.example.test");
    act(() => { seedSavedQuery(editor); });
    fireEvent.click(screen.getByRole("button", { name: "Edit query Saved query" }));

    fireEvent.change(screen.getByLabelText("Query name"), { target: { value: "Single pump" } });
    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/pump" } });
    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    fireEvent.change(screen.getByLabelText("Parameter 1 name"), { target: { value: "deviceId" } });
    selectWorkbenchOption(screen.getByLabelText("Parameter 1 type"), "Number");
    fireEvent.change(screen.getByLabelText("Parameter 1 default"), { target: { value: "7" } });
    fireEvent.click(screen.getByLabelText("Override parameter 1"));
    fireEvent.change(screen.getByLabelText("Parameter 1 test value"), { target: { value: "8" } });

    selectWorkbenchOption(screen.getByLabelText("Data shape"), "Single object");
    fireEvent.change(screen.getByLabelText("Data root path"), { target: { value: "data.pump" } });
    selectWorkbenchOption(screen.getByLabelText("Identity source"), "Query parameter");
    selectWorkbenchOption(screen.getByLabelText("Device ID parameter"), "deviceId");
    fireEvent.change(screen.getByLabelText("Display name path"), { target: { value: "name" } });
    fireEvent.change(screen.getByLabelText("Property 1 key"), { target: { value: "temperature" } });
    fireEvent.change(screen.getByLabelText("Property 1 source path"), { target: { value: "tempRaw" } });
    selectWorkbenchOption(screen.getByLabelText("Property 1 transform"), "Multiply and offset");
    fireEvent.change(screen.getByLabelText("Property 1 factor"), { target: { value: "0.1" } });

    fireEvent.change(screen.getByLabelText("Example JSON"), {
      target: {
        value: JSON.stringify({
          data: {
            pump: {
              name: "SAMPLE-ONLY-777",
              tempRaw: 426,
              run: 1
            }
          }
        })
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply example JSON" }));

    const entity = await screen.findByLabelText("Device 8");
    expect(entity.textContent).toContain("SAMPLE-ONLY-777");
    expect(entity.textContent).toContain("42.6");
    expect(screen.getByText("Previewing example JSON")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save query" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Query configuration" })).toBeNull());
    expect(editor.getHistoryState()).toEqual({ undoCount: 3, redoCount: 0 });

    const query = Object.values(editor.getSnapshot().dataSources.queries)[0];
    expect(query).toMatchObject({
      name: "Single pump",
      path: "/pump",
      parameters: [{ name: "deviceId", type: "number", defaultValue: 7 }],
      mapping: {
        mode: "single",
        identity: { kind: "parameter", parameterName: "deviceId" }
      }
    });
    expect(JSON.stringify(editor.serialize())).not.toContain("SAMPLE-ONLY-777");
    expect(JSON.stringify(editor.serialize())).not.toContain("42.6");
    expect(JSON.stringify(editor.serialize())).not.toMatch(/"deviceId":\s*8/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    view.unmount();
    editor.dispose();
  });
  it("saves a mapping after an empty array result without deleting fields", async () => {
    const executor: DataRequestExecutor = async () => ({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [] } })
    });
    const editor = createEditor({ executor });
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Empty API", "https://empty.example.test");
    act(() => { seedSavedQuery(editor); });
    fireEvent.click(screen.getByRole("button", { name: "Edit query Saved query" }));

    fireEvent.change(screen.getByLabelText("Query name"), { target: { value: "Empty query" } });
    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/pumps" } });
    fireEvent.change(screen.getByLabelText("Data root path"), { target: { value: "data.items" } });
    fireEvent.change(screen.getByLabelText("Device ID path"), { target: { value: "deviceCode" } });
    fireEvent.change(screen.getByLabelText("Property 1 key"), { target: { value: "temperature" } });
    fireEvent.change(screen.getByLabelText("Property 1 source path"), { target: { value: "tempRaw" } });

    fireEvent.click(screen.getByRole("button", { name: "Run request" }));
    await screen.findByText("Tested with a real response");
    expect(screen.getByText("No devices in this result. You can still save the mapping.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save query" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Query configuration" })).toBeNull());
    expect(editor.getHistoryState()).toEqual({ undoCount: 3, redoCount: 0 });
    const query = Object.values(editor.getSnapshot().dataSources.queries)[0];
    expect(query.mapping.properties).toMatchObject([{ key: "temperature", source: [{ kind: "key", key: "tempRaw" }] }]);
    view.unmount();
    editor.dispose();
  });

  it("saves a structurally valid mapping without a sample or request", async () => {
    const editor = createEditor();
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Untested API", "https://untested.example.test");
    act(() => { seedSavedQuery(editor); });
    fireEvent.click(screen.getByRole("button", { name: "Edit query Saved query" }));

    fireEvent.change(screen.getByLabelText("Query name"), { target: { value: "Untested query" } });
    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/pumps" } });
    fireEvent.change(screen.getByLabelText("Data root path"), { target: { value: "data.items" } });
    fireEvent.change(screen.getByLabelText("Device ID path"), { target: { value: "deviceCode" } });
    fireEvent.change(screen.getByLabelText("Property 1 key"), { target: { value: "temperature" } });
    fireEvent.change(screen.getByLabelText("Property 1 source path"), { target: { value: "tempRaw" } });
    expect(screen.queryByText("Tested with a real response")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save query" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Query configuration" })).toBeNull());
    expect(editor.getHistoryState()).toEqual({ undoCount: 3, redoCount: 0 });
    expect(Object.values(editor.getSnapshot().dataSources.queries)[0]).toMatchObject({
      name: "Untested query",
      mapping: { properties: [{ key: "temperature" }] }
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    view.unmount();
    editor.dispose();
  });

  it("round-trips string map outputs and property range/allowed constraints", async () => {
    const editor = createEditor();
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("State API", "https://state.example.test");
    act(() => { seedSavedQuery(editor); });
    fireEvent.click(screen.getByRole("button", { name: "Edit query Saved query" }));

    fireEvent.change(screen.getByLabelText("Query name"), { target: { value: "State query" } });
    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/state" } });
    fireEvent.change(screen.getByLabelText("Data root path"), { target: { value: "data.items" } });
    fireEvent.change(screen.getByLabelText("Device ID path"), { target: { value: "id" } });
    fireEvent.change(screen.getByLabelText("Property 1 key"), { target: { value: "temperature" } });
    fireEvent.change(screen.getByLabelText("Property 1 source path"), { target: { value: "tempRaw" } });
    fireEvent.change(screen.getByLabelText("Property 1 minimum"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Property 1 maximum"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Property 1 allowed values (JSON)"), { target: { value: "[10, 42.6]" } });

    fireEvent.click(screen.getByRole("button", { name: "Add property" }));
    fireEvent.change(screen.getByLabelText("Property 2 key"), { target: { value: "state" } });
    selectWorkbenchOption(screen.getByLabelText("Property 2 type"), "String");
    fireEvent.change(screen.getByLabelText("Property 2 source path"), { target: { value: "state" } });
    selectWorkbenchOption(screen.getByLabelText("Property 2 transform"), "Value table");
    fireEvent.change(screen.getByLabelText("Entry 1 source value"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Entry 1 output value"), { target: { value: "on" } });

    fireEvent.click(screen.getByRole("button", { name: "Save query" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Query configuration" })).toBeNull());
    const saved = Object.values(editor.getSnapshot().dataSources.queries)[0];
    expect(saved.mapping.properties[0]).toMatchObject({
      range: { min: 0, max: 50 },
      allowed: [10, 42.6]
    });
    expect(saved.mapping.properties[1]).toMatchObject({
      type: "string",
      transform: { kind: "map", entries: [{ from: 1, to: "on" }] }
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit query State query" }));
    expect((screen.getByLabelText("Property 1 minimum") as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText("Property 1 maximum") as HTMLInputElement).value).toBe("50");
    expect((screen.getByLabelText("Property 1 allowed values (JSON)") as HTMLInputElement).value).toBe("[10,42.6]");
    expect((screen.getByLabelText("Entry 1 output value") as HTMLInputElement).value).toBe("on");

    fireEvent.click(screen.getByRole("button", { name: "Save query" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Query configuration" })).toBeNull());
    expect(editor.getHistoryState()).toEqual({ undoCount: 4, redoCount: 0 });
    const updated = Object.values(editor.getSnapshot().dataSources.queries)[0];
    expect(updated.mapping.properties[0]).toMatchObject({
      range: { min: 0, max: 50 },
      allowed: [10, 42.6]
    });
    expect(updated.mapping.properties[1]).toMatchObject({
      transform: { kind: "map", entries: [{ from: 1, to: "on" }] }
    });
    view.unmount();
    editor.dispose();
  });
});

function openDataPanel(): void {
  const navigation = within(screen.getByLabelText("Workspace views"));
  fireEvent.click(navigation.getByRole("button", { name: /^Data \d/ }));
}

async function createConnection(name: string, baseUrl: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "New connection" }));
  fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Service URL"), { target: { value: baseUrl } });
  fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
  await waitFor(() => expect(screen.getByRole("button", { name: `Edit ${name}` })).toBeTruthy());
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
