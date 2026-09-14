import React from "react";
import { createRoot } from "react-dom/client";
import { createApp, type App as VueApp } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import type { GltfLoaderAdapter, RendererLike } from "@ek-aiot/3d-editor-core";
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
    await clickByText(host, "Set default");
    expect(text(host)).toContain("Default");
    await clickByText(host, "Apply view");
    await assertCameraLayout(host);

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
  await clickByText(host, "设为默认");
  expect(text(host)).toContain("默认");
  await clickByText(host, "应用视图");
  await assertLocalizedCameraLayout(host);
  await assertLocalizedWorkbenchLayout(host);
}

function mountReactDemo(options: { locale?: "en" | "zh-CN" } = {}): { host: HTMLElement; cleanup(): void } {
  installStyles("react-demo-styles", [ReactWorkbenchStyles, ReactInspectorStyles, ReactDemoStyles]);
  const host = createHost();
  const root = createRoot(host);
  root.render(<ReactProofLoopApp loader={proofLoopLoader} rendererFactory={paintedRenderer} locale={options.locale} />);
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

async function clickByText(host: HTMLElement, label: string): Promise<void> {
  const target = button(host, label);
  expect(target, `Expected button ${label}`).toBeTruthy();
  target!.click();
  await waitForAnimationFrame();
}

async function openLeftWorkspaceView(host: HTMLElement, label: string): Promise<void> {
  const tabs = [...host.querySelectorAll<HTMLButtonElement>(".ek-workbench__panel-tab")];
  if (tabs.length === 0) {
    return;
  }

  const target = tabs
    .find((candidate) => (candidate.getAttribute("aria-label") ?? "").startsWith(`${label} `));
  expect(target, `Expected workspace tab ${label}`).toBeTruthy();

  target!.click();
  await waitForAnimationFrame();
  await waitFor(() => {
    expect(target!.getAttribute("aria-pressed")).toBe("true");
  });
}

function hasLeftWorkspaceTabs(host: HTMLElement): boolean {
  return host.querySelector(".ek-workbench__panel-tab") !== null;
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
  expect(projectPanel.querySelector(".ek-workbench__panel-nav"), `Workspace nav ${currentViewportLabel()}`).toBeTruthy();
  expect(commandBar.querySelector(".ek-workbench__command-button svg"), `Command icon ${currentViewportLabel()}`).toBeTruthy();
  expect(inspector.querySelector(".ek-inspector-summary"), `Inspector summary ${currentViewportLabel()}`).toBeTruthy();
  expect(status.querySelector(".ek-workbench__status-chip"), `Status chip ${currentViewportLabel()}`).toBeTruthy();
  assertViewportWidthWasExercised();
}

async function assertCameraLayout(host: HTMLElement): Promise<void> {
  const cameraToolbar = section(host, "Camera");
  const cameraInspector = [...host.querySelectorAll(".ek-inspector-section")]
    .find((candidate) => text(candidate).includes("Camera views")) as HTMLElement | undefined;
  expect(cameraInspector, "Expected Camera views inspector section").toBeTruthy();
  await waitForAnimationFrame();
  assertChildrenInside(cameraToolbar, `Camera toolbar ${currentViewportLabel()}`);
  assertChildrenInside(cameraInspector!, `Camera inspector ${currentViewportLabel()}`);
}

async function assertLocalizedCameraLayout(host: HTMLElement): Promise<void> {
  const cameraToolbar = section(host, "相机");
  const cameraInspector = [...host.querySelectorAll(".ek-inspector-section")]
    .find((candidate) => text(candidate).includes("相机视图")) as HTMLElement | undefined;
  expect(cameraInspector, "Expected localized camera views inspector section").toBeTruthy();
  await waitForAnimationFrame();
  assertChildrenInside(cameraToolbar, `Localized camera toolbar ${currentViewportLabel()}`);
  assertChildrenInside(cameraInspector!, `Localized camera inspector ${currentViewportLabel()}`);
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
  let nextObjectUrlId = 0;
  URL.createObjectURL = ((blob: Blob) => {
    const objectUrl = `blob:starter-project-${nextObjectUrlId++}`;
    blobsByUrl.set(objectUrl, blob);
    return objectUrl;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((url: string) => {
    blobsByUrl.delete(url);
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
