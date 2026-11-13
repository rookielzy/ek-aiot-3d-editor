import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
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

// Acceptance sizes come from vitest.browser.config.ts (1440x900, 1920x1080,
// 1100x800); the pre-existing instances keep the smaller viewports honest.
const MIN_ACCEPTANCE_WIDTH = 1100;

const COPY = {
  nav: "Workspace views",
  dataPrefix: "Data ",
  manageBindings: "Manage bindings for Pump status",
  dialogTitle: "Bindings for Pump status",
  close: "Close bindings",
  discardTitle: "Discard binding changes?",
  keepEditing: "Keep editing",
  discardChanges: "Discard changes",
  locatePump: "Locate Pump object in the scene",
  object: "Object",
  device: "Device ID",
  draftBadge: "Unsaved changes",
  listed: "Bound objects"
} as const;

describe("real workbench object bindings dialog", () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it("keeps the binding draft, locates the bound object, and survives every acceptance viewport", async () => {
    const workbench = await openBindingsDialog();
    cleanup = workbench.dispose;
    const { editor, host } = workbench;
    const dialog = workbench.dialog;

    // The dialog owns the viewport at every acceptance size: no clipping, and
    // the long form stays reachable through the dialog's own scroll area.
    if (window.innerWidth >= MIN_ACCEPTANCE_WIDTH) {
      const box = dialog.getBoundingClientRect();
      expect(box.width).toBeGreaterThan(Math.min(600, window.innerWidth - 64));
      expect(box.bottom).toBeLessThanOrEqual(window.innerHeight + 1);
      expect(box.right).toBeLessThanOrEqual(window.innerWidth + 1);
      expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth + 1);
    }
    // The long form scrolls inside the dialog: scrolling to the primary action
    // brings it fully inside the dialog frame instead of leaving it clipped.
    const save = button(dialog, "Save binding");
    save.scrollIntoView({ block: "nearest" });
    await expect.poll(() => {
      const box = save.getBoundingClientRect();
      const frame = dialog.getBoundingClientRect();
      return box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1;
    }).toBe(true);
    await page.screenshot({
      path: `__screenshots__/data-bindings-dialog.browser.test.tsx/bindings-dialog-${window.innerWidth}x${window.innerHeight}.png`
    });

    // Every section of the long form is rendered and laid out.
    for (const label of ["Binding parameters", "Click details", "Status color", "Binding state"]) {
      const section = requireElement<HTMLElement>(
        dialog,
        `section[aria-label="${label}"], [role="group"][aria-label="${label}"]`
      );
      const rect = section.getBoundingClientRect();
      expect(rect.width, label).toBeGreaterThan(0);
      expect(rect.height, label).toBeGreaterThan(0);
    }

    const snapshotBefore = editor.getSnapshot();
    const historyBefore = editor.getHistoryState();

    // A typed draft marks the dialog; leaving asks before throwing it away.
    const device = requireElement<HTMLInputElement>(dialog, `[aria-label="${COPY.device}"]`);
    await userEvent.fill(device, "pump-42");
    await expect.poll(() => text(dialog).includes(COPY.draftBadge)).toBe(true);
    await userEvent.keyboard("{Escape}");
    const prompt = await waitForElement<HTMLElement>(dialog, '[role="alertdialog"]');
    expect(prompt.textContent).toContain(COPY.discardTitle);
    const keep = button(prompt, COPY.keepEditing);
    await expect.poll(() => document.activeElement).toBe(keep);
    await userEvent.click(keep);
    await expect.poll(() => dialog.querySelector('[role="alertdialog"]')).toBeNull();
    expect(device.value).toBe("pump-42");
    expect(editor.getSnapshot()).toEqual(snapshotBefore);
    expect(editor.getHistoryState()).toEqual(historyBefore);

    // Escape on the prompt must not also close the dialog underneath it; the
    // next Escape asks again instead of discarding without consent.
    await userEvent.keyboard("{Escape}");
    await waitForElement<HTMLElement>(dialog, '[role="alertdialog"]');
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => dialog.querySelector('[role="alertdialog"]')).toBeNull();
    expect(dialog.open).toBe(true);
    expect(device.value).toBe("pump-42");

    // Cancelling the confirm and closing for real discards only after consent,
    // and returns focus to the panel row that opened the dialog.
    const trigger = button(host, COPY.manageBindings);
    await userEvent.click(button(dialog, COPY.close));
    const closePrompt = await waitForElement<HTMLElement>(dialog, '[role="alertdialog"]');
    await userEvent.click(button(closePrompt, COPY.discardChanges));
    await expect.poll(() => host.querySelector(`dialog[aria-label="${COPY.dialogTitle}"]`)).toBeNull();
    await expect.poll(() => document.activeElement).toBe(trigger);
    expect(editor.getSnapshot()).toEqual(snapshotBefore);

    // Editing, saving, and locating from the list runs on the real workbench.
    await userEvent.click(trigger);
    const reopened = await waitForDialog(host, COPY.dialogTitle);
    await userEvent.fill(requireElement<HTMLInputElement>(reopened, `[aria-label="${COPY.device}"]`), "pump-77");
    await userEvent.click(button(reopened, "Save binding"));
    // Re-saving an existing binding is announced as an update, not a new save.
    await expect.poll(() => text(reopened).includes("Binding updated. Undo to revert.")).toBe(true);
    expect(editor.getSnapshot().dataSources.bindings.pump.deviceId).toBe("pump-77");

    await userEvent.click(button(reopened, COPY.locatePump));
    await expect.poll(() => host.querySelector(`dialog[aria-label="${COPY.dialogTitle}"]`)).toBeNull();
    expect(editor.getSnapshot().selection.nodeId).toBe("pump");

    // A different object of the scene stays selectable from the reopened dialog
    // without rewriting the saved binding.
    await userEvent.click(button(host, COPY.manageBindings));
    const again = await waitForDialog(host, COPY.dialogTitle);
    const bindingsBefore = editor.getSnapshot().dataSources.bindings;
    const picker = requireElement<HTMLButtonElement>(again, `[aria-label="${COPY.object}"]`);
    await userEvent.click(picker);
    const valve = await waitForElement<HTMLElement>(
      document.body,
      '[role="option"][data-radix-collection-item]:not([data-state="checked"])'
    );
    expect(text(valve)).toContain("Valve object");
    await userEvent.click(valve);
    // The draft form follows the picker; nothing is saved until the user saves.
    await expect.poll(() => deviceValue(again)).toBe("");
    expect(again.querySelector(`[aria-label="${COPY.device}"]`)).toBeTruthy();
    expect(editor.getSnapshot().selection.nodeId).toBe("pump");
    expect(editor.getSnapshot().dataSources.bindings).toEqual(bindingsBefore);
  }, 45_000);
});

