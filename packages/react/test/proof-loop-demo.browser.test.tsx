import React, { useState } from "react";
import { page, userEvent } from "vitest/browser";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { createRoot } from "react-dom/client";
import { createApp, type App as VueApp } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { AssetResolverBridge, createEditor, ThreeGltfLoaderAdapter, type GltfLoaderAdapter, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import { decodeArchiveJson, defaultArchiveAdapter } from "../../core/src/project/archive-adapter";
import { App as ReactProofLoopApp } from "../../../examples/react-proof-loop/src/App";
import ReactDemoStyles from "../../../examples/react-proof-loop/src/styles.css?raw";
import VueProofLoopApp from "../../../examples/vue-proof-loop/src/App.vue";
import VueDemoStyles from "../../../examples/vue-proof-loop/src/styles.css?raw";
import ReactWorkbenchStyles from "../src/components/workbench.css?raw";
import ReactInspectorStyles from "../src/components/inspector.css?raw";
import VueWorkbenchStyles from "../../vue/src/components/workbench.css?raw";
import VueInspectorStyles from "../../vue/src/components/inspector.css?raw";
import simpleBoxUrl from "../../core/test/fixtures/simple-box.glb?url";

describe("proof-loop starter demo browser verification", () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = "";
    delete window.__lastDownloadedProject;
  });

  it("drives the React starter through the package default workbench", async () => {
    const root = mountReactDemo();
    cleanup = root.cleanup;

    await verifyStarterFlow(root.host, { assertProfessionalUi: true });
  }, 15000);

  it("resizes and restores React panels across desktop sizes without replacing the canvas", async () => {
    const originalSize = { width: window.innerWidth, height: window.innerHeight };
    const root = mountReactDemo();
    cleanup = root.cleanup;
    const { host } = root;
    try {
      await page.viewport(1440, 900);
      await waitFor(() => expect(host.querySelector('[role="separator"]')).toBeTruthy());
      const canvas = await findReadyCanvas(host.querySelector<HTMLElement>(".starter-viewport")!);
      for (const [width, height] of [[1440, 900], [1920, 1080], [1100, 800]]) {
        await page.viewport(width, height);
        for (const side of ["left", "right"]) {
          const separator = host.querySelector(`[aria-label="Resize ${side} panel"]`) as HTMLElement;
          const panel = section(host, side === "left" ? "Project panel" : "Inspector panel");
          separator.focus();
          separator.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
          await waitFor(() => expect(panel.getBoundingClientRect().width).toBe(Number(separator.getAttribute("aria-valuemin"))));
          separator.dispatchEvent(new KeyboardEvent("keydown", { key: side === "left" ? "ArrowRight" : "ArrowLeft", bubbles: true }));
          await waitFor(() => {
            expect(Number(separator.getAttribute("aria-valuenow"))).toBe(Number(separator.getAttribute("aria-valuemin")) + 16);
            expect(panel.getBoundingClientRect().width).toBe(Number(separator.getAttribute("aria-valuenow")));
          });
          const previous = panel.getBoundingClientRect().width;
          const rect = separator.getBoundingClientRect();
          await userEvent.dragAndDrop(separator, host, {
            sourcePosition: { x: 1, y: 100 },
            targetPosition: { x: rect.left + 2 + (side === "left" ? 24 : -24), y: rect.top + 100 }
          });
          await waitFor(() => expect(panel.getBoundingClientRect().width).toBe(previous + 24));
          expect(document.activeElement).toBe(separator);
          expect(Number(separator.getAttribute("aria-valuenow"))).toBe(panel.getBoundingClientRect().width);
          const expandedCanvasWidth = canvas.width;
          await userEvent.click(host.querySelector(`[aria-label="Collapse ${side} panel"]`)!);
          await waitFor(() => {
            expect(panel.hidden).toBe(true);
            expect(canvas.width).toBeGreaterThan(expandedCanvasWidth);
          });
          const restore = host.querySelector(`[aria-label="Expand ${side} panel"]`) as HTMLButtonElement;
          expect(document.activeElement).toBe(restore);
          expect(restore.getBoundingClientRect().right).toBeLessThanOrEqual(width);
          await userEvent.click(restore);
          await waitFor(() => expect(panel.getBoundingClientRect().width).toBe(previous + 24));
          expect(document.activeElement).toBe(restore);
          expect(host.querySelector("canvas")).toBe(canvas);
          const restoredSeparator = host.querySelector(`[aria-label="Resize ${side} panel"]`) as HTMLElement;
          restoredSeparator.focus();
          restoredSeparator.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
          await waitFor(() => expect(panel.getBoundingClientRect().width).toBe(Number(restoredSeparator.getAttribute("aria-valuemax"))));
          expect(document.activeElement).toBe(restoredSeparator);
        }
        await waitFor(() => {
          const viewport = host.querySelector(".starter-viewport")!.getBoundingClientRect();
          expect(canvas.width).toBe(Math.floor(viewport.width));
          expect(canvas.height).toBe(Math.floor(viewport.height));
          expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
          expect(section(host, "Editor status").getBoundingClientRect().bottom).toBeLessThanOrEqual(height);
        });
        await verifyViewportToolsReachable(host);
      }
      host.style.height = "600px";
      await waitFor(() => {
        expect(host.querySelector(".ek-workbench")!.getBoundingClientRect().height).toBe(600);
        expect(section(host, "Editor status").getBoundingClientRect().bottom).toBeLessThanOrEqual(600);
      });
      await verifyViewportToolsReachable(host);
      await verifyStarterFlow(host);
    } finally {
      await page.viewport(originalSize.width, originalSize.height);
    }
  }, 30000);

  it("keeps tools reachable when a host status drawer reduces the viewport", async () => {
    const originalSize = { width: window.innerWidth, height: window.innerHeight };
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    installStyles("react-tools-drawer", [ReactWorkbenchStyles, ReactInspectorStyles]);
    const host = createHost();
    const root = createRoot(host);
    function HostWorkbench() {
      const [expanded, setExpanded] = useState(false);
      const [overlayVisible, setOverlayVisible] = useState(true);
      return <EditorWorkbench editor={editor} rendererFactory={paintedRenderer}
        viewportOverlay={() => overlayVisible ? <button type="button"
          style={{ position: "absolute", inset: "0 0 auto", height: 56, width: "100%", maxWidth: "none" }}
          onClick={() => setOverlayVisible(false)}>Host overlay action</button> : null}
        status={() => <div>
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>Host details</button>
        {expanded ? <div style={{ height: 160 }}>Host diagnostic details</div> : null}
      </div>} />;
    }
    root.render(<HostWorkbench />);
    cleanup = () => {
      root.unmount();
      editor.dispose();
      removeStyles("react-tools-drawer");
    };
    try {
      await page.viewport(1440, 900);
      await waitFor(() => expect(host.querySelector("canvas")).toBeTruthy());
      const canvas = host.querySelector("canvas")!;
      const snapshot = editor.getSnapshot();
      const rotate = host.querySelector('[title="Rotate mode"]')!.getBoundingClientRect();
      const overlay = button(host, "Host overlay action")!;
      expect(overlay.contains(document.elementFromPoint(rotate.left + rotate.width / 2, rotate.top + rotate.height / 2))).toBe(true);
      await userEvent.click(overlay);
      await waitFor(() => expect(button(host, "Host overlay action")).toBeNull());
      expect(editor.transformMode.get()).toBe("translate");
      for (const [width, height] of [[1440, 900], [1920, 1080], [1100, 800]]) {
        await page.viewport(width, height);
        await waitForAnimationFrame();
        const before = canvas.getBoundingClientRect().height;
        await userEvent.click(button(host, "Host details")!);
        await waitFor(() => expect(canvas.getBoundingClientRect().height).toBeLessThan(before));
        await verifyViewportToolsReachable(host);
        await userEvent.click(button(host, "Host details")!);
        await waitFor(() => expect(canvas.getBoundingClientRect().height).toBe(before));
        expect(editor.getSnapshot()).toEqual(snapshot);
        expect(host.querySelector("canvas")).toBe(canvas);
      }
    } finally {
      await page.viewport(originalSize.width, originalSize.height);
    }
  }, 15000);

  it("searches and focuses real imported hierarchy targets at desktop sizes", async () => {
    const originalSize = { width: window.innerWidth, height: window.innerHeight };
    const editor = createEditor();
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial({ color: 0x6fa8dc });
    const mesh = new Mesh(geometry, material);
    mesh.name = "ImportedPanelWithAVeryLongNameAndReadableFullText";
    const scene = new Group();
    scene.add(mesh);
    const bytes = await new GLTFExporter().parseAsync(scene, { binary: true }) as ArrayBuffer;
    geometry.dispose();
    material.dispose();
    for (let depth = 0; depth < 10; depth++) {
      editor.dispatch({ type: "create-group", nodeId: `group-${depth}`, name: `Assembly ${depth}`, parentId: depth ? `group-${depth - 1}` : null });
    }
    const imported = await editor.importGlbAsset({ asset: { id: "real-asset", source: new File([bytes], "hierarchy.glb") }, objectId: "robot", name: "Robot", parentId: "group-9", expandImportedTargets: true });
    expect(imported.ok).toBe(true);
    const inheritedStyles = [...document.querySelectorAll<HTMLStyleElement>("style[data-vite-dev-id]")].map((style) => ({ style, disabled: style.disabled }));
    inheritedStyles.forEach(({ style }) => { style.disabled = true; });
    installStyles("react-hierarchy-styles", [ReactWorkbenchStyles, ReactInspectorStyles]);
    const host = createHost();
    const root = createRoot(host);
    const uri = URL.createObjectURL(new Blob([bytes], { type: "model/gltf-binary" }));
    root.render(<EditorWorkbench editor={editor} loader={new ThreeGltfLoaderAdapter()} resolver={new AssetResolverBridge(() => ({ uri }))}
      interactions={{ camera: true, pointerSelection: true, marqueeSelection: true, transform: true, resize: true, selectionVisuals: true }} />);
    cleanup = () => {
      root.unmount();
      removeStyles("react-hierarchy-styles");
      editor.dispose();
      URL.revokeObjectURL(uri);
      inheritedStyles.forEach(({ style, disabled }) => { style.disabled = disabled; });
    };
    try {
      await waitFor(() => expect(editor.getRuntime()).toBeTruthy());
      await editor.getRuntime()!.project();
      const hierarchy = section(host, "Hierarchy");
      const canvas = host.querySelector("canvas")!;
      for (const [width, height] of [[1440, 900], [1920, 1080], [1100, 800]]) {
        await page.viewport(width, height);
        const before = editor.getSnapshot();
        await userEvent.click(hierarchy.querySelector('[aria-label="Collapse Assembly 0"]')!);
        expect(text(hierarchy)).not.toContain(mesh.name);
        const search = hierarchy.querySelector('input[type="search"]')!;
        await userEvent.fill(search, "readablefulltext");
        await waitFor(() => expect(text(hierarchy)).toContain(mesh.name));
        expect(text(hierarchy)).toContain("Assembly 0");
        await userEvent.fill(search, "no matching thing");
        await waitFor(() => expect(text(hierarchy)).toContain("No matching nodes"));
        await userEvent.clear(search);
        expect(text(hierarchy)).not.toContain(mesh.name);
        expect(editor.getSnapshot()).toEqual(before);
        const expand = hierarchy.querySelector<HTMLButtonElement>('[aria-label="Expand Assembly 0"]')!;
        expand.focus();
        await userEvent.keyboard("{Enter}");
        expect(document.activeElement).toBe(expand);
        const row = hierarchy.querySelector<HTMLButtonElement>(`button.ek-workbench__tree-row[title="${mesh.name}"]`)!;
        editor.getRuntime()!.resetCamera();
        const cameraBefore = editor.getRuntime()!.captureCameraView();
        await userEvent.dblClick(row);
        await waitFor(() => {
          expect(editor.getSnapshot().nodes[editor.getSnapshot().selection.nodeId!]?.kind).toBe("imported");
          expect(row.getAttribute("aria-pressed")).toBe("true");
          expect(text(section(host, "Editor status"))).toContain(mesh.name);
        });
        expect(editor.getRuntime()!.captureCameraView()).not.toEqual(cameraBefore);
        expect(findFieldInput(host, "Position X", 'input[type="number"]')).toBeTruthy();
        expect(text(hierarchy)).toContain("cannot be transformed independently");
        expect(row.getBoundingClientRect().width).toBeGreaterThan(100);
        const panel = section(host, "Project panel");
        expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
        expect(panel.scrollLeft).toBe(0);
        const parentRow = hierarchy.querySelector('[title="Assembly 8"]')!;
        const childRow = hierarchy.querySelector('[title="Assembly 9"]')!;
        expect(childRow.getBoundingClientRect().left).toBeGreaterThan(parentRow.getBoundingClientRect().left);
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        expect(section(host, "Editor status").getBoundingClientRect().bottom).toBeLessThanOrEqual(height);
        expect(host.querySelector("canvas")).toBe(canvas);
        await clickByText(host, "Clear");
        await userEvent.click(canvas, { position: { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 } });
        await waitFor(() => expect(editor.getSnapshot().nodes[editor.getSnapshot().selection.nodeId!]?.kind).toBe("imported"));
        await clickByText(host, "Clear");
        await userEvent.dragAndDrop(canvas, canvas, {
          sourcePosition: { x: 20, y: 70 },
          targetPosition: { x: canvas.clientWidth - 20, y: canvas.clientHeight - 20 }
        });
        await waitFor(() => {
          const snapshot = editor.getSnapshot();
          expect(snapshot.selection.nodeIds.some((id) => snapshot.nodes[id].kind === "imported")).toBe(true);
          expect(hierarchy.querySelector('[aria-pressed="true"]')).toBeTruthy();
        });
        await userEvent.keyboard("{Control>}");
        await userEvent.click(hierarchy.querySelector('button.ek-workbench__tree-row[title="Robot"]')!);
        await userEvent.keyboard("{/Control}");
        await waitFor(() => expect(editor.getSnapshot().selection.nodeIds.length).toBeGreaterThan(1));
        expect(text(section(host, "Editor status"))).toContain("nodes");
        if (width === 1440) {
          await userEvent.dblClick(hierarchy.querySelector('button.ek-workbench__tree-row[title="Robot"]')!);
          await editor.getRuntime()!.project();
          await waitForAnimationFrame();
          // A point on the visible red X handle, clear of the center plane handles.
          const x = canvas.clientWidth / 2 + canvas.clientHeight * 0.1;
          const historyBefore = editor.getHistoryState().undoCount;
          await userEvent.dragAndDrop(canvas, canvas, {
            sourcePosition: { x, y: canvas.clientHeight / 2 },
            targetPosition: { x: x + 40, y: canvas.clientHeight / 2 }
          });
          await waitFor(() => expect(editor.getSnapshot().objects.robot.transform.position[0]).not.toBe(0));
          const committedPosition = editor.getSnapshot().objects.robot.transform.position[0];
          expect(editor.getHistoryState().undoCount).toBe(historyBefore + 1);
          expect(Number((findFieldInput(host, "Position X", 'input[type="number"]') as HTMLInputElement).value)).not.toBe(0);
          await clickByText(host, "Undo");
          await waitFor(() => expect(editor.getSnapshot().objects.robot.transform.position[0]).toBe(0));
          await clickByText(host, "Redo");
          await waitFor(() => expect(editor.getSnapshot().objects.robot.transform.position[0]).toBe(committedPosition));
          await clickByText(host, "Undo");
        }
      }
    } finally {
      await page.viewport(originalSize.width, originalSize.height);
    }
  }, 30000);

  it("imports a real GLB and keeps canvas picking and undo working after React panel resize", async () => {
    const root = mountReactDemo({ nativeRuntime: true });
    cleanup = root.cleanup;
    await waitFor(() => expect(text(root.host)).toContain("Runtime ready"));
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial({ color: 0x6fa8dc });
    const bytes = await new GLTFExporter().parseAsync(new Mesh(geometry, material), { binary: true }) as ArrayBuffer;
    geometry.dispose();
    material.dispose();
    await openLeftWorkspaceView(root.host, "Assets");
    await uploadFile(root.host.querySelector<HTMLInputElement>('[aria-label="Import assets"]')!, new File([bytes], "actual-box.glb"));
    await openLeftWorkspaceView(root.host, "Scene");
    await waitFor(() => expect(text(section(root.host, "Hierarchy"))).toContain("actual-box"));
    await clickHierarchyRow(root.host, "actual-box");
    await clickByText(root.host, "Frame all");
    const canvas = root.host.querySelector("canvas")!;
    await userEvent.click(root.host.querySelector('[aria-label="Collapse left panel"]')!);
    await userEvent.click(root.host.querySelector('[aria-label="Collapse right panel"]')!);
    await clickByText(root.host, "Clear");
    await waitFor(() => expect(text(section(root.host, "Editor status"))).toContain("Selection none"));
    await userEvent.click(canvas, { position: { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 } });
    await waitFor(() => expect(text(section(root.host, "Editor status"))).toContain("Selection actual-box"));
    await userEvent.click(root.host.querySelector('[aria-label="Expand right panel"]')!);
    const position = findFieldInput(root.host, "Position X", 'input[type="number"]') as HTMLInputElement;
    await userEvent.fill(position, "2");
    position.blur();
    await waitFor(() => expect((findFieldInput(root.host, "Position X", 'input[type="number"]') as HTMLInputElement).value).toBe("2"));
    await clickByText(root.host, "Undo");
    await waitFor(() => expect((findFieldInput(root.host, "Position X", 'input[type="number"]') as HTMLInputElement).value).toBe("0"));
    expect(root.host.querySelector("canvas")).toBe(canvas);
  }, 15000);

  it("restores React object transforms and material slots from a real project package", async () => {
    const originalSize = { width: window.innerWidth, height: window.innerHeight };
    const editor = createEditor();
    const geometry = new BoxGeometry(1, 1, 1);
    const bodyMaterial = new MeshStandardMaterial({ color: 0x6fa8dc, emissive: 0x28405c });
    bodyMaterial.name = "Body finish";
    const screenMaterial = new MeshStandardMaterial({ color: 0x222222, emissive: 0x101010 });
    screenMaterial.name = "Screen finish";
    const model = new Group();
    const body = new Mesh(geometry, bodyMaterial);
    body.name = "Body node";
    const screenMesh = new Mesh(geometry, screenMaterial);
    screenMesh.name = "Screen node";
    screenMesh.position.x = 1.5;
    model.add(body, screenMesh);
    const bytes = await new GLTFExporter().parseAsync(model, { binary: true }) as ArrayBuffer;
    geometry.dispose();
    bodyMaterial.dispose();
    screenMaterial.dispose();
    expect((await editor.importGlbAsset({ asset: { id: "panel-asset", source: new File([bytes], "panel.glb") }, objectId: "panel", name: "Panel", expandImportedTargets: true })).ok).toBe(true);
    expect((await editor.replaceAsset({ assetId: "panel-asset", source: new Uint8Array(bytes), kind: "glb" })).ok).toBe(true);
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = textureCanvas.height = 1;
    const context = textureCanvas.getContext("2d")!;
    context.fillStyle = "#aabbcc";
    context.fillRect(0, 0, 1, 1);
    const textureBlob = await new Promise<Blob>((resolve) => textureCanvas.toBlob((blob) => resolve(blob!)));
    const textureResults = await editor.importWorkbenchAssets({ files: [{ id: "paint", source: new File([textureBlob], "paint.png"), kind: "texture" }] });
    expect(textureResults[0]?.committed).toBe(true);
    const inheritedStyles = [...document.querySelectorAll<HTMLStyleElement>("style[data-vite-dev-id]")].map((style) => ({ style, disabled: style.disabled }));
    inheritedStyles.forEach(({ style }) => { style.disabled = true; });
    installStyles("react-inspector-styles", [ReactWorkbenchStyles, ReactInspectorStyles]);
    const host = createHost();
    const root = createRoot(host);
    root.render(<EditorWorkbench editor={editor} loader={new ThreeGltfLoaderAdapter()} />);
    const restoreDownloads = installDownloadCapture();
    cleanup = () => {
      root.unmount();
      editor.dispose();
      removeStyles("react-inspector-styles");
      inheritedStyles.forEach(({ style, disabled }) => { style.disabled = disabled; });
      restoreDownloads();
    };
    try {
      await page.viewport(1440, 900);
      await waitFor(() => expect(editor.getRuntime()).toBeTruthy());
      await editor.getRuntime()!.project();
      await clickHierarchyRow(host, "Panel");
      await clickByText(host, "Frame all");
      const inspector = section(host, "Scene inspector");
      const field = (label: string) => findFieldInput(inspector, label, 'input[type="number"]') as HTMLInputElement;
      await userEvent.fill(field("Position X"), "2");
      await userEvent.keyboard("{Enter}{Tab}");
      await userEvent.fill(field("Rotation Y"), "90");
      await userEvent.keyboard("{Enter}{Tab}");
      expect(editor.getSnapshot().objects.panel.transform).toMatchObject({ position: [2, 0, 0], rotation: [0, Math.PI / 2, 0] });
      await clickByText(host, "Undo");
      expect(field("Rotation Y").value).toBe("0");
      await clickByText(host, "Redo");
      expect(field("Rotation Y").value).toBe("90");
      await userEvent.fill(field("Position X"), "");
      await userEvent.keyboard("{Tab}");
      expect(editor.getSnapshot().objects.panel.transform.position[0]).toBe(2);
      expect(inspector.querySelector('[role="alert"]')).toBeTruthy();
      await userEvent.fill(field("Position X"), "2");
      await userEvent.keyboard("{Tab}");

      const radios = () => [...inspector.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
      expect(radios()).toHaveLength(3);
      const slot = () => radios().find((radio) => text(radio.closest("label")!).includes("Body finish"))!;
      expect(slot().disabled).toBe(false);
      await userEvent.click(slot());
      expect(slot().checked).toBe(true);
      await userEvent.fill(field("Opacity"), "0.6");
      await userEvent.keyboard("{Enter}{Tab}");
      expect(field("Opacity").value).toBe("0.6");
      expect(Object.values(editor.getSnapshot().materials.definitions).some((material) => material.override.opacity === 0.6)).toBe(true);
      await clickByText(host, "Undo");
      expect(field("Opacity").value).toBe("1");
      await clickByText(host, "Redo");
      expect(field("Opacity").value).toBe("0.6");
      const textureSelect = findFieldInput(inspector, "map", "select") as HTMLSelectElement;
      await userEvent.selectOptions(textureSelect, "paint");
      expect(Object.values(editor.getSnapshot().materials.definitions).some((material) => material.override.textures?.map?.assetId === "paint")).toBe(true);
      await clickHierarchyRow(host, "Primitive 0");
      expect(slot().checked).toBe(true);
      await clickHierarchyRow(host, "Panel");
      expect(radios()[0]!.checked).toBe(true);
      expect(field("Opacity").value).toBe("1");
      await userEvent.click(slot());
      for (const [width, height] of [[1440, 900], [1920, 1080], [1100, 800]]) {
        await page.viewport(width, height);
        inspector.scrollTop = 0;
        await waitForAnimationFrame();
        assertChildrenInside(inspector, "Material inspector");
        const x = field("Position X").getBoundingClientRect();
        const y = field("Position Y").getBoundingClientRect();
        const z = field("Position Z").getBoundingClientRect();
        expect(x.top).toBe(y.top);
        expect(y.top).toBe(z.top);
        expect(x.right).toBeLessThanOrEqual(y.left);
        expect(y.right).toBeLessThanOrEqual(z.left);
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      }
      await openInspectorGroup(host, "Environment");
      expect(findFieldInput(inspector, "Lighting asset", "select")!.getClientRects().length).toBeGreaterThan(0);
      await openInspectorGroup(host, "Scene");
      expect(inspector.querySelector('[aria-label="Add light"]')!.getClientRects().length).toBeGreaterThan(0);
      await openInspectorGroup(host, "Properties");
      expect(slot().checked).toBe(true);
      const saved = editor.getSnapshot();
      await clickByText(host, "Export");
      await waitForDownloadedProject();
      await userEvent.fill(field("Opacity"), "0.2");
      await userEvent.keyboard("{Tab}");
      const open = section(host, "Project actions").querySelector<HTMLInputElement>('input[type="file"]')!;
      await uploadFile(open, new File([copyBytes(window.__lastDownloadedProject!)], "inspector.ek3d"));
      await waitFor(() => expect(editor.getSnapshot().materials).toEqual(saved.materials));
      expect(editor.getSnapshot().objects.panel.transform).toEqual(saved.objects.panel.transform);
      expect(editor.getSnapshot().selection).toEqual(saved.selection);
      await userEvent.click(slot());
      expect(field("Opacity").value).toBe("0.6");
      expect(field("Rotation Y").value).toBe("90");
      expect((findFieldInput(inspector, "map", "select") as HTMLSelectElement).value).toBe("paint");
      await editor.getRuntime()!.project();
      expect(editor.getRuntime()!.getObject("panel")).toBeTruthy();
    } finally {
      await page.viewport(originalSize.width, originalSize.height);
    }
  }, 20000);

  it("drives the Vue starter through the package default workbench", async () => {
    const root = mountVueDemo();
    cleanup = root.cleanup;

    await verifyStarterFlow(root.host, { assertProfessionalUi: true });
  }, 15000);

  it("keeps the React starter workbench usable in Simplified Chinese", async () => {
    const root = mountReactDemo({ locale: "zh-CN" });
    cleanup = root.cleanup;

    await verifyChineseWorkbenchLayout(root.host, { assertProfessionalUi: true });
  }, 15000);

  it("keeps the Vue starter workbench usable in Simplified Chinese", async () => {
    const root = mountVueDemo({ locale: "zh-CN" });
    cleanup = root.cleanup;

    await verifyChineseWorkbenchLayout(root.host, { assertProfessionalUi: true });
  }, 15000);
});

