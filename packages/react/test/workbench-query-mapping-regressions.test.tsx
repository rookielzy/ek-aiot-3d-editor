import React, { act } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEditor,
  type DataRequestExecutor,
  type DataResponseDescriptor,
  type EditorWithGlbImport,
  type JsonValue,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import { selectWorkbenchOption } from "./support/workbench-select";

const editors: EditorWithGlbImport[] = [];

afterEach(async () => {
  await act(async () => {
    cleanup();
    editors.forEach((editor) => editor.dispose());
  });
  editors.length = 0;
});

describe("React query mapping regressions", () => {
  it("offers response roots and device-relative fields for wrapped arrays", () => {
    const editor = createQueryEditor();
    render(<EditorWorkbench editor={editor} locale="en" rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openQuery("Query");
    applyExample({ data: { items: [
      { id: "001", tempRaw: 426 },
      { id: "002", tempRaw: 381, details: { quality: "ok" } }
    ] } });

    expect(suggestionsFor("Data root path")).toContain("data.items");
    expect(suggestionsFor("Device ID path")).toContain("id");
    expect(suggestionsFor("Property 1 source path")).toContain("tempRaw");
    expect(suggestionsFor("Property 1 source path")).not.toContain("data.items[0].tempRaw");
    expect(suggestionsFor("Source quality path")).toContain("details.quality");
    fireEvent.change(screen.getByLabelText("Property 1 source path"), { target: { value: "tempRaw" } });
    expect(screen.getByLabelText("Device 001").textContent).toContain("426");
    expect(screen.getByLabelText("Device 002").textContent).toContain("381");
  });

  it("updates device-relative suggestions when the root or data shape changes", () => {
    const editor = createQueryEditor();
    render(<EditorWorkbench editor={editor} locale="en" rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openQuery("Query");
    applyExample({ data: {
      items: [{ id: "001", tempRaw: 426 }],
      pump: { id: "single", reading: 42.6, sampledAt: "2026-10-26T00:00:00Z" }
    } });

    selectWorkbenchOption(screen.getByLabelText("Data shape"), "Single object");
    fireEvent.change(screen.getByLabelText("Data root path"), { target: { value: "data.pump" } });
    expect(suggestionsFor("Property 1 source path")).toContain("reading");
    expect(suggestionsFor("Property 1 source path")).not.toContain("tempRaw");
    expect(suggestionsFor("Sample time path")).toContain("sampledAt");
    fireEvent.change(screen.getByLabelText("Property 1 source path"), { target: { value: "reading" } });
    expect(screen.getByLabelText("Device single").textContent).toContain("42.6");
  });

  it("keeps an applied example when an earlier request finishes", async () => {
    let finish!: (response: DataResponseDescriptor) => void;
    const requests: AbortSignal[] = [];
    const editor = createQueryEditor({ executor: (request) => {
      requests.push(request.signal);
      return new Promise((resolve) => { finish = resolve; });
    } });
    render(<EditorWorkbench editor={editor} locale="en" rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openQuery("Query");
    const before = editor.serialize();
    const history = editor.getHistoryState();

    fireEvent.click(screen.getByRole("button", { name: "Run request" }));
    const example = { data: { items: [{ id: "example-001", tempRaw: 426 }] } };
    applyExample(example);
    await act(async () => finish({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [{ id: "late-002", tempRaw: 999 }] } })
    }));

    expect(screen.queryByText("Tested with a real response")).toBeNull();
    expect(screen.getByText("Previewing example JSON")).toBeTruthy();
    expect(screen.getByLabelText("Device example-001").textContent).toContain("426");
    expect(screen.queryByLabelText("Device late-002")).toBeNull();
    expect(JSON.parse((screen.getByLabelText("Example JSON") as HTMLTextAreaElement).value)).toEqual(example);
    expect(requests[0].aborted).toBe(true);
    expect(editor.serialize()).toEqual(before);
    expect(editor.getHistoryState()).toEqual(history);
  });

  it.each([
    { label: "address", patch: { baseUrl: "https://changed.example.test" } },
    { label: "authentication", patch: { auth: { kind: "bearer", credentialRef: "changed-credential" } } },
    { label: "headers", patch: { headers: { "X-Area": "changed" } } }
  ] as const)("marks tested samples stale when the connection $label changes", async ({ patch }) => {
    const editor = createQueryEditor({ executor: () => ({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ data: { items: [{ id: "001", tempRaw: 426 }] } })
    }) });
    render(<EditorWorkbench editor={editor} locale="en" rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openQuery("Query");
    fireEvent.click(screen.getByRole("button", { name: "Run request" }));
    await screen.findByText("Tested with a real response");
    expect(screen.queryByText("Draft changed after this sample")).toBeNull();
    const history = editor.getHistoryState().undoCount;

    act(() => {
      expect(editor.dispatch({ type: "update-data-connection", connectionId: "connection-a", connection: {
        ...editor.getSnapshot().dataSources.connections["connection-a"], ...patch
      } }).ok).toBe(true);
    });

    expect(screen.getByText("Draft changed after this sample")).toBeTruthy();
    expect(screen.getByLabelText("Device 001").textContent).toContain("426");
    expect(editor.getHistoryState().undoCount).toBe(history + 1);
    expect(JSON.stringify(editor.serialize())).not.toContain('"tempRaw":426');
  });

  it("keeps samples current for unrelated connection edits and clears staleness after retesting", async () => {
    const urls: string[] = [];
    const editor = createQueryEditor({ executor: (request) => {
      urls.push(request.url);
      return { status: 200, contentType: "application/json", body: '{"data":{"items":[{"id":"001","tempRaw":426}]}}' };
    } });
    expect(editor.dispatch({ type: "create-data-connection", connection: {
      ...editor.getSnapshot().dataSources.connections["connection-a"], id: "connection-b", name: "Other API"
    } }).ok).toBe(true);
    render(<EditorWorkbench editor={editor} locale="en" rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openQuery("Query");
    fireEvent.click(screen.getByRole("button", { name: "Run request" }));
    await screen.findByText("Tested with a real response");

    act(() => {
      expect(editor.dispatch({ type: "update-data-connection", connectionId: "connection-b", connection: {
        ...editor.getSnapshot().dataSources.connections["connection-b"], baseUrl: "https://other.example.test"
      } }).ok).toBe(true);
    });
    expect(screen.queryByText("Draft changed after this sample")).toBeNull();

    act(() => {
      expect(editor.dispatch({ type: "update-data-connection", connectionId: "connection-a", connection: {
        ...editor.getSnapshot().dataSources.connections["connection-a"], baseUrl: "https://changed.example.test"
      } }).ok).toBe(true);
    });
    expect(screen.getByText("Draft changed after this sample")).toBeTruthy();
    const history = editor.getHistoryState();
    fireEvent.click(screen.getByRole("button", { name: "Run request" }));
    await waitFor(() => expect(screen.queryByText("Draft changed after this sample")).toBeNull());
    expect(urls).toEqual(["https://api.example.test/Query", "https://changed.example.test/Query"]);
    expect(editor.getHistoryState()).toEqual(history);
  });

  it("resets the query session when the host replaces an editor with matching IDs", async () => {
    const first = createQueryEditor({ name: "First", executor: () => ({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [{ id: "first-private-device", tempRaw: 426 }] } })
    }) });
    const second = createQueryEditor({ name: "Second" });
    const view = render(<EditorWorkbench editor={first} locale="en" rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openQuery("First");
    fireEvent.click(screen.getByRole("button", { name: "Run request" }));
    await screen.findByText("Tested with a real response");
    fireEvent.change(screen.getByLabelText("Query name"), { target: { value: "Unsaved first draft" } });

    view.rerender(<EditorWorkbench editor={first} locale="en" rendererFactory={fakeRenderer} rightPanel={() => null} />);
    expect((screen.getByLabelText("Query name") as HTMLInputElement).value).toBe("Unsaved first draft");
    const before = second.serialize();
    const history = second.getHistoryState();
    view.rerender(<EditorWorkbench editor={second} locale="en" rendererFactory={fakeRenderer} rightPanel={() => null} />);

    expect(screen.queryByRole("dialog", { name: "Query configuration" })).toBeNull();
    expect(screen.queryByText("Tested with a real response")).toBeNull();
    expect(screen.queryByLabelText("Device first-private-device")).toBeNull();
    expect(second.serialize()).toEqual(before);
    expect(second.getHistoryState()).toEqual(history);

    fireEvent.click(screen.getByRole("button", { name: "Edit query Second" }));
    expect((screen.getByLabelText("Query name") as HTMLInputElement).value).toBe("Second");
    expect((screen.getByLabelText("Request path") as HTMLInputElement).value).toBe("/Second");
    expect((screen.getByLabelText("Example JSON") as HTMLTextAreaElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Save query" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Query configuration" })).toBeNull());
    expect(second.getSnapshot().dataSources.queries["query-a"]).toEqual(before.dataSources.queries["query-a"]);
    expect(first.getSnapshot().dataSources.queries["query-a"].name).toBe("First");
  });

  it.each(["string", "boolean"])("clears hidden numeric ranges when a property changes to %s", async (type) => {
    const editor = createQueryEditor();
    render(<EditorWorkbench editor={editor} locale="en" rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openQuery("Query");
    fireEvent.change(screen.getByLabelText("Property 1 minimum"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Property 1 maximum"), { target: { value: "50" } });
    selectWorkbenchOption(screen.getByLabelText("Property 1 type"), type === "string" ? "String" : "Boolean");
    expect(screen.queryByLabelText("Property 1 minimum")).toBeNull();
    applyExample({ data: { items: [{ id: "001", tempRaw: type === "string" ? "running" : true }] } });
    expect(screen.getByLabelText("Device 001").textContent).toContain(type === "string" ? "running" : "true");

    fireEvent.click(screen.getByRole("button", { name: "Save query" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Query configuration" })).toBeNull());
    expect(editor.getSnapshot().dataSources.queries["query-a"].mapping.properties[0]).toMatchObject({ type, range: null });
    expect(editor.getHistoryState()).toEqual({ undoCount: 3, redoCount: 0 });
  });
});

function createQueryEditor(options: { name?: string; executor?: DataRequestExecutor } = {}) {
  const editor = createEditor({ executor: options.executor });
  editors.push(editor);
  expect(editor.dispatch({ type: "create-data-connection", connection: {
    id: "connection-a", name: "API", baseUrl: "https://api.example.test", auth: { kind: "none" }, headers: {}, timeoutMs: 10_000
  } }).ok).toBe(true);
  expect(editor.dispatch({ type: "create-data-query", query: {
    id: "query-a", connectionId: "connection-a", name: options.name ?? "Query", path: `/${options.name ?? "Query"}`, parameters: [],
    mapping: {
      mode: "array", root: [{ kind: "key", key: "data" }, { kind: "key", key: "items" }],
      identity: { kind: "path", path: [{ kind: "key", key: "id" }], valueType: "string" },
      displayName: null,
      properties: [{
        key: "temperature", label: "Temperature", type: "number", nullable: false, unit: null,
        source: [{ kind: "key", key: "tempRaw" }], transform: { kind: "raw" }, range: null, allowed: null
      }],
      observedAt: null, sourceQuality: null
    }
  } }).ok).toBe(true);
  return editor;
}

function openQuery(name: string) {
  fireEvent.click(within(screen.getByLabelText("Workspace views")).getByRole("button", { name: /^Data / }));
  fireEvent.click(screen.getByRole("button", { name: `Edit query ${name}` }));
}

function applyExample(body: JsonValue) {
  fireEvent.change(screen.getByLabelText("Example JSON"), { target: { value: JSON.stringify(body) } });
  fireEvent.click(screen.getByRole("button", { name: "Apply example JSON" }));
}

function suggestionsFor(label: string) {
  return [...(screen.getByLabelText(label) as HTMLInputElement).list!.options].map((option) => option.value);
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return { domElement: container.ownerDocument.createElement("canvas"), setSize() {}, render() {}, dispose() {} };
}
