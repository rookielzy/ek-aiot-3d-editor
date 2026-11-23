import React, { act } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import { selectWorkbenchOption, workbenchOptionLabels } from "./support/workbench-select";

describe("React object binding authoring", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves one query, device overrides, and ordered details as one undoable binding", async () => {
    const editor = createSeedEditor();
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByRole("tab", { name: "Device data" }));
    fireEvent.click(screen.getByTitle("Pump object"));

    expect(screen.getByRole("heading", { name: "Device data" })).toBeTruthy();
    expect(await screen.findByText("Pump status")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Device ID"), { target: { value: "pump-manual-99" } });
    fireEvent.click(screen.getByLabelText("Override areaId for this object"));
    fireEvent.change(screen.getByLabelText("Override value for areaId"), { target: { value: "B" } });
    fireEvent.change(screen.getByLabelText("Decimal places for Temperature"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Label override for Temperature"), { target: { value: "Temperature °C" } });
    fireEvent.click(screen.getByRole("button", { name: "Move detail field Running up" }));

    const before = editor.getHistoryState();
    fireEvent.click(screen.getByRole("button", { name: "Create binding" }));

    await screen.findByText("Binding saved. Undo to discard.");
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
      { key: "temperature", label: "Temperature °C", precision: 1 }
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Remove binding" }));
    await screen.findByText("Binding removed. Undo to restore.");
    expect(editor.getSnapshot().dataSources.bindings).toEqual({});
    act(() => {
      editor.undo();
    });
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toBeTruthy();

    view.unmount();
    editor.dispose();
  });

  it("loads candidates from the binding override and falls back to the query default", async () => {
    const urls: string[] = [];
    const executor = vi.fn<DataRequestExecutor>(async (request) => {
      urls.push(request.url);
      return {
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            { deviceCode: "pump-1", name: "Pump 1", tempRaw: 251, run: 1 },
            { deviceCode: "pump-2", name: "Pump 2", tempRaw: 180, run: 0 }
          ]
        })
      };
    });
    const editor = createSeedEditor(executor);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByRole("tab", { name: "Device data" }));
    fireEvent.click(screen.getByTitle("Pump object"));

    fireEvent.click(screen.getByLabelText("Override areaId for this object"));
    fireEvent.change(screen.getByLabelText("Override value for areaId"), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: "Load devices" }));

    const candidates = await screen.findByLabelText("Devices in current result");
    expect(urls).toEqual(["https://api.example.test/v1/pumps?areaId=B"]);
    expect(workbenchOptionLabels(candidates)).toContain("Pump 2 (pump-2)");
    await selectWorkbenchOption(candidates, "Pump 2 (pump-2)");
    expect((screen.getByLabelText("Device ID") as HTMLInputElement).value).toBe("pump-2");

    fireEvent.change(screen.getByLabelText("Override value for areaId"), { target: { value: "C" } });
    expect(screen.getByText("Parameters changed. Load devices again.")).toBeTruthy();
    expect(screen.queryByLabelText("Devices in current result")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load devices" }));
    await waitFor(() => expect(urls).toHaveLength(2));
    expect(urls[1]).toBe("https://api.example.test/v1/pumps?areaId=C");

    fireEvent.click(screen.getByLabelText("Override areaId for this object"));
    fireEvent.click(screen.getByRole("button", { name: "Load devices" }));
    await waitFor(() => expect(urls).toHaveLength(3));
    expect(urls[2]).toBe("https://api.example.test/v1/pumps?areaId=A");
    expect(Object.values(editor.getSnapshot().dataSources.queries)[0]?.parameters)
      .toEqual([{ name: "areaId", type: "string", defaultValue: "A", location: "query" }]);
    expect(editor.getSnapshot().dataSources.bindings).toEqual({});

    view.unmount();
    editor.dispose();
  });

  it("invalidates device candidates when the bound connection configuration changes", async () => {
    const urls: string[] = [];
    const executor = vi.fn<DataRequestExecutor>(async (request) => {
      urls.push(request.url);
      return {
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [{ deviceCode: "pump-1", name: "Pump 1", tempRaw: 251, run: 1 }]
        })
      };
    });
    const editor = createSeedEditor(executor);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByRole("tab", { name: "Device data" }));
    fireEvent.click(screen.getByTitle("Pump object"));

    fireEvent.click(screen.getByRole("button", { name: "Load devices" }));
    expect(await screen.findByLabelText("Devices in current result")).toBeTruthy();
    expect(urls).toEqual(["https://api.example.test/v1/pumps?areaId=A"]);

    const connection = editor.getSnapshot().dataSources.connections["connection-a"];
    const update = buildSaveDataConnectionCommand(editor.getSnapshot(), {
      name: connection.name,
      baseUrl: "https://api.example.test/v2",
      auth: connection.auth,
      headers: connection.headers,
      timeoutMs: connection.timeoutMs
    }, { connectionId: "connection-a" });
    if (!update.ok) throw new Error(update.problems.map((problem) => problem.message).join("\n"));
    act(() => {
      const dispatched = editor.dispatch(update.command);
      if (!dispatched.ok) throw new Error(dispatched.error);
    });

    expect(screen.getByText("Parameters changed. Load devices again.")).toBeTruthy();
    expect(screen.queryByLabelText("Devices in current result")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Load devices" }));
    await waitFor(() => expect(urls).toHaveLength(2));
    expect(urls[1]).toBe("https://api.example.test/v2/pumps?areaId=A");

    view.unmount();
    editor.dispose();
  });

  it("localizes device candidate mapping failures", async () => {
    window.localStorage.setItem("ek-aiot.workbench.locale", "zh-CN");
    const executor = vi.fn<DataRequestExecutor>(async () => ({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ devices: [] })
    }));
    const editor = createSeedEditor(executor);
    const query = Object.values(editor.getSnapshot().dataSources.queries)[0];
    const update = buildSaveDataQueryCommand(editor.getSnapshot(), {
      connectionId: query.connectionId,
      name: query.name,
      path: query.path,
      parameters: query.parameters,
      mapping: {
        ...query.mapping,
        root: [{ kind: "key", key: "missingRoot" }]
      }
    }, { queryId: query.id });
    if (!update.ok) throw new Error(update.problems.map((problem) => problem.message).join("\n"));
    act(() => {
      const dispatched = editor.dispatch(update.command);
      if (!dispatched.ok) throw new Error(dispatched.error);
    });

    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByRole("tab", { name: "设备数据" }));
    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.click(screen.getByRole("button", { name: "加载设备" }));

    expect(await screen.findByText("配置的数据根不存在。")).toBeTruthy();

    view.unmount();
    editor.dispose();
  });

  it("explains imported, multi-selected, and grouped targets without silent rebinding", () => {
    const editor = createSeedEditor(undefined, true);
    const imported = Object.values(editor.getSnapshot().nodes).find((node) =>
      node.kind === "imported" && node.ownerObjectId === "object-a"
    );
    if (!imported) throw new Error("Expected an imported target.");
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByRole("tab", { name: "Device data" }));

    fireEvent.click(screen.getByTitle(imported.name));
    expect(screen.getByText("Imported nodes cannot be bound directly. Bind the owner object instead.")).toBeTruthy();
    expect(screen.queryByLabelText("Device ID")).toBeNull();
    expect(editor.getSnapshot().selection.nodeId).toBe(imported.id);

    fireEvent.click(screen.getByRole("button", { name: "Select owner Pump object" }));
    expect(editor.getSnapshot().selection.nodeId).toBe("object-a");
    expect(screen.getByLabelText("Device ID")).toBeTruthy();

    fireEvent.click(screen.getByTitle(imported.name), { ctrlKey: true });
    expect(screen.getByText("Device data is available for one object at a time. Select a single object.")).toBeTruthy();
    expect(screen.queryByLabelText("Device ID")).toBeNull();

    act(() => {
      const grouped = editor.dispatch({
        type: "group-nodes",
        nodeIds: ["object-a"],
        nodeId: "group-a",
        name: "Pump group"
      });
      if (!grouped.ok) throw new Error(grouped.error);
    });
    fireEvent.click(screen.getByTitle("Pump group"));
    expect(screen.getByText("Groups cannot carry device data. Select a GLB object.")).toBeTruthy();
    expect(screen.queryByLabelText("Device ID")).toBeNull();

    view.unmount();
    editor.dispose();
  });

  it("returns to the same object draft after creating or cancelling a query", async () => {
    const editor = createConnectionOnlyEditor();
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByRole("tab", { name: "Device data" }));
    fireEvent.click(screen.getByTitle("Pump object"));

    expect(screen.getByText("No saved queries yet. Create one for this object.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Device ID"), { target: { value: "pump-manual-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create query" }));

    const dialog = await screen.findByRole("dialog", { name: "Query configuration" });
    fireEvent.change(within(dialog).getByLabelText("Query name"), { target: { value: "Pump query" } });
    fireEvent.change(within(dialog).getByLabelText("Request path"), { target: { value: "/pumps" } });
    fireEvent.change(within(dialog).getByLabelText("Data root path"), { target: { value: "items" } });
    fireEvent.change(within(dialog).getByLabelText("Device ID path"), { target: { value: "deviceCode" } });
    fireEvent.change(within(dialog).getByLabelText("Property 1 key"), { target: { value: "temperature" } });
    fireEvent.change(within(dialog).getByLabelText("Property 1 label"), { target: { value: "Temperature" } });
    fireEvent.change(within(dialog).getByLabelText("Property 1 source path"), { target: { value: "tempRaw" } });
    selectWorkbenchOption(within(dialog).getByLabelText("Property 1 transform"), "Multiply and offset");
    fireEvent.change(within(dialog).getByLabelText("Property 1 factor"), { target: { value: "0.1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save query" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Query configuration" })).toBeNull());
    expect(editor.getSnapshot().selection.nodeId).toBe("object-a");
    expect((screen.getByLabelText("Device ID") as HTMLInputElement).value).toBe("pump-manual-1");
    const savedQuery = Object.values(editor.getSnapshot().dataSources.queries)[0];
    expect(savedQuery).toMatchObject({ name: "Pump query", path: "/pumps" });
    expect(await screen.findByText("Pump query")).toBeTruthy();
    expect(screen.queryByText("Pump status")).toBeNull();
    expect(screen.getByText("Temperature")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Create query" }));
    const cancelled = await screen.findByRole("dialog", { name: "Query configuration" });
    fireEvent.click(within(cancelled).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Query configuration" })).toBeNull());
    expect(editor.getSnapshot().selection.nodeId).toBe("object-a");
    expect((screen.getByLabelText("Device ID") as HTMLInputElement).value).toBe("pump-manual-1");
    expect(Object.keys(editor.getSnapshot().dataSources.queries)).toHaveLength(1);

    view.unmount();
    editor.dispose();
  });

  it("can create a query when a connection is added after selecting the object", async () => {
    const editor = createEditor();
    seedObject(editor);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByRole("tab", { name: "Device data" }));
    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.change(screen.getByLabelText("Device ID"), { target: { value: "pump-draft" } });

    act(() => seedConnection(editor));

    const create = screen.getByRole("button", { name: "Create query" }) as HTMLButtonElement;
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    const dialog = await screen.findByRole("dialog", { name: "Query configuration" });
    expect(within(dialog).getByLabelText("Query name")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect((screen.getByLabelText("Device ID") as HTMLInputElement).value).toBe("pump-draft");
    expect(editor.getSnapshot().selection.nodeId).toBe("object-a");

    act(() => {
      expect(editor.dispatch({ type: "delete-data-connection", connectionId: "connection-a" }).ok).toBe(true);
      expect(editor.dispatch({
        type: "create-data-connection",
        connection: {
          id: "connection-b",
          name: "Replacement API",
          baseUrl: "https://api.example.test/replacement",
          auth: { kind: "none" },
          headers: {},
          timeoutMs: 10_000
        }
      }).ok).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "Create query" }));
    const replacementDialog = await screen.findByRole("dialog", { name: "Query configuration" });
    expect(within(replacementDialog).getByLabelText("Query name")).toBeTruthy();
    expect(within(replacementDialog).queryByText("This connection no longer exists.")).toBeNull();

    view.unmount();
    editor.dispose();
  });

  it("allows devices to be loaded again after query creation cancels a pending candidate request", async () => {
    let resolvePending!: (response: { status: number; body: string }) => void;
    const pending = new Promise<{ status: number; body: string }>((resolve) => {
      resolvePending = resolve;
    });
    const requests: Parameters<DataRequestExecutor>[0][] = [];
    const editor = createSeedEditor((request) => {
      requests.push(request);
      return requests.length === 1 ? pending.promise : {
        status: 200,
        body: JSON.stringify({ items: [{ deviceCode: "pump-1", name: "Pump 1", tempRaw: 251, run: 1 }] })
      };
    });
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByRole("tab", { name: "Device data" }));
    fireEvent.click(screen.getByTitle("Pump object"));
    fireEvent.click(screen.getByRole("button", { name: "Load devices" }));
    expect(requests).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Create query" }));
    const dialog = await screen.findByRole("dialog", { name: "Query configuration" });
    expect(requests[0].signal.aborted).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    const load = await screen.findByRole("button", { name: "Load devices" });
    expect((load as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(load);
    expect(await screen.findByLabelText("Devices in current result")).toBeTruthy();
    expect(requests).toHaveLength(2);
    await act(async () => resolvePending({ status: 200, body: JSON.stringify({ items: [] }) }));
    expect(workbenchOptionLabels(screen.getByLabelText("Devices in current result"))).toContain("Pump 1 (pump-1)");

    view.unmount();
    editor.dispose();
  });

  it("reuses the binding form from the query details dialog", async () => {
    const editor = createSeedEditor();
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "Manage bindings for Pump status" }));
    const dialog = await screen.findByRole("dialog", { name: "Bindings for Pump status" });
    expect(within(dialog).getByRole("heading", { name: "Bindings for Pump status" })).toBeTruthy();
    // The query is fixed by the dialog, so the object form offers no query picker.
    expect(within(dialog).queryByRole("combobox", { name: "Query" })).toBeNull();
    expect(within(dialog).getByRole("combobox", { name: "Object" }).textContent).toContain("Pump object");

    fireEvent.change(within(dialog).getByLabelText("Device ID"), { target: { value: "pump-77" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create binding" }));

    await within(dialog).findByText("pump-77");
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toMatchObject({
      queryId: Object.keys(editor.getSnapshot().dataSources.queries)[0],
      deviceId: "pump-77"
    });
    expect(within(dialog).getByRole("button", { name: "Edit binding for Pump object" })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close bindings" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bindings for Pump status" })).toBeNull());

    view.unmount();
    editor.dispose();
  });

  it("locates a bound object in the scene and announces the saved binding", async () => {
    const editor = createSeedEditor();
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "Manage bindings for Pump status" }));
    const dialog = await screen.findByRole("dialog", { name: "Bindings for Pump status" });
    fireEvent.change(within(dialog).getByLabelText("Device ID"), { target: { value: "pump-77" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create binding" }));
    await within(dialog).findByText("Binding saved. Undo to discard.");

    fireEvent.click(within(dialog).getByRole("button", { name: "Locate Pump object in the scene" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bindings for Pump status" })).toBeNull());

    expect(editor.getSnapshot().selection.nodeId).toBe("object-a");
    fireEvent.click(screen.getByRole("tab", { name: "Device data" }));
    expect(screen.getByRole("heading", { name: "Device data" })).toBeTruthy();
    expect((screen.getByLabelText("Device ID") as HTMLInputElement).value).toBe("pump-77");
    expect(screen.getByText("Selected Pump object in the scene.")).toBeTruthy();

    view.unmount();
    editor.dispose();
  });

  it("resolves the discard prompt before the dialog listens to Escape", async () => {
    const editor = createSeedEditor();
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "Manage bindings for Pump status" }));
    const dialog = await screen.findByRole("dialog", { name: "Bindings for Pump status" });
    fireEvent.change(within(dialog).getByLabelText("Device ID"), { target: { value: "pump-draft" } });

    fireEvent.keyDown(dialog, { key: "Escape" });
    const guard = await within(dialog).findByRole("alertdialog", { name: "Discard binding changes?" });
    fireEvent.keyDown(guard, { key: "Escape" });
    await waitFor(() => expect(within(dialog).queryByRole("alertdialog")).toBeNull());
    // Cancelling the prompt keeps the draft and the dialog.
    expect((within(dialog).getByLabelText("Device ID") as HTMLInputElement).value).toBe("pump-draft");

    fireEvent.keyDown(dialog, { key: "Escape" });
    await within(dialog).findByRole("alertdialog", { name: "Discard binding changes?" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(within(dialog).queryByRole("alertdialog")).toBeNull());
    expect((within(dialog).getByLabelText("Device ID") as HTMLInputElement).value).toBe("pump-draft");

    fireEvent.click(within(dialog).getByRole("button", { name: "Close bindings" }));
    const closeGuard = await within(dialog).findByRole("alertdialog", { name: "Discard binding changes?" });
    // The panel entry point owns the focus again once the dialog is gone.
    fireEvent.click(within(closeGuard).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bindings for Pump status" })).toBeNull());
    expect(editor.getSnapshot().dataSources.bindings).toEqual({});
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Manage bindings for Pump status" })
    ));

    view.unmount();
    editor.dispose();
  });

  it.each([
    {
      locale: "en" as const,
      dialog: "Bindings for Pump status",
      guard: "Discard binding changes?",
      object: "Object",
      device: "Device ID",
      close: "Close bindings",
      keep: "Keep editing",
      discard: "Discard changes"
    },
    {
      locale: "zh-CN" as const,
      dialog: "Pump status 的绑定",
      guard: "放弃绑定修改？",
      object: "对象",
      device: "设备 ID",
      close: "关闭绑定",
      keep: "继续编辑",
      discard: "放弃修改"
    }
  ])("protects binding drafts when switching objects and closing in $locale", async (labels) => {
    const editor = createSeedEditor();
    expect(editor.dispatch({
      type: "import-glb",
      objectId: "object-b",
      name: "Valve object",
      asset: { id: "asset-b" }
    }).ok).toBe(true);
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} locale={labels.locale} />);
    const navigation = within(screen.getByLabelText(labels.locale === "en" ? "Workspace views" : "工作区视图"));
    fireEvent.click(navigation.getByRole("button", { name: labels.locale === "en" ? /^Data \d/ : /^数据 \d/ }));
    fireEvent.click(screen.getByRole("button", {
      name: labels.locale === "en" ? "Manage bindings for Pump status" : "管理 Pump status 的绑定"
    }));
    const dialog = await screen.findByRole("dialog", { name: labels.dialog });
    fireEvent.change(within(dialog).getByLabelText(labels.device), { target: { value: "pump-draft" } });
    await selectWorkbenchOption(within(dialog).getByLabelText(labels.object), "Valve object");
    const switchGuard = await within(dialog).findByRole("alertdialog", { name: labels.guard });
    expect(within(dialog).getByLabelText(labels.object).textContent).toContain("Pump object");

    fireEvent.click(within(switchGuard).getByRole("button", { name: labels.keep }));
    expect(within(dialog).getByLabelText(labels.object).textContent).toContain("Pump object");
    expect((within(dialog).getByLabelText(labels.device) as HTMLInputElement).value).toBe("pump-draft");

    await selectWorkbenchOption(within(dialog).getByLabelText(labels.object), "Valve object");
    fireEvent.click(within(dialog).getByRole("button", { name: labels.discard }));
    expect(within(dialog).getByLabelText(labels.object).textContent).toContain("Valve object");
    expect((within(dialog).getByLabelText(labels.device) as HTMLInputElement).value).toBe("");

    fireEvent.change(within(dialog).getByLabelText(labels.device), { target: { value: "valve-draft" } });
    fireEvent.click(within(dialog).getByRole("button", { name: labels.close }));
    const closeGuard = await within(dialog).findByRole("alertdialog", { name: labels.guard });
    fireEvent.click(within(closeGuard).getByRole("button", { name: labels.keep }));
    expect((within(dialog).getByLabelText(labels.device) as HTMLInputElement).value).toBe("valve-draft");
    fireEvent.click(within(dialog).getByRole("button", { name: labels.close }));
    fireEvent.click(within(dialog).getByRole("button", { name: labels.discard }));
    expect(screen.queryByRole("dialog", { name: labels.dialog })).toBeNull();
    expect(editor.getSnapshot().dataSources.bindings).toEqual({});

    view.unmount();
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
  seedObject(editor, expandImportedTargets);
  return editor;
}

function createConnectionOnlyEditor() {
  const editor = createEditor();
  seedConnection(editor);
  seedObject(editor);
  return editor;
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
