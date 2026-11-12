import React, { act } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEditor,
  createEmptySnapshot,
  type DataRequestExecutor,
  type DataResponseDescriptor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import { selectWorkbenchOption } from "./support/workbench-select";

describe("React manual HTTP request tester", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs a typed GET through the host executor and isolates temporary overrides from defaults", async () => {
    const urls: string[] = [];
    const executor: DataRequestExecutor = async (request) => {
      urls.push(request.url);
      return {
        status: 200,
        contentType: "application/json",
        body: "{\"devices\":[{\"id\":\"pump-1\"}]}"
      };
    };
    const editor = createEditor({ executor });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Plant API", "https://api.example.test/v1");
    const history = editor.getHistoryState();

    fireEvent.click(screen.getByRole("button", { name: "Test request for Plant API" }));
    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/pumps/{areaId}" } });
    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    fireEvent.change(screen.getByLabelText("Parameter 1 name"), { target: { value: "areaId" } });
    fireEvent.change(screen.getByLabelText("Parameter 1 default"), { target: { value: "A" } });
    expect((screen.getByLabelText("Use default for parameter 1") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText("Override parameter 1"));
    fireEvent.change(screen.getByLabelText("Parameter 1 test value"), { target: { value: "B" } });

    expect(screen.getByText("https://api.example.test/v1/pumps/B")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Run request" }));

    const result = await screen.findByLabelText("Request result");
    await waitFor(() => expect(within(result).getByText("200")).toBeTruthy());
    const configRevision = result.getAttribute("data-config-revision");
    expect(configRevision).toBe("1");
    expect(within(result).getByText(`Config revision ${configRevision}`)).toBeTruthy();
    expect(urls).toEqual(["https://api.example.test/v1/pumps/B"]);
    expect(result.textContent).toContain("pump-1");
    expect(result.textContent).toContain("https://api.example.test/v1/pumps/B");
    expect(result.textContent).toContain("GET");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Parameter 1 default") as HTMLInputElement).value).toBe("A");

    fireEvent.click(screen.getByLabelText("Override parameter 1"));
    fireEvent.click(screen.getByRole("button", { name: "Run request" }));
    await waitFor(() => expect(urls).toEqual([
      "https://api.example.test/v1/pumps/B",
      "https://api.example.test/v1/pumps/A"
    ]));
    expect(screen.getAllByText("https://api.example.test/v1/pumps/A").length).toBeGreaterThan(0);
    expect((screen.getByLabelText("Parameter 1 default") as HTMLInputElement).value).toBe("A");
    expect(editor.getSnapshot().dataSources.queries).toEqual({});
    expect(editor.getHistoryState()).toEqual(history);
    expect(JSON.stringify(editor.serialize())).not.toContain("pump-1");
  });

  it("reports the missing host executor without a network request", async () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Offline API", "https://offline.example.test");

    fireEvent.click(screen.getByRole("button", { name: "Test request for Offline API" }));
    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/devices" } });
    fireEvent.click(screen.getByRole("button", { name: "Run request" }));

    const result = await screen.findByLabelText("Request result");
    await waitFor(() => expect(result.textContent).toContain("No host request executor is configured."));
    expect(result.getAttribute("data-status")).toBe("error");
    expect(screen.getByText(/No host request executor is configured. Provide one/)).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(editor.getHistoryState()).toEqual({ undoCount: 1, redoCount: 0 });
  });

  it("blocks missing and mistyped parameter values before calling the executor", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => ({
      status: 200,
      body: "{}"
    }));
    const editor = createEditor({ executor });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Plant API", "https://api.example.test/v1");

    fireEvent.click(screen.getByRole("button", { name: "Test request for Plant API" }));
    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/devices" } });
    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    fireEvent.change(screen.getByLabelText("Parameter 1 name"), { target: { value: "areaId" } });
    fireEvent.click(screen.getByLabelText("Use default for parameter 1"));
    fireEvent.click(screen.getByRole("button", { name: "Run request" }));

    await waitFor(() => expect(screen.getByText("Enter a value for areaId.")).toBeTruthy());
    expect(executor).not.toHaveBeenCalled();

    selectWorkbenchOption(screen.getByLabelText("Parameter 1 type"), "Number");
    fireEvent.click(screen.getByLabelText("Use default for parameter 1"));
    fireEvent.click(screen.getByRole("button", { name: "Run request" }));
    await waitFor(() => expect(screen.getByText("The value for areaId does not match its type.")).toBeTruthy());
    expect(executor).not.toHaveBeenCalled();
  });

  it("cancels an in-flight request and ignores a late host response", async () => {
    let signal: AbortSignal | undefined;
    let deliver!: (response: DataResponseDescriptor) => void;
    const executor: DataRequestExecutor = (request) => {
      signal = request.signal;
      return new Promise<DataResponseDescriptor>((resolve) => {
        deliver = resolve;
      });
    };
    const editor = createEditor({ executor });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Plant API", "https://api.example.test/v1");
    fireEvent.click(screen.getByRole("button", { name: "Test request for Plant API" }));
    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/devices" } });
    fireEvent.click(screen.getByRole("button", { name: "Run request" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel request" }));

    const result = await screen.findByLabelText("Request result");
    await waitFor(() => expect(result.getAttribute("data-status")).toBe("cancelled"));
    expect(result.textContent).toContain("The request was cancelled.");
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      deliver({ status: 200, contentType: "application/json", body: "{\"late\":true}" });
      await Promise.resolve();
    });
    expect(screen.getByLabelText("Request result").getAttribute("data-status")).toBe("cancelled");
    expect(screen.getByLabelText("Request result").textContent).not.toContain("late");
  });

  it("clears the previous verified response when the draft changes", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => ({
      status: 200,
      contentType: "application/json",
      body: "{\"value\":\"first\"}"
    }));
    const editor = createEditor({ executor });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Plant API", "https://api.example.test/v1");
    fireEvent.click(screen.getByRole("button", { name: "Test request for Plant API" }));
    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/devices" } });
    fireEvent.click(screen.getByRole("button", { name: "Run request" }));

    const result = await screen.findByLabelText("Request result");
    await waitFor(() => expect(result.textContent).toContain("first"));
    expect(executor).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Request path"), { target: { value: "/devices/changed" } });
    await waitFor(() => expect(screen.queryByLabelText("Request result")).toBeNull());
    expect(screen.queryByText("first")).toBeNull();
  });

  it("returns focus to the connection row when the tester closes", async () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    openDataPanel();
    await createConnection("Focus API", "https://focus.example.test");
    const testButton = screen.getByRole("button", { name: "Test request for Focus API" });

    fireEvent.click(testButton);
    expect(document.activeElement).toBe(screen.getByLabelText("Request path"));
    fireEvent.click(screen.getByRole("button", { name: "Close request" }));

    await waitFor(() => expect(screen.queryByLabelText("Request path")).toBeNull());
    expect(document.activeElement).toBe(testButton);
  });

  it("renders the request form in Chinese without losing connection context", () => {
    const editor = createEditor({
      snapshot: {
        ...createEmptySnapshot("scene-a"),
        dataSources: {
          connections: {
            "connection-a": {
              id: "connection-a",
              name: "Plant API",
              baseUrl: "https://api.example.test/v1",
              auth: { kind: "none" },
              headers: {},
              timeoutMs: 10_000
            }
          },
          queries: {},
          bindings: {}
        }
      }
    });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} locale="zh-CN" />);
    const navigation = within(screen.getByLabelText("工作区视图"));
    fireEvent.click(navigation.getByRole("button", { name: /^数据 \d/ }));
    fireEvent.click(screen.getByRole("button", { name: "测试 Plant API 的请求" }));

    expect(screen.getByLabelText("请求路径")).toBeTruthy();
    expect(screen.getByRole("button", { name: "添加参数" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "运行请求" })).toBeTruthy();
    expect(screen.getByText("测试请求 · Plant API")).toBeTruthy();
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
