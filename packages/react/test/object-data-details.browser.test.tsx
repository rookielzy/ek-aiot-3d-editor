import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { BoxGeometry, Mesh, MeshBasicMaterial } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import {
  AssetResolverBridge,
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  ThreeGltfLoaderAdapter,
  type DataRequestExecutor
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

describe("real GLB object data details smoke", () => {
  let host: HTMLElement | null = null;
  let root: Root | null = null;
  let editor: ReturnType<typeof createEditor> | null = null;
  let objectUrl: string | null = null;

  afterEach(() => {
    root?.unmount();
    editor?.dispose();
    host?.remove();
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    root = null;
    editor = null;
    host = null;
    objectUrl = null;
  });

  it("picks a real GLB object and shows same-origin device details after an explicit preview", async () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial({ color: 0x6fa8dc });
    const model = new Mesh(geometry, material);
    model.name = "Pump body";
    const bytes = await new GLTFExporter().parseAsync(model, { binary: true }) as ArrayBuffer;
    geometry.dispose();
    material.dispose();
    const executor: DataRequestExecutor = async (request) => {
      const fetched = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        signal: request.signal
      });
      return {
        status: fetched.status,
        contentType: fetched.headers.get("content-type"),
        body: await fetched.text()
      };
    };
    editor = createEditor({ executor });
    const connection = editor.dispatch({
      type: "create-data-connection",
      connection: {
        id: "fixture",
        name: "Fixture API",
        baseUrl: `${window.location.origin}/__fixtures__/http-data-source`,
        auth: { kind: "none" },
        headers: {},
        timeoutMs: 10_000
      }
    });
    expect(connection.ok).toBe(true);
    const query = buildSaveDataQueryCommand(editor.getSnapshot(), {
      connectionId: "fixture",
      name: "Fixture pump",
      path: "/pumps",
      parameters: [{ name: "areaId", type: "string", defaultValue: "A" }],
      mapping: {
        mode: "single",
        root: [],
        identity: {
          kind: "path",
          path: [{ kind: "key", key: "query" }, { kind: "key", key: "areaId" }],
          valueType: "string"
        },
        displayName: [{ kind: "key", key: "source" }],
        properties: [
          {
            key: "requestCount",
            label: "Request count",
            type: "number",
            nullable: false,
            unit: "req",
            source: [{ kind: "key", key: "requestCount" }],
            transform: { kind: "number" },
            range: null,
            allowed: null
          },
          {
            key: "requestPath",
            label: "Request path",
            type: "string",
            nullable: false,
            unit: null,
            source: [{ kind: "key", key: "path" }],
            transform: { kind: "raw" },
            range: null,
            allowed: null
          },
          {
            key: "areaId",
            label: "Area",
            type: "string",
            nullable: false,
            unit: null,
            source: [{ kind: "key", key: "query" }, { kind: "key", key: "areaId" }],
            transform: { kind: "raw" },
            range: null,
            allowed: null
          }
        ],
        observedAt: null,
        sourceQuality: null
      }
    });
    if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
    const savedQuery = editor.dispatch(query.command);
    expect(savedQuery.ok).toBe(true);
    const queryId = Object.keys(savedQuery.snapshot.dataSources.queries)[0]!;

    objectUrl = URL.createObjectURL(new Blob([bytes], { type: "model/gltf-binary" }));
    const imported = await editor.importGlbAsset({
      asset: {
        id: "pump-asset",
        source: new File([bytes], "pump.glb", { type: "model/gltf-binary" })
      },
      objectId: "pump",
      name: "Pump object"
    });
    expect(imported.ok, imported.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).toBe(true);
    const binding = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
      objectNodeId: "pump",
      queryId,
      parameterOverrides: {},
      deviceId: "A",
      enabled: true,
      details: [
        { key: "requestCount", precision: 0 },
        { key: "requestPath" },
        { key: "areaId" }
      ]
    });
    if (!binding.ok) throw new Error(binding.problems.map((problem) => problem.message).join("\n"));
    expect(editor.dispatch(binding.command).ok).toBe(true);

    host = document.createElement("div");
    host.style.height = "900px";
    document.body.appendChild(host);
    root = createRoot(host);
    root.render(
      <EditorWorkbench
        editor={editor}
        loader={new ThreeGltfLoaderAdapter()}
        resolver={new AssetResolverBridge(() => ({ uri: objectUrl! }))}
        locale="en"
      />
    );

    await waitFor(() => expect(editor!.getRuntime()).toBeTruthy(), 8000);
    const runtime = editor.getRuntime()!;
    await runtime.project();
    runtime.frameAll();
    await waitForAnimationFrame();
    await waitForAnimationFrame();
    const canvas = host.querySelector("canvas");
    expect(canvas).toBeTruthy();
    await waitFor(() => expect(canvas!.width).toBeGreaterThan(1), 8000);

    await userEvent.click(canvas!, {
      position: { x: canvas!.clientWidth / 2, y: canvas!.clientHeight / 2 }
    });
    await waitFor(() => expect(editor!.getSnapshot().selection.nodeId).toBe("pump"));
    const selected = editor.getSnapshot();
    const history = editor.getHistoryState();

    const preview = await waitForButton(host, "Start data preview");
    await userEvent.click(preview);
    const card = await waitForElement(host, '[aria-label="Device details"]');
    await waitFor(() => expect(text(card)).toContain("Current"), 8000);
    expect(text(card)).toContain("Pump object");
    expect(text(card)).toContain("same-origin-fixture · A");
    expect(text(card)).toContain("/__fixtures__/http-data-source/pumps");
    expect(detailValue(card, "Area")).toBe("A");
    expect(Number(detailValue(card, "Request count"))).toBeGreaterThan(0);
    expect(editor.getSnapshot()).toEqual(selected);
    expect(editor.getHistoryState()).toEqual(history);

    const count = detailValue(card, "Request count");
    await userEvent.click(await waitForButton(host, "Refresh data"));
    await waitFor(() => expect(detailValue(card, "Request count")).not.toBe(count), 8000);
    expect(editor.getSnapshot()).toEqual(selected);
    expect(editor.getHistoryState()).toEqual(history);

    await userEvent.click(await waitForButton(host, "Stop data preview"));
    await waitFor(() => expect(host!.querySelector('[aria-label="Device details"]')).toBeNull());
    expect(editor.getSnapshot().dataSources.bindings.pump).toBeTruthy();
  }, 20000);
});

function detailValue(card: HTMLElement, label: string): string | null {
  const term = [...card.querySelectorAll("dt")]
    .find((candidate) => text(candidate).startsWith(label));
  return term?.nextElementSibling?.querySelector("strong")?.textContent ?? null;
}

function text(element: Element): string {
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

async function waitForButton(host: HTMLElement, label: string): Promise<HTMLButtonElement> {
  let found: HTMLButtonElement | null = null;
  await waitFor(() => {
    found = [...host.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
      candidate.getAttribute("aria-label") === label || text(candidate) === label
    ) ?? null;
    expect(found, `Expected button ${label}`).toBeTruthy();
  });
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

async function waitFor(assertion: () => void, timeout = 5000): Promise<void> {
  const startedAt = performance.now();
  let lastError: unknown;
  while (performance.now() - startedAt < timeout) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await waitForAnimationFrame();
    }
  }
  throw lastError;
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}