async function verifyStarterFlow(host: HTMLElement, options: { assertProfessionalUi?: boolean } = {}): Promise<void> {
  const restoreDownloadCapture = installDownloadCapture();
  try {
    await waitFor(() => {
      expect(text(section(host, "Hierarchy"))).toContain("No scene nodes");
      expect(text(testId(host, "starter-overlay"))).toContain("0 objects");
      expect(text(testId(host, "starter-overlay"))).toContain("0 assets");
      expect(text(host)).toContain("Selection none");
    });

    await openLeftWorkspaceView(host, "Assets");
    await waitFor(() => {
      const assets = visibleSection(host, "Assets");
      expect(text(assets)).toContain("No registered assets");
    });
    if (options.assertProfessionalUi) {
      await assertProfessionalWorkbenchLayout(host);
    }

    const importInput = visibleSection(host, "Assets").querySelector('[aria-label="Import assets"]') as HTMLInputElement | null;
    expect(importInput, "Expected Import assets input").toBeTruthy();
    await uploadFile(importInput!, await glbFixtureFile("simple-box.glb"));
    await openLeftWorkspaceView(host, "Scene");
    await waitFor(() => {
      expect(text(section(host, "Hierarchy"))).toContain("simple-box");
      expect(text(testId(host, "starter-overlay"))).toContain("1 objects");
      expect(text(testId(host, "starter-overlay"))).toContain("1 assets");
    });
    await clickHierarchyRow(host, "simple-box");
    await waitFor(() => expect(text(host)).toContain("Selection simple-box"));

    await openLeftWorkspaceView(host, "Assets");
    await waitFor(() => {
      const assets = visibleSection(host, "Assets");
      expect(text(assets)).toContain("simple-box.glb");
      expect(text(assets)).toContain("GLB");
      expect(text(assets)).toContain("1 refs");
    });
    await assertAssetWorkspaceLayout(host);
    await openLeftWorkspaceView(host, "Scene");

    const viewport = host.querySelector(".starter-viewport") as HTMLElement | null;
    expect(viewport).toBeTruthy();
    await findReadyCanvas(viewport!);

    await waitFor(() => {
      expect(findFieldInput(host, "Base color", 'input[type="color"]'), "Expected material inspector Base color input").toBeTruthy();
    });
    const colorInput = findFieldInput(host, "Base color", 'input[type="color"]') as HTMLInputElement;
    setInputValue(colorInput, "#00aa88");
    await waitFor(() => expect(text(host)).toContain("Dirty"));

    await clickByText(host, "Snap move");
    expect(button(host, "Snap move")?.getAttribute("aria-pressed")).toBe("true");

    await clickByText(host, "Capture view");
    await waitFor(() => expect(text(host)).toContain("Camera view 1"));
    await openInspectorGroup(host, "Scene");
    await clickByText(host, "Set default");
    expect(text(host)).toContain("Default");
    await clickByText(host, "Apply view");
    await assertCameraLayout(host);

    await openInspectorGroup(host, "Properties");
    const positionX = findFieldInput(host, "Position X", 'input[type="number"]') as HTMLInputElement | null;
    expect(positionX, "Expected transform Position X input").toBeTruthy();
    positionX!.focus();
    positionX!.value = "2";
    positionX!.dispatchEvent(new Event("input", { bubbles: true }));
    positionX!.blur();
    await waitFor(() => {
      expect(text(host)).toMatch(/Undo [1-9]/);
      expect(text(host)).toContain("Dirty");
    });

    await clickByText(host, "Undo");
    await waitFor(() => expect(text(host)).toContain("Redo 1"));
    await clickByText(host, "Redo");

    await clickByText(host, "Export partial");
    await waitFor(() => expect(text(host)).toMatch(/Exported (partial )?project/));
    await waitForDownloadedProject();
    expect(JSON.stringify(window.__lastDownloadedProject)).not.toContain("asset-unresolved");
    expectExportedPresentation(window.__lastDownloadedProject!);

    const openInput = section(host, "Project actions").querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(openInput, "Expected default Open project file input").toBeTruthy();
    await uploadFile(openInput!, new File([copyBytes(window.__lastDownloadedProject!)], "starter.ek3d", { type: "application/octet-stream" }));
    await waitFor(() => expect(text(host)).toContain("Opened starter.ek3d"));
    await waitFor(() => {
      expect(text(section(host, "Hierarchy"))).toContain("simple-box");
      expect(text(host)).toContain("Selection simple-box");
    });
    await waitFor(() => {
      expect(text(host)).toContain("Camera view 1");
      expect(text(host)).toContain("Default");
    });
    await openLeftWorkspaceView(host, "Scene");

    await clickByText(host, "Duplicate");
    await openLeftWorkspaceView(host, "Project");
    await waitFor(() => expect(text(visibleSection(host, "Project"))).toContain("Objects2"));
    expect(text(testId(host, "starter-overlay"))).toContain("2 objects");
    expect(JSON.stringify(window.__lastDownloadedProject)).not.toContain("Import assets");
  } finally {
    restoreDownloadCapture();
  }
}

