import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataRequestExecutor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

describe("same-origin HTTP data source smoke", () => {
  let host: HTMLElement | null = null;
  let root: Root | null = null;
  let editor: ReturnType<typeof createEditor> | null = null;

  afterEach(() => {
    root?.unmount();
    editor?.dispose();
    host?.remove();
    root = null;
    editor = null;
    host = null;
  });

  it("sends a real encoded GET to the local fixture from the Workbench request form", async () => {
    const executor: DataRequestExecutor = async (request) => {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        signal: request.signal
      });
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        body: await response.text()
      };
    };
    editor = createEditor({ executor });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    root.render(<EditorWorkbench editor={editor} locale="en" rendererFactory={fakeRenderer} rightPanel={() => null} />);

    await waitFor(() => expect(button(host!, "Data", true)).toBeTruthy());
    await userEvent.click(button(host, "Data", true)!);
    await userEvent.click(await waitForButton(host, "New connection"));
    await userEvent.fill(field(host, "Connection name"), "Fixture API");
    await userEvent.fill(field(host, "Service URL"), `${window.location.origin}/__fixtures__/http-data-source`);
    await userEvent.click(button(host, "Add header")!);
    await userEvent.fill(field(host, "Header name 1"), "X-Fixture-Probe");
    await userEvent.fill(field(host, "Header value 1"), "browser-smoke");
    await userEvent.click(button(host, "Save connection")!);
    await waitForButton(host, "Test request for Fixture API");

    await userEvent.click(button(host, "Test request for Fixture API")!);
    await userEvent.fill(field(host, "Request path"), "/pumps/{areaId}");
    await userEvent.click(button(host, "Add parameter")!);
    await userEvent.fill(field(host, "Parameter 1 name"), "areaId");
    await userEvent.fill(field(host, "Parameter 1 default"), "A");
    await userEvent.click(field(host, "Override parameter 1"));
    await userEvent.fill(field(host, "Parameter 1 test value"), "B");
    await userEvent.click(button(host, "Add parameter")!);
    await userEvent.fill(field(host, "Parameter 2 name"), "tag");
    await userEvent.fill(field(host, "Parameter 2 default"), "a b");

    const expectedUrl = `${window.location.origin}/__fixtures__/http-data-source/pumps/B?tag=a+b`;
    await waitFor(() => expect(host!.textContent).toContain(expectedUrl));
    await userEvent.click(button(host, "Run request")!);

    const result = await waitForElement(host, '[aria-label="Request result"]');
    await waitFor(() => expect(result.getAttribute("data-status")).toBe("success"));
    expect(new URL(expectedUrl).origin).toBe(window.location.origin);
    expect(result.textContent).toContain(expectedUrl);
    expect(result.textContent).toContain("same-origin-fixture");
    expect(result.textContent).toContain("\"path\": \"/__fixtures__/http-data-source/pumps/B\"");
    expect(result.textContent).toContain("\"tag\": \"a b\"");
    expect(result.textContent).toContain("\"header\": \"browser-smoke\"");
    expect(result.textContent).toContain("200");
    expect(result.textContent).toContain("Config revision");
    expect(editor.getSnapshot().dataSources.queries).toEqual({});
    expect(JSON.stringify(editor.serialize())).not.toContain("same-origin-fixture");
  });

  it("serves two objects from one same-origin preview request", async () => {
    const urls: string[] = [];
    const executor: DataRequestExecutor = async (request) => {
      urls.push(request.url);
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        signal: request.signal
      });
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        body: await response.text()
      };
    };
    editor = createEditor({ executor });
    const connection = editor.dispatch({
      type: "create-data-connection",
      connection: {
        id: "connection-browser",
        name: "Browser fixture",
        baseUrl: `${window.location.origin}/__fixtures__/http-data-source`,
        auth: { kind: "none" },
        headers: {},
        timeoutMs: 10_000
      }
    });
    expect(connection.ok).toBe(true);
    const query = buildSaveDataQueryCommand(editor.getSnapshot(), {
      connectionId: "connection-browser",
      name: "Fixture devices",
      path: "/devices",
      parameters: [],
      mapping: {
        mode: "array",
        root: [{ kind: "key", key: "items" }],
        identity: { kind: "path", path: [{ kind: "key", key: "deviceCode" }], valueType: "string" },
        displayName: [{ kind: "key", key: "name" }],
        properties: [{
          key: "reading",
          label: "Reading",
          type: "number",
          nullable: false,
          unit: null,
          source: [{ kind: "key", key: "reading" }],
          transform: { kind: "number" },
          range: null,
          allowed: null
        }]
      },
      updatePolicy: { refreshIntervalMs: 60_000, maxAgeMs: 120_000 }
    });
    if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
    const saved = editor.dispatch(query.command);
    expect(saved.ok).toBe(true);
    const queryId = Object.keys(editor.getSnapshot().dataSources.queries)[0];
    for (const [objectId, name] of [["object-a", "Pump object"], ["object-b", "Pump object 2"]] as const) {
      const imported = editor.dispatch({
        type: "import-glb",
        objectId,
        name,
        asset: { id: `asset-${objectId}` }
      });
      expect(imported.ok).toBe(true);
      const binding = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
        objectNodeId: objectId,
        queryId,
        parameterOverrides: {},
        deviceId: objectId === "object-a" ? "pump-1" : "pump-2",
        enabled: true,
        details: [{ key: "reading" }]
      });
      if (!binding.ok) throw new Error(binding.problems.map((problem) => problem.message).join("\n"));
      expect(editor.dispatch(binding.command).ok).toBe(true);
    }

    await editor.getDataService().startPreview();

    expect(urls).toEqual([`${window.location.origin}/__fixtures__/http-data-source/devices`]);
    const state = editor.getDataService().getObjectDataState();
    expect(state.preview.contextCount).toBe(1);
    expect(state.objects["object-a"]?.status).toBe("ready");
    expect(state.objects["object-b"]?.status).toBe("ready");
    const firstReading = state.objects["object-a"]?.fields.find((field) => field.key === "reading");
    const secondReading = state.objects["object-b"]?.fields.find((field) => field.key === "reading");
    expect(firstReading?.status).toBe("ok");
    expect(firstReading?.value).toBe(secondReading?.value);
    expect(typeof firstReading?.value).toBe("number");
    expect(JSON.stringify(editor.serialize())).not.toContain("same-origin-fixture");

    editor.getDataService().stopPreview();
    expect(editor.getDataService().getObjectDataState().objects).toEqual({});
    expect(urls).toHaveLength(1);
  });
});

