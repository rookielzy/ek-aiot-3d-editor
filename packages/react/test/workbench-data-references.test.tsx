import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

describe("React data source references", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows query, property, and parameter usage and selects a referencing object", async () => {
    const editor = createSeedEditor();
    saveBinding(editor, "object-a", {
      parameterOverrides: { areaId: "B" },
      details: [
        { key: "temperature", label: null, precision: null },
        { key: "running", label: null, precision: null }
      ],
      color: { propertyKey: "running", rules: [{ operator: "eq", value: true, max: null, color: "#22c55e" }] }
    });
    saveBinding(editor, "object-b", {
      parameterOverrides: {},
      details: [{ key: "temperature", label: null, precision: null }]
    });
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "Edit query Pump status" }));
    const dialog = screen.getByRole("dialog", { name: "Query configuration" });

    expect(within(dialog).getByText("Used by 2 object bindings")).toBeTruthy();
    expect(within(dialog).getByText("Pump object")).toBeTruthy();
    expect(within(dialog).getByText("Pump B")).toBeTruthy();
    expect(within(dialog).getAllByText("Device pump-01")).toHaveLength(2);
    expect(within(dialog).getByText(
      "Used by Pump object (details), Pump B (details). Keep this key and type, or update those bindings first."
    )).toBeTruthy();
    expect(within(dialog).getByText(
      "Used by Pump object (details, color). Keep this key and type, or update those bindings first."
    )).toBeTruthy();
    expect(within(dialog).getByText(
      "Overridden by Pump object. Keep this parameter and type, or update those bindings first."
    )).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Select Pump B in the scene" }));
    expect(screen.queryByRole("dialog", { name: "Query configuration" })).toBeNull();
    expect(editor.getSnapshot().selection.nodeId).toBe("object-b");
    view.unmount();
    editor.dispose();
  });

  it("shows why referenced connections and queries cannot be deleted", () => {
    const editor = createSeedEditor();
    saveBinding(editor, "object-a");
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    openDataPanel();

    const deleteConnection = screen.getByRole("button", { name: "Delete Plant API" }) as HTMLButtonElement;
    expect(deleteConnection.disabled).toBe(true);
    expect(screen.getByText("Remove or reassign its queries first.")).toBeTruthy();

    const deleteQuery = screen.getByRole("button", { name: "Delete query Pump status" }) as HTMLButtonElement;
    expect(deleteQuery.disabled).toBe(true);
    expect(screen.getByText("Remove object bindings before deleting this query.")).toBeTruthy();
    expect(screen.getAllByText("1 bound object").length).toBeGreaterThan(0);
    expect(screen.getByText("Applied to Pump object")).toBeTruthy();
    view.unmount();
    editor.dispose();
  });

  it("warns and blocks saving when a draft drops a property or parameter that bindings use", () => {
    const editor = createSeedEditor();
    saveBinding(editor, "object-a", { parameterOverrides: { areaId: "B" } });
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "Edit query Pump status" }));
    const dialog = screen.getByRole("dialog", { name: "Query configuration" });
    fireEvent.change(within(dialog).getByLabelText("Property 1 key"), { target: { value: "temp" } });
    fireEvent.change(within(dialog).getByLabelText("Parameter 1 name"), { target: { value: "zoneId" } });

    expect(within(dialog).getByText(
      "Used property temperature is missing from this draft. Saving is blocked until those bindings are updated."
    )).toBeTruthy();
    expect(within(dialog).getByText(
      "Used parameter areaId is missing from this draft. Saving is blocked until those bindings are updated."
    )).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save query" }));
    expect(within(dialog).getByText("Property temperature is used by an object binding.")).toBeTruthy();
    expect(within(dialog).getByText("Parameter areaId is overridden by an object binding.")).toBeTruthy();
    expect(editor.getSnapshot().dataSources.queries["query-a"].mapping.properties[0].key).toBe("temperature");
    expect(editor.getSnapshot().dataSources.queries["query-a"].parameters[0].name).toBe("areaId");
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toBeTruthy();
    view.unmount();
    editor.dispose();
  });

  it("warns when a draft changes the type of a used property or parameter", () => {
    const editor = createSeedEditor();
    saveBinding(editor, "object-a", { parameterOverrides: { areaId: "B" } });
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "Edit query Pump status" }));
    const dialog = screen.getByRole("dialog", { name: "Query configuration" });
    fireEvent.change(within(dialog).getByLabelText("Property 1 type"), { target: { value: "string" } });
    fireEvent.change(within(dialog).getByLabelText("Parameter 1 type"), { target: { value: "number" } });

    expect(within(dialog).getByText(
      "Property temperature is used by an object binding and its type changed. Saving is blocked until those bindings are updated."
    )).toBeTruthy();
    expect(within(dialog).getByText(
      "Parameter areaId is overridden by an object binding and its type changed. Saving is blocked until those bindings are updated."
    )).toBeTruthy();
    view.unmount();
    editor.dispose();
  });

  it("unbinds a referenced object from the query bindings dialog", async () => {
    const editor = createSeedEditor();
    saveBinding(editor, "object-a");
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "Manage bindings for Pump status" }));
    const dialog = screen.getByRole("dialog", { name: "Bindings for Pump status" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unbind Pump object" }));

    expect(await within(dialog).findByText("Binding for Pump object removed. Undo to restore.")).toBeTruthy();
    expect(editor.getSnapshot().dataSources.bindings).toEqual({});
    expect(editor.getSnapshot().dataSources.queries["query-a"]).toBeTruthy();
    expect(editor.getSnapshot().dataSources.connections["connection-a"]).toBeTruthy();
    view.unmount();
    editor.dispose();
  });

  it("tells the user that a duplicated object stays linked to the same device", () => {
    const editor = createSeedEditor();
    saveBinding(editor, "object-a");
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);

    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.click(screen.getByRole("button", { name: "Node operations" }));
    fireEvent.pointerUp(screen.getByRole("menuitem", { name: /^Duplicate/ }));

    const bindings = editor.getSnapshot().dataSources.bindings;
    expect(Object.keys(bindings)).toHaveLength(2);
    expect(Object.values(bindings).map((binding) => binding.deviceId)).toEqual(["pump-01", "pump-01"]);
    expect(screen.getByText(
      "This copy stays linked to the same device: pump-01. Change it in Device data if needed."
    )).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(
      "This copy stays linked to the same device: pump-01. Change it in Device data if needed."
    )).toBeNull();
    view.unmount();
    editor.dispose();
  });
});

function createSeedEditor() {
  const editor = createEditor();
  editor.dispatch({
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
  editor.dispatch({
    type: "import-glb",
    objectId: "object-a",
    name: "Pump object",
    asset: { id: "asset-a" }
  });
  editor.dispatch({
    type: "import-glb",
    objectId: "object-b",
    name: "Pump B",
    asset: { id: "asset-b" }
  });
  return editor;
}

function saveBinding(
  editor: ReturnType<typeof createEditor>,
  objectNodeId: string,
  patch: Partial<Parameters<typeof buildSaveDataObjectBindingCommand>[1]> = {}
): void {
  const result = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId,
    queryId: "query-a",
    parameterOverrides: {},
    deviceId: "pump-01",
    enabled: true,
    details: [{ key: "temperature", label: null, precision: null }],
    ...patch
  });
  if (!result.ok) throw new Error(result.problems.map((problem) => problem.message).join("\n"));
  const dispatched = editor.dispatch(result.command);
  if (!dispatched.ok) throw new Error(dispatched.error);
}

function openDataPanel(): void {
  const navigation = within(screen.getByLabelText("Workspace views"));
  fireEvent.click(navigation.getByRole("button", { name: /^Data \d/ }));
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
