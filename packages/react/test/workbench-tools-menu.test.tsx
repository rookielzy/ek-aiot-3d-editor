import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { describe, expect, it, vi } from "vitest";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import { closeTopLayer, registerCommandLayer } from "../src/components/ui/command-layer";

describe("React Workbench viewport command menus", () => {
  it("shows shortcut hints and keeps disabled reasons on hover and keyboard focus", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);

    expect(screen.getByRole("button", { name: "Undo" }).getAttribute("aria-keyshortcuts")).toBe("Control+Z Meta+Z");
    expect(within(screen.getByLabelText("Viewport tools")).getByRole("button", { name: "Rotate" }).getAttribute("aria-keyshortcuts")).toBe("E");

    const viewport = within(screen.getByLabelText("3D viewport"));
    const trigger = viewport.getByRole("button", { name: "Node operations" });
    expect(trigger.getAttribute("aria-keyshortcuts")).toBeNull();
    fireEvent.click(trigger);
    const q = screen.getByRole("menu", { name: "Node operations" });




    const menu = q;
    const deletable = within(menu).getByRole("menuitem", { name: /Delete/ });
    expect(deletable.getAttribute("aria-disabled")).toBe("false");
    expect(deletable.getAttribute("aria-keyshortcuts")).toBe("Delete Backspace");
    expect(deletable.getAttribute("data-tooltip")).toBeNull();

    // A one-shot command closes its menu; the trigger reopens it with the refreshed state.
    const clearWhileOpen = within(menu).getByRole("menuitem", { name: /Clear/ });
    fireEvent.click(clearWhileOpen);


    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(trigger);
    const clearedMenu = screen.getByRole("menu", { name: "Node operations" });
    const disabledDelete = within(clearedMenu).getByRole("menuitem", { name: /Delete/ });
    expect(disabledDelete.getAttribute("aria-disabled")).toBe("true");
    expect(editor.getSnapshot().selection.nodeIds).toEqual([]);

    fireEvent.pointerEnter(disabledDelete);
    expect(screen.getByRole("tooltip").textContent).toBe("Select a node first.");
    fireEvent.pointerLeave(disabledDelete);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.focus(disabledDelete);
    expect(screen.getByRole("tooltip").getAttribute("id")).toBe(disabledDelete.getAttribute("aria-describedby"));
  });

  it("closes after one-shot commands and keeps helper toggles open with refreshed state", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);

    const viewport = within(screen.getByLabelText("3D viewport"));
    const helpers = viewport.getByRole("button", { name: "Viewport helpers" });
    fireEvent.click(helpers);
    const helperMenu = screen.getByRole("menu", { name: "Viewport helpers" });
    const grid = within(helperMenu).getByRole("menuitemcheckbox", { name: /Grid/ });
    expect(grid.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(grid);
    expect(editor.viewportHelpers.get().visibility.grid).toBe(false);
    expect(helpers.getAttribute("aria-expanded")).toBe("true");
    expect(within(helperMenu).getByRole("menuitemcheckbox", { name: /Grid/ }).getAttribute("aria-checked")).toBe("false");
    expect(document.activeElement?.getAttribute("role")).toBe("menuitemcheckbox");

    const nodes = viewport.getByRole("button", { name: "Node operations" });
    fireEvent.click(nodes);
    const nodeMenu = screen.getByRole("menu", { name: "Node operations" });
    fireEvent.click(within(nodeMenu).getByRole("menuitem", { name: /Duplicate/ }));
    expect(Object.keys(editor.getSnapshot().objects)).toHaveLength(2);
    expect(nodes.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(nodes);
  });

  it("navigates menus with arrows, Home, and End", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    await act(async () => { await Promise.resolve(); });
    const viewport = within(screen.getByLabelText("3D viewport"));
    const camera = viewport.getByRole("button", { name: "Camera" });

    fireEvent.click(camera);
    await act(async () => { await Promise.resolve(); });
    const menu = screen.getByRole("menu", { name: "Camera" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.getAttribute("data-command"))).toEqual(["reset-camera", "frame-selected", "frame-all", "capture-view", "apply-view"]);
    const enabled = items.filter((item) => item.getAttribute("aria-disabled") === "false");
    expect(enabled.length).toBeLessThan(items.length);

    // Pointer-opened menus keep the trigger focused so Escape returns there; keyboard users
    // enter the roving list by moving focus into it with ArrowDown.
    fireEvent.keyDown(camera, { key: "ArrowDown" });
    await act(async () => { await Promise.resolve(); });
    const press = (key: string) => fireEvent.keyDown(menu, { key });
    const reached = () => document.querySelector<HTMLElement>(`[role="menu"] [data-roving="true"]`);

    expect(reached()).toBe(enabled[0]);
    press("ArrowDown");
    expect(reached()).toBe(enabled[1]);
    press("ArrowUp");
    expect(reached()).toBe(enabled[0]);
    press("ArrowUp");
    expect(reached()).toBe(enabled[enabled.length - 1]);
    press("End");
    expect(reached()).toBe(enabled[enabled.length - 1]);
    press("Home");
    expect(reached()).toBe(enabled[0]);
  });

  it("closes with Tab and Escape while returning focus to the trigger", async () => {
    render(<EditorWorkbench editor={createEditor()} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    const viewport = within(screen.getByLabelText("3D viewport"));
    const helpers = viewport.getByRole("button", { name: "Viewport helpers" });

    fireEvent.click(helpers);
    fireEvent.keyDown(screen.getByRole("menu", { name: "Viewport helpers" }), { key: "Escape" });
    expect(helpers.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(helpers);

    fireEvent.click(helpers);
    await act(async () => { await Promise.resolve(); });
    const menu = screen.getByRole("menu", { name: "Viewport helpers" });
    const closed = fireEvent.keyDown(menu, { key: "Tab" });
    expect(closed).toBe(true);
    expect(helpers.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes an open menu when focus leaves it", () => {
    render(<EditorWorkbench editor={createEditor()} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    const viewport = within(screen.getByLabelText("3D viewport"));
    const camera = viewport.getByRole("button", { name: "Camera" });
    fireEvent.click(camera);
    expect(camera.getAttribute("aria-expanded")).toBe("true");

    fireEvent.blur(within(screen.getByRole("menu", { name: "Camera" })).getAllByRole("menuitem")[0]!, {
      relatedTarget: screen.getByLabelText("Inspector panel")
    });
    expect(camera.getAttribute("aria-expanded")).toBe("false");
  });

  it("ignores editor shortcuts typed inside an open command menu", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    const viewport = within(screen.getByLabelText("3D viewport"));
    const nodes = viewport.getByRole("button", { name: "Node operations" });
    fireEvent.click(nodes);
    const menu = screen.getByRole("menu", { name: "Node operations" });
    const before = editor.getSnapshot();
    // The workbench root also answers keys, so only the scene state proves they were ignored.
    fireEvent.keyDown(menu, { key: "w" });
    fireEvent.keyDown(menu, { key: "z", ctrlKey: true });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    const focused = document.activeElement as HTMLElement;
    expect(focused.getAttribute("role")).toBe("menuitem");
    expect(fireEvent.keyDown(focused, { key: "e" })).toBe(true);
    expect(editor.transformMode.get()).toBe("translate");
    expect(editor.getSnapshot()).toEqual(before);
    expect(screen.getByRole("menu", { name: "Node operations" })).toBe(menu);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(nodes.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps a single open menu when another trigger is activated", () => {
    render(<EditorWorkbench editor={createEditor()} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    const viewport = within(screen.getByLabelText("3D viewport"));
    const camera = viewport.getByRole("button", { name: "Camera" });
    const helpers = viewport.getByRole("button", { name: "Viewport helpers" });
    fireEvent.click(camera);
    fireEvent.click(helpers);
    expect(camera.getAttribute("aria-expanded")).toBe("false");
    expect(helpers.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("menu")).toHaveLength(1);
  });
});

describe("React Workbench project menu", () => {
  it("exposes project commands as menu items that close on activation and keep the locale switch", async () => {
    const editor = createEditor();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    const trigger = screen.getByRole("button", { name: "Project menu" });

    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBeNull();

    fireEvent.click(trigger);
    await act(async () => { await Promise.resolve(); });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu", { name: "Project actions" });
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);

    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.getAttribute("data-command"))).toEqual(["open", "export", "export-partial"]);
    expect(items.every((item) => item.getAttribute("aria-disabled") === "false")).toBe(true);
    // The locale switch stays a toolbar control, so it remains reachable with the menu closed.
    expect(screen.getByLabelText("Language")).toBeTruthy();

    // Opening a package goes through the same file input the previous toolbar used, which now
    // lives beside the menu so it stays mounted while the menu is closed.
    const fileInput = screen.getByLabelText("Open project package");
    expect(fileInput.getAttribute("type")).toBe("file");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("enters the project menu from the keyboard and leaves it with Escape", async () => {
    render(<EditorWorkbench editor={createEditor()} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    const trigger = screen.getByRole("button", { name: "Project menu" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    await act(async () => { await Promise.resolve(); });
    const menu = screen.getByRole("menu", { name: "Project actions" });
    // Keyboard entry lands on the first command, so no pointer is needed to reach the rows.
    expect(document.activeElement).toBe(within(menu).getAllByRole("menuitem")[0]);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the project menu after an export and reports busy state while it runs", async () => {
    const editor = createEditor();
    const createObjectURL = vi.fn(() => "blob:project");
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    try {
      fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
      await act(async () => { await Promise.resolve(); });
      const menu = screen.getByRole("menu", { name: "Project actions" });
      fireEvent.click(within(menu).getByRole("menuitem", { name: "Export" }));
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByRole("button", { name: "Project menu" }).getAttribute("aria-expanded")).toBe("false");
      expect(createObjectURL).toHaveBeenCalled();
    } finally {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreate });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevoke });
    }
  });
});