function button(host: HTMLElement, label: string, startsWith = false): HTMLButtonElement | undefined {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => {
    const aria = candidate.getAttribute("aria-label") ?? "";
    const text = candidate.textContent?.trim() ?? "";
    return startsWith ? aria.startsWith(label) : aria === label || text === label;
  });
}

async function waitForButton(host: HTMLElement, label: string): Promise<HTMLButtonElement> {
  let found: HTMLButtonElement | undefined;
  await waitFor(() => {
    found = button(host, label);
    expect(found, `Expected button ${label}`).toBeTruthy();
  });
  return found!;
}

function field(host: HTMLElement, label: string): HTMLInputElement | HTMLSelectElement {
  const found = [...host.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")].find(
    (candidate) => candidate.getAttribute("aria-label") === label
  );
  expect(found, `Expected field ${label}`).toBeTruthy();
  return found!;
}

async function waitForElement(host: HTMLElement, selector: string): Promise<HTMLElement> {
  let found: HTMLElement | null = null;
  await waitFor(() => {
    found = host.querySelector<HTMLElement>(selector);
    expect(found, `Expected element ${selector}`).toBeTruthy();
  });
  return found!;
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}

async function waitFor(assertion: () => void, timeout = 4000): Promise<void> {
  const startedAt = performance.now();
  let lastError: unknown;
  while (performance.now() - startedAt < timeout) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    }
  }
  throw lastError;
}
