import { expect } from "vitest";
import { createEditor, type Editor, type RendererLike } from "@ek-aiot/3d-editor-core";

export function createDefaultWorkbenchFixtureEditor(): Editor {
  const editor = createEditor();
  editor.dispatch({
    type: "register-asset",
    asset: {
      id: "recoverable-asset",
      kind: "glb",
      label: "Recoverable asset"
    }
  });
  editor.dispatch({
    type: "import-glb",
    objectId: "object-a",
    name: "Workbench cube",
    asset: { id: "asset-a", label: "cube.glb", source: new Uint8Array([1, 2, 3, 4]) }
  });
  editor.dispatch({
    type: "set-material",
    target: { kind: "object", objectId: "object-a" },
    materialId: "mat-a",
    materialName: "Workbench material",
    material: { color: "#f4d35e" }
  });
  editor.dispatch({
    type: "import-glb",
    objectId: "object-missing",
    name: "Missing model",
    asset: { id: "recoverable-asset" }
  });
  editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "point", name: "Workbench light", intensity: 1 } });
  editor.dispatch({ type: "select-node", nodeId: "object-a" });
  return editor;
}

export function paintedRenderer(container: HTMLElement): RendererLike {
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

export function assertDesktopLayout(regions: {
  toolbar: HTMLElement;
  leftPanel: HTMLElement;
  viewport: HTMLElement;
  inspector: HTMLElement;
  status: HTMLElement;
}): void {
  const toolbar = regions.toolbar.getBoundingClientRect();
  const left = regions.leftPanel.getBoundingClientRect();
  const viewport = regions.viewport.getBoundingClientRect();
  const inspector = regions.inspector.getBoundingClientRect();
  const status = regions.status.getBoundingClientRect();

  expect(toolbar.bottom).toBeLessThanOrEqual(viewport.top + 1);
  expect(left.right).toBeLessThanOrEqual(viewport.left + 1);
  expect(viewport.right).toBeLessThanOrEqual(inspector.left + 1);
  expect(viewport.bottom).toBeLessThanOrEqual(status.top + 1);
  expect(left.top).toBeLessThanOrEqual(viewport.top + 1);
  expect(inspector.top).toBeLessThanOrEqual(viewport.top + 1);
  expect(viewport.width).toBeGreaterThan(400);
  expect(viewport.height).toBeGreaterThan(400);
}

export function assertVerticalOrder(elements: HTMLElement[]): void {
  for (let index = 1; index < elements.length; index += 1) {
    const previous = elements[index - 1].getBoundingClientRect();
    const current = elements[index].getBoundingClientRect();
    expect(previous.bottom).toBeLessThanOrEqual(current.top + 1);
    expect(current.width).toBeLessThanOrEqual(window.innerWidth);
  }
}

export function assertNoControlOverlap(host: HTMLElement): void {
  const controls = [...host.querySelectorAll("button, label.ek-workbench__file-action")] as HTMLElement[];
  for (let index = 0; index < controls.length; index += 1) {
    const first = controls[index].getBoundingClientRect();
    if (!isVisibleBox(first)) {
      continue;
    }
    for (let nextIndex = index + 1; nextIndex < controls.length; nextIndex += 1) {
      const second = controls[nextIndex].getBoundingClientRect();
      if (!isVisibleBox(second)) {
        continue;
      }
      expect(overlapArea(first, second), `${text(controls[index])} overlaps ${text(controls[nextIndex])}`).toBe(0);
    }
  }
}

export function assertTextContained(host: HTMLElement): void {
  const textElements = [...host.querySelectorAll("button, span, small, strong, dd, dt, h2")] as HTMLElement[];
  for (const element of textElements) {
    const rect = element.getBoundingClientRect();
    if (!isVisibleBox(rect)) {
      continue;
    }
    expect(rect.right, `Text escaped viewport: ${text(element)}`).toBeLessThanOrEqual(window.innerWidth + 1);
    expect(element.scrollWidth, `Text overflowed element: ${text(element)}`).toBeLessThanOrEqual(element.clientWidth + 1);
  }
}

export function canvasFor(host: HTMLElement): HTMLCanvasElement {
  const canvas = section(host, "3D viewport").querySelector("canvas") as HTMLCanvasElement | null;
  expect(canvas, "Expected runtime canvas").toBeTruthy();
  return canvas!;
}

export function hasNonBlankCanvasPixel(canvas: HTMLCanvasElement): boolean {
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

export async function waitForWorkbench(host: HTMLElement, flushUi: () => Promise<void>): Promise<void> {
  await waitFor(async () => {
    expect(section(host, "Editor controls")).toBeTruthy();
    expect(section(host, "Project panel")).toBeTruthy();
    expect(section(host, "3D viewport")).toBeTruthy();
    expect(section(host, "Inspector panel")).toBeTruthy();
    expect(section(host, "Editor status")).toBeTruthy();
    expect(text(host)).toContain("Workbench cube");
    expect(canvasFor(host).width).toBeGreaterThan(1);
  }, flushUi);
}

export async function clickByText(host: HTMLElement, label: string, flushUi: () => Promise<void>): Promise<void> {
  const target = [...host.querySelectorAll("button")].find((candidate) => text(candidate) === label) as HTMLButtonElement | undefined;
  expect(target, `Expected button ${label}`).toBeTruthy();
  target!.click();
  await flushUi();
}

export function section(host: HTMLElement, label: string): HTMLElement {
  const element = host.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
  expect(element, `Expected [aria-label="${label}"]`).toBeTruthy();
  return element!;
}

export function findFieldInput(host: HTMLElement, label: string, selector: string): Element | null {
  const field = [...host.querySelectorAll("label")].find((candidate) => text(candidate).includes(label));
  return field?.querySelector(selector) ?? null;
}

export async function changeNumberInput(input: HTMLInputElement, value: string, flushUi: () => Promise<void>): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  await flushUi();
}

export async function changeColorInput(input: HTMLInputElement, value: string, flushUi: () => Promise<void>): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await flushUi();
}

