import React from "react";
import { createRoot } from "react-dom/client";
import { createApp, type App as VueApp } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import type { RendererLike } from "@ek-aiot/3d-editor-core";
import { App as ReactProofLoopApp } from "../../../examples/react-proof-loop/src/App";
import ReactDemoStyles from "../../../examples/react-proof-loop/src/styles.css?raw";
import VueProofLoopApp from "../../../examples/vue-proof-loop/src/App.vue";
import VueDemoStyles from "../../../examples/vue-proof-loop/src/styles.css?raw";
import WorkbenchStyles from "../src/components/workbench.css?raw";
import InspectorStyles from "../src/components/inspector.css?raw";

describe("proof-loop demo browser verification", () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = "";
  });

  it("drives the React demo through visible checklist states and canvas smoke checks", async () => {
    const root = mountReactDemo();
    cleanup = root.cleanup;

    await verifyDemoFlow(root.host);
  }, 15000);

  it("drives the Vue demo through the same visible checklist states and final shape", async () => {
    const root = mountVueDemo();
    cleanup = root.cleanup;

    await verifyDemoFlow(root.host);
  }, 15000);
});

async function verifyDemoFlow(host: HTMLElement): Promise<void> {
  await waitFor(() => {
    expect(text(testId(host, "demo-hierarchy"))).toContain("Simple box");
    expect(text(testId(host, "demo-hierarchy"))).toContain("simple-box");
    expect(text(testId(host, "demo-hierarchy"))).toContain("Recoverable asset");
    expect(text(testId(host, "demo-hierarchy"))).toContain("Ambient light");
  });
  expect(testId(host, "demo-hierarchy").querySelector('[data-node-kind="light"][data-light-id="fill"]')).toBeTruthy();
  expect(text(testId(host, "demo-selection-count"))).toContain("Simple box (1)");
  expect(text(testId(host, "demo-assets"))).toContain("recoverable-box");

  const viewport = host.querySelector(".demo-viewport") as HTMLElement | null;
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

  await clickByText(host, "Nudge primary");
  await expectChecklist(host, "Transform command changed history");
  await expectChecklist(host, "Undo is available");

  await clickByText(host, "Undo");
  await expectChecklist(host, "Redo is available");
  await clickByText(host, "Redo");

  await clickByText(host, "Frame selected");
  await expectChecklist(host, "Camera helper used");

  await clickByText(host, "Snap move");
  await expectChecklist(host, "Snap/mode status visible");
  expect(text(testId(host, "demo-toolbar-state"))).toContain("snap move");

  const colorInput = findFieldInput(host, "Base color", 'input[type="color"]') as HTMLInputElement | null;
  expect(colorInput, "Expected material inspector Base color input").toBeTruthy();
  colorInput!.value = "#00aa88";
  colorInput!.dispatchEvent(new Event("input", { bubbles: true }));
  colorInput!.dispatchEvent(new Event("change", { bubbles: true }));
  await expectChecklist(host, "Material inspector changed runtime");
  await waitFor(() => {
    expect(text(testId(host, "demo-status"))).toContain("Undo");
  });

  await clickByText(host, "Duplicate");
  await expectChecklist(host, "Copy/paste or duplicate ran");

  await clickByText(host, "Group demo");
  await expectChecklist(host, "Hierarchy operation changed nesting");

  await clickByText(host, "Export project");
  await expectChecklist(host, "Project exported");

  await clickByText(host, "Reopen package");
  await expectChecklist(host, "Project reopened");
  await waitFor(() => {
    expect(text(testId(host, "demo-problem-badge"))).toContain("1 problems");
    expect(text(testId(host, "demo-status"))).not.toContain("asset-unresolved");
  });
  await expectChecklist(host, "Missing asset surfaced");

  await clickByText(host, "Replace missing asset");
  await expectChecklist(host, "Missing asset recovered");
  await waitFor(() => {
    expect(text(testId(host, "demo-problem-badge"))).toContain("0 problems");
  });
  expect(text(testId(host, "demo-assets"))).toContain("recoverable-box");

  const checklistLabels = checklist(host).map((item) => item.textContent?.replace(/^(OK|--)/, "").trim());
  expect(checklistLabels).toEqual([
    "Hierarchy lists seeded scene",
    "Selection is visible",
    "Camera helper used",
    "Transform command changed history",
    "Material inspector changed runtime",
    "Undo is available",
    "Redo is available",
    "Hierarchy operation changed nesting",
    "Copy/paste or duplicate ran",
    "Project exported",
    "Project reopened",
    "Missing asset surfaced",
    "Missing asset recovered",
    "Snap/mode status visible"
  ]);
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
  const button = [...host.querySelectorAll("button")].find((candidate) => text(candidate) === label);
  expect(button, `Expected button ${label}`).toBeTruthy();
  button!.click();
  await waitForAnimationFrame();
}

async function expectChecklist(host: HTMLElement, label: string): Promise<void> {
  await waitFor(() => {
    const item = checklist(host).find((candidate) => text(candidate).includes(label));
    expect(item, `Expected checklist item ${label}`).toBeTruthy();
    expect(item!.dataset.complete).toBe("true");
  });
}

function checklist(host: HTMLElement): HTMLLIElement[] {
  return [...testId(host, "demo-checklist").querySelectorAll("li")];
}

function testId(host: HTMLElement, id: string): HTMLElement {
  const element = host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  expect(element, `Expected [data-testid="${id}"]`).toBeTruthy();
  return element!;
}

function text(element: Element): string {
  return element.textContent?.trim() ?? "";
}

function findFieldInput(host: HTMLElement, label: string, selector: string): Element | null {
  const field = [...host.querySelectorAll("label")].find((candidate) => text(candidate).includes(label));
  return field?.querySelector(selector) ?? null;
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
