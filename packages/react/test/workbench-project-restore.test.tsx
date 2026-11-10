import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataRequestExecutor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import { defaultArchiveAdapter, encodeArchiveJson } from "../../core/src/project/archive-adapter";

describe("React project restore feedback", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports damaged data configuration separately from a missing credential", async () => {
    const editor = createEditor({ credentials: [] });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);

    await openPackage(configDamagedPackage(), "damaged.ek3d");

    const status = projectStatus();
    expect(status.getAttribute("data-tone")).toBe("error");
    expect((await screen.findAllByText(/data configuration/i)).length).toBeGreaterThan(0);
    expect(status.textContent).not.toContain("credential");
    expect(editor.getSnapshot().objects["object-a"]).toBeDefined();
  });

  it("reports a missing credential as a reconnect instead of damaged configuration", async () => {
    const editor = createEditor({ credentials: [] });
    const packageBytes = restorablePackage();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);

    await openPackage(packageBytes, "restored.ek3d");

    const status = projectStatus();
    expect(status.getAttribute("data-tone")).toBe("warning");
    expect(await screen.findByText(/reconnection required/i)).toBeTruthy();
    expect(status.textContent).not.toContain("damaged");
    // The configuration stays editable and the preview stays off.
    expect(editor.getSnapshot().dataSources.bindings["object-a"]).toMatchObject({ deviceId: "pump-01" });
    expect(editor.getDataService().getObjectDataState().preview.enabled).toBe(false);
  });

  it("keeps the data panel reachable so a reconnect restore can be repaired", async () => {
    const editor = createEditor({ credentials: [] });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);

    await openPackage(restorablePackage(), "restored.ek3d");
    expect(projectStatus().getAttribute("data-tone")).toBe("warning");

    // The restored configuration is still there and its panel opens for repair.
    fireEvent.click(screen.getByRole("button", { name: /^Data \d+$/ }));
    expect(await screen.findByText("Plant API")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New connection" })).toBeTruthy();
    expect(editor.getSnapshot().dataSources.connections["connection-a"]).toMatchObject({ name: "Plant API" });
  });

  it("keeps a restored project editable when the host later provides a credential and executor", async () => {
    const executor = vi.fn<DataRequestExecutor>(async () => ({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [{ deviceCode: "pump-01", name: "Pump 1", tempRaw: 426 }] })
    }));
    const source = createEditor();
    seedRestorableConfiguration(source);
    const packageBytes = source.exportProject().packageBytes as Uint8Array;
    source.dispose();

    const editor = createEditor({ credentials: [{ ref: "plant-token", label: "Plant token", available: true }], executor });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    await openPackage(packageBytes, "healthy.ek3d");

    const status = projectStatus();
    expect(status.getAttribute("data-tone")).toBe("success");
    expect(executor).not.toHaveBeenCalled();
    expect(editor.getDataService().getObjectDataState().preview.enabled).toBe(false);

    const start = await screen.findByRole("button", { name: "Start data preview" });
    fireEvent.click(start);
    await waitFor(() => expect(executor).toHaveBeenCalledTimes(1));
    expect(editor.getDataService().getObjectDataState().objects["object-a"]).toMatchObject({ status: "ready" });
  });
});

async function openPackage(bytes: Uint8Array, fileName: string): Promise<void> {
  // The file input sits beside the project menu, so a package can be handed to the workbench
  // without routing through the menu first.
  const fileInput = document.querySelector(".ek-workbench__file-input") as HTMLInputElement;
  const file = new File([bytes], fileName, { type: "application/octet-stream" });
  fireEvent.change(fileInput, { target: { files: [file] } });
  await waitFor(() => expect(projectStatus().textContent).not.toMatch(/Opening/));
}

function projectStatus(): HTMLElement {
  return document.querySelector(".ek-workbench__toolbar-status") as HTMLElement;
}

function restorablePackage(): Uint8Array {
  const source = createEditor();
  seedRestorableConfiguration(source);
  const bytes = source.exportProject().packageBytes as Uint8Array;
  source.dispose();
  return bytes;
}

function configDamagedPackage(): Uint8Array {
  // Reuse a valid scene, then point the binding at a query that does not exist.
  const source = createEditor();
  seedRestorableConfiguration(source);
  const scene = source.serialize();
  source.dispose();
  return defaultArchiveAdapter.write([
    {
      path: "project.json",
      bytes: encodeArchiveJson({
        version: 1,
        scenePath: "scene.json",
        completeness: "complete",
        assets: { "asset-a": { id: "asset-a", kind: "glb", byteSize: 3, payloadPath: "assets/asset-a.glb" } }
      })
    },
    {
      path: "scene.json",
      bytes: encodeArchiveJson({
        ...scene,
        dataSources: {
          ...scene.dataSources,
          bindings: {
            "object-a": { ...scene.dataSources.bindings["object-a"]!, queryId: "query-missing" }
          }
        }
      })
    },
    { path: "assets/asset-a.glb", bytes: new Uint8Array([1, 2, 3]) }
  ]);
}

function seedRestorableConfiguration(editor: ReturnType<typeof createEditor>): void {
  const connection = editor.dispatch({
    type: "create-data-connection",
    connection: {
      id: "connection-a",
      name: "Plant API",
      baseUrl: "https://api.example.test/v1",
      auth: { kind: "bearer", credentialRef: "plant-token" },
      headers: {},
      timeoutMs: 10_000
    }
  });
  if (!connection.ok) throw new Error(connection.error);
  const query = buildSaveDataQueryCommand(editor.getSnapshot(), {
    id: "query-a",
    connectionId: "connection-a",
    name: "Pump status",
    path: "/pumps",
    parameters: [],
    mapping: {
      mode: "array",
      root: [{ kind: "key", key: "items" }],
      identity: { kind: "path", path: [{ kind: "key", key: "deviceCode" }], valueType: "string" },
      displayName: null,
      properties: [{
        key: "temperature",
        label: "Temperature",
        type: "number",
        nullable: false,
        unit: "°C",
        source: [{ kind: "key", key: "tempRaw" }],
        transform: { kind: "scale", factor: 0.1, offset: 0 },
        range: null,
        allowed: null
      }],
      observedAt: null,
      sourceQuality: null
    },
    updatePolicy: { refreshIntervalMs: 60_000, maxAgeMs: 120_000 }
  });
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  const savedQuery = editor.dispatch(query.command);
  if (!savedQuery.ok) throw new Error(savedQuery.error);
  const imported = editor.dispatch({
    type: "import-glb",
    objectId: "object-a",
    name: "Pump A",
    asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) }
  });
  if (!imported.ok) throw new Error(imported.error);
  const binding = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId: "object-a",
    queryId: "query-a",
    parameterOverrides: {},
    deviceId: "pump-01",
    enabled: true,
    details: [{ key: "temperature", precision: 1 }]
  });
  if (!binding.ok) throw new Error(binding.problems.map((problem) => problem.message).join("\n"));
  const savedBinding = editor.dispatch(binding.command);
  if (!savedBinding.ok) throw new Error(savedBinding.error);
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
