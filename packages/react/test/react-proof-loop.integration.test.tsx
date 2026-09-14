import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Group } from "three";
import { describe, expect, it } from "vitest";
import { AssetResolverBridge, createEditor, resolveDefaultPresentationView, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import { App as ReactProofLoopApp } from "../../../examples/react-proof-loop/src/App";

describe("React proof-loop parity", () => {
  it("renders a restored core snapshot without React-local editor behavior", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture" } });
    editor.registerAsset({ id: "hdr-a", kind: "hdr" });
    editor.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });
    editor.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { color: "#ffffff", textures: { map: { assetId: "texture-a" } } }
    });
    editor.dispatch({
      type: "set-environment",
      environment: {
        lighting: { source: { kind: "hdr", assetId: "hdr-a" }, intensity: 1, rotation: { x: 0, y: 0, z: 0 } },
        background: { source: { kind: "hdr", assetId: "hdr-a" } }
      }
    });
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    editor.dispatch({ type: "update-light", lightId: "light-a", patch: { intensity: 2 } });
    editor.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [6, 0, 0] } });
    editor.dispatch({
      type: "create-camera-view",
      view: {
        id: "hero-view",
        name: "Hero view",
        projection: { kind: "perspective", fov: 45 },
        position: [3, 2, 6],
        target: [0, 0, 0],
        near: 0.1,
        far: 200
      }
    });
    editor.dispatch({ type: "set-default-camera-view", viewId: "hero-view" });
    const restored = createEditor({ snapshot: editor.serialize() });

    render(
      <EditorWorkbench
        editor={restored}
        resolver={new AssetResolverBridge((asset) => asset.kind === "glb" ? { uri: "/box.glb" } : null)}
        loader={{ load: async () => new Group() }}
        rendererFactory={fakeRenderer}
        status={({ runtimeProblems }) => <span>Runtime problems {runtimeProblems.length}</span>}
      />
    );
    await act(async () => {
      await restored.getRuntime()?.project();
    });

    expect(restored.getSnapshot().objects["object-a"].transform.position).toEqual([6, 0, 0]);
    expect(restored.getSnapshot().materials.definitions["material:object:object-a"].override.textures?.map?.assetId).toBe("texture-a");
    expect(restored.getSnapshot().environment.lighting.source).toEqual({ kind: "hdr", assetId: "hdr-a" });
    expect(restored.getSnapshot().lights["light-a"].intensity).toBe(2);
    expect(resolveDefaultPresentationView(restored.getSnapshot())).toMatchObject({
      status: "resolved",
      defaultCameraId: "hero-view",
      view: { id: "hero-view", name: "Hero view" }
    });
    expect(restored.getRuntime()?.getObject("object-a")).toBeTruthy();
    expect(restored.getRuntime()?.getProblems()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "material-texture-asset-unresolved", assetId: "texture-a" }),
      expect.objectContaining({ code: "environment-asset-unresolved", assetId: "hdr-a", metadata: { role: "background" } }),
      expect.objectContaining({ code: "environment-asset-unresolved", assetId: "hdr-a", metadata: { role: "environment" } })
    ]));
    expect(await screen.findByText("Runtime problems 3")).toBeTruthy();
    expect(JSON.stringify(restored.serialize())).not.toContain("material-texture-asset-unresolved");
    expect(JSON.stringify(restored.serialize())).not.toContain("environment-asset-unresolved");
  });

  it("uses the package default workbench as the local starter proof", async () => {
    const restoreDownloadCapture = installDownloadCapture();
    try {
      render(<ReactProofLoopApp rendererFactory={fakeRenderer} loader={fakeLoader} />);
      await act(async () => undefined);

      const toolbar = screen.getByLabelText("Editor controls");
      const viewport = screen.getByLabelText("3D viewport");
      expect(within(toolbar).getByRole("button", { name: "Export" })).toBeTruthy();
      expect(within(viewport).getByRole("button", { name: "Move", exact: true }).getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(within(viewport).getByRole("button", { name: "Node operations" }));
      expect((within(viewport).getByRole("button", { name: "Duplicate" }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });

      const projectPanel = screen.getByLabelText("Project panel");
      const hierarchy = within(projectPanel).getByLabelText("Hierarchy");
      expect(hierarchy.textContent).toContain("No scene nodes");
      expect(screen.getByTestId("starter-overlay").textContent).toContain("0 objects");
      expect(screen.getByTestId("starter-overlay").textContent).toContain("0 assets");
      expect(screen.getByText("Selection none")).toBeTruthy();

      await act(async () => {
        const importInput = within(projectPanel).getByLabelText("Import assets") as HTMLInputElement;
        const file = await glbFixtureFile("simple-box.glb");
        fireEvent.change(importInput, { target: { files: [file] } });
      });
      await waitFor(() => expect(within(hierarchy).getByText("simple-box")).toBeTruthy());
      expect(screen.getByTestId("starter-overlay").textContent).toContain("1 objects");
      expect(screen.getByTestId("starter-overlay").textContent).toContain("1 assets");

      await act(async () => {
        fireEvent.click(within(hierarchy).getByText("simple-box"));
      });
      await waitFor(() => expect(screen.getByText("Selection simple-box")).toBeTruthy());

      await act(async () => {
        await clickButton("Capture view");
      });
      await waitFor(() => expect(screen.getAllByText("Camera view 1").length).toBeGreaterThan(0));
      await act(async () => {
        await clickButton("Set default");
      });
      expect(screen.getByText(/Default/)).toBeTruthy();
      await act(async () => {
        await clickButton("Apply view");
      });

      await act(async () => {
        await clickButton("Snap move");
      });
      expect(within(viewport).getByRole("button", { name: "Snap move" }).getAttribute("aria-pressed")).toBe("true");

      fireEvent.change(screen.getByLabelText("Language"), { target: { value: "zh-CN" } });
      await waitFor(() => expect(screen.getByLabelText("编辑器控件")).toBeTruthy());
      expect(screen.getByText("选择 simple-box")).toBeTruthy();

      const positionX = getFieldInput("位置 X") as HTMLInputElement;
      fireEvent.change(positionX, { target: { value: "2" } });
      fireEvent.blur(positionX);
      await act(async () => undefined);
      await waitFor(() => expect(screen.getByText(/撤销 [1-9]/)).toBeTruthy());

      await act(async () => {
        await clickButton("撤销");
      });
      expect(screen.getByText(/重做 [1-9]/)).toBeTruthy();
      await act(async () => {
        await clickButton("重做");
      });

      const baseColorInput = getFieldInput("基础色") as HTMLInputElement;
      fireEvent.change(baseColorInput, { target: { value: "#00aa88" } });
      await act(async () => undefined);
      await waitFor(() => expect(screen.getByText("未保存")).toBeTruthy());

      await act(async () => {
        await clickButton("副本");
      });
      const localizedProjectPanel = screen.getByLabelText("项目面板");
      await waitFor(() => expect(localizedProjectPanel.textContent).toContain("对象2"));
      expect(screen.getByTestId("starter-overlay").textContent).toContain("2 objects");

      await act(async () => {
        await clickButton("导出部分");
      });
      await waitFor(() => expect(screen.getByText(/已导出/)).toBeTruthy());
      await waitFor(() => expect(window.__lastDownloadedProject).toBeInstanceOf(Uint8Array));
      expect(JSON.stringify(window.__lastDownloadedProject)).not.toContain("asset-unresolved");
      expect(JSON.stringify(window.__lastDownloadedProject)).not.toContain("zh-CN");
      expect(JSON.stringify(window.__lastDownloadedProject)).not.toContain("缺少载荷");

      await act(async () => {
        const bytes = window.__lastDownloadedProject;
        expect(bytes).toBeInstanceOf(Uint8Array);
        const openInput = toolbar.querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File([copyBytes(bytes!)], "starter.ek3d", { type: "application/octet-stream" });
        fireEvent.change(openInput, { target: { files: [file] } });
      });
      await waitFor(() => expect(screen.getByText("已打开 starter.ek3d")).toBeTruthy());
      await waitFor(() => expect(screen.getAllByText("Camera view 1").length).toBeGreaterThan(0));
      expect(screen.getAllByText(/默认/).length).toBeGreaterThan(0);
      expect(screen.getByTestId("starter-overlay").textContent).toContain("2 objects");
      expect(JSON.stringify(window.__lastDownloadedProject)).not.toContain("Blob");
    } finally {
      restoreDownloadCapture();
    }
  }, 20000);
});

