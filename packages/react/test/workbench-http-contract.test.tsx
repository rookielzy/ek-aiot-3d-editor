import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEditor,
  type DataRequestDescriptor,
  type DataRequestExecutor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import { selectWorkbenchOption } from "./support/workbench-select";

describe("React HTTP read contract configuration", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("configures an API key connection and a read-only POST query with typed body and business condition", async () => {
    const editor = createEditor({
      credentials: [{ ref: "credential-zone", label: "Zone key", available: true }]
    });
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();

    fireEvent.click(screen.getByRole("button", { name: "New connection" }));
    fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: "Zone API" } });
    fireEvent.change(screen.getByLabelText("Service URL"), { target: { value: "https://zone.example.test/v1" } });
    selectWorkbenchOption(screen.getByLabelText("Authentication"), "API key header");
    fireEvent.change(screen.getByLabelText("API key header name"), { target: { value: "X-Zone-Key" } });
    selectWorkbenchOption(screen.getByLabelText("Credential"), "Zone key");
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit Zone API" })).toBeTruthy());
    const connection = Object.values(editor.getSnapshot().dataSources.connections)[0];
    expect(connection.auth).toEqual({
      kind: "api-key",
      credentialRef: "credential-zone",
      headerName: "X-Zone-Key"
    });
    expect(screen.getAllByText("API key header").length).toBeGreaterThan(0);
    expect(screen.getByText("Auth header: X-Zone-Key")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New query for Zone API" }));
    fireEvent.change(screen.getByLabelText("Query name"), { target: { value: "Zone search" } });
    selectWorkbenchOption(screen.getByLabelText("Method"), "POST");
    expect(screen.getAllByText(/Read-only POST queries run only/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText("I confirm this POST only reads data"));
    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/search/{area}" } });
    fireEvent.click(screen.getByRole("button", { name: "Add query header" }));
    fireEvent.change(screen.getByLabelText("Query header 1 name"), { target: { value: "X-Trace" } });
    fireEvent.change(screen.getByLabelText("Query header 1 value"), { target: { value: "trace-1" } });

    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    fireEvent.change(screen.getByLabelText("Parameter 1 name"), { target: { value: "area" } });
    fireEvent.change(screen.getByLabelText("Parameter 1 default"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    fireEvent.change(screen.getByLabelText("Parameter 2 name"), { target: { value: "offset" } });
    selectWorkbenchOption(screen.getByLabelText("Parameter 2 type"), "Number");
    fireEvent.change(screen.getByLabelText("Parameter 2 default"), { target: { value: "0" } });
    selectWorkbenchOption(screen.getByLabelText("Parameter 2 location"), "JSON body");
    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    fireEvent.change(screen.getByLabelText("Parameter 3 name"), { target: { value: "include" } });
    selectWorkbenchOption(screen.getByLabelText("Parameter 3 type"), "Boolean");
    fireEvent.change(screen.getByLabelText("Parameter 3 default"), { target: { value: "false" } });
    selectWorkbenchOption(screen.getByLabelText("Parameter 3 location"), "JSON body");

    fireEvent.change(screen.getByLabelText("Success field path"), { target: { value: "code" } });
    fireEvent.change(screen.getByLabelText("Success value"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Expire after (seconds)"), { target: { value: "1" } });
    expect(screen.getByText(/"offset": 0/)).toBeTruthy();
    expect(screen.getByText(/"include": false/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Data root path"), { target: { value: "items" } });
    fireEvent.change(screen.getByLabelText("Device ID path"), { target: { value: "deviceCode" } });
    fireEvent.change(screen.getByLabelText("Property 1 key"), { target: { value: "reading" } });
    fireEvent.change(screen.getByLabelText("Property 1 source path"), { target: { value: "reading" } });
    fireEvent.click(screen.getByRole("button", { name: "Save query" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Query configuration" })).toBeNull());
    const query = Object.values(editor.getSnapshot().dataSources.queries)[0];
    expect(query).toMatchObject({
      method: "POST",
      readOnly: true,
      headers: { "X-Trace": "trace-1" },
      successCondition: { path: [{ kind: "key", key: "code" }], equals: 0 },
      updatePolicy: { refreshIntervalMs: 5_000, maxAgeMs: 1_000 }
    });
    expect(query.parameters).toEqual([
      { name: "area", type: "string", defaultValue: "A", location: "path" },
      { name: "offset", type: "number", defaultValue: 0, location: "body" },
      { name: "include", type: "boolean", defaultValue: false, location: "body" }
    ]);
    expect(screen.getByText(/Read-only POST · manual refresh/)).toBeTruthy();
    view.unmount();
    editor.dispose();
  }, 20000);

  it("blocks saving a numeric success condition with no value instead of treating it as zero", async () => {
    const editor = createEditor();
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Blank API", "https://blank.example.test");
    fireEvent.click(screen.getByRole("button", { name: "New query for Blank API" }));

    fireEvent.change(screen.getByLabelText("Query name"), { target: { value: "Blank success" } });
    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/devices" } });
    fireEvent.change(screen.getByLabelText("Data root path"), { target: { value: "items" } });
    fireEvent.change(screen.getByLabelText("Device ID path"), { target: { value: "deviceCode" } });
    fireEvent.change(screen.getByLabelText("Property 1 key"), { target: { value: "reading" } });
    fireEvent.change(screen.getByLabelText("Property 1 source path"), { target: { value: "reading" } });
    fireEvent.change(screen.getByLabelText("Success field path"), { target: { value: "code" } });
    fireEvent.click(screen.getByRole("button", { name: "Save query" }));

    expect(screen.getByRole("dialog", { name: "Query configuration" })).toBeTruthy();
    expect(
      screen.getByText("The business success condition needs a valid field path and JSON scalar value.")
    ).toBeTruthy();
    expect(editor.getHistoryState()).toEqual({ undoCount: 1, redoCount: 0 });
    expect(editor.getSnapshot().dataSources.queries).toEqual({});
    view.unmount();
    editor.dispose();
  });

  it("runs a POST draft once with its typed body", async () => {
    const requests: DataRequestDescriptor[] = [];
    const executor: DataRequestExecutor = async (request) => {
      requests.push(request);
      return {
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 0, items: [{ deviceCode: "pump-1", reading: 12 }] })
      };
    };
    const editor = createEditor({ executor });
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Plant API", "https://api.example.test/v1");
    fireEvent.click(screen.getByRole("button", { name: "Test request for Plant API" }));
    selectWorkbenchOption(screen.getByLabelText("Method"), "POST");
    fireEvent.click(screen.getByLabelText("I confirm this POST only reads data"));
    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/search" } });
    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    fireEvent.change(screen.getByLabelText("Parameter 1 name"), { target: { value: "offset" } });
    selectWorkbenchOption(screen.getByLabelText("Parameter 1 type"), "Number");
    fireEvent.change(screen.getByLabelText("Parameter 1 default"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Run request" }));

    const result = await screen.findByLabelText("Request result");
    await waitFor(() => expect(result.getAttribute("data-status")).toBe("success"));
    expect(requests[0]).toMatchObject({
      method: "POST",
      readOnly: true,
      body: { offset: 0 },
      headers: { "Content-Type": "application/json" }
    });
    expect(requests[0].auth).toEqual({ kind: "none" });
    expect(within(result).getByLabelText("Body").textContent).toContain("\"offset\": 0");
    expect(requests).toHaveLength(1);
    expect(editor.getSnapshot().dataSources.queries).toEqual({});
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