describe("React Workbench command layers", () => {
  it("closes only the top-most registered layer and stops once handled", () => {
    const order: string[] = [];
    const unregisterMenu = registerCommandLayer((event) => {
      order.push("menu");
      if (event.key !== "Escape") return false;
      event.preventDefault();
      return true;
    });
    const unregisterDrawer = registerCommandLayer((event) => {
      order.push("drawer");
      if (event.key !== "Escape") return false;
      event.preventDefault();
      return true;
    });
    try {
      expect(closeTopLayer(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(true);
      expect(order).toEqual(["drawer"]);
      unregisterDrawer();
      expect(closeTopLayer(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(true);
      expect(order).toEqual(["drawer", "menu"]);
      unregisterMenu();
      expect(closeTopLayer(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(false);
    } finally {
      unregisterMenu();
      unregisterDrawer();
    }
  });

  it("restores focus to the trigger when Escape closes the menu", async () => {
    render(<EditorWorkbench editor={createEditor()} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    const viewport = within(screen.getByLabelText("3D viewport"));
    const camera = viewport.getByRole("button", { name: "Camera" });
    fireEvent.click(camera);
    await act(async () => { await Promise.resolve(); });
    const menu = screen.getByRole("menu", { name: "Camera" });
    expect(camera.getAttribute("aria-expanded")).toBe("true");
    // Keyboard entry starts at the menu list, which hands roving focus to its first command.
    await act(async () => menu.focus());
    expect(menu.querySelector('[data-roving="true"]')).toBe(within(menu).getAllByRole("menuitem")[0]);

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(camera.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
    // Closing unmounts a Radix focus scope, which hands focus back to the document; the trigger is
    // focused on close and again once that scope's cleanup has run.
    await act(async () => { await Promise.resolve(); });
    expect(document.activeElement).toBe(camera);
  });
});

function fakeRenderer(): RendererLike {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    domElement: document.createElement("canvas"),
    render: () => {},
    setSize: () => {},
    dispose: () => {},
    setViewportHelpers: () => {},
    setSnapFeedback: () => {},
    addEventListener: (type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener as (event: unknown) => void);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener as (event: unknown) => void);
    }
  } as unknown as RendererLike;
}
