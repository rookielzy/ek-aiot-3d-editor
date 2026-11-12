import React, { act } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

describe("React data configuration dialogs", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("edits a connection in a roomy modal dialog that organizes connection, headers, and problems", async () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "New connection" }));
    const dialog = screen.getByRole("dialog", { name: "New connection" });
    expect(within(dialog).getByRole("group", { name: "Connection" })).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: "Authentication settings" })).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: "Public headers" })).toBeTruthy();
    // While the dialog is open the panel behind it accepts no pointer or
    // keyboard input, so the modal stays modal in nonvisual DOM hosts too.
    expect(screen.getByRole("button", { name: "New connection" }).hasAttribute("inert")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New connection" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "New connection" }));
    expect(editor.getHistoryState()).toEqual({ undoCount: 0, redoCount: 0 });
  });

  it("keeps inline pointer save explicit and restores focus to the edited row", async () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Plant API", "https://api.example.test/v1");

    fireEvent.click(screen.getByRole("button", { name: "Edit Plant API" }));
    const dialog = screen.getByRole("dialog", { name: "Edit connection" });
    const nameInput = within(dialog).getByLabelText("Connection name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Plant API v2" } });
    fireEvent.blur(nameInput);
    expect(editor.getHistoryState()).toEqual({ undoCount: 1, redoCount: 0 });
    expect(nameInput.value).toBe("Plant API v2");
    expect(nameInput).toBe(screen.getByLabelText("Connection name"));

    fireEvent.click(within(dialog).getByRole("button", { name: "Save connection" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit connection" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Plant API v2" }));
    expect(editor.getHistoryState()).toEqual({ undoCount: 2, redoCount: 0 });
  });

  it("shows field errors next to fields inside the dialog and keeps overall problems visible", async () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "New connection" }));
    const dialog = screen.getByRole("dialog", { name: "New connection" });
    const nameInput = within(dialog).getByLabelText("Connection name") as HTMLInputElement;
    const urlInput = within(dialog).getByLabelText("Service URL") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Header API" } });
    fireEvent.change(urlInput, { target: { value: "https://user:secret@api.example.test" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add header" }));
    fireEvent.change(within(dialog).getByLabelText("Header name 1"), { target: { value: "Authorization" } });
    fireEvent.change(within(dialog).getByLabelText("Header value 1"), { target: { value: "Bearer secret" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save connection" }));

    const urlAlert = within(dialog).getByText("Remove embedded credentials from the URL.");
    expect(urlAlert.getAttribute("role")).toBe("alert");
    expect(urlInput.getAttribute("aria-describedby")).toBe(urlAlert.getAttribute("id"));
    expect(urlInput.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(urlInput);

    const problems = within(dialog).getByRole("alert", { name: "Connection problems" });
    expect(within(problems).getByText("Authentication headers cannot be set as public or query headers.")).toBeTruthy();
    expect(editor.getSnapshot().dataSources.connections).toEqual({});
  });

  it("prevents the native Escape dismissal and keeps the dialog open with its draft", async () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "New connection" }));
    const dialog = screen.getByRole("dialog", { name: "New connection" }) as HTMLDialogElement;
    const nameInput = within(dialog).getByLabelText("Connection name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Draft connection" } });

    act(() => {
      dialog.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true }));
    });

    expect(dialog.open).toBe(true);
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeTruthy();
    expect(screen.getByLabelText("Connection name")).toBe(nameInput);

    // Escape acts on the top-most layer: the prompt asks for editing again and
    // the draft survives instead of the close being re-requested.
    fireEvent.keyDown(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }), { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(nameInput);
    expect(nameInput.value).toBe("Draft connection");
    expect(dialog.open).toBe(true);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(nameInput);
    expect(nameInput.value).toBe("Draft connection");
    expect(dialog.open).toBe(true);
  });

  it("opens the request tester in a dialog, reports its own draft, and restores the row trigger", async () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Plant API", "https://api.example.test/v1");
    const testButton = screen.getByRole("button", { name: "Test request for Plant API" });

    fireEvent.click(testButton);
    const dialog = screen.getByRole("dialog", { name: "Request tester" });
    const pathInput = within(dialog).getByLabelText("Request path") as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(pathInput));
    expect(within(dialog).getByRole("group", { name: "Connection" })).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: "Request" })).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: "Test result" })).toBeTruthy();

    fireEvent.change(pathInput, { target: { value: "/devices" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close request" }));
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(pathInput.value).toBe("/devices");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close request" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Request tester" })).toBeNull());
    expect(document.activeElement).toBe(testButton);

    fireEvent.click(testButton);
    const reopened = screen.getByRole("dialog", { name: "Request tester" });
    const reopenedPath = within(reopened).getByLabelText("Request path") as HTMLInputElement;
    expect(reopenedPath.value).toBe("");
    expect(screen.queryByRole("alertdialog")).toBeNull();

    // The tester's own prompt also treats Escape as "stay here and keep the
    // draft", the same way the connection form does.
    fireEvent.change(reopenedPath, { target: { value: "/units" } });
    fireEvent.click(within(reopened).getByRole("button", { name: "Close request" }));
    fireEvent.keyDown(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" }), { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(reopenedPath.value).toBe("/units");
    expect(screen.getByRole("dialog", { name: "Request tester" })).toBe(reopened);
  });

  it("closes an untouched request tester without a discard prompt", async () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Offline API", "https://offline.example.test");

    fireEvent.click(screen.getByRole("button", { name: "Test request for Offline API" }));
    fireEvent.click(screen.getByRole("button", { name: "Close request" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(screen.queryByLabelText("Request path")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Test request for Offline API" }));
  });

  it("organizes the query editor into connection, request, mapping, preview, and test result sections", async () => {
    const editor = createEditor({ executor: async () => ({ status: 200, contentType: "application/json", body: "{\"value\":1}" }) });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Plant API", "https://api.example.test/v1");

    fireEvent.click(screen.getByRole("button", { name: "New query for Plant API" }));
    const dialog = screen.getByRole("dialog", { name: "Query configuration" });
    expect(within(dialog).getByRole("group", { name: "Connection" })).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: "Request" })).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: "Mapping" })).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: "Mapping preview" })).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: "Test result" })).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: "Connection" })).toBeTruthy();
    expect(within(dialog).getByText("Not tested. Save is allowed without a response.")).toBeTruthy();
  });

  it("renders the connection dialog in Chinese and keeps its draft across a locale switch", async () => {
    const editor = createEditor();
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} locale="en" />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "New connection" }));
    const nameInput = screen.getByLabelText("Connection name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Draft connection" } });

    view.rerender(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} locale="zh-CN" />);
    const dialog = screen.getByRole("dialog", { name: "新建连接" });
    expect(within(dialog).getByRole("group", { name: "连接" })).toBeTruthy();
    expect(screen.getByLabelText("连接名称")).toBe(nameInput);
    expect(document.activeElement).toBe(nameInput);

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByRole("alertdialog", { name: "放弃未保存的更改？" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(screen.queryByLabelText("连接名称")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "新建连接" }));
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
