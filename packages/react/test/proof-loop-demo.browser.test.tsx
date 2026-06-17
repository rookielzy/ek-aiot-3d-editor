import React from "react";
import { createRoot } from "react-dom/client";
import { createApp, type App as VueApp } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { RendererLike } from "@ek-aiot/3d-editor-core";
import { decodeArchiveJson, defaultArchiveAdapter } from "../../core/src/project/archive-adapter";
import { App as ReactProofLoopApp } from "../../../examples/react-proof-loop/src/App";
import ReactDemoStyles from "../../../examples/react-proof-loop/src/styles.css?raw";
import VueProofLoopApp from "../../../examples/vue-proof-loop/src/App.vue";
import VueDemoStyles from "../../../examples/vue-proof-loop/src/styles.css?raw";
import WorkbenchStyles from "../src/components/workbench.css?raw";
import InspectorStyles from "../src/components/inspector.css?raw";

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

    await verifyStarterFlow(root.host);
  }, 15000);

  it("drives the Vue starter through the package default workbench", async () => {
    const root = mountVueDemo();
    cleanup = root.cleanup;

    await verifyStarterFlow(root.host);
  }, 15000);
});

async function verifyStarterFlow(host: HTMLElement): Promise<void> {
  const restoreDownloadCapture = installDownloadCapture();
  try {
    await waitFor(() => {
      expect(text(section(host, "Hierarchy"))).toContain("Simple box");
      expect(text(section(host, "Hierarchy"))).toContain("Recoverable asset");
      expect(text(section(host, "Hierarchy"))).toContain("Ambient light");
    });
    expect(text(section(host, "Assets"))).toContain("Recoverable asset");
    expect(text(section(host, "Assets"))).toContain("GLB");
    expect(text(section(host, "Assets"))).toContain("missing payload");
    expect(text(section(host, "Assets"))).toContain("blocked");
    expect(text(section(host, "Assets"))).toContain("1 refs");
    assertAssetWorkspaceLayout(host);
    expect(text(testId(host, "starter-overlay"))).toContain("3 objects");
    expect(text(host)).toContain("Selection Simple box");

    const viewport = host.querySelector(".starter-viewport") as HTMLElement | null;
    expect(viewport).toBeTruthy();
    await findReadyCanvas(viewport!);

    await waitFor(() => {
      expect(findFieldInput(host, "Base color", 'input[type="color"]'), "Expected material inspector Base color input").toBeTruthy();
    });
    const colorInput = findFieldInput(host, "Base color", 'input[type="color"]') as HTMLInputElement;
    setInputValue(colorInput, "#00aa88");
    await waitFor(() => expect(text(host)).toContain("Dirty"));

    expect(button(host, "Marquee")?.getAttribute("aria-pressed")).toBe("false");
    await clickByText(host, "Marquee");
    expect(button(host, "Marquee")?.getAttribute("aria-pressed")).toBe("true");
    await dragMarqueeStarterObjects(await findReadyCanvas(viewport!));
    await waitFor(() => {
      expect(text(host)).toContain("Selection 2 nodes");
      expect(hierarchyRow(host, "Detail block").getAttribute("data-selected")).toBe("true");
      expect(hierarchyRow(host, "Simple box").getAttribute("data-selected")).toBe("true");
    });

    await clickByText(host, "Snap move");
    expect(button(host, "Snap move")?.getAttribute("aria-pressed")).toBe("true");

    await clickByText(host, "Capture view");
    await waitFor(() => expect(text(host)).toContain("Camera view 1"));
    await clickByText(host, "Set default");
    expect(text(host)).toContain("Default");
    await clickByText(host, "Apply view");
    assertCameraLayout(host);

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
    await waitFor(() => expect(text(host)).toContain("Exported partial project"));
    await waitFor(() => expect(window.__lastDownloadedProject).toBeInstanceOf(Uint8Array));
    expect(JSON.stringify(window.__lastDownloadedProject)).not.toContain("asset-unresolved");
    expectExportedMarqueeSelection(window.__lastDownloadedProject!);
    expectExportedPresentation(window.__lastDownloadedProject!);

    const openInput = section(host, "Project actions").querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(openInput, "Expected default Open project file input").toBeTruthy();
    await uploadFile(openInput!, new File([copyBytes(window.__lastDownloadedProject!)], "starter.ek3d", { type: "application/octet-stream" }));
    await waitFor(() => expect(text(host)).toContain("Opened starter.ek3d"));
    await waitFor(() => {
      expect(text(host)).toContain("Selection 2 nodes");
      expect(hierarchyRow(host, "Detail block").getAttribute("data-selected")).toBe("true");
      expect(hierarchyRow(host, "Simple box").getAttribute("data-selected")).toBe("true");
    });
    await waitFor(() => {
      expect(text(host)).toContain("Camera view 1");
      expect(text(host)).toContain("Default");
    });

    await clickByText(host, "Duplicate");
    await waitFor(() => expect(text(section(host, "Project"))).toContain("Objects5"));

    await waitFor(() => {
      expect(text(section(host, "Missing asset recovery"))).toContain("Replace asset");
      expect(text(section(host, "Project"))).toContain("1 problems");
    });

    const recoveryInput = section(host, "Missing asset recovery").querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(recoveryInput, "Expected default missing asset recovery input").toBeTruthy();
    await uploadFile(recoveryInput!, new File([new Uint8Array([1, 2, 3, 4])], "recovered.glb", { type: "model/gltf-binary" }));
    await waitFor(() => {
      expect(host.querySelector('[aria-label="Missing asset recovery"]')).toBeNull();
      expect(text(host)).toContain("Problems 0");
    });
    expect(text(section(host, "Assets"))).toContain("Recoverable asset");
    expect(JSON.stringify(window.__lastDownloadedProject)).not.toContain("Import assets");
  } finally {
    restoreDownloadCapture();
  }
}

