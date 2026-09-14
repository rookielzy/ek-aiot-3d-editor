import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { page, userEvent } from "vitest/browser";
import { expect, it, vi } from "vitest";
import { WebGLRenderer } from "three";
import { createEditor, resolveDefaultPresentationView, ThreeGltfLoaderAdapter, type EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "@ek-aiot/3d-editor-react";
import { App } from "../../../examples/react-proof-loop/src/App";
import { showcaseInteractions } from "../../../examples/react-proof-loop/src/showcase";
import modelUrl from "../../../examples/react-proof-loop/src/showcase/ToyCar.glb?url";

it.each(["en", "zh-CN"] as const)("edits the local showcase and restores its complete project in a fresh host in %s", async (locale) => {
  const originalSize = { width: window.innerWidth, height: window.innerHeight };
  await page.viewport(1440, 900);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.append(host);
  let root = createRoot(host);
  let renderer: WebGLRenderer;
  const rendererFactory: EditorRuntimeOptions["rendererFactory"] = () => {
    renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    return renderer;
  };
  const restored = createEditor();
  const downloads = captureDownloads();
  const label = (en: string, zh: string) => locale === "en" ? en : zh;
  const click = async (en: string, zh: string) => userEvent.click(findButton(host, label(en, zh)));
  const field = (en: string, zh: string) => {
    const name = label(en, zh);
    const input = host.querySelector(`[aria-label="${name}"]`) ?? [...host.querySelectorAll("label")].find((candidate) => candidate.textContent?.trim().startsWith(name))?.querySelector("input, select");
    expect(input, `Field ${name}`).toBeTruthy();
    return input as HTMLInputElement;
  };
  const edit = async (en: string, zh: string, value: string) => {
    await userEvent.fill(field(en, zh), value);
    await userEvent.keyboard("{Enter}{Tab}");
  };
  try {
    root.render(<StrictMode><App locale={locale} rendererFactory={rendererFactory} /></StrictMode>);
    await expect.poll(() => host.textContent, { timeout: 15000 }).toContain("Toy Car");
    await expect.poll(() => host.textContent).toContain("Studio view");
    await expect.poll(() => host.textContent).toContain(label("missing 0 · blocked 0", "缺失 0 · 阻塞 0"));
    await expect.poll(() => host.querySelector("canvas")).toBeTruthy();
    const canvas = host.querySelector("canvas");
    expect(host.textContent).toContain(label("Undo 0", "撤销 0"));
    const row = host.querySelector('[data-node-id="showcase-model"] .ek-workbench__tree-row')
      ?? [...host.querySelectorAll<HTMLButtonElement>(".ek-workbench__tree-row")].find((button) => button.textContent?.startsWith("Toy Car"));
    await userEvent.click(row!);
    await edit("Position X", "位置 X", "0.2");
    await click("Undo", "撤销");
    expect(field("Position X", "位置 X").value).toBe("0");
    await click("Redo", "重做");
    expect(field("Position X", "位置 X").value).toBe("0.2");
    const otherLocale = locale === "en" ? "zh-CN" : "en";
    root.render(<StrictMode><App locale={otherLocale} rendererFactory={rendererFactory} /></StrictMode>);
    await expect.poll(() => host.textContent).toContain(locale === "en" ? "选择 Toy Car" : "Selection Toy Car");
    expect(host.querySelector("canvas")).toBe(canvas);
    root.render(<StrictMode><App locale={locale} rendererFactory={rendererFactory} /></StrictMode>);
    await expect.poll(() => host.textContent).toContain(label("Selection Toy Car", "选择 Toy Car"));
    expect(field("Position X", "位置 X").value).toBe("0.2");
    const color = field("Base color", "基础色");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setValue.call(color, "#a8c9b6");
    color.dispatchEvent(new Event("input", { bubbles: true }));
    color.dispatchEvent(new Event("change", { bubbles: true }));
    await click("Environment", "环境");
    await userEvent.selectOptions(field("Lighting source", "灯光源") as unknown as HTMLSelectElement, "none");
    await userEvent.selectOptions(field("Lighting source", "灯光源") as unknown as HTMLSelectElement, "hdr");
    await userEvent.selectOptions(field("Lighting asset", "灯光资源") as unknown as HTMLSelectElement, "showcase-studio");
    await edit("Lighting intensity", "灯光强度", "1.4");
    await edit("Lighting rotation Y", "灯光旋转 Y", "0.6");
    await click("Scene", "场景");
    const key = [...host.querySelectorAll<HTMLButtonElement>(".ek-inspector-light-list button")].find((button) => button.textContent?.includes("Key light"))!;
    await userEvent.click(key);
    await edit("Intensity", "强度", "2.5");
    await click("Properties", "属性");
    await expect.poll(() => host.querySelector("canvas")).toBe(canvas);
    await click("Project menu", "项目菜单");
    await click("Export", "导出");
    await expect.poll(() => downloads.bytes, { timeout: 15000 }).toBeTruthy();
    // Compare the actual framebuffer, not merely a non-empty canvas or JSON equality.
    await frames();
    await expect.poll(() => pixels(renderer!).some((value) => value > 0)).toBe(true);
    const before = pixels(renderer!);
    const imported = restored.importProject(downloads.bytes!);
    expect(imported.ok).toBe(true);
    const snapshot = restored.getSnapshot();
    expect(snapshot.objects["showcase-model"].transform.position).toEqual([0.2, 0, 0]);
    expect(snapshot.environment.lighting).toEqual({ source: { kind: "hdr", assetId: "showcase-studio" }, intensity: 1.4, rotation: { x: 0, y: 0.6, z: 0 } });
    expect(snapshot.lights["showcase-key"].intensity).toBe(2.5);
    expect(snapshot.presentation.defaultCameraId).toBe("showcase-view");
    expect(snapshot.selection.nodeIds).toEqual(["showcase-key"]);
    expect(Object.values(snapshot.materials.definitions).some((material) => material.override.color === "#a8c9b6")).toBe(true);
    expect(restored.getAssetWorkspacePayloads?.()).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: "showcase-car", available: true, exportable: true }),
      expect.objectContaining({ assetId: "showcase-studio", available: true, exportable: true })
    ]));
    expect(JSON.stringify(snapshot)).not.toMatch(/blob:|Object3D|PMREM|zh-CN|panelWidth/);
    root.unmount();
    root = createRoot(host);
    restored.viewportHelpers?.setVisibility({ grid: true, hover: true, snapFeedback: true });
    root.render(<EditorWorkbench editor={restored} loader={new ThreeGltfLoaderAdapter()} locale={locale} rendererFactory={rendererFactory} interactions={showcaseInteractions}
      onRuntimeReady={(runtime) => {
        const view = resolveDefaultPresentationView(restored.getSnapshot());
        if (runtime && view.status === "resolved") runtime.applyCameraView(view.view);
      }} />);
    await expect.poll(() => restored.getRuntime()).toBeTruthy();
    await restored.getRuntime()!.project();
    await frames();
    expect(restored.getRuntime()!.getObject("showcase-model")).toBeTruthy();
    expect(restored.getRuntime()!.getProblems().filter((problem) => problem.severity === "error")).toEqual([]);
    const captured = restored.getRuntime()!.captureCameraView();
    expect(captured).toMatchObject({ ok: true, view: { position: [expect.closeTo(-3.4, 8), expect.closeTo(2.1, 8), expect.closeTo(5.5, 8)], target: [0, 0.45, 0], projection: { kind: "perspective", fov: 40 } } });
    await expect.poll(() => pixels(renderer!).some((value) => value > 0)).toBe(true);
    const after = pixels(renderer!);
    expect(after.length).toBe(before.length);
    let difference = 0;
    for (let index = 0; index < before.length; index++) difference += Math.abs(before[index] - after[index]);
    expect(difference / before.length).toBeLessThan(0.5);
  } finally {
    root.unmount();
    restored.dispose();
    downloads.restore();
    host.remove();
    await page.viewport(originalSize.width, originalSize.height);
  }
}, 90000);