export async function uploadFile(input: HTMLInputElement, file: File, flushUi: () => Promise<void>): Promise<void> {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file]
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await flushUi();
}

export async function waitFor(assertion: () => void | Promise<void>, flushUi: () => Promise<void>, timeout = 5000): Promise<void> {
  const startedAt = performance.now();
  let lastError: unknown;
  while (performance.now() - startedAt < timeout) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await flushUi();
    }
  }
  throw lastError;
}

export function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function text(element: Element): string {
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

export function installStyles(id: string, blocks: string[]): void {
  removeStyles(id);
  const style = document.createElement("style");
  style.id = id;
  style.textContent = blocks.join("\n");
  document.head.append(style);
}

export function removeStyles(id: string): void {
  document.getElementById(id)?.remove();
}

export function installDownloadCapture(objectUrl: string): () => void {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = ((blob: Blob) => {
    void blob.arrayBuffer().then((buffer) => {
      window.__lastDownloadedProject = new Uint8Array(buffer);
    });
    return objectUrl;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  HTMLAnchorElement.prototype.click = () => undefined;

  return () => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    HTMLAnchorElement.prototype.click = originalAnchorClick;
  };
}

export function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function paintCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D | null, color: string): void {
  if (!context) {
    return;
  }
  context.fillStyle = color;
  context.fillRect(0, 0, Math.max(1, canvas.width), Math.max(1, canvas.height));
  context.fillStyle = "#f4d35e";
  context.fillRect(8, 8, 48, 48);
}

function isVisibleBox(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

function overlapArea(first: DOMRect, second: DOMRect): number {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  return Math.round(width * height);
}

declare global {
  interface Window {
    __lastDownloadedProject?: Uint8Array;
  }
}
