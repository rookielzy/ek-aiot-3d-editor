import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { BoxGeometry, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import {
  AssetResolverBridge,
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  ThreeGltfLoaderAdapter,
  type DataBindingColor,
  type DataRequestExecutor
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

const RED_RULE: DataBindingColor = {
  propertyKey: "requestCount",
  rules: [{ operator: "gte", value: 0, max: null, color: "#ff0000" }]
};

describe("real GLB data color smoke", () => {
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

  it("isolates a shared GLB asset, survives reprojection, restores on stop and trial cancel", async () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshStandardMaterial({ color: 0xffffff });
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
    expect(editor.dispatch({
      type: "create-data-connection",
      connection: {
        id: "fixture",
        name: "Fixture API",
        baseUrl: `${window.location.origin}/__fixtures__/http-data-source`,
        auth: { kind: "none" },
        headers: {},
        timeoutMs: 10_000
      }
    }).ok).toBe(true);
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
    expect(editor.dispatch(query.command).ok).toBe(true);
    const queryId = Object.keys(editor.getSnapshot().dataSources.queries)[0]!;

    objectUrl = URL.createObjectURL(new Blob([bytes], { type: "model/gltf-binary" }));
    for (const [assetId, objectId] of [["pump-asset-a", "pump-a"], ["pump-asset-b", "pump-b"]] as const) {
      const imported = await editor.importGlbAsset({
        asset: {
          id: assetId,
          source: new File([bytes], `${assetId}.glb`, { type: "model/gltf-binary" })
        },
        objectId,
        name: objectId === "pump-a" ? "Pump A" : "Pump B"
      });
      expect(imported.ok, imported.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).toBe(true);
    }
    const binding = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
      objectNodeId: "pump-a",
      queryId,
      deviceId: "A",
      enabled: true,
      details: [{ key: "requestCount", precision: 0 }],
      color: RED_RULE
    });
    if (!binding.ok) throw new Error(binding.problems.map((problem) => problem.message).join("\n"));
    expect(editor.dispatch(binding.command).ok).toBe(true);

    const baseLoader = new ThreeGltfLoaderAdapter();
    let sharedModel: Object3D | null = null;
    const sharedMaterialLoader = {
      async load(resolved: Parameters<ThreeGltfLoaderAdapter["load"]>[0]) {
        sharedModel ??= await baseLoader.load(resolved);
        return sharedModel.clone(true);
      }
    };

    host = document.createElement("div");
    host.style.height = "900px";
    document.body.appendChild(host);
    root = createRoot(host);
    root.render(
      <EditorWorkbench
        editor={editor}
        loader={sharedMaterialLoader}
        resolver={new AssetResolverBridge(() => ({ uri: objectUrl! }))}
        locale="en"
      />
    );

    await waitFor(() => expect(editor!.getRuntime()).toBeTruthy(), 8000);
    const runtime = editor.getRuntime()!;
    await runtime.project();
    await waitFor(() => expect(materialOf(runtime.getObject("pump-a"))).toBeInstanceOf(MeshStandardMaterial), 8000);
    await waitFor(() => expect(materialOf(runtime.getObject("pump-b"))).toBeInstanceOf(MeshStandardMaterial), 8000);
    expect(materialOf(runtime.getObject("pump-a"))).toBe(materialOf(runtime.getObject("pump-b")));
    expect(colorOf(runtime, "pump-a")).toBe("ffffff");
    expect(colorOf(runtime, "pump-b")).toBe("ffffff");

    await userEvent.click(await waitForButton(host, "Start data preview"));
    await waitFor(() => expect(colorOf(runtime, "pump-a")).toBe("ff0000"), 8000);
    expect(colorOf(runtime, "pump-b")).toBe("ffffff");
    expect(materialOf(runtime.getObject("pump-a"))).not.toBe(materialOf(runtime.getObject("pump-b")));
    expect(editor.getSnapshot().dataSources.bindings["pump-a"].color).toEqual(RED_RULE);

    await runtime.project();
    expect(colorOf(runtime, "pump-a")).toBe("ff0000");
    expect(colorOf(runtime, "pump-b")).toBe("ffffff");

    await userEvent.click(await waitForButton(host, "Stop data preview"));
    await waitFor(() => expect(colorOf(runtime, "pump-a")).toBe("ffffff"), 8000);
    expect(colorOf(runtime, "pump-b")).toBe("ffffff");
    expect(materialOf(runtime.getObject("pump-a"))).toBe(materialOf(runtime.getObject("pump-b")));

    const trial = editor.getDataColorService!().startTrial({
      objectNodeId: "pump-a",
      color: RED_RULE,
      value: 12,
      source: "test"
    });
    expect(trial.ok).toBe(true);
    expect(colorOf(runtime, "pump-a")).toBe("ff0000");
    editor.getDataColorService!().endTrial();
    expect(colorOf(runtime, "pump-a")).toBe("ffffff");
    expect(colorOf(runtime, "pump-b")).toBe("ffffff");
  }, 30000);
});

function colorOf(runtime: NonNullable<ReturnType<ReturnType<typeof createEditor>["getRuntime"]>>, objectId: string): string {
  const material = materialOf(runtime.getObject(objectId));
  return material instanceof MeshStandardMaterial ? material.color.getHexString() : "unsupported";
}

function materialOf(object: Object3D | undefined) {
  let found: unknown = null;
  object?.traverse((child) => {
    if (!found && child instanceof Mesh) {
      found = Array.isArray(child.material) ? child.material[0] : child.material;
    }
  });
  return found;
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

function text(element: Element): string {
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
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
