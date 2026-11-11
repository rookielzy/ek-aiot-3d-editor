import { AssetResolverBridge, createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import WorkbenchStyles from "../src/components/workbench.css?raw";
import InspectorStyles from "../src/components/inspector.css?raw";
import UiStyles from "../src/components/ui/ui.css?raw";

const CAPTURE = Boolean(import.meta.env.VITE_CAPTURE_ASSETS);
const WIDTHS = [[1440, 900], [1920, 1080], [1100, 800]] as const;
const LONG_NAME = "PanelPaintWithAnExtremelyLongAssetLabelThatMustNotOverflowTheNarrowSidebar";

describe("React asset workspace browser verification", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = "";
  });

  it("imports, filters, expands, maintains, and recovers assets from visible controls", async () => {
    const originalSize = { width: window.innerWidth, height: window.innerHeight };
    const inheritedStyles = [...document.querySelectorAll<HTMLStyleElement>("style[data-vite-dev-id]")]
      .map((style) => ({ style, disabled: style.disabled }));
    inheritedStyles.forEach(({ style }) => { style.disabled = true; });
    installStyles("assets-browser-styles", [UiStyles, WorkbenchStyles, InspectorStyles]);
    const editor = createEditor();
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x6fa8dc }));
    mesh.name = "Panel";
    const scene = new Group();
    scene.add(mesh);
    const bytes = await new GLTFExporter().parseAsync(scene, { binary: true }) as ArrayBuffer;
    const imported = await editor.importGlbAsset({
      asset: { id: "robot", source: new File([bytes], "robot.glb") },
      objectId: "robot-object",
      name: "Robot",
      parentId: null,
    });
    expect(imported.ok).toBe(true);
    // A registered asset without a payload keeps the maintenance affordance visible.
    editor.dispatch({ type: "register-asset", asset: { id: "broken-texture", kind: "texture", label: "Broken texture" } });
    // An asset whose payload cannot be resolved never projects and needs a recovery action.
    editor.dispatch({ type: "import-glb", objectId: "box", name: "Recovery box", asset: { id: "box-asset", label: "Missing box" } });
    const host = document.createElement("div");
    host.id = "app";
    document.body.append(host);
    const root = createRoot(host);
    root.render(
      <EditorWorkbench
        editor={editor}
        locale="en"
        resolver={new AssetResolverBridge(() => null)}
        rendererFactory={paintedRenderer}
        style={{ height: "100vh", "--ek-workbench-accent": "rgb(123, 45, 67)" } as CSSProperties}
      />,
    );
    cleanup = () => {
      root.unmount();
      editor.dispose();
      host.remove();
      removeStyles("assets-browser-styles");
      inheritedStyles.forEach(({ style, disabled }) => { style.disabled = disabled; });
    };
    const assetsPanel = () => [...host.querySelectorAll<HTMLElement>(".ek-workbench__panel-section")]
      .find((section) => section.getClientRects().length > 0
        && section.querySelector(".ek-workbench__asset-import") !== null)!;
    const rows = () => assetsPanel().querySelector<HTMLElement>('[aria-label="Asset workspace rows"]')!;
    // Rows are addressed through the control a user presses: the details disclosure names its asset.
    const rowFor = (label: string) => {
      const found = [...rows().querySelectorAll<HTMLElement>("li")]
        .find((item) => [...item.querySelectorAll<HTMLButtonElement>("button")]
          .some((button) => button.getAttribute("aria-label")?.endsWith(` ${label}`)));
      expect(found, `Expected asset row ${label}`).toBeTruthy();
      return found!;
    };

    try {
      await page.viewport(1440, 900);
      await waitForAnimationFrame();

      // Open the Assets view through its visible navigation control.
      await userEvent.click(page.getByRole("button", { name: /^Assets / }));
      await waitFor(() => expect(rows().getClientRects().length).toBeGreaterThan(0));
      await waitFor(() => expect(rowFor("Broken texture")).toBeTruthy());

      // A batch that half-fails reports every file separately.
      const importInput = assetsPanel().querySelector<HTMLInputElement>('input[aria-label="Import assets"]')!;
      await userEvent.upload(importInput, [
        new File([new Uint8Array([1, 2, 3])], "paint.png", { type: "image/png" }),
        new File([new Uint8Array([4, 5, 6])], "notes.txt", { type: "text/plain" }),
      ]);
      const queue = () => assetsPanel().querySelector<HTMLElement>('[aria-label="Asset import queue"]')!;
      await waitFor(() => expect(text(queue())).toContain("paint.png"));
      await waitFor(() => expect(text(queue())).toMatch(/succeeded/i));
      await waitFor(() => expect(text(queue())).toMatch(/failed/i));
      const queueItems = [...queue().querySelectorAll<HTMLElement>("li")];
      expect(queueItems.some((item) => item.getAttribute("data-status") === "succeeded")).toBe(true);
      expect(queueItems.some((item) => item.getAttribute("data-status") === "failed")).toBe(true);
      await expect.element(page.getByText("1 imported · 1 failed")).toBeVisible();

      // Search narrows the list and says so when nothing matches.
      const search = assetsPanel().querySelector<HTMLInputElement>('input[aria-label="Search assets"]')!;
      await userEvent.fill(search, "no such asset");
      await waitFor(() => expect(assetsPanel().querySelector('[aria-label="Asset workspace rows"]')).toBeNull());
      await waitFor(() => expect(text(assetsPanel())).toContain("No matching assets"));
      await userEvent.clear(search);
      await waitFor(() => expect(rowFor("Broken texture")).toBeTruthy());

      // Details expand from the summary row and expose the maintenance file action.
      const brokenRow = rowFor("Broken texture");
      const toggle = brokenRow.querySelector<HTMLButtonElement>('[aria-expanded="false"][aria-controls]')!;
      expect(toggle).toBeTruthy();
      await expect.element(page.getByText("No scene references", { exact: true }).first()).not.toBeVisible();
      expect(document.getElementById(toggle.getAttribute("aria-controls")!)!.getClientRects()).toHaveLength(0);
      await userEvent.click(toggle);
      await waitFor(() => expect(toggle.getAttribute("aria-expanded")).toBe("true"));
      const details = document.getElementById(toggle.getAttribute("aria-controls")!)!;
      expect(details.hidden).toBe(false);
      const replaceInput = brokenRow.querySelector<HTMLInputElement>('input[aria-label="Replace Broken texture"]')!;
      expect(replaceInput.getBoundingClientRect().width).toBeGreaterThan(0);
      expect(editor.getSnapshot().assets["broken-texture"]).toBeTruthy();

      // Replacing through the visible label updates the row feedback next to that asset.
      await userEvent.upload(replaceInput, new File([new Uint8Array([7, 8, 9])], "fixed.png", { type: "image/png" }));
      await waitFor(() => expect(text(brokenRow)).toContain("Replaced with fixed.png"));

      // A filter that hides a missing asset keeps its repair action below the list.
      await editor.getRuntime()?.project();
      const missingRow = rowFor("Missing box");
      await userEvent.click(missingRow.querySelector<HTMLButtonElement>('[aria-expanded="false"][aria-controls]')!);
      await userEvent.fill(search, "no such asset");
      await waitFor(() => expect(assetsPanel().querySelector('[aria-label="Asset workspace rows"]')).toBeNull());
      const hiddenRecovery = assetsPanel().querySelector<HTMLElement>('[aria-label="Missing asset recovery"]')!;
      expect(text(hiddenRecovery)).toContain("Hidden by the current filters");
      expect(hiddenRecovery.querySelector("input")).toBeTruthy();
      await userEvent.clear(search);
      await waitFor(() => expect(rowFor("Missing box").querySelector("[role=\"status\"]")).toBeTruthy());

      // The row menu lands on the same file control as the expanded details.
      await userEvent.click(page.getByRole("button", { name: "Asset actions for Missing box" }));
      await expect.element(page.getByRole("menu")).toBeVisible();
      await userEvent.click(page.getByRole("menuitem", { name: /Reimport GLB and remap targets/ }));
      await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
      // The list re-renders when the menu closes, so the control is looked up fresh.
      const picker = rowFor("Missing box").querySelector<HTMLInputElement>('input[aria-label="Reimport Missing box"]')!;
      expect(picker.getBoundingClientRect().width).toBeGreaterThan(0);
      expect(document.activeElement).toBe(picker);
      await userEvent.upload(picker, new File([bytes], "recovered.glb", { type: "model/gltf-binary" }));
      // The reimport reports its remap summary on the asset it repaired and removes the recovery action.
      await waitFor(() => expect(text(rowFor("Missing box"))).toContain("0 unresolved"));
      await waitFor(() => expect(rowFor("Missing box").querySelector('[aria-label="Missing asset recovery"]')).toBeNull());

      // The row menu survives every acceptance width, keeps the theme, and leaves the scene alone.
      const before = editor.getSnapshot();
      for (const [width, height] of WIDTHS) {
        await page.viewport(width, height);
        await waitForAnimationFrame();
        const menuButton = page.getByRole("button", { name: "Asset actions for Broken texture" });
        expect(menuButton.element().getBoundingClientRect().width).toBeGreaterThan(0);
        await userEvent.click(menuButton);
        await expect.element(page.getByRole("menu", { name: "Asset actions for Broken texture" })).toBeVisible();
        const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
        const menuRect = menu.getBoundingClientRect();
        expect(menuRect.top).toBeGreaterThanOrEqual(0);
        expect(menuRect.left).toBeGreaterThanOrEqual(0);
        expect(menuRect.right).toBeLessThanOrEqual(width);
        expect(menuRect.bottom).toBeLessThanOrEqual(height);
        expect(getComputedStyle(menu).getPropertyValue("--ek-workbench-accent").trim()).toBe("rgb(123, 45, 67)");
        const triggerRect = menuButton.element().getBoundingClientRect();
        expect(Math.abs(menuRect.left - triggerRect.left)).toBeLessThan(300);
        expect(Math.abs(menuRect.top - triggerRect.bottom)).toBeLessThan(80);
        if (CAPTURE) {
          await page.screenshot({ path: `__screenshots__/assets/${width}-en.png` });
        }
        await userEvent.keyboard("{Escape}");
        await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
        expect(document.activeElement).toBe(menuButton.element());

        // No horizontal overflow at any acceptance width, including the long label.
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        const panelRect = assetsPanel().getBoundingClientRect();
        for (const selector of ["[aria-label=\"Asset workspace rows\"]", ".ek-workbench__asset-row", ".ek-workbench__asset-controls"]) {
          const target = assetsPanel().querySelector<HTMLElement>(selector);
          if (!target) continue;
          const rect = target.getBoundingClientRect();
          expect(rect.left).toBeGreaterThanOrEqual(panelRect.left - 1);
          expect(rect.right).toBeLessThanOrEqual(panelRect.right + 1);
          expect(target.scrollWidth).toBeLessThanOrEqual(target.clientWidth + 1);
        }
      }
      expect(editor.getSnapshot()).toEqual(before);

      // A long asset label never widens the sidebar.
      editor.dispatch({ type: "register-asset", asset: { id: "long", kind: "image", label: LONG_NAME } });
      await page.viewport(1100, 800);
      await waitFor(() => expect(rowFor(LONG_NAME)).toBeTruthy());
      await waitForAnimationFrame();
      const longRow = rowFor(LONG_NAME);
      expect(longRow.scrollWidth).toBeLessThanOrEqual(longRow.clientWidth + 1);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(1100);

      // Clearing the queue removes per-file results without touching the assets.
      await userEvent.click(page.getByRole("button", { name: "Clear import results" }));
      await waitFor(() => expect(assetsPanel().querySelector('[aria-label="Asset import queue"]')).toBeNull());
      expect(editor.getSnapshot().assets["broken-texture"]).toBeTruthy();
    } finally {
      await page.viewport(originalSize.width, originalSize.height);
    }
  }, 60000);
});

function paintedRenderer(container: HTMLElement): RendererLike {
  const canvas = container.ownerDocument.createElement("canvas");
  const context = canvas.getContext("2d");
  return {
    domElement: canvas,
    setSize(width: number, height: number) {
      canvas.width = width;
      canvas.height = height;
      if (context) {
        context.fillStyle = "#17324d";
        context.fillRect(0, 0, width, height);
      }
    },
    render() {
      if (context) {
        context.fillStyle = "#17324d";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
    },
    dispose() {},
  } as RendererLike;
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
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function installStyles(id: string, blocks: string[]): void {
  removeStyles(id);
  const style = document.createElement("style");
  style.id = id;
  style.textContent = blocks.join("\n");
  document.head.appendChild(style);
}

function removeStyles(id: string): void {
  document.getElementById(id)?.remove();
}
