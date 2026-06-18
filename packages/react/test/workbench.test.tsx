import React, { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Group } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  AssetResolverBridge,
  attachGlbImportManifestMetadata,
  buildAssetWorkspaceModel,
  createGlbImportManifest,
  createMessageDescriptor,
  createEditor,
  filterAssetWorkspaceItems,
  ThreeGltfLoaderAdapter,
  type EditorRuntimeOptions,
  type ProjectProblem,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import { useWorkbench } from "../src/hooks/use-workbench";

describe("React EditorWorkbench", () => {
  it("composes viewport, inspector, and render regions around one core editor", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });

    render(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
        toolbar={({ snapshot }) => <span>Objects {Object.keys(snapshot.objects).length}</span>}
        status={({ inspector }) => <span>Problems {inspector.problems.problems.length}</span>}
      />
    );

    expect(screen.getByText("Objects 1")).toBeTruthy();
    expect(screen.getByText("Problems 0")).toBeTruthy();
    const inspectorPanel = screen.getByLabelText("Inspector panel");
    expect(inspectorPanel.textContent).toContain("Transform");
    expect(inspectorPanel.textContent).toContain("Material");
    expect(inspectorPanel.textContent).toContain("Lights");
  });

  it("lets render-prop extensions dispatch core commands and observe the shared snapshot", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    render(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
        toolbar={({ dispatch, snapshot }) => (
          <>
            <button onClick={() => dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [2, 0, 0] } })}>
              Move object
            </button>
            <span>Position {snapshot.objects["object-a"].transform.position[0]}</span>
          </>
        )}
      />
    );

    fireEvent.click(screen.getByText("Move object"));

    expect(screen.getByText("Position 2")).toBeTruthy();
    expect((screen.getByLabelText("Position X") as HTMLInputElement).value).toBe("2");
  });

  it("exposes advanced operation state and routes shortcuts outside editable controls", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    const { container } = render(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
        toolbar={({ operations, selectionCount, snap }) => (
          <>
            <button onClick={() => operations.duplicate()}>Duplicate</button>
            <span>Selected {selectionCount}</span>
            <span>Translate snap {snap.translate ?? "off"}</span>
            <input aria-label="Toolbar input" />
          </>
        )}
      />
    );
    const root = container.querySelector(".ek-workbench") as HTMLElement;

    expect(screen.getByText("Selected 1")).toBeTruthy();
    fireEvent.keyDown(root, { key: "d", ctrlKey: true });
    expect(Object.keys(editor.getSnapshot().objects)).toHaveLength(3);

    const input = screen.getByLabelText("Toolbar input");
    fireEvent.keyDown(input, { key: "a", ctrlKey: true });
    expect(editor.getSnapshot().selection.objectIds).not.toEqual(["object-a", "object-b"]);

    fireEvent.keyDown(root, { key: "w", ctrlKey: true, altKey: true });
    expect(screen.getByText("Translate snap 0.5")).toBeTruthy();
  });

  it("renders default workbench controls that route transform, snap, camera, and operations through core", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    const runtime = editor.getRuntime();
    const resetCamera = vi.spyOn(runtime!, "resetCamera");
    const frameSelected = vi.spyOn(runtime!, "frameSelected");
    const captureCameraView = vi.spyOn(runtime!, "captureCameraView");
    const applyCameraView = vi.spyOn(runtime!, "applyCameraView");
    const duplicate = vi.spyOn(editor.operations, "duplicate");

    fireEvent.click(screen.getByTitle("Rotate mode"));
    expect(editor.transformMode.get()).toBe("rotate");
    expect(screen.getByTitle("Rotate mode").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTitle("Toggle move snap"));
    expect(editor.snap.get().translate).toBe(0.5);
    expect(screen.getByTitle("Toggle move snap").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTitle("Toggle viewport grid"));
    expect(editor.viewportHelpers.get().visibility.grid).toBe(false);
    expect(screen.getByTitle("Toggle viewport grid").getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByTitle("Toggle viewport floor"));
    expect(editor.viewportHelpers.get().visibility.floor).toBe(true);
    expect(screen.getByTitle("Toggle viewport floor").getAttribute("aria-pressed")).toBe("true");

    for (const title of [
      "Toggle viewport axes",
      "Toggle hover feedback",
      "Toggle selection bounds",
      "Toggle snap feedback",
      "Toggle viewport floor"
    ]) {
      fireEvent.click(screen.getByTitle(title));
      expect(screen.getByTitle(title).getAttribute("aria-pressed")).toBe("false");
    }
    expect(Object.values(editor.viewportHelpers.get().visibility)).toEqual([false, false, false, false, false, false, true, true, false]);

    fireEvent.click(screen.getByTitle("Move mode"));
    expect(Object.values(editor.viewportHelpers.get().visibility)).toEqual([false, false, false, false, false, false, true, true, false]);
    expect(JSON.stringify(editor.serialize())).not.toContain("viewportHelpers");

    fireEvent.click(screen.getByTitle("Reset camera"));
    fireEvent.click(screen.getByTitle("Frame selected"));
    expect(resetCamera).toHaveBeenCalledTimes(1);
    expect(frameSelected).toHaveBeenCalledTimes(1);

    captureCameraView.mockReturnValueOnce({
      ok: true,
      view: {
        id: "view-a",
        name: "Hero",
        projection: { kind: "perspective", fov: 50 },
        position: [1, 2, 3],
        target: [0, 0, 0],
        near: 0.1,
        far: 1000
      }
    });
    fireEvent.click(screen.getByTitle("Capture camera view"));
    expect(editor.getSnapshot().cameras["view-a"]).toBeDefined();
    fireEvent.click(screen.getByTitle("Apply camera view"));
    expect(applyCameraView).toHaveBeenCalledWith(editor.getSnapshot().cameras["view-a"]);

    fireEvent.click(screen.getByTitle("Duplicate selection"));
    expect(duplicate).toHaveBeenCalledTimes(1);
  });

  it("passes decoder-aware loader adapters through to the core runtime", () => {
    const editor = createEditor();
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    const loader = new ThreeGltfLoaderAdapter({ decoders: {} });

    render(<EditorWorkbench editor={editor} loader={loader} rendererFactory={fakeRenderer} />);

    expect(mountRuntime).toHaveBeenCalledWith(expect.objectContaining({ loader }));
  });

  it("imports GLB files through the default asset workspace using the Workbench loader", async () => {
    const editor = createEditor();
    const scene = new Group();
    const loader: EditorRuntimeOptions["loader"] = {
      load: vi.fn(async () => scene),
      analyze: vi.fn(async () => ({ scene }))
    };
    const urls = mockObjectUrls();

    render(<EditorWorkbench editor={editor} loader={loader} rendererFactory={fakeRenderer} />);

    const input = screen.getByLabelText("Import assets") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "robot.glb", { type: "model/gltf-binary" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/Imported asset-/)).toBeTruthy();
    expect(loader.analyze).toHaveBeenCalledWith(expect.objectContaining({
      uri: "blob:react-workbench-0",
      mimeType: "model/gltf-binary"
    }));
    const rows = within(screen.getByLabelText("Asset workspace rows"));
    expect(rows.getByText("robot.glb")).toBeTruthy();
    expect(rows.getByText("GLB")).toBeTruthy();
    expect(Object.values(editor.getSnapshot().objects)[0]).toMatchObject({
      name: "robot",
      asset: { kind: "glb", label: "robot.glb" }
    });
    urls.restore();
  });

  it("keeps failed import queue rows visible while committing successful batch assets", async () => {
    const editor = createEditor();
    const urls = mockObjectUrls();
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);

    const input = screen.getByLabelText("Import assets") as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          new File([new Uint8Array([1])], "paint.png", { type: "image/png" }),
          new File([new Uint8Array([2])], "notes.txt", { type: "text/plain" })
        ]
      }
    });

    await waitFor(() => {
      expect(Object.values(editor.getSnapshot().assets)).toEqual([
        expect.objectContaining({ kind: "texture", label: "paint.png" })
      ]);
      expect(within(screen.getByLabelText("Asset import queue")).getAllByText(/Unsupported asset type/).length).toBeGreaterThan(0);
    });
    expect(within(screen.getByLabelText("Asset import queue")).getByText(/paint.png/)).toBeTruthy();
    expect(Object.values(editor.getSnapshot().assets)).toEqual([
      expect.objectContaining({ kind: "texture", label: "paint.png" })
    ]);
    expect(within(screen.getByLabelText("Asset workspace rows")).getByText("Texture")).toBeTruthy();
    urls.restore();
  });

  it("filters asset rows using core workspace search semantics", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture", label: "Panel paint", source: new Uint8Array([1]) } });
    editor.dispatch({ type: "register-asset", asset: { id: "image-a", kind: "image", label: "Manual label", source: new Uint8Array([2]) } });
    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);

    const expectedIds = filterAssetWorkspaceItems(
      buildAssetWorkspaceModel(editor.getSnapshot(), {
        payloads: editor.getAssetWorkspacePayloads()
      }).items,
      { query: "manual" }
    ).map((item) => item.id);

    act(() => {
      fireEvent.change(screen.getByLabelText("Search assets"), { target: { value: "manual" } });
    });

    expect(expectedIds).toEqual(["image-a"]);
    const rows = within(screen.getByLabelText("Asset workspace rows"));
    expect(rows.getByText("Manual label")).toBeTruthy();
    expect(rows.queryByText("Panel paint")).toBeNull();
  });

  it("reimports GLB assets from the default asset row through core remap API", async () => {
    const editor = createEditor();
    const initialManifest = createWorkbenchManifest();
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      name: "Robot arm",
      asset: {
        id: "asset-a",
        label: "robot.glb",
        source: new Uint8Array([1, 2, 3]),
        metadata: attachGlbImportManifestMetadata(undefined, initialManifest)
      },
      expandImportedTargets: true
    });
    const replacementManifest = withPrimitivePath(createWorkbenchManifest(), "meshes/panel/primitives/0");
    const loader: EditorRuntimeOptions["loader"] = {
      load: vi.fn(async () => new Group()),
      analyze: vi.fn(async () => ({ scene: new Group(), manifest: replacementManifest }))
    };
    const reimport = vi.spyOn(editor, "reimportGlbAsset");
    const urls = mockObjectUrls();

    render(<EditorWorkbench editor={editor} loader={loader} rendererFactory={fakeRenderer} />);
    const project = vi.spyOn(editor.getRuntime()!, "project");
    const projectCallsBeforeReimport = project.mock.calls.length;

    const input = screen.getByLabelText("Reimport robot.glb") as HTMLInputElement;
    const file = new File([new Uint8Array([4, 5, 6])], "robot-v2.glb", { type: "model/gltf-binary" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(reimport).toHaveBeenCalledWith(expect.objectContaining({
        assetId: "asset-a",
        source: file,
        loader
      }));
    });
    expect(await screen.findByText(/remapped/)).toBeTruthy();
    expect(editor.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
    expect(Object.values(editor.getSnapshot().nodes).some((node) =>
      node.kind === "imported" && node.importKey === "glb:object-a/primitive:meshes/panel/primitives/0"
    )).toBe(true);
    expect(project).toHaveBeenCalledTimes(projectCallsBeforeReimport + 2);
    urls.restore();
  });

  it("routes default project open and export controls through core project APIs", async () => {
    const source = createEditor();
    source.dispatch({
      type: "import-glb",
      objectId: "restored-object",
      name: "Restored robot",
      asset: { id: "restored-asset", label: "restored.glb", source: new Uint8Array([1, 2, 3]) }
    });
    const packageBytes = source.exportProject().packageBytes as Uint8Array;
    const editor = createEditor();
    const importProject = vi.spyOn(editor, "importProject");
    const exportProject = vi.spyOn(editor, "exportProject");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);

    const fileInput = document.querySelector(".ek-workbench__file-input") as HTMLInputElement;
    const file = new File([packageBytes], "restored.ek3d", { type: "application/octet-stream" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText("Opened restored.ek3d")).toBeTruthy();
    expect(importProject.mock.calls[0]?.[0]).toBeInstanceOf(Uint8Array);
    expect(screen.getByText("Restored robot")).toBeTruthy();

    fireEvent.click(screen.getByTitle("Export complete project"));

    expect(exportProject).toHaveBeenLastCalledWith({ partial: false });
    expect(await screen.findByText("Exported project")).toBeTruthy();
  });

  it("renders the install-ready default shell when no regions are provided", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Robot arm", asset: { id: "asset-a", label: "robot.glb" } });
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });

    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);

    expect(screen.getByLabelText("Editor controls")).toBeTruthy();
    expect(screen.getByLabelText("Project panel")).toBeTruthy();
    expect(screen.getByLabelText("3D viewport")).toBeTruthy();
    expect(screen.getByLabelText("Inspector panel")).toBeTruthy();
    expect(screen.getByLabelText("Editor status")).toBeTruthy();
    expect(screen.getByText("Hierarchy")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Assets" })).toBeTruthy();
    expect(screen.getByText("Project")).toBeTruthy();
    expect(screen.getByText("Robot arm")).toBeTruthy();
    expect(screen.getByText("robot.glb")).toBeTruthy();
    expect(screen.getByText("Project Partial")).toBeTruthy();
    expect(screen.getByText("Selection none")).toBeTruthy();

    fireEvent.click(screen.getByTitle("Select all"));

    expect(screen.getByText("Selection 2 nodes")).toBeTruthy();
  });

  it("renders representative default Workbench text in Simplified Chinese", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Robot arm", asset: { id: "asset-a", label: "robot.glb" } });

    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} locale="zh-CN" />);

    expect(screen.getByLabelText("编辑器控件")).toBeTruthy();
    expect(screen.getByLabelText("项目面板")).toBeTruthy();
    expect(screen.getByLabelText("3D 视口")).toBeTruthy();
    expect(screen.getByLabelText("检查器面板")).toBeTruthy();
    expect(screen.getByLabelText("编辑器状态")).toBeTruthy();
    expect(screen.getByLabelText("场景检查器")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "层级" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "资源" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "项目" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "变换" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "材质" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "环境" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "灯光" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "相机视图" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "问题" })).toBeTruthy();
    expect(screen.getByText("选择可变换节点以编辑变换。")).toBeTruthy();
    expect(screen.getByText("选择 GLB 对象以编辑材质覆盖。")).toBeTruthy();
    expect(screen.getByText("添加灯光以编辑场景灯光。")).toBeTruthy();
    expect(screen.getByText("捕获相机视图以编写展示状态。")).toBeTruthy();
    expect(screen.getByText("没有运行时问题。")).toBeTruthy();
    expect(screen.getByLabelText("灯光源")).toBeTruthy();
    expect(screen.getByLabelText("添加灯光")).toBeTruthy();
    expect(screen.getByRole("button", { name: "纯色背景" })).toBeTruthy();
    expect(screen.getByTitle("旋转模式")).toBeTruthy();
    expect(screen.getByPlaceholderText("标签、ID、状态、诊断")).toBeTruthy();
    expect(screen.getByText("Robot arm")).toBeTruthy();
    expect(screen.getByText("robot.glb")).toBeTruthy();
    expect(screen.getByText("项目 部分")).toBeTruthy();
    expect(screen.getByText("选择 无")).toBeTruthy();

    fireEvent.click(screen.getByText("Robot arm"));
    expect((screen.getByLabelText("位置 X") as HTMLInputElement).value).toBe("0");
    expect(screen.getByLabelText("基础色")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("不透明度"), { target: { value: "2" } });
    fireEvent.blur(screen.getByLabelText("不透明度"));
    expect(screen.getByText(/输入无效：.*less than or equal to 1/)).toBeTruthy();
    expect(screen.getByText("选择 Robot arm")).toBeTruthy();
  });

  it("uses defaultLocale for uncontrolled initial Workbench copy", () => {
    const editor = createEditor();

    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} defaultLocale="zh-CN" />);

    expect(screen.getByLabelText("编辑器控件")).toBeTruthy();
    expect((screen.getByLabelText("语言") as HTMLSelectElement).value).toBe("zh-CN");
  });

  it("switches uncontrolled locale without changing editor state or helper state", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Robot arm", asset: { id: "asset-a", label: "robot.glb" } });
    const onLocaleChange = vi.fn();

    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} onLocaleChange={onLocaleChange} />);

    fireEvent.click(screen.getByTitle("Rotate mode"));
    fireEvent.click(screen.getByTitle("Toggle viewport grid"));
    const serializedBefore = editor.serialize();

    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "zh-CN" } });

    expect(onLocaleChange).toHaveBeenCalledWith("zh-CN");
    expect(screen.getByTitle("旋转模式").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTitle("切换视口网格").getAttribute("aria-pressed")).toBe("false");
    expect(editor.transformMode.get()).toBe("rotate");
    expect(editor.serialize()).toEqual(serializedBefore);
    expect(JSON.stringify(editor.serialize())).not.toContain("zh-CN");
    expect(JSON.stringify(editor.serialize())).not.toContain("旋转");
  });

  it("supports controlled locale, hidden switch, disabled switch, and host translation override", () => {
    const editor = createEditor();
    const onLocaleChange = vi.fn();
    const { rerender } = render(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
        locale="en"
        showLocaleSwitcher={false}
        translate={(descriptor, locale) =>
          descriptor.key === "reactWorkbench.toolbar.project.open.label" && locale === "zh-CN"
            ? "载入工程"
            : undefined}
        onLocaleChange={onLocaleChange}
        toolbar={({ i18n }) => <span>Custom {i18n.t("reactWorkbench.toolbar.project.open.label")}</span>}
      />
    );

    expect(screen.queryByLabelText("Language")).toBeNull();
    expect(screen.getByText("Custom Open")).toBeTruthy();

    rerender(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
        locale="zh-CN"
        localeSwitcherDisabled
        translate={(descriptor, locale) =>
          descriptor.key === "reactWorkbench.toolbar.project.open.label" && locale === "zh-CN"
            ? "载入工程"
            : undefined}
        onLocaleChange={onLocaleChange}
        toolbar={({ i18n }) => <span>Custom {i18n.t("reactWorkbench.toolbar.project.open.label")}</span>}
      />
    );

    expect(screen.getByText("Custom 载入工程")).toBeTruthy();
    const switcher = screen.getByLabelText("语言") as HTMLSelectElement;
    expect(switcher.disabled).toBe(true);
    fireEvent.change(switcher, { target: { value: "en" } });
    expect(onLocaleChange).not.toHaveBeenCalled();
  });

  it("calls onLocaleChange from an enabled controlled switch without changing host-controlled copy before rerender", () => {
    const editor = createEditor();
    const onLocaleChange = vi.fn();

    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} locale="en" onLocaleChange={onLocaleChange} />);

    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "zh-CN" } });

    expect(onLocaleChange).toHaveBeenCalledWith("zh-CN");
    expect(screen.getByLabelText("Editor controls")).toBeTruthy();
    expect(screen.queryByLabelText("编辑器控件")).toBeNull();
  });

  it("re-resolves completed asset import queue statuses after locale changes", async () => {
    const editor = createEditor();
    const urls = mockObjectUrls();

    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);

    const input = screen.getByLabelText("Import assets") as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array([1])], "paint.png", { type: "image/png" })]
      }
    });

    expect(await screen.findByText(/succeeded · texture · Imported asset-/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "zh-CN" } });

    expect(await screen.findByText(/已成功 · texture · 已导入 asset-/)).toBeTruthy();
    expect(screen.getAllByText("paint.png").length).toBeGreaterThan(0);
    urls.restore();
  });

  it("re-resolves failed recovery statuses after locale changes while preserving raw details", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "texture-a", label: "Broken texture" } });
    const replaceAsset = vi.spyOn(editor, "replaceAsset").mockResolvedValue({
      ok: false,
      problems: [createReplacementProblem()]
    });

    render(
      <EditorWorkbench
        editor={editor}
        resolver={new AssetResolverBridge(() => null)}
        rendererFactory={fakeRenderer}
      />
    );

    await act(async () => {
      await editor.getRuntime()?.project();
    });

    const input = screen.getByLabelText(/Replace asset.*Broken texture/s) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array([1])], "still-broken.png", { type: "image/png" })]
      }
    });

    expect((await screen.findAllByText("Asset could not be resolved")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "zh-CN" } });

    expect((await screen.findAllByText("无法解析资源")).length).toBeGreaterThan(0);
    expect(replaceAsset).toHaveBeenCalledWith(expect.objectContaining({
      assetId: "texture-a",
      label: "still-broken.png"
    }));
  });

  it("localizes asset payload, package, import, diagnostic, and recovery descriptors in zh-CN", async () => {
    const editor = createEditor();
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      name: "Robot arm",
      asset: {
        id: "asset-a",
        label: "robot.glb",
        metadata: attachGlbImportManifestMetadata(undefined, createGlbImportManifest({
          diagnostics: [{
            id: "glb-load-failed",
            severity: "error",
            code: "glb-load-failed",
            target: { kind: "asset", assetId: "asset-a" },
            message: "loader exploded",
            recoverability: "user-action",
            display: {
              title: "GLB failed to load",
              detail: "loader exploded",
              actionLabel: "Replace asset"
            }
          }]
        }))
      }
    });
    editor.dispatch({ type: "register-asset", asset: { id: "unused-image", kind: "image", label: "Unused image" } });

    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} locale="zh-CN" />);

    const rows = within(screen.getByLabelText("资源工作区行"));
    const rowText = rows.getByText("robot.glb").closest("li")!.textContent ?? "";

    expect(rowText).toContain("GLB");
    expect(rowText).toContain("缺失");
    expect(rowText).toContain("阻塞");
    expect(rowText).toContain("失败");
    expect(rowText).toContain("GLB 加载失败");
    expect(rows.getByLabelText("重新导入 robot.glb")).toBeTruthy();
    expect((rows.getByText("Unused image").closest("li")!.textContent ?? "")).toContain("未引用");
  });

  it("renders descriptor-backed missing asset recovery actions in zh-CN", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", label: "Missing box" } });

    render(
      <EditorWorkbench
        editor={editor}
        resolver={new AssetResolverBridge(() => null)}
        rendererFactory={fakeRenderer}
        locale="zh-CN"
      />
    );

    await act(async () => {
      await editor.getRuntime()?.project();
    });

    expect(await screen.findByLabelText("缺失资源恢复")).toBeTruthy();
    expect(screen.getAllByText("替换资源").length).toBeGreaterThan(0);
    expect(screen.getAllByText("无法解析资源").length).toBeGreaterThan(0);
    const inspector = within(screen.getByLabelText("场景检查器"));
    expect(inspector.getByRole("heading", { name: "问题" })).toBeTruthy();
    expect(inspector.getByText("无法解析资源")).toBeTruthy();
    expect(inspector.getByText("资源 asset-a 缺失或不可用。")).toBeTruthy();
    expect(inspector.getByText(/警告 · 资源解析器 · asset-a · 替换资源/)).toBeTruthy();
    expect(JSON.stringify(editor.serialize())).not.toContain("zh-CN");
    expect(JSON.stringify(editor.serialize())).not.toContain("无法解析资源");
  });

  it("does not recreate editor or remount runtime when controlled locale changes", () => {
    const editor = createEditor();
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    const rendererDispose = vi.fn();
    const rendererFactory = (container: HTMLElement) => fakeRenderer(container, rendererDispose);
    const { rerender, unmount } = render(
      <EditorWorkbench editor={editor} rendererFactory={rendererFactory} locale="en" />
    );
    const runtime = editor.getRuntime();

    act(() => {
      rerender(
        <EditorWorkbench editor={editor} rendererFactory={rendererFactory} locale="zh-CN" />
      );
    });

    expect(editor.getRuntime()).toBe(runtime);
    expect(mountRuntime).toHaveBeenCalledTimes(1);
    expect(rendererDispose).not.toHaveBeenCalled();
    expect(editor.disposed).toBe(false);
    expect(screen.getByText("选择 无")).toBeTruthy();

    unmount();
  });

  it("selects hierarchy rows through core node selection and updates inspector and status", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Assembly" });
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Robot arm", asset: { id: "asset-a", label: "robot.glb" }, parentId: "group-a" });

    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);

    fireEvent.click(screen.getByText("Robot arm"));

    expect(editor.getSnapshot().selection.nodeId).toBe("object-a");
    expect(screen.getByText("Selection Robot arm")).toBeTruthy();
    expect((screen.getByLabelText("Position X") as HTMLInputElement).value).toBe("0");
  });

  it("edits material slots through the default Workbench inspector", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      name: "Panel",
      asset: {
        id: "asset-a",
        label: "panel.glb",
        metadata: attachGlbImportManifestMetadata(undefined, createWorkbenchManifest({ twoSlots: true }))
      },
      expandImportedTargets: true
    });
    editor.dispatch({ type: "select-node", nodeId: "object-a" });
    const slotId = getWorkbenchSlotIds(editor)[1]!;

    render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);
    fireEvent.click(screen.getByLabelText(/Screen/));
    fireEvent.change(screen.getByLabelText("Base color"), { target: { value: "#336699" } });

    expect(editor.getSnapshot().materials.assignments[`material-slot:object-a:${slotId}`]).toMatchObject({
      target: { kind: "material-slot", objectId: "object-a", slotId }
    });
    expect(editor.getSnapshot().materials.assignments["object:object-a"]).toBeUndefined();
    expect(JSON.stringify(editor.getSnapshot())).not.toContain("ek-material-target");
  });

  it("supports explicit left/right region overrides while keeping sidePanel compatible", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });

    const { rerender } = render(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
        leftPanel={({ assets, project, snapshot }) => (
          <span>
            Left {Object.keys(snapshot.assets).length}:{project.exportProject().ok ? "exportable" : "blocked"}:{typeof assets.replaceAsset}
          </span>
        )}
        rightPanel={({ inspector }) => <span>Right {inspector.selection.count}</span>}
      />
    );

    expect(screen.getByText("Left 1:blocked:function")).toBeTruthy();
    expect(screen.getByText("Right 0")).toBeTruthy();
    expect(screen.queryByText("Hierarchy")).toBeNull();
    expect(screen.queryByText("Transform")).toBeNull();

    rerender(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
        sidePanel={({ selection, history, transform, camera, problems }) => (
          <span>
            Side {selection.count}:{history.undoCount}:{transform.mode}:{camera.ready ? "ready" : "missing"}:{problems.totalCount}
          </span>
        )}
        rightPanel={({ editor }) => <span>Custom right {editor.disposed ? "disposed" : "usable"}</span>}
      />
    );

    expect(screen.getByText("Side 0:1:translate:ready:0")).toBeTruthy();
    expect(screen.getByText("Custom right usable")).toBeTruthy();
  });

  it("can hide the default toolbar while preserving extension regions", () => {
    const editor = createEditor();

    render(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
        showDefaultToolbar={false}
        toolbar={({ runtimeReady }) => <span>Runtime {runtimeReady ? "ready" : "missing"}</span>}
      />
    );

    expect(screen.queryByTitle("Move mode")).toBeNull();
    expect(screen.getAllByText("Runtime ready").length).toBeGreaterThan(0);
  });

  it("routes light list choices through node selection and exposes node-aware context", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    editor.dispatch({ type: "add-light", light: { id: "light-b", kind: "point" } });

    render(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
        status={({ activeLightId, selectedNodeId, selectedNodeKind, selectedObjectId, selectedLightId }) => (
          <span>
            Active {activeLightId ?? "none"} · Node {selectedNodeId}:{selectedNodeKind} · Object {selectedObjectId ?? "none"} · Light {selectedLightId ?? "none"}
          </span>
        )}
      />
    );

    expect(screen.getByText(/Active none .* Node object-a:object .* Object object-a .* Light none/)).toBeTruthy();

    const pointLightButton = screen.getByLabelText("Inspector panel").querySelector('[data-node-id="light-b"]');
    expect(pointLightButton).toBeTruthy();
    fireEvent.click(pointLightButton as HTMLElement);

    expect(editor.getSnapshot().selection).toMatchObject({
      nodeId: "light-b",
      nodeIds: ["light-b"],
      objectId: null,
      objectIds: []
    });
    expect(screen.getByText(/Active light-b .* Node light-b:light .* Object none .* Light light-b/)).toBeTruthy();
  });

  it("keeps setActiveLightId as a compatibility selector for light nodes only", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });

    render(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
        status={({ setActiveLightId }) => (
          <>
            <button onClick={() => setActiveLightId(null)}>Clear light focus</button>
            <button onClick={() => setActiveLightId("light-a")}>Focus light</button>
          </>
        )}
      />
    );

    fireEvent.click(screen.getByText("Clear light focus"));
    expect(editor.getSnapshot().selection.nodeId).toBe("object-a");

    fireEvent.click(screen.getByText("Focus light"));
    expect(editor.getSnapshot().selection.nodeId).toBe("light-a");

    fireEvent.click(screen.getByText("Clear light focus"));
    expect(editor.getSnapshot().selection.nodeId).toBeNull();
  });

  it("forwards runtime options to the core viewport boundary", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const resolver = new AssetResolverBridge((asset) => asset.kind === "glb" ? { uri: "/box.glb" } : null);
    const loader: EditorRuntimeOptions["loader"] = { load: vi.fn(async () => new Group()) };

    render(<EditorWorkbench editor={editor} resolver={resolver} loader={loader} rendererFactory={fakeRenderer} />);

    await act(async () => {
      await editor.getRuntime()?.project();
    });

    expect(loader.load).toHaveBeenCalledWith(expect.objectContaining({ uri: "/box.glb" }));
  });

  it("forwards interaction options and runtime readiness through workbench", () => {
    const editor = createEditor();
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    const runtimeReady = vi.fn();
    const interactions: EditorRuntimeOptions["interactions"] = {
      camera: { enableDamping: true },
      pointerSelection: true,
      marqueeSelection: { defaultMode: "add" },
      resize: true,
      selectionVisuals: true,
      transform: true
    };
    const { unmount } = render(
      <EditorWorkbench
        editor={editor}
        interactions={interactions}
        onRuntimeReady={runtimeReady}
        rendererFactory={fakeRenderer}
        status={({ runtimeReady }) => <span>Runtime {runtimeReady ? "ready" : "missing"}</span>}
      />
    );

    expect(mountRuntime).toHaveBeenCalledWith(expect.objectContaining({ interactions }));
    expect(runtimeReady).toHaveBeenCalledWith(expect.objectContaining({ disposed: false }));
    expect(screen.getAllByText("Runtime ready").length).toBeGreaterThan(0);

    unmount();

    expect(runtimeReady).toHaveBeenLastCalledWith(null);
    expect(editor.disposed).toBe(false);
  });

  it("keeps marquee selection off by default and enables it from the toolbar", () => {
    const editor = createEditor();
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    const { container, unmount } = render(
      <EditorWorkbench
        editor={editor}
        rendererFactory={fakeRenderer}
      />
    );

    expect(mountRuntime).toHaveBeenCalledWith(expect.objectContaining({
      interactions: expect.objectContaining({
        pointerSelection: true,
        marqueeSelection: false,
        viewportHelpers: true
      })
    }));
    const viewport = container.querySelector(".ek-workbench__viewport");
    expect(viewport).not.toBeNull();
    expect(screen.getByText("Marquee").getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByText("Marquee"));

    expect(screen.getByText("Marquee").getAttribute("aria-pressed")).toBe("true");
    expect(mountRuntime).toHaveBeenLastCalledWith(expect.objectContaining({
      interactions: expect.objectContaining({
        marqueeSelection: true
      })
    }));

    unmount();
  });

  it("exposes runtime problems through built-in UI and render context without serialization", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });

    render(
      <EditorWorkbench
        editor={editor}
        resolver={new AssetResolverBridge(() => null)}
        rendererFactory={fakeRenderer}
        status={({ runtimeProblems }) => <span>Runtime problems {runtimeProblems.length}</span>}
      />
    );

    await act(async () => {
      await editor.getRuntime()?.project();
    });

    expect(await screen.findByText("Runtime problems 1")).toBeTruthy();
    expect(screen.getAllByText("Asset could not be resolved").length).toBeGreaterThan(0);
    expect(JSON.stringify(editor.serialize())).not.toContain("asset-unresolved");
  });

  it("routes problem-panel replacement files through the core project API", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const replaceAsset = vi.spyOn(editor, "replaceAsset");

    render(
      <EditorWorkbench
        editor={editor}
        resolver={new AssetResolverBridge(() => null)}
        rendererFactory={fakeRenderer}
      />
    );

    await act(async () => {
      await editor.getRuntime()?.project();
    });

    const input = document.querySelector(".ek-inspector-file-action input") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "box.glb", { type: "model/gltf-binary" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(replaceAsset).toHaveBeenCalledWith({
      assetId: "asset-a",
      source: file,
      label: "box.glb",
      mimeType: "model/gltf-binary"
    });
  });

  it("surfaces missing asset recovery in the default left panel", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", label: "Missing box" } });
    const replaceAsset = vi.spyOn(editor, "replaceAsset");

    render(
      <EditorWorkbench
        editor={editor}
        resolver={new AssetResolverBridge(() => null)}
        rendererFactory={fakeRenderer}
      />
    );

    await act(async () => {
      await editor.getRuntime()?.project();
    });

    expect(await screen.findByLabelText("Missing asset recovery")).toBeTruthy();
    const recoveryPanel = screen.getByLabelText("Missing asset recovery");
    const input = recoveryPanel.querySelector("input") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "recovered.glb", { type: "model/gltf-binary" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(replaceAsset).toHaveBeenCalledWith({
      assetId: "asset-a",
      source: file,
      label: "recovered.glb",
      mimeType: "model/gltf-binary"
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("Missing asset recovery")).toBeNull();
    });
  });

  it("does not dispose a host-owned editor on unmount", () => {
    const editor = createEditor();
    const { unmount } = render(<EditorWorkbench editor={editor} rendererFactory={fakeRenderer} />);

    unmount();

    expect(editor.disposed).toBe(false);
    expect(editor.getSnapshot().version).toBe(8);
  });

  it("disposes a shell-created editor when the workbench unmounts", async () => {
    let capturedEditor = createEditor();
    const { unmount } = render(
      <EditorWorkbench
        rendererFactory={fakeRenderer}
        toolbar={({ editor }) => {
          capturedEditor = editor;
          return null;
        }}
      />
    );

    unmount();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(capturedEditor.disposed).toBe(true);
  });

  it("balances runtime cleanup under React StrictMode", () => {
    const editor = createEditor();
    const rendererDispose = vi.fn();

    const { unmount } = render(
      <StrictMode>
        <EditorWorkbench editor={editor} rendererFactory={(container) => fakeRenderer(container, rendererDispose)} />
      </StrictMode>
    );

    unmount();

    expect(rendererDispose.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(editor.disposed).toBe(false);
    expect(editor.getRuntime()?.disposed ?? true).toBe(true);
  });

  it("keeps runtime ownership stable under StrictMode when locale changes", () => {
    const editor = createEditor();
    const rendererDispose = vi.fn();
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    const { rerender, unmount } = render(
      <StrictMode>
        <EditorWorkbench editor={editor} rendererFactory={(container) => fakeRenderer(container, rendererDispose)} locale="en" />
      </StrictMode>
    );
    const mountCallsBeforeLocaleChange = mountRuntime.mock.calls.length;

    rerender(
      <StrictMode>
        <EditorWorkbench editor={editor} rendererFactory={(container) => fakeRenderer(container, rendererDispose)} locale="zh-CN" />
      </StrictMode>
    );

    expect(mountRuntime.mock.calls.length).toBeLessThanOrEqual(mountCallsBeforeLocaleChange + 1);
    expect(editor.disposed).toBe(false);
    expect(screen.getByText("选择 无")).toBeTruthy();

    unmount();

    expect(editor.disposed).toBe(false);
  });

  it("keeps a shell-created editor alive during React StrictMode effect replay", async () => {
    let capturedEditor = createEditor();
    const { unmount } = render(
      <StrictMode>
        <EditorWorkbench
          rendererFactory={fakeRenderer}
          toolbar={({ editor }) => {
            capturedEditor = editor;
            return <span>Workbench ready</span>;
          }}
        />
      </StrictMode>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(capturedEditor.disposed).toBe(false);

    unmount();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(capturedEditor.disposed).toBe(true);
  });

  it("keeps useWorkbench ownership explicit", () => {
    const editor = createEditor();
    const { result, unmount } = renderHookWithResult(() => useWorkbench({ editor }));

    expect(result().editor).toBe(editor);
    expect(result().ownsEditor).toBe(false);
    expect(result().exportProject().ok).toBe(true);

    unmount();
    expect(editor.disposed).toBe(false);
  });

  it("exposes Workbench i18n helpers from direct useWorkbench consumers", () => {
    const editor = createEditor();
    const { result, unmount } = renderHookWithResult(() => useWorkbench({ editor, locale: "zh-CN" }));

    expect(result().i18n.locale).toBe("zh-CN");
    expect(result().i18n.t("reactWorkbench.toolbar.project.open.label")).toBe("打开");
    expect(result().i18n.localeLabel("zh-CN")).toBe("简体中文");

    unmount();
  });

  it("refreshes useWorkbench asset workspace after payload-only replacement", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const { result, unmount } = renderHookWithResult(() => useWorkbench({ editor }));

    expect(result().model.assets.workspace!.items.find((asset) => asset.id === "asset-a")?.payloadStatus).toBe("missing");
    await act(async () => {
      await editor.replaceAsset({ assetId: "asset-a", source: new Uint8Array([1, 2, 3]) });
    });

    expect(result().model.assets.workspace!.items.find((asset) => asset.id === "asset-a")?.payloadStatus).toBe("available");
    unmount();
  });
});