async function verifyChineseWorkbenchLayout(host: HTMLElement, options: { assertProfessionalUi?: boolean } = {}): Promise<void> {
  await waitFor(() => {
    expect(text(section(host, "层级"))).toContain("没有场景节点");
    expect(text(testId(host, "starter-overlay"))).toContain("0 objects");
    expect(text(section(host, "编辑器状态"))).toContain("选择 无");
  });

  await openLeftWorkspaceView(host, "资源");
  await waitFor(() => expect(text(visibleSection(host, "资源"))).toContain("没有已注册资源"));
  const importInput = visibleSection(host, "资源").querySelector('[aria-label="导入资源"]') as HTMLInputElement | null;
  expect(importInput, "Expected localized Import assets input").toBeTruthy();
  await uploadFile(importInput!, await glbFixtureFile("simple-box.glb"));

  await openLeftWorkspaceView(host, "场景");
  await waitFor(() => {
    expect(text(section(host, "层级"))).toContain("simple-box");
  });
  await clickHierarchyRow(host, "simple-box", "层级");
  await waitFor(() => {
    expect(text(section(host, "场景检查器"))).toContain("变换");
    expect(text(host)).toContain("选择 simple-box");
  });
  await openLeftWorkspaceView(host, "资源");
  await waitFor(() => expect(text(visibleSection(host, "资源"))).toContain("simple-box.glb"));
  await openLeftWorkspaceView(host, "项目");
  await waitFor(() => expect(text(visibleSection(host, "项目"))).toContain("对象"));
  await openLeftWorkspaceView(host, "场景");

  const viewport = host.querySelector(".starter-viewport") as HTMLElement | null;
  expect(viewport).toBeTruthy();
  await findReadyCanvas(viewport!);
  await assertLocalizedWorkbenchLayout(host);
  if (options.assertProfessionalUi) {
    await assertProfessionalWorkbenchLayout(host, {
      commandBarLabel: "编辑器控件",
      statusLabel: "编辑器状态",
      projectPanelLabel: "项目面板",
      inspectorLabel: "场景检查器"
    });
  }

  await clickByText(host, "捕获视图");
  await waitFor(() => {
    expect(text(host)).toContain("相机视图");
    expect(text(host)).toContain("Camera view 1");
  });
  await openInspectorGroup(host, "场景");
  await clickByText(host, "设为默认");
  expect(text(host)).toContain("默认");
  await clickByText(host, "应用视图");
  await assertLocalizedCameraLayout(host);
  await assertLocalizedWorkbenchLayout(host);
}

