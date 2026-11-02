import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSaveDataObjectBindingCommand,
  buildSaveDataQueryCommand,
  createEditor,
  type DataRequestExecutor,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import { decodeArchiveJson, defaultArchiveAdapter, encodeArchiveJson } from "../../core/src/project/archive-adapter";
import { PROJECT_SCENE_PATH } from "../../core/src/project/package-types";

/**
 * The same authored project must open in another framework's host and be
 * repairable there. This suite opens the project inside the React Workbench,
 * checks the user-visible reconnect path, then repairs it with host
 * capabilities and confirms only public behaviour moved.
 */
describe("React Workbench receives a project authored in another host", () => {
  let editor: ReturnType<typeof createEditor> | null = null;
  let unmount: (() => void) | null = null;

  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    unmount?.();
    unmount = null;
    editor?.dispose();
    editor = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("opens a foreign project, reports the reconnect, and repairs it with host capabilities", async () => {
    const packageBytes = authoredProjectPackage();
    const urls: string[] = [];
    editor = createEditor({ credentials: [{ ref: "plant-token", label: "Plant token", available: false }] });
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    unmount = view.unmount;

    await openPackage(packageBytes, "handoff.ek3d");

    // User-visible restore feedback: reconnect, not damage, and preview stays off.
    expect(projectStatus().getAttribute("data-tone")).toBe("warning");
    expect(projectStatus().textContent).toMatch(/reconnection required/i);
    expect(editor.getDataService().getObjectDataState().preview.enabled).toBe(false);
    expect(editor.getSnapshot().dataSources.bindings["plant-pump"]).toMatchObject({
      queryId: "pump-status",
      deviceId: "plant-pump",
      details: [{ key: "temperature" }, { key: "running" }]
    });
    expect(editor.getSnapshot().dataSources.connections["plant-api"]).toMatchObject({
      name: "Plant API",
      auth: { kind: "bearer", credentialRef: "plant-token" }
    });

    // The panel opens for repair instead of locking the user out.
    fireEvent.click(screen.getByRole("button", { name: /^Data \d+$/ }));
    expect(await screen.findByText("Plant API")).toBeTruthy();
    expect(screen.getByText("Pump status")).toBeTruthy();

    // Start with the capability gap present: a locatable problem, no request.
    fireEvent.click(screen.getByRole("button", { name: "Start data preview" }));
    await waitFor(() => {
      expect(editor.getDataService().getObjectDataState().objects["plant-pump"]?.status).toBe("error");
    });
    expect(urls).toEqual([]);

    // The host repairs the capability while the project stays open.
    act(() => editor!.getDataService().setHostCapabilities({
      executor: async (request) => {
        urls.push(request.url);
        const headers: Record<string, string> = { ...request.headers };
        if (request.credentialRef === "plant-token") headers.Authorization = "Bearer plant-secret";
        return okResponse();
      },
      credentials: [{ ref: "plant-token", label: "Plant token", available: true }]
    }));

    fireEvent.click(screen.getByTitle("Plant pump"));
    const card = await screen.findByRole("region", { name: "Device details" });
    await waitFor(() => expect(detailValue(card, "Temperature")).toBe("41.50"));
    expect(detailValue(card, "Running")).toBe("true");
    expect(urls).toEqual(["https://plant.example.test/__fixtures__/http-data-source/devices"]);
    expect(within(card).getByRole("heading", { name: "Plant pump" })).toBeTruthy();
    expect(card.textContent).toContain("plant-pump");

    // The repair is runtime-only: durable configuration and history are untouched.
    expect(editor.getSnapshot().dataSources.connections["plant-api"]?.auth).toEqual({
      kind: "bearer",
      credentialRef: "plant-token"
    });
    expect(JSON.stringify(editor.serialize())).not.toContain("plant-secret");
  }, 20000);

  it("reports damaged durable data configuration as repairable damage, not a bad file", async () => {
    const broken = stripQueryFromPackage(authoredProjectPackage());
    editor = createEditor({ credentials: [] });
    const view = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    unmount = view.unmount;

    await openPackage(broken, "broken.ek3d");

    const status = projectStatus();
    expect(status.getAttribute("data-tone")).toBe("error");
    expect(status.textContent).toMatch(/damaged/i);
    expect(status.textContent).toMatch(/1 broken reference/i);
    expect(status.textContent).not.toMatch(/Project open failed/i);
    expect(editor.getSnapshot().objects["plant-pump"]).toBeDefined();
  }, 20000);
});