function fakeRenderer(container: HTMLElement, dispose: () => void = () => {}): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose
  };
}

function renderHookWithResult<T>(callback: () => T) {
  let value: T;
  function Harness() {
    value = callback();
    return null;
  }

  const view = render(<Harness />);
  return {
    ...view,
    result: () => value!
  };
}

function mockObjectUrls(): {
  createObjectURL: ReturnType<typeof vi.fn>;
  revokeObjectURL: ReturnType<typeof vi.fn>;
  restore(): void;
} {
  let count = 0;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const createObjectURL = vi.fn(() => `blob:react-workbench-${count++}`);
  const revokeObjectURL = vi.fn();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  return {
    createObjectURL,
    revokeObjectURL,
    restore() {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  };
}

function createWorkbenchManifest(options: { twoSlots?: boolean } = {}) {
  return createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name: "Panel", mesh: 0 }],
          meshes: [{
            name: "Panel mesh",
            primitives: options.twoSlots
              ? [
                  { attributes: { POSITION: 0 }, material: 0 },
                  { attributes: { POSITION: 1 }, material: 1 }
                ]
              : [{ attributes: { POSITION: 0 }, material: 0 }]
          }],
          materials: options.twoSlots ? [{ name: "Body" }, { name: "Screen" }] : [{ name: "Red" }]
        }
      }
    }
  });
}

