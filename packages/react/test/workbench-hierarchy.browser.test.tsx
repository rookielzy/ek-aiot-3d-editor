import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
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

const CAPTURE = Boolean(import.meta.env.VITE_CAPTURE_HIERARCHY);
const WIDTHS = [[1440, 900], [1920, 1080], [1100, 800]] as const;

describe("React hierarchy browser verification", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = "";
  });

  it("separates browsing focus from selection and works a node menu at desktop sizes", async () => {
    const originalSize = { width: window.innerWidth, height: window.innerHeight };
    const inheritedStyles = [...document.querySelectorAll<HTMLStyleElement>("style[data-vite-dev-id]")]
      .map((style) => ({ style, disabled: style.disabled }));
    inheritedStyles.forEach(({ style }) => { style.disabled = true; });
    installStyles("hierarchy-keyboard-styles", [UiStyles, WorkbenchStyles, InspectorStyles]);
    const editor = createEditor();
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x6fa8dc }));
    mesh.name = "ImportedPanelWithAVeryLongNameThatKeepsGoing";
    const scene = new Group();
    scene.add(mesh);
    const bytes = await new GLTFExporter().parseAsync(scene, { binary: true }) as ArrayBuffer;
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Assembly", parentId: null });
    const imported = await editor.importGlbAsset({
      asset: { id: "hierarchy-asset", source: new File([bytes], "hierarchy.glb") },
      objectId: "robot",
      name: "Robot",
      parentId: "group-a",
      expandImportedTargets: true,
    });
    expect(imported.ok).toBe(true);
    editor.dispatch({ type: "add-light", light: { id: "light-key", name: "Key light", kind: "point" } });
    editor.dispatch({ type: "create-camera-view", view: { id: "camera-front", name: "Front view" } });
    const host = document.createElement("div");
    host.id = "app";
    document.body.append(host);
    const root = createRoot(host);
    root.render(
      <EditorWorkbench
        editor={editor}
        locale="en"
        rendererFactory={paintedRenderer}
        style={{ height: "100vh", "--ek-workbench-accent": "rgb(123, 45, 67)" } as CSSProperties}
      />,
    );
    cleanup = () => {
      root.unmount();
      editor.dispose();
      host.remove();
      removeStyles("hierarchy-keyboard-styles");
      inheritedStyles.forEach(({ style, disabled }) => { style.disabled = disabled; });
    };
    const hierarchy = () => visibleSection(host, "Hierarchy");
    const row = (label: string) => {
      const found = [...hierarchy().querySelectorAll<HTMLButtonElement>('[role="treeitem"]')]
        .find((candidate) => candidate.getAttribute("aria-label") === label);
      expect(found, `Expected hierarchy row ${label}`).toBeTruthy();
      return found!;
    };
    const status = () => text(visibleSection(host, "Editor status"));

    try {
      await page.viewport(1440, 900);
      await waitFor(() => expect(editor.getRuntime()).toBeTruthy());
      await editor.getRuntime()!.project();
      await waitForAnimationFrame();

      // Browsing focus never changes the scene selection or the inspector target.
      const snapshot = editor.getSnapshot();
      row("Assembly").focus();
      await userEvent.keyboard("{ArrowDown}");
      await waitFor(() => expect(document.activeElement).toBe(row("Robot")));
      // The real GLB adds its own scene nodes under the imported target, so walk to the next siblings.
      await userEvent.keyboard("{ArrowDown}");
      await waitFor(() => expect(document.activeElement).toBe(row("AuxScene")));
      await userEvent.keyboard("{End}");
      await waitFor(() => expect(document.activeElement).toBe(row("Front view")));
      await userEvent.keyboard("{Home}");
      await waitFor(() => expect(document.activeElement).toBe(row("Assembly")));
      expect(editor.getSnapshot()).toEqual(snapshot);
      expect(status()).toContain("Selection none");

      // Enter selects the focused node and the inspector follows.
      await userEvent.keyboard("{ArrowDown}");
      await userEvent.keyboard("{Enter}");
      await waitFor(() => expect(editor.getSnapshot().selection.nodeId).toBe("robot"));
      expect(status()).toContain("Robot");
      expect(fieldValue(host, "Position X")).toBe("0");

      // Arrows only move between visible nodes: a focused child of a collapsed branch is skipped.
      editor.dispatch({ type: "select-nodes", mode: "clear" });
      await waitForAnimationFrame();
      row("Assembly").focus();
      await userEvent.keyboard("{ArrowLeft}");
      await waitFor(() => expect(row("Assembly").getAttribute("aria-expanded")).toBe("false"));
      expect([...hierarchy().querySelectorAll('[role="treeitem"]')].map((item) => item.getAttribute("aria-label")))
        .toEqual(["Assembly", "Key light", "Front view"]);
      await userEvent.keyboard("{ArrowDown}");
      await waitFor(() => expect(document.activeElement).toBe(row("Key light")));
      // ArrowRight on a leaf does nothing; the collapsed Assembly expands and keeps its focus.
      await userEvent.keyboard("{ArrowUp}");
      await waitFor(() => expect(document.activeElement).toBe(row("Assembly")));
      await userEvent.keyboard("{ArrowRight}");
      await waitFor(() => expect(row("Robot").closest("ul")?.getAttribute("role")).toBe("group"));
      expect(status()).toContain("Selection none");

      // The row menu runs existing node commands on its own row and restores focus on dismissal.
      row("Front view").focus();
      await userEvent.keyboard("{ContextMenu}");
      await expect.element(page.getByRole("menu", { name: "Actions for Front view" })).toBeVisible();
      // A camera view cannot be deleted from the tree, and the menu says why.
      await expect.element(page.getByRole("menuitem", { name: /Delete/ })).toHaveAttribute("aria-disabled", "true");
      // Keyboard focus on the unavailable command shows the same reason as its label.
      const remove = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((item) => text(item).startsWith("Delete"))!;
      await waitFor(() => expect(remove().getAttribute("data-tooltip")).toMatch(/inspector/));
      remove().focus();
      await waitFor(() => expect(document.querySelector('[role="tooltip"]')?.textContent).toMatch(/inspector/));
      expect(editor.getSnapshot().selection.nodeIds).toEqual([]);
      await userEvent.keyboard("{Escape}");
      await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
      expect(document.activeElement).toBe(row("Front view"));
      expect(editor.getSnapshot().selection.nodeIds).toEqual([]);

      // Enter activates the row itself: it selects, it does not open the menu.
      await userEvent.keyboard("{Enter}");
      await waitFor(() => expect(editor.getSnapshot().selection.nodeId).toBe("camera-front"));
      expect(status()).toContain("Front view");
      expect(document.querySelector('[role="menu"]')).toBeNull();
      await userEvent.keyboard("{Shift>}{F10}{/Shift}");
      await expect.element(page.getByRole("menu", { name: "Actions for Front view" })).toBeVisible();
      // The open menu previews its row without touching the stored selection.
      expect(hierarchy().querySelector('[aria-selected="true"]')?.getAttribute("aria-label")).toBe("Front view");
      const stored = editor.getSnapshot();
      expect(stored.selection.nodeId).toBe("camera-front");
      // Pointing at the row's own button dismisses the panel without moving focus off the row.
      const moreButton = () => hierarchy().querySelector<HTMLElement>(`[aria-label="Actions for Front view"]`)!;
      moreButton().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
      expect(editor.getSnapshot()).toEqual(stored);
      row("Front view").focus();

      // Search still reveals ancestors while the tree keeps one row per node.
      const search = hierarchy().querySelector<HTMLInputElement>('input[type="search"]')!;
      await userEvent.fill(search, "ImportedPanelWithAVeryLongName");
      const labels = () => [...hierarchy().querySelectorAll('[role="treeitem"]')].map((item) => item.getAttribute("aria-label"));
      await waitFor(() => expect(labels()[0]).toBe("Assembly"));
      expect(labels()).toContain("Robot");
      expect(labels()).toContain("ImportedPanelWithAVeryLongNameThatKeepsGoing");
      expect(labels()).not.toContain("Key light");
      // Search shows the matching node once per browser node; the GLB scene root and mesh share the
      // same display name, so only the ids are unique. Collapsing the branch hides it again.
      const matchingIds = [...hierarchy().querySelectorAll('[role="treeitem"]')]
        .filter((item) => item.getAttribute("aria-label") === "ImportedPanelWithAVeryLongNameThatKeepsGoing")
        .map((item) => item.getAttribute("data-tree-row-id"));
      expect(new Set(matchingIds).size).toBe(matchingIds.length);
      await userEvent.fill(search, "no matching thing");
      await waitFor(() => expect(text(hierarchy())).toContain("No matching nodes"));
      await userEvent.clear(search);
      await row("Assembly").click();
      await waitForAnimationFrame();

      // Every visible control stays inside the window at each acceptance width.
      for (const [width, height] of WIDTHS) {
        await page.viewport(width, height);
        await waitForAnimationFrame();
        row("Robot").focus();
        await userEvent.keyboard("{ContextMenu}");
        await expect.element(page.getByRole("menu", { name: "Actions for Robot" })).toBeVisible();
        const menuRect = hierarchy().ownerDocument.querySelector<HTMLElement>('[role="menu"]')!.getBoundingClientRect();
        expect(menuRect.top).toBeGreaterThanOrEqual(0);
        expect(menuRect.left).toBeGreaterThanOrEqual(0);
        const triggerRect = hierarchy().querySelector<HTMLElement>('[aria-label="Actions for Robot"]')!.getBoundingClientRect();
        expect(Math.abs(menuRect.top - triggerRect.bottom)).toBeLessThan(80);
        expect(Math.abs(menuRect.left - triggerRect.left)).toBeLessThan(300);
        expect(getComputedStyle(document.querySelector<HTMLElement>('[role="menu"]')!).getPropertyValue("--ek-workbench-accent").trim()).toBe("rgb(123, 45, 67)");
        expect(menuRect.right).toBeLessThanOrEqual(width);
        expect(menuRect.bottom).toBeLessThanOrEqual(height);
        const longRow = row(mesh.name);
        expect(longRow.getBoundingClientRect().width).toBeGreaterThan(0);
        expect(longRow.scrollWidth).toBeLessThanOrEqual(longRow.clientWidth + 1);
        expect(longRow.getAttribute("title")).toBe(mesh.name);
        // Every acceptance width keeps the tree, its menu, and the status strip inside the window.
        const moreButtons = [...hierarchy().querySelectorAll<HTMLElement>(`[aria-label="Actions for ${mesh.name}"]`)];
        expect(moreButtons.length).toBeGreaterThan(0);
        expect(moreButtons.every((item) => item.getBoundingClientRect().width > 0)).toBe(true);
        if (CAPTURE) {
          await page.screenshot({ path: `__screenshots__/hierarchy-menu/${width}-en.png` });
        }
        await userEvent.keyboard("{Escape}");
        await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        expect(visibleSection(host, "Editor status").getBoundingClientRect().bottom).toBeLessThanOrEqual(height);
      }
    } finally {
      await page.viewport(originalSize.width, originalSize.height);
    }
  }, 40000);
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

function visibleSection(host: HTMLElement, label: string): HTMLElement {
  const element = [...host.querySelectorAll<HTMLElement>(`[aria-label="${label}"]`)]
    .find((candidate) => candidate.getClientRects().length > 0);
  expect(element, `Expected visible [aria-label="${label}"]`).toBeTruthy();
  return element!;
}

function fieldValue(host: HTMLElement, label: string): string | undefined {
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  expect(field, `Expected inspector field ${label}`).toBeTruthy();
  return field!.value;
}

function text(element: Element): string {
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
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