/** Remove the saved query so the binding dangles, keeping everything else intact. */
function stripQueryFromPackage(bytes: Uint8Array): Uint8Array {
  const entries = defaultArchiveAdapter.read(bytes);
  const sceneEntry = entries.find((entry) => entry.path === PROJECT_SCENE_PATH)!;
  const scene = decodeArchiveJson(sceneEntry.bytes) as { dataSources: { queries: Record<string, unknown> } };
  scene.dataSources.queries = {};
  return defaultArchiveAdapter.write(entries.map((entry) => entry.path === PROJECT_SCENE_PATH
    ? { path: entry.path, bytes: encodeArchiveJson(scene) }
    : entry));
}

function authoredProjectPackage(): Uint8Array {
  const source = createEditor();
  const connection = source.dispatch({
    type: "create-data-connection",
    connection: {
      id: "plant-api",
      name: "Plant API",
      baseUrl: "https://plant.example.test/__fixtures__/http-data-source",
      auth: { kind: "bearer", credentialRef: "plant-token" },
      headers: {},
      timeoutMs: 10_000
    }
  });
  if (!connection.ok) throw new Error(connection.error);
  const imported = source.dispatch({
    type: "import-glb",
    objectId: "plant-pump",
    name: "Plant pump",
    asset: { id: "plant-pump-model", source: new Uint8Array([103, 108, 84, 70]) }
  });
  if (!imported.ok) throw new Error(imported.error);
  const query = buildSaveDataQueryCommand(source.getSnapshot(), {
    id: "pump-status",
    connectionId: "plant-api",
    name: "Pump status",
    path: "/devices",
    parameters: [],
    mapping: {
      mode: "array",
      root: [{ kind: "key", key: "items" }],
      identity: { kind: "path", path: [{ kind: "key", key: "deviceCode" }], valueType: "string" },
      displayName: [{ kind: "key", key: "name" }],
      properties: [
        {
          key: "temperature",
          label: "Temperature",
          type: "number",
          nullable: false,
          unit: "°C",
          source: [{ kind: "key", key: "tempRaw" }],
          transform: { kind: "scale", factor: 0.1, offset: 0 },
          range: null,
          allowed: null
        },
        {
          key: "running",
          label: "Running",
          type: "boolean",
          nullable: false,
          unit: null,
          source: [{ kind: "key", key: "run" }],
          transform: { kind: "map", entries: [{ from: 1, to: true }, { from: 0, to: false }] },
          range: null,
          allowed: null
        }
      ],
      observedAt: null,
      sourceQuality: null
    },
    updatePolicy: { refreshIntervalMs: 60_000, maxAgeMs: 120_000 }
  });
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  if (!source.dispatch(query.command).ok) throw new Error("Failed to save the query.");
  const binding = buildSaveDataObjectBindingCommand(source.getSnapshot(), {
    objectNodeId: "plant-pump",
    queryId: "pump-status",
    deviceId: "plant-pump",
    enabled: true,
    details: [{ key: "temperature" }, { key: "running" }]
  });
  if (!binding.ok) throw new Error(binding.problems.map((problem) => problem.message).join("\n"));
  if (!source.dispatch(binding.command).ok) throw new Error("Failed to save the binding.");
  const bytes = source.exportProject().packageBytes;
  if (!(bytes instanceof Uint8Array)) throw new Error("Expected a synchronous project package.");
  source.dispose();
  return bytes;
}

function okResponse() {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      items: [
        { deviceCode: "valve-2", name: "Valve 2", tempRaw: 180, run: 0 },
        { deviceCode: "plant-pump", name: "Plant pump", tempRaw: 415, run: 1 }
      ]
    })
  };
}

async function openPackage(bytes: Uint8Array, fileName: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
  const fileInput = document.querySelector(".ek-workbench__file-input") as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: [new File([bytes], fileName, { type: "application/octet-stream" })] } });
  await waitFor(() => expect(projectStatus().textContent).not.toMatch(/Opening/));
}

function projectStatus(): HTMLElement {
  return document.querySelector(".ek-workbench__toolbar-status") as HTMLElement;
}

function detailValue(card: HTMLElement, label: string): string | null {
  const term = [...card.querySelectorAll("dt")].find((candidate) => candidate.textContent?.startsWith(label));
  const description = term?.nextElementSibling as HTMLElement | null;
  return description?.querySelector("strong")?.textContent ?? description?.textContent ?? null;
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
