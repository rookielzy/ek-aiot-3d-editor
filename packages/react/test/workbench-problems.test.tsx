import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetResolverBridge, createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

/**
 * The problem region is part of the shell, not a dialog: the status line states what the project,
 * the assets, the runtime and the problems are even while the region is closed, closing it clears
 * nothing, and every problem offers exactly the route the workbench can actually take — locate the
 * target it names, or the one file that repairs it.
 */
describe("React workbench problems", () => {
  beforeEach(() => {
    window.localStorage.removeItem("ek-aiot.workbench.locale");
  });

  it("keeps the project, asset, runtime and problem summaries in the status line after the region closes", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    render(<EditorWorkbench editor={editor} resolver={new AssetResolverBridge(() => null)} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    await act(async () => { await editor.getRuntime()?.project(); });

    const status = screen.getByLabelText("Editor status");
    expect(status.textContent).toContain("Project");
    expect(status.textContent).toContain("Assets");
    expect(status.textContent).toContain("Runtime");
    expect(status.textContent).toContain("Problems");
    expect(statusSummary().textContent).toMatch(/\d+ errors · \d+ warnings · \d+ notes/);

    const trigger = screen.getByRole("button", { name: "Problem details" });
    fireEvent.click(trigger);
    const drawer = screen.getByRole("region", { name: "Problem details" });
    const reported = drawer.textContent;
    const before = editor.serialize();

    fireEvent.click(within(drawer).getByRole("button", { name: "Close details" }));

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    // The status line still states the same problems, and closing the region cleared nothing.
    expect(statusSummary().textContent).toMatch(/\d+ errors · \d+ warnings · \d+ notes/);
    expect(drawer.textContent).toBe(reported);
    expect(editor.serialize()).toEqual(before);
  });

  it("keeps the scene editable while the region is open", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);

    const trigger = screen.getByRole("button", { name: "Problem details" });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const objects = Object.keys(editor.getSnapshot().objects).length;

    // A real editing control, reached with the region open: the shell never takes the scene away.
    const viewport = within(screen.getByLabelText("3D viewport"));
    fireEvent.click(viewport.getByRole("button", { name: "Node operations" }));
    await act(async () => { await Promise.resolve(); });
    const menu = screen.getByRole("menu", { name: "Node operations" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Duplicate/ }));

    expect(Object.keys(editor.getSnapshot().objects)).toHaveLength(objects + 1);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("states each problem's severity, source, target and detail, and only offers actions it can take", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-group", groupId: "keep", name: "Keep me" });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);

    // Opening a damaged package reports a problem about the project itself: nothing to locate in
    // the scene or the asset list, so the region must not invent an action for it.
    fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
    const file = new File(["invalid"], "broken.ek3d");
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("invalid").buffer });
    fireEvent.change(screen.getByLabelText("Open project package"), { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: "Problem details" }));
    const drawer = screen.getByRole("region", { name: "Problem details" });
    await waitFor(() => expect(drawer.textContent).toContain("Project Archive Invalid"));

    const row = problemRow(drawer, "Project Archive Invalid");
    expect(row.textContent).toContain("Severity");
    expect(row.textContent).toContain("error");
    expect(row.textContent).toContain("Source");
    expect(row.textContent).toContain("validation");
    expect(row.textContent).toContain("Target · Scene");
    expect(row.textContent).toContain("Detail");
    expect(within(row).queryByRole("button", { name: "Locate" })).toBeNull();
    expect(within(row).queryByLabelText("Replace asset")).toBeNull();
  });

  it("locates a problem about a scene node and closes the region", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "point-a", kind: "point", name: "Key light", shadow: { enabled: true } } });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    await act(async () => { await editor.getRuntime()?.project(); });

    const trigger = screen.getByRole("button", { name: "Problem details" });
    fireEvent.click(trigger);
    const drawer = screen.getByRole("region", { name: "Problem details" });
    const row = problemRow(drawer, "Target · Light");
    fireEvent.click(within(row).getByRole("button", { name: "Locate" }));

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    const hierarchy = screen.getByRole("region", { name: "Hierarchy" });
    // The press lands on the light's own row, selected, with the keyboard focus there.
    const lightRow = within(hierarchy).getByRole("treeitem", { name: /Key light/ });
    expect(document.activeElement).toBe(lightRow);
    expect(lightRow.getAttribute("aria-selected")).toBe("true");
  });

  it("locates an asset problem in the asset workspace and moves the region's target there", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const urls = mockObjectUrls();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<EditorWorkbench editor={editor} resolver={new AssetResolverBridge(() => null)} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    await act(async () => { await editor.getRuntime()?.project(); });

    // A payload the package cannot carry is a problem about the asset, so exporting reports it.
    fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Export", exact: true }));

    fireEvent.click(screen.getByRole("button", { name: "Problem details" }));
    const drawer = screen.getByRole("region", { name: "Problem details" });
    await waitFor(() => expect(problemRows(drawer).some((item) => item.textContent?.includes("Target · Asset"))).toBe(true));

    const row = problemRow(drawer, "Target · Asset");
    fireEvent.click(within(row).getByRole("button", { name: "Locate" }));

    // The asset workspace is in front of the user, focused on the asset the problem named.
    const assets = screen.getByRole("region", { name: "Assets" });
    const assetControls = within(assets).getAllByRole("button", { name: /asset-a/ });
    expect(assetControls).toContain(document.activeElement);
    urls.restore();
  });

  it("reports the real result of a recovery and updates the summary afterwards", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    render(<EditorWorkbench editor={editor} resolver={new AssetResolverBridge(() => null)} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    await act(async () => { await editor.getRuntime()?.project(); });

    const status = screen.getByLabelText("Editor status");
    fireEvent.click(screen.getByRole("button", { name: "Problem details" }));
    const drawer = screen.getByRole("region", { name: "Problem details" });
    const input = within(drawer).getByLabelText("Replace asset");
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1, 2, 3])], "recovered.glb", { type: "model/gltf-binary" })] } });

    // The result names the file that was actually applied, and the region reports it as a status.
    const results = await within(drawer).findByRole("status", { name: "Recovery results" });
    await waitFor(() => expect(results.textContent).toContain("Replaced with recovered.glb"));
    // The repaired problem leaves the region and the status summaries, because it is gone.
    expect(drawer.querySelector("input")).toBeNull();
    await waitFor(() => expect(within(status).queryByText(/1 errors/)).toBeNull());
    expect(editor.exportProject().packageBytes).toBeTruthy();
  });

  it("closes on Escape and returns focus to the entry it came from", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    render(<EditorWorkbench editor={editor} resolver={new AssetResolverBridge(() => null)} rendererFactory={fakeRenderer} rightPanel={() => null} />);
    await act(async () => { await editor.getRuntime()?.project(); });

    const trigger = screen.getByRole("button", { name: "Problem details" });
    fireEvent.click(trigger);
    const drawer = screen.getByRole("region", { name: "Problem details" });
    fireEvent.keyDown(within(drawer).getByRole("button", { name: "Close details" }), { key: "Escape" });

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
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

function problemRows(drawer: HTMLElement): HTMLElement[] {
  return within(drawer).getAllByRole("listitem");
}

/**
 * The severity summary is stated twice by design — once in the status line, once at the head of the
 * open region — so read the one that is on screen.
 */
function statusSummary(): HTMLElement {
  const [summary, ...rest] = screen.getAllByText(/\d+ errors · \d+ warnings · \d+ notes/).filter((element) => !element.closest("[hidden]"));
  expect(rest).toHaveLength(0);
  return summary;
}

function problemRow(drawer: HTMLElement, ...texts: string[]): HTMLElement {
  const row = problemRows(drawer).find((item) => texts.every((text) => item.textContent?.includes(text)));
  expect(row, `a problem row containing ${texts.join(" and ")}`).toBeTruthy();
  return row!;
}

function mockObjectUrls(): { restore(): void } {
  let count = 0;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => `blob:react-problems-${count++}`);
  URL.revokeObjectURL = vi.fn();
  return {
    restore() {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  };
}
