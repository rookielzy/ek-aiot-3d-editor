import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { AssetResolverBridge, type Editor } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";
import InspectorStyles from "../src/components/inspector.css?raw";
import WorkbenchStyles from "../src/components/workbench.css?raw";
import {
  assertDesktopLayout,
  assertNoControlOverlap,
  assertTextContained,
  assertVerticalOrder,
  canvasFor,
  changeColorInput,
  changeNumberInput,
  clickByText,
  copyBytes,
  createDefaultWorkbenchFixtureEditor,
  findFieldInput,
  hasNonBlankCanvasPixel,
  installDownloadCapture,
  installStyles,
  paintedRenderer,
  removeStyles,
  section,
  text,
  uploadFile,
  waitFor,
  waitForAnimationFrame,
  waitForWorkbench
} from "./default-workbench-browser-helpers";

describe("React default EditorWorkbench browser acceptance", () => {
  let cleanup: (() => void) | null = null;

  afterEach(async () => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = "";
    removeStyles("react-default-workbench-browser");
    await page.viewport(1280, 900);
    delete window.__lastDownloadedProject;
  });

  it("keeps desktop regions ordered without overlapping controls", async () => {
    await page.viewport(1280, 900);
    const editor = createDefaultWorkbenchFixtureEditor();
    const mounted = mountWorkbench(editor);
    cleanup = mounted.cleanup;

    await waitForWorkbench(mounted.host, flushUi);

    const toolbar = section(mounted.host, "Editor controls");
    const leftPanel = section(mounted.host, "Project panel");
    const viewport = section(mounted.host, "3D viewport");
    const inspector = section(mounted.host, "Inspector panel");
    const status = section(mounted.host, "Editor status");

    assertDesktopLayout({ toolbar, leftPanel, viewport, inspector, status });
    assertNoControlOverlap(mounted.host);
  });

  it("stacks narrow regions predictably and keeps text contained", async () => {
    await page.viewport(390, 900);
    const editor = createDefaultWorkbenchFixtureEditor();
    const mounted = mountWorkbench(editor);
    cleanup = mounted.cleanup;

    await waitForWorkbench(mounted.host, flushUi);

    const toolbar = section(mounted.host, "Editor controls");
    const viewport = section(mounted.host, "3D viewport");
    const leftPanel = section(mounted.host, "Project panel");
    const inspector = section(mounted.host, "Inspector panel");
    const status = section(mounted.host, "Editor status");

    assertVerticalOrder([toolbar, viewport, leftPanel, inspector, status]);
    assertTextContained(mounted.host);
    assertNoControlOverlap(mounted.host);
  });

  it("renders a nonblank canvas and runs the default edit/export/restore flow", async () => {
    await page.viewport(1280, 900);
    const editor = createDefaultWorkbenchFixtureEditor();
    const mounted = mountWorkbench(editor);
    cleanup = mounted.cleanup;

    const restoreDownloadCapture = installDownloadCapture("blob:react-default-workbench-project");
    try {
      await waitForWorkbench(mounted.host, flushUi);
      const canvas = canvasFor(mounted.host);
      await waitFor(() => {
        expect(canvas.width).toBeGreaterThan(1);
        expect(canvas.height).toBeGreaterThan(1);
        expect(hasNonBlankCanvasPixel(canvas)).toBe(true);
      }, flushUi);

      await clickByText(mounted.host, "Workbench cube", flushUi);
      await waitFor(() => expect(text(section(mounted.host, "Editor status"))).toContain("Selection Workbench cube"), flushUi);

      const positionX = findFieldInput(mounted.host, "Position X", 'input[type="number"]') as HTMLInputElement | null;
      expect(positionX, "Expected transform Position X input").toBeTruthy();
      const undoCountBeforeEdit = editor.getHistoryState().undoCount;
      await changeNumberInput(positionX!, "2", flushUi);
      expect(editor.getSnapshot().objects["object-a"].transform.position[0]).toBe(2);
      expect(editor.getHistoryState().undoCount).toBe(undoCountBeforeEdit + 1);
      expect(text(section(mounted.host, "Editor status"))).toContain("Dirty");

      await clickByText(mounted.host, "Undo", flushUi);
      await waitFor(() => expect(editor.getSnapshot().objects["object-a"].transform.position[0]).toBe(0), flushUi);
      await clickByText(mounted.host, "Redo", flushUi);
      await waitFor(() => expect(editor.getSnapshot().objects["object-a"].transform.position[0]).toBe(2), flushUi);

      const colorInput = findFieldInput(mounted.host, "Base color", 'input[type="color"]') as HTMLInputElement | null;
      expect(colorInput, "Expected material Base color input").toBeTruthy();
      await changeColorInput(colorInput!, "#00aa88", flushUi);
      expect(editor.getSnapshot().materials.definitions["mat-a"].override.color).toBe("#00aa88");

      const environmentColor = findFieldInput(mounted.host, "Background color", 'input[type="color"]') as HTMLInputElement | null;
      expect(environmentColor, "Expected environment Background color input").toBeTruthy();
      await changeColorInput(environmentColor!, "#203040", flushUi);
      expect(editor.getSnapshot().environment.background.color).toBe("#203040");

      await clickByText(mounted.host, "Workbench light", flushUi);
      const intensityInput = findFieldInput(mounted.host, "Intensity", 'input[type="number"]') as HTMLInputElement | null;
      expect(intensityInput, "Expected light Intensity input").toBeTruthy();
      await changeNumberInput(intensityInput!, "3", flushUi);
      expect(editor.getSnapshot().lights["light-a"].intensity).toBe(3);

      await clickByText(mounted.host, "Export partial", flushUi);
      await waitFor(() => expect(window.__lastDownloadedProject).toBeInstanceOf(Uint8Array), flushUi);
      const exported = copyBytes(window.__lastDownloadedProject!);
      expect(JSON.stringify(editor.serialize())).not.toContain("asset-unresolved");

      await uploadFile(
        section(mounted.host, "Project actions").querySelector('input[type="file"]') as HTMLInputElement,
        new File([exported], "react-workbench.ek3d", { type: "application/octet-stream" }),
        flushUi
      );
      await waitFor(() => expect(text(mounted.host)).toContain("Opened react-workbench.ek3d"), flushUi);
      await waitFor(() => expect(text(section(mounted.host, "Missing asset recovery"))).toContain("Replace asset"), flushUi);

      const recoveryInput = section(mounted.host, "Missing asset recovery").querySelector('input[type="file"]') as HTMLInputElement | null;
      expect(recoveryInput, "Expected missing asset recovery input").toBeTruthy();
      await uploadFile(recoveryInput!, new File([new Uint8Array([5, 6, 7, 8])], "recovered.glb", { type: "model/gltf-binary" }), flushUi);
      await waitFor(() => {
        expect(mounted.host.querySelector('[aria-label="Missing asset recovery"]')).toBeNull();
        expect(text(section(mounted.host, "Editor status"))).toContain("Problems 0");
      }, flushUi);
    } finally {
      restoreDownloadCapture();
    }
  }, 15000);
});

function mountWorkbench(editor: Editor): { host: HTMLElement; cleanup(): void } {
  installStyles("react-default-workbench-browser", [WorkbenchStyles, InspectorStyles]);
  const host = document.createElement("div");
  host.id = "react-default-workbench-host";
  document.body.append(host);
  const root: Root = createRoot(host);
  root.render(
    <EditorWorkbench
      editor={editor}
      rendererFactory={paintedRenderer}
      resolver={new AssetResolverBridge((asset) => asset.id === "asset-a" ? { uri: `memory://${asset.id}` } : null)}
    />
  );

  return {
    host,
    cleanup() {
      root.unmount();
      editor.dispose();
    }
  };
}

function flushUi(): Promise<void> {
  return waitForAnimationFrame();
}

declare global {
  interface Window {
    __lastDownloadedProject?: Uint8Array;
  }
}