async function clickButton(name: string): Promise<void> {
  const command = [...document.querySelectorAll<HTMLButtonElement>("button[aria-label]")]
    .find((button) => button.getAttribute("aria-label") === name);
  const panel = command?.closest<HTMLElement>("[hidden][id]");
  if (panel) {
    fireEvent.click(document.querySelector(`[aria-controls="${panel.id}"]`)!);
    await act(async () => undefined);
  }
  const button = screen.getAllByRole("button", { name }).at(-1);
  expect(button, `Expected button ${name}`).toBeTruthy();
  fireEvent.click(button!);
  await act(async () => undefined);
}

function getFieldInput(label: string): HTMLInputElement {
  const field = screen.getAllByText(label).at(-1)?.closest("label")?.querySelector("input");
  expect(field, `Expected input for ${label}`).toBeTruthy();
  return field as HTMLInputElement;
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}

const fakeLoader = {
  load: async () => new Group()
};

function installDownloadCapture(): () => void {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = ((blob: Blob) => {
    void blob.arrayBuffer().then((buffer) => {
      window.__lastDownloadedProject = new Uint8Array(buffer);
    });
    return "blob:starter-project";
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  HTMLAnchorElement.prototype.click = () => undefined;

  return () => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    HTMLAnchorElement.prototype.click = originalAnchorClick;
    delete window.__lastDownloadedProject;
  };
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function glbFixtureFile(fileName = "recovered.glb"): Promise<File> {
  const here = dirname(fileURLToPath(import.meta.url));
  const bytes = await readFile(resolve(here, "../../core/test/fixtures/simple-box.glb"));
  return new File([toArrayBuffer(bytes)], fileName, { type: "model/gltf-binary" });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

declare global {
  interface Window {
    __lastDownloadedProject?: Uint8Array;
  }
}
