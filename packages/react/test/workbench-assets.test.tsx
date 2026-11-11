import { AssetResolverBridge, createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

const fakeRenderer: () => RendererLike = () => {
  const canvas = document.createElement("canvas");
  return {
    domElement: canvas,
    setSize(width: number, height: number) {
      canvas.width = width;
      canvas.height = height;
    },
    render() {},
    dispose() {}
  };
};

function openAssetsView(label = "Assets"): void {
  const button = [...screen.getAllByRole("button")]
    .find((candidate) => (candidate.getAttribute("aria-label") ?? "").startsWith(`${label} `));
  expect(button, `Expected navigation button ${label}`).toBeTruthy();
  fireEvent.click(button!);
}

/** The row that carries an asset's own controls: the list item holding its details disclosure. */
function assetRow(assetLabel: string, detailsToggle = /details for/): HTMLElement {
  const rows = [...screen.getAllByRole("button", { name: detailsToggle })]
    .map((button) => button.closest("li"))
    .filter((row): row is HTMLElement => row !== null && (row.textContent ?? "").includes(assetLabel));
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

describe("React asset workspace row interactions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.removeItem("ek-aiot.workbench.locale");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps details collapsed until the summary disclosure expands them", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "image-a", kind: "image", label: "Hero image", source: new Uint8Array([1, 2]) } });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    openAssetsView();

    const row = assetRow("Hero image");
    const toggle = within(row).getByRole("button", { name: "Show details for Hero image" });
    const detailsId = toggle.getAttribute("aria-controls")!;
    const details = () => document.getElementById(detailsId) as HTMLElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(details()).toBeTruthy();
    expect(details().hidden).toBe(true);
    expect(details().hasAttribute("hidden")).toBe(true);
    // The file action stays reachable in the DOM so its label stays unique whether open or closed.
    expect(within(row).getByLabelText("Replace Hero image")).toBeTruthy();

    fireEvent.click(toggle);
    expect(within(row).getByRole("button", { name: "Hide details for Hero image" }).getAttribute("aria-expanded")).toBe("true");
    expect(details().hidden).toBe(false);
    expect(details().textContent).toContain("Payload");
    expect(details().textContent).toContain("No scene references");
    expect(within(details()).getByText("2")).toBeTruthy();

    fireEvent.click(within(row).getByRole("button", { name: "Hide details for Hero image" }));
    expect(details().hidden).toBe(true);
  });

  it("opens the row menu and runs the row's own file action", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "image-a", kind: "image", label: "Manual label", source: new Uint8Array([1]) } });
    const replaceAsset = vi.spyOn(editor, "replaceAsset");
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    openAssetsView();

    const row = assetRow("Manual label");
    const openButton = within(row).getByRole("button", { name: "Asset actions for Manual label" });
    expect(openButton.getAttribute("aria-haspopup")).toBe("menu");
    expect(openButton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(openButton);
    expect(openButton.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu", { name: "Asset actions for Manual label" });
    expect(within(menu).getByRole("menuitem", { name: /Replace file/ })).toBeTruthy();

    // The menu routes to the row's single maintenance input instead of duplicating it.
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Replace file/ }));
    expect(screen.queryByRole("menu")).toBeNull();
    const detailsId = within(row).getByRole("button", { name: "Hide details for Manual label" }).getAttribute("aria-controls")!;
    expect(document.getElementById(detailsId)!.hidden).toBe(false);

    const input = within(row).getByLabelText("Replace Manual label");
    expect(document.activeElement).toBe(input);
    // Routing must also work when the details are already expanded.
    fireEvent.click(openButton);
    fireEvent.click(screen.getByRole("menuitem", { name: /Replace file/ }));
    expect(document.activeElement).toBe(input);

    fireEvent.click(openButton);
    fireEvent.click(screen.getByRole("menuitem", { name: "Hide details for Manual label" }));
    expect(document.activeElement).toBe(openButton);
    fireEvent.click(openButton);
    fireEvent.click(screen.getByRole("menuitem", { name: "Show details for Manual label" }));
    expect(document.activeElement).toBe(openButton);
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([2])], "next.png", { type: "image/png" })] } });
    await act(async () => {
      await vi.waitFor(() => expect(replaceAsset).toHaveBeenCalledWith(expect.objectContaining({ assetId: "image-a", label: "next.png" })));
    });
    await vi.waitFor(() => expect(within(assetRow("Manual label")).getByText("Replaced with next.png")).toBeTruthy());
  });

  it("lists the file action for a registered asset and restores focus on Escape", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "sounds", kind: "image", label: "Detached image" } });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    openAssetsView();

    const row = assetRow("Detached image");
    // A registered asset always accepts a replacement file, so the menu lists it.
    fireEvent.click(within(row).getByRole("button", { name: "Asset actions for Detached image" }));
    expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: /Replace file/ })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(within(row).getByRole("button", { name: "Asset actions for Detached image" }));
  });

  it("summarizes mixed import batches and clears the queue without touching assets", async () => {
    const editor = createEditor();
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    openAssetsView();

    fireEvent.change(screen.getByLabelText("Import assets"), {
      target: {
        files: [
          new File([new Uint8Array([1])], "paint.png", { type: "image/png" }),
          new File([new Uint8Array([2])], "notes.txt", { type: "text/plain" })
        ]
      }
    });

    await screen.findByText("1 imported · 1 failed");
    const queue = within(screen.getByLabelText("Asset import queue"));
    expect(queue.getByText(/paint.png/)).toBeTruthy();
    expect(queue.getByText(/notes.txt/)).toBeTruthy();
    expect(Object.values(editor.getSnapshot().assets)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Clear import results" }));
    expect(screen.queryByLabelText("Asset import queue")).toBeNull();
    expect(Object.values(editor.getSnapshot().assets)).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("keeps recovery actions for missing assets that the filters hide", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", label: "Recovery box" } });
    render(
      <EditorWorkbench
        editor={editor}
        resolver={new AssetResolverBridge(() => null)}
        rendererFactory={fakeRenderer}
        rightPanel={() => null}
      />
    );
    await act(async () => { await editor.getRuntime()?.project(); });
    openAssetsView();

    const visibleRecovery = within(assetRow("Recovery box")).getByLabelText("Missing asset recovery");
    expect((visibleRecovery.querySelector("input") as HTMLInputElement)).toBeTruthy();

    // A filter that hides the row must not take its repair action away with it.
    fireEvent.change(screen.getByLabelText("Search assets"), { target: { value: "no such payload" } });
    expect(screen.getByText("No matching assets. Adjust search or filters.")).toBeTruthy();
    const hiddenRecovery = screen.getByLabelText("Missing asset recovery");
    expect(within(hiddenRecovery).getByText("Hidden by the current filters")).toBeTruthy();
    const input = hiddenRecovery.querySelector("input")!;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1, 2, 3])], "recovered.glb", { type: "model/gltf-binary" })] } });
    await waitFor(() => expect(screen.getByLabelText("Asset recovery status").textContent).toContain("Replaced with recovered.glb"));
    expect(editor.getSnapshot().assets["asset-a"]).toBeTruthy();
  });

  it("localizes the summary disclosure and row menu in zh-CN", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "image-a", kind: "image", label: "主图", source: new Uint8Array([1]) } });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} locale="zh-CN" />);
    openAssetsView("资源");

    const row = assetRow("主图", /的详情/);
    const toggle = within(row).getByRole("button", { name: "展开 主图 的详情" });
    fireEvent.click(toggle);
    expect(within(row).getByRole("button", { name: "收起 主图 的详情" }).getAttribute("aria-expanded")).toBe("true");
    expect(within(row).getByRole("button", { name: "主图 的资源操作" })).toBeTruthy();
  });
});
