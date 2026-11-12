import { AssetResolverBridge, createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import WorkbenchStyles from "../src/components/workbench.css?raw";
import InspectorStyles from "../src/components/inspector.css?raw";
import UiStyles from "../src/components/ui/ui.css?raw";

const CAPTURE = Boolean(import.meta.env.VITE_CAPTURE_PROBLEMS);
const WIDTHS = [[1440, 900], [1920, 1080], [1100, 800]] as const;

describe("React problem region browser verification", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = "";
  });

  it("reports problems without taking the scene away at every acceptance width", async () => {
    const originalSize = { width: window.innerWidth, height: window.innerHeight };
    const inheritedStyles = [...document.querySelectorAll<HTMLStyleElement>("style[data-vite-dev-id]")]
      .map((style) => ({ style, disabled: style.disabled }));
    inheritedStyles.forEach(({ style }) => { style.disabled = true; });
    installStyles("problems-browser-styles", [UiStyles, WorkbenchStyles, InspectorStyles]);
    const editor = createEditor();
    // A runtime warning about a scene node, and an asset the resolver cannot hand over: the region
    // must offer a route for each of them and state where each one lives.
    editor.dispatch({ type: "add-light", light: { id: "point-a", kind: "point", name: "Key light", shadow: { enabled: true } } });
    editor.dispatch({ type: "import-glb", objectId: "box", name: "Missing box", asset: { id: "box-asset", label: "Missing box" } });
    editor.dispatch({ type: "select-object", objectId: "box" });
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
      removeStyles("problems-browser-styles");
      inheritedStyles.forEach(({ style, disabled }) => { style.disabled = disabled; });
    };
    await waitFor(() => expect(editor.getRuntime()).toBeTruthy());
    await editor.getRuntime()!.project();

    const viewport = () => document.querySelector<HTMLElement>('[aria-label="3D viewport"]')!;
    const region = () => document.querySelector<HTMLElement>('[aria-label="Problem details"]')!;
    const rows = () => [...region().querySelectorAll<HTMLElement>("li")];

    const trigger = page.getByRole("button", { name: "Problem details" });
    await userEvent.click(trigger);
    await waitFor(() => expect(region().hidden).toBe(false));
    await waitForAnimationFrame();

    // The problems are stated where the work happens, with their severity, source, target and detail.
    const light = rows().find((row) => text(row).includes("Target · Light"))!;
    expect(text(light)).toContain("Severity");
    expect(text(light)).toContain("warning");
    expect(text(light)).toContain("Source");
    expect(text(light)).toContain("runtime");
    expect(text(light)).toContain("Detail");
    expect(light.querySelector('button')?.textContent).toContain("Locate");
    const asset = rows().find((row) => text(row).includes("Target · Object"))!;
    expect(asset.querySelector<HTMLInputElement>('input[type="file"]')).toBeTruthy();

    const before = editor.getSnapshot();
    try {
      for (const [width, height] of WIDTHS) {
        await page.viewport(width, height);
        await waitForAnimationFrame();

        // The region reports problems from the shell; the viewport it reports about stays intact and
        // on screen, so the scene is still editable while the region is open.
        const regionRect = region().getBoundingClientRect();
        const viewportRect = viewport().getBoundingClientRect();
        expect(regionRect.width).toBeGreaterThan(0);
        expect(viewportRect.height).toBeGreaterThan(200);
        expect(regionRect.top).toBeGreaterThanOrEqual(viewportRect.bottom - 1);
        expect(trigger.element().getAttribute("aria-expanded")).toBe("true");

        // Nothing spills out of the acceptance width, and every row stays inside the region.
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        for (const row of rows()) {
          expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
          expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(regionRect.right + 1);
        }

        // A real edit still lands while the region is open: the scene is not blocked.
        const objectsBefore = Object.keys(editor.getSnapshot().objects).length;
        await userEvent.click(page.getByRole("button", { name: "Node operations" }));
        await expect.element(page.getByRole("menu", { name: "Node operations" })).toBeVisible();
        await userEvent.click(page.getByRole("menuitem", { name: /Duplicate/ }));
        await waitFor(() => expect(Object.keys(editor.getSnapshot().objects)).toHaveLength(objectsBefore + 1));
        editor.dispatch({ type: "undo" });
        expect(trigger.element().getAttribute("aria-expanded")).toBe("true");

        if (CAPTURE) {
          await page.screenshot({ path: `__screenshots__/problems/${width}-en.png` });
        }
      }
    } finally {
      await page.viewport(originalSize.width, originalSize.height);
    }

    // Closing the region hides only the region: the summaries and the problems stay.
    await userEvent.click(page.getByRole("button", { name: "Close details" }));
    expect(region().hidden).toBe(true);
    expect(trigger.element().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger.element());
    expect(text(document.querySelector<HTMLElement>('[aria-label="Editor status"]')!)).toContain("errors");
    expect(rows().length).toBeGreaterThan(0);
    expect(editor.getSnapshot().problems.acknowledged).toEqual(before.problems.acknowledged);
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