function mountReactDemo(options: { locale?: "en" | "zh-CN"; nativeRuntime?: boolean } = {}): { host: HTMLElement; cleanup(): void } {
  installStyles("react-demo-styles", [ReactWorkbenchStyles, ReactInspectorStyles, ReactDemoStyles]);
  const host = createHost();
  const root = createRoot(host);
  root.render(<ReactProofLoopApp loader={options.nativeRuntime ? undefined : proofLoopLoader}
    rendererFactory={options.nativeRuntime ? undefined : paintedRenderer} locale={options.locale} />);
  return {
    host,
    cleanup() {
      root.unmount();
      removeStyles("react-demo-styles");
    }
  };
}

function mountVueDemo(options: { locale?: "en" | "zh-CN" } = {}): { host: HTMLElement; cleanup(): void } {
  installStyles("vue-demo-styles", [VueWorkbenchStyles, VueInspectorStyles, VueDemoStyles]);
  const host = createHost();
  const app: VueApp = createApp(VueProofLoopApp, { loader: proofLoopLoader, rendererFactory: paintedRenderer, locale: options.locale });
  app.mount(host);
  return {
    host,
    cleanup() {
      app.unmount();
      removeStyles("vue-demo-styles");
    }
  };
}

const proofLoopLoader: GltfLoaderAdapter = {
  async load() {
    const group = new Group();
    group.name = "Proof-loop test GLB";
    group.add(new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({ color: 0x6fa8dc })
    ));
    return group;
  }
};

