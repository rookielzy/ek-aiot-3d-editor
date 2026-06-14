import React from "react";
import { createRoot } from "react-dom/client";
import { createApp, type App as VueApp } from "vue";
import { afterEach, describe, expect, it } from "vitest";
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
    expect(text(section(host, "Assets"))).toContain("glb");
    expect(text(section(host, "Assets"))).toContain("missing payload");
    expect(text(section(host, "Assets"))).toContain("blocked");
    expect(text(section(host, "Assets"))).toContain("1 refs");
    assertAssetWorkspaceLayout(host);
    expect(text(testId(host, "starter-overlay"))).toContain("3 objects");
    expect(text(host)).toContain("Selection Simple box");

    const viewport = host.querySelector(".starter-viewport") as HTMLElement | null;
    expect(viewport).toBeTruthy();
    const canvas = viewport!.querySelector("canvas") as HTMLCanvasElement | null;
    expect(canvas).toBeTruthy();
    await waitFor(() => {
      expect(canvas!.width).toBeGreaterThan(1);
      expect(canvas!.height).toBeGreaterThan(1);
      expect(canvas!.getBoundingClientRect().width).toBeGreaterThan(100);
      expect(canvas!.getBoundingClientRect().height).toBeGreaterThan(100);
      expect(hasNonBlankCanvasPixel(canvas!)).toBe(true);
    });

    await dragMarquee(canvas!, { x: 35, y: 35 }, { x: 135, y: 165 });
    await waitFor(() => {
      expect(text(host)).toContain("Selection 2 nodes");
      expect(text(section(host, "Hierarchy"))).toContain("Detail block selected");
      expect(text(section(host, "Hierarchy"))).toContain("Simple box selected primary");
    });

    await clickByText(host, "Snap move");
    expect(button(host, "Snap move")?.getAttribute("aria-pressed")).toBe("true");

    const positionX = findFieldInput(host, "Position X", 'input[type="number"]') as HTMLInputElement | null;
    expect(positionX, "Expected transform Position X input").toBeTruthy();
    positionX!.focus();
    positionX!.value = "2";
    positionX!.dispatchEvent(new Event("input", { bubbles: true }));
    positionX!.blur();
    await waitFor(() => {
      expect(text(host)).toContain("Undo 1");
      expect(text(host)).toContain("Dirty");
    });

    await clickByText(host, "Undo");
    await waitFor(() => expect(text(host)).toContain("Redo 1"));
    await clickByText(host, "Redo");

    const colorInput = findFieldInput(host, "Base color", 'input[type="color"]') as HTMLInputElement | null;
    expect(colorInput, "Expected material inspector Base color input").toBeTruthy();
    colorInput!.value = "#00aa88";
    colorInput!.dispatchEvent(new Event("input", { bubbles: true }));
    colorInput!.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => expect(text(host)).toContain("Dirty"));

    await clickByText(host, "Duplicate");
    await waitFor(() => expect(text(section(host, "Project"))).toContain("Objects4"));

    await clickByText(host, "Export partial");
    await waitFor(() => expect(text(host)).toContain("Exported partial project"));
    await waitFor(() => expect(window.__lastDownloadedProject).toBeInstanceOf(Uint8Array));
    expect(JSON.stringify(window.__lastDownloadedProject)).not.toContain("asset-unresolved");
    expectExportedMarqueeSelection(window.__lastDownloadedProject!);

    const openInput = section(host, "Project actions").querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(openInput, "Expected default Open project file input").toBeTruthy();
    await uploadFile(openInput!, new File([copyBytes(window.__lastDownloadedProject!)], "starter.ek3d", { type: "application/octet-stream" }));
    await waitFor(() => expect(text(host)).toContain("Opened starter.ek3d"));
    await waitFor(() => {
      expect(text(host)).toContain("Selection 2 nodes");
      expect(text(section(host, "Hierarchy"))).toContain("Detail block selected");
      expect(text(section(host, "Hierarchy"))).toContain("Simple box selected primary");
    });

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

function expectExportedMarqueeSelection(bytes: Uint8Array): void {
  const files = defaultArchiveAdapter.read(bytes);
  const scene = decodeArchiveJson(files.find((entry) => entry.path === "scene.json")!.bytes) as { selection: { nodeIds: string[] } };
  expect(scene.selection.nodeIds).toEqual(["detail", "box"]);
  const serialized = JSON.stringify(scene);
  expect(serialized).not.toContain("marquee");
  expect(serialized).not.toContain("candidateNodeIds");
  expect(serialized).not.toContain("PointerEvent");
}

function button(host: HTMLElement, label: string): HTMLButtonElement | null {
  return [...host.querySelectorAll("button")].find((candidate) => text(candidate) === label) ?? null;
}

function section(host: HTMLElement, label: string): HTMLElement {
  const element = host.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
  expect(element, `Expected [aria-label="${label}"]`).toBeTruthy();
  return element!;
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