function mountReactDemo(): { host: HTMLElement; cleanup(): void } {
  installStyles("react-demo-styles", [WorkbenchStyles, InspectorStyles, ReactDemoStyles]);
  const host = createHost();
  const root = createRoot(host);
  root.render(<ReactProofLoopApp rendererFactory={paintedRenderer} />);
  return {
    host,
    cleanup() {
      root.unmount();
      removeStyles("react-demo-styles");
    }
  };
}

function mountVueDemo(): { host: HTMLElement; cleanup(): void } {
  installStyles("vue-demo-styles", [WorkbenchStyles, InspectorStyles, VueDemoStyles]);
  const host = createHost();
  const app: VueApp = createApp(VueProofLoopApp, { rendererFactory: paintedRenderer });
  app.mount(host);
  return {
    host,
    cleanup() {
      app.unmount();
      removeStyles("vue-demo-styles");
    }
  };
}

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

async function dragMarquee(canvas: HTMLCanvasElement, start: { x: number; y: number }, end: { x: number; y: number }): Promise<void> {
  const rect = canvas.getBoundingClientRect();
  const pointer = {
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
    bubbles: true,
    cancelable: true
  };
  canvas.dispatchEvent(new PointerEvent("pointerdown", {
    ...pointer,
    clientX: rect.left + start.x,
    clientY: rect.top + start.y
  }));
  await waitForAnimationFrame();
  canvas.dispatchEvent(new PointerEvent("pointermove", {
    ...pointer,
    clientX: rect.left + end.x,
    clientY: rect.top + end.y
  }));
  await waitForAnimationFrame();
  canvas.dispatchEvent(new PointerEvent("pointerup", {
    ...pointer,
    buttons: 0,
    clientX: rect.left + end.x,
    clientY: rect.top + end.y
  }));
  await waitForAnimationFrame();
}

async function dragMarqueeStarterObjects(canvas: HTMLCanvasElement): Promise<void> {
  const rect = canvas.getBoundingClientRect();
  const detailRect = projectStarterBoxRect(-1.35, rect.width, rect.height);
  const boxRect = projectStarterBoxRect(0, rect.width, rect.height);
  const recoverableRect = projectStarterBoxRect(1.35, rect.width, rect.height);
  const ambientPoint = projectStarterPoint(0, 0, 0, rect.width, rect.height);
  const paddingX = Math.max(2, rect.width * 0.01);
  const paddingY = Math.min(8, Math.max(2, rect.height * 0.02));
  const start = {
    x: Math.max(4, Math.min(detailRect.left, boxRect.left) - paddingX),
    y: Math.max(4, ambientPoint.y + paddingY)
  };
  const end = {
    x: Math.min(rect.width - 4, recoverableRect.left - paddingX, Math.max(detailRect.right, boxRect.right) + paddingX),
    y: Math.min(rect.height - 4, Math.max(detailRect.bottom, boxRect.bottom) + paddingY)
  };

  expect(end.x).toBeGreaterThan(start.x + 4);
  expect(end.y).toBeGreaterThan(start.y + 4);
  expect(start.y).toBeGreaterThan(ambientPoint.y);

  await dragMarquee(canvas, start, end);
}