function getWorkbenchSlotIds(editor: ReturnType<typeof createEditor>) {
  return Object.values(editor.getSnapshot().nodes)
    .filter((node) => node.kind === "imported")
    .flatMap((node) => node.materialSlots?.map((slot) => slot.slotKey) ?? []);
}

function withPrimitivePath(manifest: ReturnType<typeof createWorkbenchManifest>, path: string) {
  const mesh = manifest.meshes[0]!;
  const primitive = mesh.primitives[0]!;
  return {
    ...manifest,
    meshes: [{
      ...mesh,
      primitives: [{
        ...primitive,
        path
      }]
    }]
  };
}

function createReplacementProblem(): ProjectProblem {
  return {
    id: "project:asset-unresolved",
    severity: "error",
    code: "asset-unresolved",
    source: "validation",
    target: { kind: "asset", assetId: "texture-a" },
    assetId: "texture-a",
    recoverability: "user-action",
    message: "Asset texture-a could not be resolved.",
    display: {
      title: "Asset could not be resolved",
      titleDescriptor: createMessageDescriptor({
        key: "problem.asset.unresolved.title",
        fallback: "Asset could not be resolved",
        values: { assetId: "texture-a", objectId: null }
      }),
      detail: "Asset texture-a is missing or unavailable.",
      detailDescriptor: createMessageDescriptor({
        key: "problem.asset.unresolved.detail",
        fallback: "Asset {assetId} is missing or unavailable.",
        values: { assetId: "texture-a", objectId: null }
      }),
      actionLabel: "Replace asset",
      actionLabelDescriptor: createMessageDescriptor({
        key: "problem.asset.unresolved.actionLabel",
        fallback: "Replace asset",
        values: { assetId: "texture-a", objectId: null }
      })
    }
  };
}