function createHost(): HTMLElement {
  const host = document.createElement("div");
  host.id = "app";
  document.body.appendChild(host);
  return host;
}

function paintedRenderer(container: HTMLElement): RendererLike {
  const canvas = container.ownerDocument.createElement("canvas");
  const context = canvas.getContext("2d");
  return {
    domElement: canvas,
    setSize(width, height) {
      canvas.width = width;
      canvas.height = height;
      paintCanvas(canvas, context, "#17324d");
    },
    render() {
      paintCanvas(canvas, context, "#1f7a8c");
    },
    dispose() {}
  };
}

function paintCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D | null, color: string): void {
  if (!context) {
    return;
  }
  context.fillStyle = color;
  context.fillRect(0, 0, Math.max(1, canvas.width), Math.max(1, canvas.height));
  context.fillStyle = "#f4d35e";
  context.fillRect(12, 12, 48, 48);
}

function hasNonBlankCanvasPixel(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }
  const pixels = context.getImageData(0, 0, Math.min(canvas.width, 64), Math.min(canvas.height, 64)).data;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] !== 0 || pixels[index + 1] !== 0 || pixels[index + 2] !== 0 || pixels[index + 3] !== 0) {
      return true;
    }
  }
  return false;
}

async function findReadyCanvas(viewport: HTMLElement): Promise<HTMLCanvasElement> {
  let canvas: HTMLCanvasElement | null = null;
  await waitFor(() => {
    canvas = viewport.querySelector("canvas") as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    expect(canvas!.width).toBeGreaterThan(1);
    expect(canvas!.height).toBeGreaterThan(1);
    expect(canvas!.getBoundingClientRect().width).toBeGreaterThan(100);
    expect(canvas!.getBoundingClientRect().height).toBeGreaterThan(100);
    expect(hasNonBlankCanvasPixel(canvas!)).toBe(true);
  });
  return canvas!;
}

