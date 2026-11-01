import React, { act } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

describe("React data source workspace", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens an empty searchable data workspace without network access", async () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);

    openDataPanel();

    expect(screen.getByRole("heading", { name: "Data sources" })).toBeTruthy();
    expect(screen.getByText("No connections yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New connection" })).toBeTruthy();
    expect(screen.getByLabelText("Search connections")).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(editor.getSnapshot().dataSources).toEqual({ connections: {}, queries: {}, bindings: {} });
  });

  it("creates, edits, duplicates, deletes, and undoes connections through core history", async () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();

    await createConnection("Plant API", "https://api.example.test/v1");
    const created = Object.values(editor.getSnapshot().dataSources.connections);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      auth: { kind: "none" }
    });
    expect(editor.getHistoryState()).toEqual({ undoCount: 1, redoCount: 0 });
    expect(screen.getByRole("button", { name: "Edit Plant API" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit Plant API" }));
    fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: "Plant API v2" } });
    fireEvent.change(screen.getByLabelText("Timeout (seconds)"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    expect(editor.getSnapshot().dataSources.connections[created[0].id]).toMatchObject({
      name: "Plant API v2",
      timeoutMs: 15_000
    });
    expect(editor.getHistoryState()).toEqual({ undoCount: 2, redoCount: 0 });
    expect(screen.getByText("Connection updated. Undo to revert.")).toBeTruthy();

    const connectionId = created[0].id;
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Plant API v2" }));
    const duplicated = Object.values(editor.getSnapshot().dataSources.connections);
    expect(duplicated).toHaveLength(2);
    const copy = duplicated.find((connection) => connection.id !== connectionId);
    expect(copy?.name).toBe("Plant API v2 copy");
    expect(copy?.id).not.toBe(connectionId);
    expect(editor.getSnapshot().dataSources.queries).toEqual({});
    expect(editor.getHistoryState()).toEqual({ undoCount: 3, redoCount: 0 });
    expect(screen.getByText("Duplicated as Plant API v2 copy.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete Plant API v2 copy" }));
    expect(Object.keys(editor.getSnapshot().dataSources.connections)).toEqual([connectionId]);
    expect(editor.getHistoryState()).toEqual({ undoCount: 4, redoCount: 0 });
    expect(screen.queryByRole("button", { name: "Edit Plant API v2 copy" })).toBeNull();

    act(() => {
      editor.undo();
    });
    expect(Object.keys(editor.getSnapshot().dataSources.connections)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Edit Plant API v2 copy" })).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid drafts without history and focuses the first invalid field", async () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "New connection" }));
    const nameInput = screen.getByLabelText("Connection name");
    await waitFor(() => expect(document.activeElement).toBe(nameInput));
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    expect(screen.getByText("Enter a connection name.")).toBeTruthy();
    expect(document.activeElement).toBe(nameInput);
    expect(editor.getHistoryState()).toEqual({ undoCount: 0, redoCount: 0 });
    expect(editor.getSnapshot().dataSources.connections).toEqual({});

    fireEvent.change(nameInput, { target: { value: "Plant API" } });
    const urlInput = screen.getByLabelText("Service URL");
    fireEvent.change(urlInput, { target: { value: "https://user:secret@api.example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    expect(screen.getAllByText("Remove embedded credentials from the URL.").length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(urlInput);

    fireEvent.change(urlInput, { target: { value: "https://api.example.test/v1" } });
    const timeoutInput = screen.getByLabelText("Timeout (seconds)");
    fireEvent.change(timeoutInput, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    expect(screen.getAllByText("Enter a positive timeout.").length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(timeoutInput);
    expect(editor.getSnapshot().dataSources.connections).toEqual({});

    fireEvent.change(timeoutInput, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    expect(Object.values(editor.getSnapshot().dataSources.connections)).toHaveLength(1);
    expect(editor.getHistoryState()).toEqual({ undoCount: 1, redoCount: 0 });
  });

  it("uses credentials supplied through EditorWorkbench options", () => {
    render(
      <EditorWorkbench
        credentials={[{ ref: "credential-host", label: "Host token", available: true }]}
        rendererFactory={fakeRenderer}
        rightPanel={() => null}
      />
    );
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "New connection" }));
    fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: "Host API" } });
    fireEvent.change(screen.getByLabelText("Service URL"), { target: { value: "https://host.example.test" } });
    fireEvent.change(screen.getByLabelText("Authentication"), { target: { value: "bearer" } });
    expect(screen.getByRole("option", { name: "Host token" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Credential"), { target: { value: "credential-host" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    expect(screen.getByText("Credential: Host token")).toBeTruthy();
  });

  it("round-trips millisecond timeouts when editing other fields", () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "New connection" }));
    fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: "Fast API" } });
    fireEvent.change(screen.getByLabelText("Service URL"), { target: { value: "https://fast.example.test" } });
    fireEvent.change(screen.getByLabelText("Timeout (seconds)"), { target: { value: "0.005" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    const saved = Object.values(editor.getSnapshot().dataSources.connections)[0];
    expect(saved.timeoutMs).toBe(5);

    fireEvent.click(screen.getByRole("button", { name: "Edit Fast API" }));
    expect((screen.getByLabelText("Timeout (seconds)") as HTMLInputElement).value).toBe("0.005");
    fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: "Fast API v2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    expect(editor.getSnapshot().dataSources.connections[saved.id]).toMatchObject({
      name: "Fast API v2",
      timeoutMs: 5
    });
  });

  it("authors public headers and rejects reserved authentication headers", () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "New connection" }));
    fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: "Header API" } });
    fireEvent.change(screen.getByLabelText("Service URL"), { target: { value: "https://headers.example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Add header" }));
    fireEvent.change(screen.getByLabelText("Header name 1"), { target: { value: "X-Tenant" } });
    fireEvent.change(screen.getByLabelText("Header value 1"), { target: { value: "plant-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    const saved = Object.values(editor.getSnapshot().dataSources.connections)[0];
    expect(saved.headers).toEqual({ "X-Tenant": "plant-1" });
    expect(editor.getHistoryState()).toEqual({ undoCount: 1, redoCount: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Edit Header API" }));
    expect((screen.getByLabelText("Header name 1") as HTMLInputElement).value).toBe("X-Tenant");
    expect((screen.getByLabelText("Header value 1") as HTMLInputElement).value).toBe("plant-1");
    fireEvent.change(screen.getByLabelText("Header name 1"), { target: { value: "Authorization" } });
    fireEvent.change(screen.getByLabelText("Header value 1"), { target: { value: "Bearer secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    expect(screen.getByText("Authentication headers cannot be set as public or query headers.")).toBeTruthy();
    expect(editor.getSnapshot().dataSources.connections[saved.id].headers).toEqual({ "X-Tenant": "plant-1" });
    expect(editor.getHistoryState()).toEqual({ undoCount: 1, redoCount: 0 });
  });

  it("asks before discarding an unsaved draft", () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "New connection" }));
    fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: "Draft connection" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeTruthy();
    expect((screen.getByLabelText("Connection name") as HTMLInputElement).value).toBe("Draft connection");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep editing" }));

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((screen.getByLabelText("Connection name") as HTMLInputElement).value).toBe("Draft connection");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByLabelText("Connection name")).toBeNull();
    expect(editor.getHistoryState()).toEqual({ undoCount: 0, redoCount: 0 });
    expect(editor.getSnapshot().dataSources.connections).toEqual({});
  });

  it("keeps host credential labels when project feedback rebuilds the workbench model", async () => {
    const editor = createEditor({
      credentials: [{ ref: "credential-live", label: "Live token", available: true }]
    });
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "New connection" }));
    fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: "Live API" } });
    fireEvent.change(screen.getByLabelText("Service URL"), { target: { value: "https://live.example.test" } });
    fireEvent.change(screen.getByLabelText("Authentication"), { target: { value: "bearer" } });
    fireEvent.change(screen.getByLabelText("Credential"), { target: { value: "credential-live" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    expect(screen.getByText("Credential: Live token")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Export", exact: true }));

    await screen.findAllByText("Project Export Payload Missing");
    expect(screen.getByText("Credential: Live token")).toBeTruthy();
  });

  it.each(["New connection", "Edit Existing API", "Edit Other API"])("protects dirty drafts before %s", async (action) => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Existing API", "https://existing.example.test");
    await createConnection("Other API", "https://other.example.test");
    fireEvent.click(screen.getByRole("button", { name: "Edit Existing API" }));
    fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: "Unsaved name" } });
    fireEvent.change(screen.getByLabelText("Service URL"), { target: { value: "https://draft.example.test" } });
    const before = editor.serialize();
    const history = editor.getHistoryState();

    fireEvent.click(screen.getByRole("button", { name: action }));
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((screen.getByLabelText("Connection name") as HTMLInputElement).value).toBe("Unsaved name");
    expect((screen.getByLabelText("Service URL") as HTMLInputElement).value).toBe("https://draft.example.test");
    expect(document.activeElement).toBe(screen.getByLabelText("Connection name"));

    fireEvent.click(screen.getByRole("button", { name: action }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((screen.getByLabelText("Connection name") as HTMLInputElement).value).toBe(
      action === "New connection" ? "" : action.replace("Edit ", "")
    );
    expect((screen.getByLabelText("Service URL") as HTMLInputElement).value).toBe(
      action === "New connection" ? "" : action === "Edit Existing API" ? "https://existing.example.test" : "https://other.example.test"
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Connection name"));
    expect(editor.serialize()).toEqual(before);
    expect(editor.getHistoryState()).toEqual(history);
  });

  it("preserves connections, history, and canvas across locale changes with inline credentials", async () => {
    const view = render(
      <EditorWorkbench
        credentials={[{ ref: "credential-host", label: "Host token", available: true }]}
        rendererFactory={fakeRenderer}
        rightPanel={() => null}
        locale="en"
      />
    );
    openDataPanel();
    await createConnection("Saved API", "https://saved.example.test");
    const canvas = view.container.querySelector("canvas");
    expect(canvas).not.toBeNull();

    view.rerender(
      <EditorWorkbench
        credentials={[{ ref: "credential-host", label: "Host token", available: true }]}
        rendererFactory={fakeRenderer}
        rightPanel={() => null}
        locale="zh-CN"
      />
    );

    expect(screen.getByRole("button", { name: "编辑 Saved API" })).toBeTruthy();
    expect(view.container.querySelector("canvas")).toBe(canvas);
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(screen.queryByRole("button", { name: "编辑 Saved API" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    expect(screen.getByRole("button", { name: "编辑 Saved API" })).toBeTruthy();
  });

  it("asks before row actions discard a dirty draft", async () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Existing API", "https://existing.example.test");

    fireEvent.click(screen.getByRole("button", { name: "Edit Existing API" }));
    fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: "Changed name" } });
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Existing API" }));

    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeTruthy();
    expect(editor.getHistoryState()).toEqual({ undoCount: 1, redoCount: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((screen.getByLabelText("Connection name") as HTMLInputElement).value).toBe("Changed name");

    fireEvent.click(screen.getByRole("button", { name: "Duplicate Existing API" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(Object.keys(editor.getSnapshot().dataSources.connections)).toHaveLength(2);
    expect(screen.queryByLabelText("Connection name")).toBeNull();
  });

  it("shows host credential availability and still saves legal offline configuration", () => {
    const editor = createEditor({
      credentials: [{ ref: "credential-retired", label: "Retired token", available: false }]
    });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "New connection" }));
    fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: "Retired API" } });
    fireEvent.change(screen.getByLabelText("Service URL"), { target: { value: "https://retired.example.test" } });
    fireEvent.change(screen.getByLabelText("Authentication"), { target: { value: "bearer" } });
    fireEvent.change(screen.getByLabelText("Credential"), { target: { value: "credential-retired" } });
    expect(screen.getAllByText("Retired token (unavailable)").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    const saved = Object.values(editor.getSnapshot().dataSources.connections)[0];
    expect(saved.auth).toEqual({ kind: "bearer", credentialRef: "credential-retired" });
    expect(screen.getByText("Credential unavailable")).toBeTruthy();
    expect(JSON.stringify(editor.serialize())).not.toContain("Retired token");

    act(() => {
      editor.dispatch({
        type: "update-data-connection",
        connectionId: saved.id,
        connection: { ...saved, auth: { kind: "bearer", credentialRef: "credential-removed" } }
      });
    });
    expect(screen.getByText("Missing credential: credential-removed")).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("allows saving without authentication when the host provides no credentials", () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "New connection" }));
    fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: "Offline API" } });
    fireEvent.change(screen.getByLabelText("Service URL"), { target: { value: "https://offline.example.test" } });
    fireEvent.change(screen.getByLabelText("Authentication"), { target: { value: "bearer" } });
    expect(screen.getByText("The host provides no credentials. Save without authentication or configure credentials in the host.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    expect(screen.getByText("Select a credential or disable authentication.")).toBeTruthy();
    expect(editor.getSnapshot().dataSources.connections).toEqual({});

    fireEvent.change(screen.getByLabelText("Authentication"), { target: { value: "none" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    expect(Object.values(editor.getSnapshot().dataSources.connections)[0]?.auth).toEqual({ kind: "none" });
  });

  it("filters connections and preserves search and draft state across view switches and locale changes", async () => {
    const editor = createEditor();
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} locale="en" />);
    openDataPanel();
    await createConnection("Zone A", "https://zone-a.example.test");
    await createConnection("Zone B", "https://zone-b.example.test");

    const search = screen.getByLabelText("Search connections") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "zone b" } });
    expect(screen.getByRole("button", { name: "Edit Zone B" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Zone A" })).toBeNull();

    fireEvent.click(within(screen.getByLabelText("Workspace views")).getByRole("button", { name: /^Scene \d/ }));
    fireEvent.click(within(screen.getByLabelText("Workspace views")).getByRole("button", { name: /^Data \d/ }));
    expect((screen.getByLabelText("Search connections") as HTMLInputElement).value).toBe("zone b");

    fireEvent.click(screen.getByRole("button", { name: "New connection" }));
    const nameInput = screen.getByLabelText("Connection name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Draft connection" } });
    await waitFor(() => expect(document.activeElement).toBe(nameInput));

    view.rerender(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} locale="zh-CN" />);
    expect(screen.getByLabelText("连接名称")).toBe(nameInput);
    expect((screen.getByLabelText("连接名称") as HTMLInputElement).value).toBe("Draft connection");
    expect(document.activeElement).toBe(nameInput);

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "新建连接" }));
    expect(Object.keys(editor.getSnapshot().dataSources.connections)).toHaveLength(2);
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
