import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Mesh, MeshStandardMaterial } from "three";
import {
  AssetResolverBridge,
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataRequestExecutor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

describe("React data color authoring", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves ordered color rules and reports material capability", async () => {
    const editor = createSeedEditor();
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} loader={fakeLoader} resolver={fakeResolver} />);
    await waitFor(() => expect(editor.getRuntime()).toBeTruthy());
    fireEvent.click(screen.getByTitle("Pump object"));

    const section = screen.getByRole("group", { name: "Status color" });
    fireEvent.click(within(section).getByLabelText("Use status color"));
    const property = within(section).getByLabelText("Color property") as HTMLSelectElement;
    expect(property.value).toBe("temperature");
    fireEvent.change(property, { target: { value: "running" } });
    await within(section).findByLabelText("Color rule 1 · Color");
    fireEvent.click(within(section).getByRole("button", { name: "Use color #3b82f6" }));
    expect((within(section).getByLabelText("Color rule 1 · Color") as HTMLInputElement).value).toBe("#3b82f6");
    fireEvent.click(within(section).getByRole("button", { name: "Add rule" }));
    fireEvent.change(within(section).getByLabelText("Color rule 2 · Operator"), { target: { value: "ne" } });
    fireEvent.change(within(section).getByLabelText("Color rule 2 · Color"), { target: { value: "#00ff00" } });
    fireEvent.click(within(section).getByRole("button", { name: "Move color rule 2 up" }));
    fireEvent.change(screen.getByLabelText("Device ID"), { target: { value: "pump-1" } });

    fireEvent.click(screen.getByRole("button", { name: "Create binding" }));
    await screen.findByText("Binding saved. Undo to discard.");
    await within(section).findByText("All materials support status color.");

    expect(editor.getSnapshot().dataSources.bindings["object-a"].color).toEqual({
      propertyKey: "running",
      rules: [
        { operator: "ne", value: true, max: null, color: "#00ff00" },
        { operator: "eq", value: true, max: null, color: "#3b82f6" }
      ]
    });
    expect((screen.getByRole("button", { name: "Try draft on object" }) as HTMLButtonElement).disabled).toBe(true);

    view.unmount();
    editor.dispose();
  });

  it("trials the draft once and ends on a target change", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse());
    const editor = createSeedEditor(executor);
    importObject(editor, "object-b", "Pump object B");
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} loader={fakeLoader} resolver={fakeResolver} />);
    await waitFor(() => expect(editor.getRuntime()).toBeTruthy());
    fireEvent.click(screen.getByTitle("Pump object"));

    const section = screen.getByRole("group", { name: "Status color" });
    fireEvent.click(within(section).getByLabelText("Use status color"));
    fireEvent.change(within(section).getByLabelText("Color property"), { target: { value: "running" } });
    fireEvent.click(screen.getByRole("button", { name: "Load devices" }));
    const candidates = await screen.findByLabelText("Devices in current result");
    fireEvent.change(candidates, { target: { value: "pump-1" } });

    fireEvent.click(within(section).getByRole("button", { name: "Try draft on object" }));

    await waitFor(() => expect(editor.getDataColorService?.().getState().trial).toMatchObject({
      objectNodeId: "object-a",
      source: "test",
      propertyKey: "running",
      color: "#22c55e"
    }));
    expect(within(section).getByText("Draft trial is showing on this object — not saved.")).toBeTruthy();
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toBeUndefined();

    fireEvent.click(screen.getByTitle("Pump object B"));
    await waitFor(() => expect(editor.getDataColorService?.().getState().trial).toBeNull());
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toBeUndefined();

    view.unmount();
    editor.dispose();
  });

  it("locks transform and material authoring while preview runs", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => jsonResponse());
    const editor = createSeedEditor(executor);
    saveBasicBinding(editor);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} loader={fakeLoader} resolver={fakeResolver} />);
    await waitFor(() => expect(editor.getRuntime()).toBeTruthy());
    fireEvent.click(screen.getByTitle("Pump object"));
    const section = screen.getByRole("group", { name: "Status color" });
    fireEvent.click(within(section).getByLabelText("Use status color"));

    expect(screen.queryByText("Editing is paused while data preview runs. Stop preview to change transforms or materials.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));
    await screen.findAllByText("Editing is paused while data preview runs. Stop preview to change transforms or materials.");
    expect((screen.getByLabelText("Position X") as HTMLInputElement).disabled).toBe(true);
    expect(within(section).getByText("Stop data preview to try draft colors.")).toBeTruthy();
    expect((within(section).getByRole("button", { name: "Try draft on object" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Stop data preview" }));
    await waitFor(() => expect(screen.queryByText("Editing is paused while data preview runs. Stop preview to change transforms or materials.")).toBeNull());
    expect((screen.getByLabelText("Position X") as HTMLInputElement).disabled).toBe(false);

    view.unmount();
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

function jsonResponse() {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      items: [{ deviceCode: "pump-1", name: "Pump 1", tempRaw: 426, run: 1 }]
    })
  };
}

const fakeLoader = {
  load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: "#ffffff" }))
};

const fakeResolver = new AssetResolverBridge(() => ({ uri: "/box.glb" }));

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
