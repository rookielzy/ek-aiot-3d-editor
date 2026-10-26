import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
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
