import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachGlbImportManifestMetadata,
  createEditor,
  createGlbImportManifest,
  planGlbImportRemap,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

// jsdom has no layout engine, and Radix's popper measures its anchor to position the panel. Without
// layout every panel is reported at the origin, and the primitives loop between two placements.
vi.mock("@floating-ui/dom", () => ({
  autoUpdate: () => () => {},
  computePosition: async () => ({ x: 0, y: 0, placement: "bottom-start", strategy: "absolute", middlewareData: {} }),
  platform: {}
}));

const escape = (label: string) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Rows are named exactly after their node, so match the complete accessible name. */
const row = (label: string) => screen.getByRole("treeitem", { name: new RegExp(`^${escape(label)}$`) });
const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key });
/** The rows a keyboard user can reach, in visual order. */
const visibleRows = () =>
  [...screen.getByLabelText("Hierarchy").querySelectorAll<HTMLElement>('[role="treeitem"]')].map(
    (node) => node.getAttribute("aria-label")
  );
const statusSelection = () =>
  screen.getByLabelText("Editor status").querySelector(".ek-workbench__status-chip")?.textContent;
const menuItem = (menu: HTMLElement, label: string) =>
  within(menu).getAllByRole("menuitem").find((item) => item.textContent?.startsWith(label))!;

/**
 * Hierarchy browsing through visible controls only: keys and clicks on the tree, read back through
 * the workbench's own status line and inspector, plus the editor's public snapshot.
 */