type Workbench = {
  editor: ReturnType<typeof createEditor>;
  host: HTMLDivElement;
  dialog: HTMLDialogElement;
  dispose(): void;
};

async function openBindingsDialog(): Promise<Workbench> {
  const pumpBytes = await glb("Pump body");
  const valveBytes = await glb("Valve body");
  const objectUrl = new Map<string, string>();
  objectUrl.set("pump", URL.createObjectURL(new Blob([pumpBytes], { type: "model/gltf-binary" })));
  objectUrl.set("valve", URL.createObjectURL(new Blob([valveBytes], { type: "model/gltf-binary" })));

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
  const editor = createEditor({ executor });
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
  if (!connection.ok) throw new Error("Failed to create the fixture connection");
  const query = buildSaveDataQueryCommand(editor.getSnapshot(), {
    connectionId: "fixture",
    name: "Pump status",
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
        }
      ],
      observedAt: null,
      sourceQuality: null
    }
  });
  if (!query.ok) throw new Error(query.problems.map((problem) => problem.message).join("\n"));
  const savedQuery = editor.dispatch(query.command);
  if (!savedQuery.ok) throw new Error("Failed to save the fixture query");
  const queryId = Object.keys(savedQuery.snapshot.dataSources.queries)[0]!;

  for (const [objectId, name] of [["pump", "Pump object"], ["valve", "Valve object"]] as const) {
    const imported = await editor.importGlbAsset({
      asset: {
        id: `${objectId}-asset`,
        source: new File([objectId === "pump" ? pumpBytes : valveBytes], `${objectId}.glb`, { type: "model/gltf-binary" })
      },
      objectId,
      name
    });
    if (!imported.ok) throw new Error(imported.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }
  const binding = buildSaveDataObjectBindingCommand(editor.getSnapshot(), {
    objectNodeId: "pump",
    queryId,
    parameterOverrides: {},
    deviceId: "A",
    enabled: true,
    details: [{ key: "requestCount", precision: 0 }]
  });
  if (!binding.ok) throw new Error(binding.problems.map((problem) => problem.message).join("\n"));
  if (!editor.dispatch(binding.command).ok) throw new Error("Failed to save the fixture binding");

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(
    <EditorWorkbench
      editor={editor}
      loader={new ThreeGltfLoaderAdapter()}
      resolver={new AssetResolverBridge((request) => ({
        uri: objectUrl.get(request.assetId.replace("-asset", ""))!
      }))}
      locale="en"
    />
  );
  const dispose = () => {
    root.unmount();
    editor.dispose();
    host.remove();
    for (const url of objectUrl.values()) URL.revokeObjectURL(url);
  };

  try {
    const nav = `[aria-label="${COPY.nav}"] button[aria-label^="${COPY.dataPrefix}"]`;
    await expect.poll(() => host.querySelector(nav), { timeout: 10_000 }).toBeTruthy();
    await userEvent.click(requireElement<HTMLButtonElement>(host, nav));
    const trigger = await waitForButton(host, COPY.manageBindings);
    await userEvent.click(trigger);
    const dialog = await waitForDialog(host, COPY.dialogTitle);
    return { editor, host, dialog, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

async function glb(name: string): Promise<ArrayBuffer> {
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial({ color: 0x6fa8dc });
  const model = new Mesh(geometry, material);
  model.name = name;
  const bytes = await new GLTFExporter().parseAsync(model, { binary: true }) as ArrayBuffer;
  geometry.dispose();
  material.dispose();
  return bytes;
}

async function waitForDialog(host: HTMLElement, label: string): Promise<HTMLDialogElement> {
  const selector = `dialog[aria-label="${label}"]`;
  await expect.poll(() => host.querySelector(selector)).toBeTruthy();
  return requireElement<HTMLDialogElement>(host, selector);
}

async function waitForElement<T extends Element>(host: ParentNode, selector: string): Promise<T> {
  await expect.poll(() => host.querySelector(selector)).toBeTruthy();
  return requireElement<T>(host, selector);
}

async function waitForButton(host: HTMLElement, label: string): Promise<HTMLButtonElement> {
  await expect.poll(() => findButton(host, label)).toBeTruthy();
  return button(host, label);
}

function requireElement<T extends Element>(host: ParentNode, selector: string): T {
  const found = host.querySelector<T>(selector);
  if (!found) throw new Error(`Expected element ${selector}`);
  return found;
}

function findButton(host: HTMLElement, label: string): HTMLButtonElement | null {
  return (
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.getAttribute("aria-label") === label || text(candidate) === label
    ) ?? null
  );
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = findButton(host, label);
  if (!found) throw new Error(`Expected button ${label}`);
  return found;
}

function deviceValue(dialog: HTMLElement): string {
  return dialog.querySelector<HTMLInputElement>(`[aria-label="${COPY.device}"]`)?.value ?? "missing";
}

function text(element: Element): string {
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
}