async function openInspectorGroup(host: HTMLElement, label: string): Promise<void> {
  const tab = [...host.querySelectorAll<HTMLButtonElement>(".ek-inspector [role=tab]")].find((candidate) => text(candidate) === label);
  if (tab) await userEvent.click(tab);
}

async function clickByText(host: HTMLElement, label: string): Promise<void> {
  const target = button(host, label);
  expect(target, `Expected button ${label}`).toBeTruthy();
  const panel = target!.closest<HTMLElement>(".ek-workbench__tool-popover");
  if (panel?.hidden) {
    await userEvent.click(host.querySelector(`[aria-controls="${panel.id}"]`)!);
  }
  if (panel || target!.closest(".ek-workbench__viewport-tools")) {
    await userEvent.click(target!);
    await waitForAnimationFrame();
    return;
  }
  target!.click();
  await waitForAnimationFrame();
}

async function verifyViewportToolsReachable(host: HTMLElement): Promise<void> {
  const viewport = section(host, "3D viewport");
  const rect = viewport.getBoundingClientRect();
  const strip = host.querySelector(".ek-workbench__viewport-tool-strip")!;
  for (const control of strip.querySelectorAll<HTMLButtonElement>("button")) {
    const bounds = control.getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(rect.left);
    expect(bounds.right).toBeLessThanOrEqual(rect.right);
    expect(bounds.bottom).toBeLessThanOrEqual(rect.bottom);
    expect(control.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2))).toBe(true);
  }
  for (const label of ["Viewport helpers", "Camera", "Node operations"]) {
    const trigger = strip.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    await userEvent.click(trigger);
    const panel = document.getElementById(trigger.getAttribute("aria-controls")!)!;
    expect(panel.getBoundingClientRect().bottom).toBeLessThanOrEqual(rect.bottom);
    const lastButton = panel.querySelector<HTMLButtonElement>("button:last-child")!;
    lastButton.focus();
    lastButton.scrollIntoView({ block: "nearest" });
    const bounds = lastButton.getBoundingClientRect();
    expect(bounds.bottom).toBeLessThanOrEqual(rect.bottom);
    expect(lastButton.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2))).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  }
}

