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
      render(<ReactProofLoopApp rendererFactory={fakeRenderer} />);
      await act(async () => undefined);

      const toolbar = screen.getByLabelText("Editor controls");
      expect(within(toolbar).getByRole("button", { name: "Export" })).toBeTruthy();
      expect(within(toolbar).getByRole("button", { name: "Move" }).getAttribute("aria-pressed")).toBe("true");
      expect((within(toolbar).getByRole("button", { name: "Duplicate" }) as HTMLButtonElement).disabled).toBe(false);

      const projectPanel = screen.getByLabelText("Project panel");
      const hierarchy = within(projectPanel).getByLabelText("Hierarchy");
      expect(within(hierarchy).getByText("Simple box")).toBeTruthy();
      expect(within(hierarchy).getByText("Recoverable asset")).toBeTruthy();
      expect(within(hierarchy).getByText("Ambient light")).toBeTruthy();
      const assets = within(projectPanel).getByLabelText("Assets");
      expect(assets.textContent).toContain("Recoverable asset");
      expect(assets.textContent).toContain("GLB");
      expect(assets.textContent).toContain("missing payload");
      expect(assets.textContent).toContain("1 refs");
      expect(screen.getByTestId("starter-overlay").textContent).toContain("3 objects");
      expect(screen.getByText("Selection Simple box")).toBeTruthy();

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
      expect(within(toolbar).getByRole("button", { name: "Snap move" }).getAttribute("aria-pressed")).toBe("true");

      fireEvent.change(screen.getByLabelText("Language"), { target: { value: "zh-CN" } });
      await waitFor(() => expect(screen.getByLabelText("编辑器控件")).toBeTruthy());
      const localizedProjectPanel = screen.getByLabelText("项目面板");
      expect(localizedProjectPanel.textContent).toContain("缺少载荷");
      expect(screen.getByText("选择 Simple box")).toBeTruthy();

      const positionX = getFieldInput("Position X") as HTMLInputElement;
      fireEvent.change(positionX, { target: { value: "2" } });
      fireEvent.blur(positionX);
      await act(async () => undefined);
      await waitFor(() => expect(screen.getByText("撤销 3")).toBeTruthy());

      await act(async () => {
        await clickButton("撤销");
      });
      expect(screen.getByText("重做 1")).toBeTruthy();
      await act(async () => {
        await clickButton("重做");
      });

      const baseColorInput = getFieldInput("Base color") as HTMLInputElement;
      fireEvent.change(baseColorInput, { target: { value: "#00aa88" } });
      await act(async () => undefined);
      await waitFor(() => expect(screen.getByText("未保存")).toBeTruthy());

      await act(async () => {
        await clickButton("副本");
      });
      await waitFor(() => expect(localizedProjectPanel.textContent).toContain("对象4"));
      expect(screen.getByTestId("starter-overlay").textContent).toContain("4 objects");

      await act(async () => {
        await clickButton("导出部分");
      });
      expect(screen.getByText(/已导出部分项目/)).toBeTruthy();
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
      expect(screen.getByText(/Default/)).toBeTruthy();

      await waitFor(() => expect(localizedProjectPanel.textContent).toContain("替换资源"));
      expect(localizedProjectPanel.textContent).toContain("1 个问题");

      await act(async () => {
        const recoveryInput = within(localizedProjectPanel).getByLabelText(/替换资源.*Recoverable asset/s) as HTMLInputElement;
        const file = new File([new Uint8Array([1, 2, 3, 4])], "recovered.glb", { type: "model/gltf-binary" });
        fireEvent.change(recoveryInput, { target: { files: [file] } });
      });
      await waitFor(() => expect(localizedProjectPanel.textContent).not.toContain("替换资源"));
      await waitFor(() => expect(screen.getByText("问题 0")).toBeTruthy());
      expect(localizedProjectPanel.textContent).toContain("Recoverable asset");
      expect(JSON.stringify(window.__lastDownloadedProject)).not.toContain("Blob");
    } finally {
      restoreDownloadCapture();
    }
  }, 10000);
});

async function clickButton(name: string): Promise<void> {
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

declare global {
  interface Window {
    __lastDownloadedProject?: Uint8Array;
  }
}