it("recovers a failed default model download through the real problem drawer", async () => {
  const bytes = await (await fetch(modelUrl)).arrayBuffer();
  const fetchAsset = window.fetch.bind(window);
  const fetchMock = vi.spyOn(window, "fetch").mockImplementation((input, init) =>
    input === modelUrl ? Promise.resolve(new Response("Unavailable", { status: 503 })) : fetchAsset(input, init));
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0";
  document.body.append(host);
  const root = createRoot(host);
  const downloads = captureDownloads();
  try {
    root.render(<App />);
    await expect.poll(() => host.textContent, { timeout: 15000 }).toContain("Toy Car");
    fetchMock.mockRestore();
    await userEvent.click(findButton(host, "Problem details"));
    const drawer = host.querySelector<HTMLElement>(".ek-workbench__problems-drawer")!;
    await expect.poll(() => drawer.textContent).toContain("showcase-car");
    const input = drawer.querySelector<HTMLInputElement>('input[type="file"]')!;
    const data = new DataTransfer();
    data.items.add(new File([bytes], "ToyCar.glb", { type: "model/gltf-binary" }));
    input.files = data.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await expect.poll(() => drawer.textContent, { timeout: 10000 }).toContain("No problems.");
    await userEvent.click(findButton(host, "Close details"));
    await userEvent.click(findButton(host, "Project menu"));
    await userEvent.click(findButton(host, "Export"));
    await expect.poll(() => downloads.bytes).toBeTruthy();
    const fresh = createEditor();
    try {
      expect(fresh.importProject(downloads.bytes!).ok).toBe(true);
      expect(fresh.getSnapshot().objects["showcase-model"].asset.id).toBe("showcase-car");
    } finally { fresh.dispose(); }
  } finally {
    fetchMock.mockRestore();
    root.unmount();
    downloads.restore();
    host.remove();
  }
}, 25000);

function findButton(host: HTMLElement, name: string): HTMLButtonElement {
  const candidates = [...host.querySelectorAll<HTMLButtonElement>("button")].filter((button) => button.getAttribute("aria-label") === name || button.textContent === name);
  const button = candidates.find((candidate) => candidate.checkVisibility());
  expect(button, `Visible button ${name}`).toBeTruthy();
  return button!;
}

function pixels(renderer: WebGLRenderer): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = renderer.domElement.width;
  canvas.height = renderer.domElement.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(renderer.domElement, 0, 0);
  return new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
}

async function frames() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function captureDownloads() {
  const blobs = new Map<string, Blob>();
  const create = URL.createObjectURL.bind(URL);
  const createMock = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    const url = create(blob);
    if (blob instanceof Blob) blobs.set(url, blob);
    return url;
  });
  const result = { bytes: undefined as Uint8Array | undefined, restore: () => { createMock.mockRestore(); clickMock.mockRestore(); } };
  const clickMock = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    const blob = blobs.get(this.href);
    if (blob) void blob.arrayBuffer().then((buffer) => { result.bytes = new Uint8Array(buffer); });
  });
  return result;
}