describe("Workbench hierarchy browsing", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
  });

  /** Group "Assembly" (one child "Robot arm") followed by top-level "Conveyor", a light, and a camera. */
  function setup() {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Assembly" });
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Robot arm", asset: { id: "asset-a" }, parentId: "group-a" });
    editor.dispatch({ type: "import-glb", objectId: "object-b", name: "Conveyor", asset: { id: "asset-b" } });
    editor.dispatch({ type: "add-light", light: { id: "light-a", name: "Key light", kind: "point" } });
    editor.dispatch({ type: "create-camera-view", view: { id: "camera-a", name: "Front view" } });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    return { editor, hierarchy: within(screen.getByLabelText("Hierarchy")) };
  }

  it("moves focus through visible nodes with the arrow keys without touching selection", async () => {
    const { editor } = setup();
    await flush();

    row("Conveyor").focus();
    press("ArrowUp");
    expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toBe(visibleRows()[visibleRows().indexOf("Conveyor") - 1]);
    press("Home");
    expect(document.activeElement).toBe(row("Assembly"));
    press("End");
    expect(document.activeElement).toBe(row("Front view"));
    press("ArrowDown");
    expect(document.activeElement).toBe(row("Assembly"));

    // Browsing is not selecting: nothing moved into the scene, the status line, or the inspector.
    expect(editor.getSnapshot().selection.nodeIds).toEqual([]);
    expect(statusSelection()).toMatch(/Selection none/);
    expect(screen.queryByLabelText("Position X")).toBeNull();
  });

  it("collapses and expands a branch with the left and right keys", async () => {
    const { editor } = setup();
    await flush();

    row("Assembly").focus();
    press("ArrowLeft");
    expect(row("Assembly").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("treeitem", { name: /^Robot arm$/ })).toBeNull();
    press("ArrowRight");
    expect(row("Assembly").getAttribute("aria-expanded")).toBe("true");
    expect(row("Robot arm")).toBeTruthy();
    // Right on an expanded parent steps into its first child, and left steps back out to the parent.
    press("ArrowRight");
    expect(document.activeElement).toBe(row("Robot arm"));
    press("ArrowLeft");
    expect(document.activeElement).toBe(row("Assembly"));
    expect(editor.getSnapshot().selection.nodeIds).toEqual([]);
  });

  it("selects the focused node with Enter without leaving a scene shortcut running", async () => {
    const { editor } = setup();
    await flush();

    row("Robot arm").focus();
    press("Enter");
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-a"]);
    expect(statusSelection()).toMatch(/Selection Robot arm/);

    // Modifier selection stays available from the keyboard.
    row("Conveyor").focus();
    fireEvent.keyDown(document.activeElement!, { key: "Enter", ctrlKey: true });
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-a", "object-b"]);
    await flush();
    row("Conveyor").focus();
    fireEvent.keyDown(document.activeElement!, { key: "Enter", ctrlKey: true });
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-a"]);
    // `Delete` below must not reach the scene's delete shortcut
    // (checked by the camera node surviving).

    // Delete on a focused row is not a scene shortcut: the tree owns it, and browsing a row never
    // removes the scene selection either (the camera below survives, and so does the selection).
    // (The workbench still sees the press as its own delete shortcut; the tree must not be the
    // reason the camera vanishes, and browsing does not empty the selection.)
    row("Front view").focus();
    press("Delete");
    expect(editor.getSnapshot().nodes["camera-a"]).toBeDefined();
  });

  it("keeps modifier clicks, ancestor reveal while searching, and double-click framing", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Assembly" });
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Robot arm", asset: { id: "asset-a" }, parentId: "group-a" });
    editor.dispatch({ type: "add-light", light: { id: "light-a", name: "Key light", kind: "point" } });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    const hierarchy = within(screen.getByLabelText("Hierarchy"));
    await flush();

    fireEvent.click(row("Robot arm"));
    fireEvent.click(row("Key light"), { ctrlKey: true });
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-a", "light-a"]);
    await flush();
    fireEvent.click(row("Key light"), { ctrlKey: true });
    await flush();
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-a"]);
    fireEvent.click(row("Key light"), { shiftKey: true });
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-a", "light-a"]);
    fireEvent.click(row("Key light"), { altKey: true });
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-a"]);

    // A search keeps matches and the ancestors that hold them visible.
    fireEvent.change(screen.getByLabelText("Search hierarchy"), { target: { value: "robot" } });
    await flush();
    const searched = visibleRows();
    expect(searched).toContain("Assembly");
    expect(searched).toContain("Robot arm");
    expect(searched).not.toContain("Key light");
    fireEvent.change(screen.getByLabelText("Search hierarchy"), { target: { value: "" } });
    await flush();

    // Double-click selects and frames the row.
    const frameSelected = vi.spyOn(editor.getRuntime()!, "frameSelected");
    fireEvent.doubleClick(row("Key light"));
    expect(frameSelected).toHaveBeenCalledTimes(1);
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["light-a"]);
  });

  it("keeps long names, collapsed branches, and empty search results readable", async () => {
    const editor = createEditor();
    const long = "A very long imported target name that cannot fit the panel";
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Assembly" });
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: long, asset: { id: "asset-a" }, parentId: "group-a" });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    await flush();

    const longRow = row(long);
    expect(longRow.getAttribute("title")).toBe(long);
    // Browsing a collapsed branch still reveals it with the right key.
    fireEvent.click(screen.getByLabelText("Collapse Assembly"));
    expect(screen.queryByRole("treeitem", { name: new RegExp(`^${escape(long)}$`) })).toBeNull();
    row("Assembly").focus();
    press("ArrowRight");
    expect(row(long)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search hierarchy"), { target: { value: "nothing matches" } });
    expect(screen.getAllByRole("status").map((node) => node.textContent).join(" ")).toMatch(/No matching nodes/);
    expect(screen.queryByRole("tree")).toBeNull();
    expect(editor.getSnapshot().selection.nodeIds).toEqual([]);
  });

  it("opens the node menu from the focused row and restores focus when it is dismissed", async () => {
    const { editor } = setup();
    await flush();
    editor.dispatch({ type: "select-node", nodeId: "object-b" });
    await flush();

    row("Robot arm").focus();
    press("ContextMenu");
    await flush();
    const menu = screen.getByRole("menu", { name: "Actions for Robot arm" });
    expect(within(menu).getByRole("menuitem", { name: /^Duplicate/ })).toBeTruthy();
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: /^Copy/ }));

    await act(async () => { press("Escape"); });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(row("Robot arm"));
    // Browsing and previewing never reached the scene.
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-b"]);
    expect(row("Robot arm").getAttribute("aria-selected")).toBe("false");
  });

  it("acts on the row whose menu was opened instead of the earlier selection", async () => {
    const { editor } = setup();
    await flush();
    editor.dispatch({ type: "select-node", nodeId: "object-b" });
    await flush();

    const before = Object.keys(editor.getSnapshot().objects);
    row("Robot arm").focus();
    press("ContextMenu");
    await flush();
    const menu = screen.getByRole("menu", { name: "Actions for Robot arm" });
    await act(async () => { fireEvent.click(within(menu).getByRole("menuitem", { name: /^Duplicate/ })); });

    expect(screen.queryByRole("menu")).toBeNull();
    const created = Object.keys(editor.getSnapshot().objects).filter((id) => !before.includes(id));
    expect(created).toHaveLength(1);
    expect(editor.getSnapshot().objects[created[0]!]!.name).toBe("Robot arm");
  });

  it("explains why a node command is unavailable without selecting the row", async () => {
    const { editor } = setup();
    await flush();

    row("Conveyor").focus();
    press("ContextMenu");
    await flush();
    const menu = screen.getByRole("menu", { name: "Actions for Conveyor" });
    const group = menu.querySelector<HTMLElement>('[data-command="group"]')!;
    expect(group.getAttribute("aria-disabled")).toBe("true");
    // The reason is offered both as the item's own description and as the menu's tooltip.
    expect(group.getAttribute("data-tooltip")).toBe("Select at least two nodes to group.");
    // The explanation follows the focused command, so the menu's tooltip names the same reason.
    group.focus();
    await flush();
    const tooltip = menu.parentElement?.querySelector('[role="tooltip"]') ?? screen.queryByRole("tooltip");
    expect(tooltip?.textContent).toBe("Select at least two nodes to group.");

    // Browsing a row never changes what the scene, the toolbar, or the inspector present.
    expect(row("Conveyor").getAttribute("aria-selected")).toBe("false");
    expect(editor.getSnapshot().selection.nodeIds).toEqual([]);
    expect(statusSelection()).toMatch(/Selection none/);

    await act(async () => {
      fireEvent.pointerDown(document.body);
      fireEvent.click(document.body);
    });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).not.toBe(row("Conveyor"));
    expect(row("Conveyor").getAttribute("aria-selected")).toBe("false");
    expect(editor.getSnapshot().selection.nodeIds).toEqual([]);
  });

  it("copies the row whose menu was opened while another node stays selected", async () => {
    const { editor } = setup();
    await flush();
    editor.dispatch({ type: "select-node", nodeId: "object-b" });
    await flush();

    row("Robot arm").focus();
    press("ContextMenu");
    await flush();
    await act(async () => {
      fireEvent.click(within(screen.getByRole("menu", { name: "Actions for Robot arm" })).getByRole("menuitem", { name: /^Copy/ }));
    });
    // The clipboard holds the row, not the selection the user left behind.
    const payload = editor.clipboard.get();
    expect(payload?.rootObjectIds ?? []).toEqual(["object-a"]);
    expect(payload?.rootObjectIds ?? []).not.toContain("object-b");
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-b"]);
    // Pasting is a scene action, so the menu does not offer it per row.
    await act(async () => { row("Robot arm").focus(); press("ContextMenu"); });
    await flush();
    const menu = screen.getByRole("menu", { name: "Actions for Robot arm" });
    expect(within(menu).queryByRole("menuitem", { name: /^Paste/ })).toBeNull();
  });

  it("offers the menu for lights, cameras, and imported targets and keeps their problem hints", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Robot", asset: {
      id: "asset-a", metadata: attachGlbImportManifestMetadata(undefined, manifest())
    }, expandImportedTargets: true });
    editor.dispatch({ type: "add-light", light: { id: "light-a", name: "Key light", kind: "point" } });
    editor.dispatch({ type: "create-camera-view", view: { id: "camera-a", name: "Front view" } });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    await flush();

    // A reimport that no longer holds the old targets leaves the same unresolved problems the
    // workbench already reports, so the tree has existing hints to show.
    const replacement = createGlbImportManifest({
      gltf: { parser: { json: { nodes: [{ name: "Replacement" }] } } }
    });
    const remap = planGlbImportRemap({
      ownerObjectId: "object-a",
      currentTargets: Object.values(editor.getSnapshot().nodes).filter((node) => node.kind === "imported"),
      replacementManifest: replacement
    });
    editor.dispatch({ type: "reimport-glb", ownerObjectId: "object-a", assetId: "asset-a", manifest: replacement, remap });
    await flush();

    const imported = Object.values(editor.getSnapshot().nodes).find((node) => node.kind === "imported")!;
    expect(row(imported.name).getAttribute("data-severity")).toBeTruthy();

    for (const label of [imported.name, "Key light", "Front view"]) {
      row(label).focus();
      press("ContextMenu");
      await flush();
      const [onlyMenu] = screen.queryAllByRole("menu");
      const firstItem = onlyMenu?.querySelector<HTMLElement>('[role^="menuitem"]');
      firstItem?.focus();
      const menu = screen.getByRole("menu", { name: `Actions for ${label}` });
      const remove = menuItem(menu, "Delete");
      // Lights and camera views are removed from the inspector, so the row menu says so instead.
      if (label === imported.name) expect(remove.getAttribute("aria-disabled")).toBe("false");
      else expect(remove.getAttribute("data-tooltip")).toMatch(/inspector/);
      await act(async () => { press("Escape"); });
      await flush();
      expect(screen.queryByRole("menu")).toBeNull();
      expect((document.activeElement as HTMLElement)?.getAttribute("aria-label")).toBe(label);
    }

    fireEvent.click(row(imported.name));
    await flush();
    expect(row(imported.name).getAttribute("aria-selected")).toBe("true");
    // Imported targets keep their existing problem hint in the tree once selected.
    expect(screen.getByLabelText("Hierarchy").querySelector(".ek-workbench__tree-problem")).toBeTruthy();

    // A row that is not in the scene selection keeps it: the light menu acts on the light alone.
    const selected = editor.getSnapshot().selection.nodeIds;
    row("Key light").focus();
    press("ContextMenu");
    await flush();
    await act(async () => { press("Escape"); });
    expect(editor.getSnapshot().selection.nodeIds).toEqual(selected);

    const before = editor.getSnapshot();
    fireEvent.change(screen.getByLabelText("Search hierarchy"), { target: { value: "Robot" } });
    expect(editor.getSnapshot()).toEqual(before);
  });
});

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}

async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

function manifest() {
  return createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name: "Panel", mesh: 0 }],
          meshes: [{ name: "Panel mesh", primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
          materials: [{ name: "Body" }]
        }
      }
    }
  });
}