async function openLeftWorkspaceView(host: HTMLElement, label: string): Promise<void> {
  const tabs = [...host.querySelectorAll<HTMLButtonElement>(".ek-workbench__panel-tab, .ek-workbench__nav-button")];
  if (tabs.length === 0) {
    return;
  }

  const target = tabs
    .find((candidate) => (candidate.getAttribute("aria-label") ?? "").startsWith(`${label} `));
  expect(target, `Expected workspace tab ${label}`).toBeTruthy();

  if (target!.getAttribute("aria-pressed") !== "true" || target!.getAttribute("aria-expanded") === "false") {
    target!.click();
  }
  await waitForAnimationFrame();
  await waitFor(() => {
    expect(target!.getAttribute("aria-pressed")).toBe("true");
  });
}

function hasLeftWorkspaceTabs(host: HTMLElement): boolean {
  return host.querySelector(".ek-workbench__panel-tab, .ek-workbench__nav-button") !== null;
}

function expectExportedPresentation(bytes: Uint8Array): void {
  const files = defaultArchiveAdapter.read(bytes);
  const scene = decodeArchiveJson(files.find((entry) => entry.path === "scene.json")!.bytes) as {
    cameras: Record<string, { id: string; name: string; projection: { kind: string; fov: number } }>;
    presentation: {
      defaultCameraId: string | null;
    };
  };
  expect(scene.presentation.defaultCameraId).toBeTruthy();
  const defaultView = scene.presentation.defaultCameraId ? scene.cameras[scene.presentation.defaultCameraId] : null;
  expect(defaultView).toMatchObject({
    id: scene.presentation.defaultCameraId,
    name: "Camera view 1",
    projection: { kind: "perspective" }
  });
  expect(JSON.stringify(scene.presentation)).not.toContain("Object3D");
  expect(JSON.stringify(scene.presentation)).not.toContain("blob:");
}

function button(host: HTMLElement, label: string): HTMLButtonElement | null {
  return [...host.querySelectorAll("button")].find((candidate) => text(candidate) === label) ?? null;
}

function section(host: HTMLElement, label: string): HTMLElement {
  const element = host.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
  expect(element, `Expected [aria-label="${label}"]`).toBeTruthy();
  return element!;
}

function visibleSection(host: HTMLElement, label: string): HTMLElement {
  const element = section(host, label);
  expect(element.getClientRects().length, `Expected visible [aria-label="${label}"]`).toBeGreaterThan(0);
  return element;
}

function testId(host: HTMLElement, id: string): HTMLElement {
  const element = host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  expect(element, `Expected [data-testid="${id}"]`).toBeTruthy();
  return element!;
}

async function clickHierarchyRow(host: HTMLElement, label: string, hierarchyLabel = "Hierarchy"): Promise<void> {
  const row = [...visibleSection(host, hierarchyLabel).querySelectorAll<HTMLButtonElement>(".ek-workbench__tree-row")]
    .find((candidate) => text(candidate).startsWith(label));
  expect(row, `Expected hierarchy row ${label}`).toBeTruthy();
  row!.click();
  await waitForAnimationFrame();
}