function projectStarterBoxRect(centerX: number, width: number, height: number): { left: number; top: number; right: number; bottom: number } {
  const camera = new PerspectiveCamera(50, width / height, 0.1, 1000);
  camera.position.set(0, 2, 5);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  const xs: number[] = [];
  const ys: number[] = [];
  for (const x of [centerX - 0.5, centerX + 0.5]) {
    for (const y of [-0.5, 0.5]) {
      for (const z of [-0.5, 0.5]) {
        const point = new Vector3(x, y, z).project(camera);
        const projected = toViewportPoint(point, width, height);
        xs.push(projected.x);
        ys.push(projected.y);
      }
    }
  }

  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys)
  };
}

function projectStarterPoint(x: number, y: number, z: number, width: number, height: number): { x: number; y: number } {
  const camera = new PerspectiveCamera(50, width / height, 0.1, 1000);
  camera.position.set(0, 2, 5);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return toViewportPoint(new Vector3(x, y, z).project(camera), width, height);
}

function toViewportPoint(point: Vector3, width: number, height: number): { x: number; y: number } {
  return {
    x: (point.x + 1) / 2 * width,
    y: (1 - point.y) / 2 * height
  };
}

function expectExportedMarqueeSelection(bytes: Uint8Array): void {
  const files = defaultArchiveAdapter.read(bytes);
  const scene = decodeArchiveJson(files.find((entry) => entry.path === "scene.json")!.bytes) as { selection: { nodeIds: string[] } };
  expect(scene.selection.nodeIds).toEqual(["detail", "box"]);
  const serialized = JSON.stringify(scene);
  expect(serialized).not.toContain("marquee");
  expect(serialized).not.toContain("candidateNodeIds");
  expect(serialized).not.toContain("PointerEvent");
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

function hierarchyRow(host: HTMLElement, label: string): HTMLButtonElement {
  const row = [...section(host, "Hierarchy").querySelectorAll<HTMLButtonElement>(".ek-workbench__tree-row")]
    .find((candidate) => text(candidate).startsWith(label));
  expect(row, `Expected hierarchy row ${label}`).toBeTruthy();
  return row!;
}

function testId(host: HTMLElement, id: string): HTMLElement {
  const element = host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  expect(element, `Expected [data-testid="${id}"]`).toBeTruthy();
  return element!;
}

function text(element: Element): string {
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function assertAssetWorkspaceLayout(host: HTMLElement): void {
  const assets = section(host, "Assets");
  const originalWidth = host.style.width;
  try {
    for (const width of ["1280px", "390px"]) {
      host.style.width = width;
      window.dispatchEvent(new Event("resize"));
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
    }
  } finally {
    host.style.width = originalWidth;
    window.dispatchEvent(new Event("resize"));
  }
}

function assertCameraLayout(host: HTMLElement): void {
  const cameraToolbar = section(host, "Camera");
  const cameraInspector = [...host.querySelectorAll(".ek-inspector-section")]
    .find((candidate) => text(candidate).includes("Camera views")) as HTMLElement | undefined;
  expect(cameraInspector, "Expected Camera views inspector section").toBeTruthy();
  const originalWidth = host.style.width;
  try {
    for (const width of ["1280px", "390px"]) {
      host.style.width = width;
      window.dispatchEvent(new Event("resize"));
      assertChildrenInside(cameraToolbar, "Camera toolbar");
      assertChildrenInside(cameraInspector!, "Camera inspector");
    }
  } finally {
    host.style.width = originalWidth;
    window.dispatchEvent(new Event("resize"));
  }
}

function assertChildrenInside(container: HTMLElement, label: string): void {
  const parent = container.getBoundingClientRect();
  expect(parent.width, label).toBeGreaterThan(0);
  for (const child of container.querySelectorAll("button, input, .ek-inspector-camera-list")) {
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