function text(element: Element): string {
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

async function assertAssetWorkspaceLayout(host: HTMLElement): Promise<void> {
  await openLeftWorkspaceView(host, "Assets");
  await waitForAnimationFrame();
  const assets = visibleSection(host, "Assets");
  const panelRect = assets.getBoundingClientRect();
  expect(panelRect.width).toBeGreaterThan(0);
  for (const selector of [
    ".ek-workbench__asset-import",
    ".ek-workbench__asset-controls",
    ".ek-workbench__asset-list",
    ".ek-workbench__asset-row"
  ]) {
    const element = assets.querySelector(selector) as HTMLElement | null;
    expect(element, `Expected ${selector} in Assets`).toBeTruthy();
    const rect = element!.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(panelRect.left - 1);
    expect(rect.right).toBeLessThanOrEqual(panelRect.right + 1);
  }
  assertViewportWidthWasExercised();
}

async function assertLocalizedWorkbenchLayout(host: HTMLElement): Promise<void> {
  await waitForAnimationFrame();
  for (const localizedSection of [
    section(host, "编辑器控件"),
    section(host, "场景检查器"),
    section(host, "编辑器状态")
  ]) {
    assertChildrenInside(localizedSection, `Localized ${localizedSection.getAttribute("aria-label")}`);
  }
  await openLeftWorkspaceView(host, "资源");
  assertChildrenInside(visibleSection(host, "资源"), "Localized 资源");
  await openLeftWorkspaceView(host, "项目");
  assertChildrenInside(visibleSection(host, "项目"), "Localized 项目");
  await openLeftWorkspaceView(host, "场景");
  assertChildrenInside(visibleSection(host, "层级"), "Localized 层级");
  assertViewportWidthWasExercised();
}

async function assertProfessionalWorkbenchLayout(
  host: HTMLElement,
  labels: {
    commandBarLabel: string;
    statusLabel: string;
    projectPanelLabel: string;
    inspectorLabel: string;
  } = {
    commandBarLabel: "Editor controls",
    statusLabel: "Editor status",
    projectPanelLabel: "Project panel",
    inspectorLabel: "Scene inspector"
  }
): Promise<void> {
  const workbench = host.querySelector(".ek-workbench") as HTMLElement | null;
  expect(workbench, "Expected React workbench root").toBeTruthy();
  const commandBar = section(host, labels.commandBarLabel);
  const status = section(host, labels.statusLabel);
  const projectPanel = section(host, labels.projectPanelLabel);
  const inspector = section(host, labels.inspectorLabel);

  await waitForAnimationFrame();
  expect(document.documentElement.scrollWidth, `Page overflow at ${currentViewportLabel()}`).toBeLessThanOrEqual(document.documentElement.clientWidth + 1);
  expect(workbench!.getBoundingClientRect().right, `Workbench right edge at ${currentViewportLabel()}`).toBeLessThanOrEqual(document.documentElement.clientWidth + 1);
  assertChildrenInside(commandBar, `Command bar ${currentViewportLabel()}`);
  assertChildrenInside(projectPanel, `Project panel ${currentViewportLabel()}`);
  assertChildrenInside(inspector, `Inspector ${currentViewportLabel()}`);
  assertChildrenInside(status, `Status ${currentViewportLabel()}`);
  expect(host.querySelector(".ek-workbench__panel-nav, .ek-workbench__navigation"), `Workspace nav ${currentViewportLabel()}`).toBeTruthy();
  expect(commandBar.querySelector(".ek-workbench__command-button svg"), `Command icon ${currentViewportLabel()}`).toBeTruthy();
  expect(inspector.querySelector(".ek-inspector-summary"), `Inspector summary ${currentViewportLabel()}`).toBeTruthy();
  expect(status.querySelector(".ek-workbench__status-chip"), `Status chip ${currentViewportLabel()}`).toBeTruthy();
  assertViewportWidthWasExercised();
}

async function assertCameraLayout(host: HTMLElement): Promise<void> {
  const cameraToolbar = await openCameraTools(host, "Camera");
  const cameraInspector = [...host.querySelectorAll(".ek-inspector-section")]
    .find((candidate) => text(candidate).includes("Camera views")) as HTMLElement | undefined;
  expect(cameraInspector, "Expected Camera views inspector section").toBeTruthy();
  await waitForAnimationFrame();
  assertChildrenInside(cameraToolbar, `Camera toolbar ${currentViewportLabel()}`);
  assertChildrenInside(cameraInspector!, `Camera inspector ${currentViewportLabel()}`);
  if (cameraToolbar.classList.contains("ek-workbench__tool-popover")) await userEvent.keyboard("{Escape}");
}

async function assertLocalizedCameraLayout(host: HTMLElement): Promise<void> {
  const cameraToolbar = await openCameraTools(host, "相机");
  const cameraInspector = [...host.querySelectorAll(".ek-inspector-section")]
    .find((candidate) => text(candidate).includes("相机视图")) as HTMLElement | undefined;
  expect(cameraInspector, "Expected localized camera views inspector section").toBeTruthy();
  await waitForAnimationFrame();
  assertChildrenInside(cameraToolbar, `Localized camera toolbar ${currentViewportLabel()}`);
  assertChildrenInside(cameraInspector!, `Localized camera inspector ${currentViewportLabel()}`);
  if (cameraToolbar.classList.contains("ek-workbench__tool-popover")) await userEvent.keyboard("{Escape}");
}

async function openCameraTools(host: HTMLElement, label: string): Promise<HTMLElement> {
  const entry = section(host, label);
  const panelId = entry.getAttribute("aria-controls");
  if (!panelId) return entry;
  if (entry.getAttribute("aria-expanded") !== "true") await userEvent.click(entry);
  return document.getElementById(panelId)!;
}

function assertViewportWidthWasExercised(): void {
  const width = document.documentElement.clientWidth;
  expect(
    width >= 1024 || width <= 480,
    `Expected desktop or narrow browser viewport, got ${width}px`
  ).toBe(true);
}

function currentViewportLabel(): string {
  return `${document.documentElement.clientWidth}px`;
}

function assertChildrenInside(container: HTMLElement, label: string): void {
  const parent = container.getBoundingClientRect();
  expect(parent.width, label).toBeGreaterThan(0);
  for (const child of container.querySelectorAll("button, input, select, .ek-inspector-camera-list, .ek-workbench__panel-nav, .ek-workbench__status-chip")) {
    if (child.getClientRects().length === 0) {
      continue;
    }
    const rect = child.getBoundingClientRect();
    expect(rect.left, `${label} child left`).toBeGreaterThanOrEqual(parent.left - 1);
    expect(rect.right, `${label} child right`).toBeLessThanOrEqual(parent.right + 1);
  }
}

function findFieldInput(host: HTMLElement, label: string, selector: string): Element | null {
  const namedInput = host.querySelector(`${selector}[aria-label="${label}"]`);
  if (namedInput) return namedInput;
  const field = [...host.querySelectorAll("label")].find((candidate) => text(candidate).includes(label));
  return field?.querySelector(selector) ?? null;
}

async function uploadFile(input: HTMLInputElement, file: File): Promise<void> {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file]
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await waitForAnimationFrame();
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const prototypeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (prototypeSetter) {
    prototypeSetter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
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

function installDownloadCapture(): () => void {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  const blobsByUrl = new Map<string, Blob>();
  URL.createObjectURL = ((blob: Blob) => {
    const objectUrl = originalCreateObjectURL.call(URL, blob);
    blobsByUrl.set(objectUrl, blob);
    return objectUrl;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((url: string) => {
    blobsByUrl.delete(url);
    originalRevokeObjectURL.call(URL, url);
  }) as typeof URL.revokeObjectURL;
  HTMLAnchorElement.prototype.click = function clickAnchor() {
    if (!this.download) {
      return;
    }
    const blob = blobsByUrl.get(this.href);
    if (!blob) {
      return;
    }
    void blob.arrayBuffer().then((buffer) => {
      window.__lastDownloadedProject = new Uint8Array(buffer);
    });
  };

  return () => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    HTMLAnchorElement.prototype.click = originalAnchorClick;
  };
}

async function waitForDownloadedProject(): Promise<void> {
  await waitFor(() => {
    expect(window.__lastDownloadedProject).toBeInstanceOf(Uint8Array);
    expect(() => defaultArchiveAdapter.read(window.__lastDownloadedProject!)).not.toThrow();
  });
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function glbFixtureFile(fileName = "recovered.glb"): Promise<File> {
  const response = await fetch(simpleBoxUrl);
  expect(response.ok).toBe(true);
  return new File([await response.arrayBuffer()], fileName, { type: "model/gltf-binary" });
}

declare global {
  interface Window {
    __lastDownloadedProject?: Uint8Array;
  }
}
