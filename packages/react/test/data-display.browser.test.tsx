import { createRoot } from "react-dom/client";
import { BoxGeometry, Mesh, MeshBasicMaterial, Sprite, Vector3, WebGLRenderer } from "three";
import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { AssetResolverBridge, createEditor, type EditorRuntime, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench } from "../src/components/EditorWorkbench";

function canvasRenderer(container: HTMLElement): RendererLike {
  const canvas = container.ownerDocument.createElement("canvas");
  canvas.dataset.testid = "data-display-canvas";
  return {
    domElement: canvas,
    setSize(width, height) {
      canvas.width = width;
      canvas.height = height;
    },
    render(scene, camera) {
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
    },
    dispose() {}
  };
}

it("searches and selects devices, adds a live field, and restores the configured card", async () => {
  const requests: string[] = [];
  const editor = createEditor({
    executor: (request) => {
      const path = new URL(request.url).pathname;
      requests.push(path);
      return {
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(path === "/devices"
          ? Array.from({ length: 2000 }, (_, i) => ({ deviceId: `pump-${i}`, deviceName: `Water pump ${i}` }))
          : [{ deviceId: "pump-1999", runningStatus: 1, runningStatusEnum: [{ value: 1, desc: "Running" }],
            data: [{ key: "temperature", desc: "Temperature", valueType: "number", value: 0, unit: "°C" }] }])
      };
    }
  });
  expect(editor.dispatch({
    type: "create-data-connection",
    connection: {
      id: "plant", name: "Plant", baseUrl: "https://example.test", auth: { kind: "none" }, headers: {}, timeoutMs: 5000,
      deviceEndpoints: {
        deviceList: { method: "GET", readOnly: true, path: "/devices", parameters: [] },
        deviceRealtime: { method: "GET", readOnly: true, path: "/realtime", parameters: [] }
      }
    }
  }).ok).toBe(true);
  const host = document.body.appendChild(document.createElement("div"));
  host.style.height = "700px";
  const root = createRoot(host);
  const runtime: { current: EditorRuntime | null } = { current: null };
  try {
    root.render(<EditorWorkbench editor={editor} locale="en" rendererFactory={canvasRenderer}
      onRuntimeReady={(value) => { runtime.current = value; }} />);
    await page.getByRole("tab", { name: "Data display" }).click();
    const devices = page.getByRole("combobox", { name: "Search devices" });
    await expect.element(devices).toBeEnabled();
    await devices.click();
    await expect.element(page.getByRole("option", { name: /Water pump 0/ })).toBeVisible();
    expect(document.querySelectorAll('[role="option"]').length).toBeLessThan(100);
    await devices.fill("pump-1999");
    await page.getByRole("option", { name: /Water pump 1999/ }).click();
    await expect.poll(() => host.querySelector(".ek-data-display")?.textContent).toContain("1 selected");
    await devices.fill("pump-1234");
    await page.getByRole("option", { name: /Water pump 1234/ }).click();
    await expect.poll(() => host.querySelector(".ek-data-display")?.textContent).toContain("2 selected");
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByText("2 selected")).toBeVisible();
    await expect.element(page.getByText("Temperature · 0 °C")).toBeVisible();
    await page.getByRole("button", { name: "Add Temperature to canvas" }).click();
    const nodeId = editor.getSnapshot().selection.nodeId!;
    await expect.poll(() => runtime.current?.getNodeTarget(nodeId)?.parent?.type).toBe("Scene");
    const preview = page.getByLabelText("Canvas text");
    await expect.element(preview).toHaveTextContent(/^0$/);
    function hasTextBeyondSingleDigit() {
      const sprite = runtime.current?.getNodeTarget(nodeId)?.children.find((child) => child instanceof Sprite);
      const texture = sprite?.material.map?.image;
      if (!(texture instanceof HTMLCanvasElement)) return undefined;
      const pixels = texture.getContext("2d")?.getImageData(24, 2, texture.width - 26, texture.height - 4).data;
      return pixels?.some((value, index) => index % 4 === 0 && value > 128);
    }
    await expect.poll(hasTextBeyondSingleDigit).toBe(false);
    const prefix = page.getByRole("textbox", { name: "Prefix", exact: true });
    const fillPrefix = page.getByRole("combobox", { name: "Quick fill prefix" });
    await fillPrefix.click();
    await page.getByRole("option", { name: "Device name", exact: true }).click();
    await fillPrefix.click();
    await page.getByRole("option", { name: "Parameter name", exact: true }).click();
    await expect.element(prefix).toHaveValue("Water pump 1999 Temperature ");
    await prefix.fill("Inlet: ");
    await userEvent.keyboard("{Enter}");
    await page.getByRole("combobox", { name: "Quick fill suffix" }).click();
    await page.getByRole("option", { name: "Unit", exact: true }).click();
    await expect.element(preview).toHaveTextContent(/^Inlet: 0 °C$/);
    await expect.poll(hasTextBeyondSingleDigit).toBe(true);
    const width = page.getByRole("spinbutton", { name: "Width (px)" });
    await width.fill("200");
    await userEvent.keyboard("{Enter}");
    const x = page.getByRole("spinbutton", { name: "X", exact: true });
    await x.fill("3");
    await userEvent.keyboard("{Enter}");
    expect(editor.getSnapshot().nodes[nodeId]).toMatchObject({
      kind: "data-display", source: { connectionId: "plant", deviceId: "pump-1999", fieldKey: "temperature" },
      style: { width: 200, prefix: "Inlet: ", suffix: " °C" }, transform: { position: [3, 0, 0] }
    });
    expect(editor.undo().snapshot.nodes[nodeId].transform?.position).toEqual([0, 0, 0]);
    const saved = editor.serialize();
    expect(JSON.stringify(saved)).not.toContain("runningStatusEnum");
    const readsBeforeRestore = requests.filter((path) => path === "/realtime").length;
    editor.restore(saved);
    await expect.element(width).toHaveValue(200);
    await expect.element(prefix).toHaveValue("Inlet: ");
    await expect.element(page.getByRole("textbox", { name: "Suffix", exact: true })).toHaveValue(" °C");
    await expect.poll(() => requests.filter((path) => path === "/realtime").length).toBeGreaterThan(readsBeforeRestore);
  } finally {
    root.unmount();
    editor.dispose();
    host.remove();
  }
});

it("picks a card in the viewport and drags its X translation handle", async () => {
  const editor = createEditor();
  editor.dispatch({ type: "create-data-connection", connection: {
    id: "plant", name: "Plant", baseUrl: "https://example.test", auth: { kind: "none" }, headers: {}, timeoutMs: 5000
  } });
  editor.dispatch({
    type: "create-data-display", nodeId: "temperature", name: "Temperature",
    source: { connectionId: "plant", deviceId: "pump", fieldKey: "temperature" }
  });
  editor.dispatch({ type: "select-node", nodeId: null });
  await editor.getDataService()?.startPreview();
  editor.transformMode.set("rotate");
  const host = document.body.appendChild(document.createElement("div"));
  host.style.height = "700px";
  const root = createRoot(host);
  try {
    root.render(<EditorWorkbench editor={editor} locale="en" rendererFactory={canvasRenderer}
      onRuntimeReady={(runtime) => runtime?.applyCameraView({
        id: "front", name: "Front", projection: { kind: "perspective", fov: 50 },
        position: [0, 0, 6], target: [0, 0, 0], near: 0.1, far: 1000
      })} />);
    await expect.poll(() => editor.getRuntime()?.getNodeTarget("temperature")?.parent?.type).toBe("Scene");
    const canvas = page.getByTestId("data-display-canvas");
    await canvas.click();
    await expect.element(page.getByRole("tab", { name: "Data display" })).toHaveAttribute("aria-selected", "true");
    expect(editor.getSnapshot().selection.nodeId).toBe("temperature");
    const bounds = canvas.element().getBoundingClientRect();
    await canvas.dropTo(canvas, {
      sourcePosition: { x: bounds.width / 2 + bounds.height * 0.075, y: bounds.height / 2 },
      targetPosition: { x: bounds.width / 2 + bounds.height * 0.075 + 28, y: bounds.height / 2 }
    });
    const x = editor.getSnapshot().nodes.temperature.transform!.position[0];
    expect(x).toBeGreaterThan(0);
    expect(Number((page.getByRole("spinbutton", { name: "X", exact: true }).element() as HTMLInputElement).value)).toBeCloseTo(x);
    expect(editor.undo().snapshot.nodes.temperature.transform?.position).toEqual([0, 0, 0]);
  } finally {
    root.unmount();
    editor.dispose();
    host.remove();
  }
});

it("picks a model behind the card and preserves the world position on detach", async () => {
  const editor = createEditor();
  editor.dispatch({ type: "create-data-connection", connection: {
    id: "plant", name: "Plant", baseUrl: "https://example.test", auth: { kind: "none" }, headers: {}, timeoutMs: 5000
  } });
  editor.dispatch({ type: "import-glb", objectId: "pump", name: "Pump", asset: { id: "pump-model" } });
  editor.dispatch({
    type: "create-data-display", nodeId: "temperature", name: "Temperature", position: [0, 0, 2],
    source: { connectionId: "plant", deviceId: "pump", fieldKey: "temperature" }
  });
  const host = document.body.appendChild(document.createElement("div"));
  host.style.height = "700px";
  const root = createRoot(host);
  const resolver = new AssetResolverBridge(() => ({ uri: "/pump.glb" }));
  const loader = { load: async () => new Mesh(new BoxGeometry(), new MeshBasicMaterial()) };
  try {
    root.render(<EditorWorkbench editor={editor} locale="en" rendererFactory={canvasRenderer} resolver={resolver} loader={loader}
      onRuntimeReady={(runtime) => runtime?.applyCameraView({
        id: "front", name: "Front", projection: { kind: "perspective", fov: 50 },
        position: [0, 0, 6], target: [0, 0, 0], near: 0.1, far: 1000
      })} />);
    await expect.poll(() => editor.getRuntime()?.getNodeTarget("temperature")?.parent?.type).toBe("Scene");
    const pick = page.getByRole("button", { name: "Pick a model in the viewport" });
    await pick.click();
    await userEvent.keyboard("{Escape}");
    await expect.element(pick).toBeVisible();
    expect(editor.getSnapshot().selection.nodeId).toBe("temperature");
    await pick.click();
    await page.getByTestId("data-display-canvas").click();
    await expect.element(page.getByText("Position relative to model")).toBeVisible();
    const x = page.getByRole("spinbutton", { name: "X", exact: true });
    await expect.element(x).toHaveValue(0);
    await x.fill("2");
    await userEvent.keyboard("{Enter}");
    editor.dispatch({
      type: "set-node-transform", nodeId: "pump",
      transform: { position: [3, 1, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 3, 1] }
    });
    await expect.poll(() => editor.getRuntime()?.getNodeTarget("temperature")?.getWorldPosition(new Vector3()).y).toBeCloseTo(5);
    await page.getByRole("button", { name: "Detach from model" }).click();
    await expect.element(page.getByText("World position")).toBeVisible();
    const position = editor.getSnapshot().nodes.temperature.transform!.position;
    expect(position[0]).toBeCloseTo(3);
    expect(position[1]).toBeCloseTo(5);
    expect(position[2]).toBe(0);
  } finally {
    root.unmount();
    editor.dispose();
    host.remove();
  }
});

it("renders the same pixel width across camera distances and respects model depth when attached to a scaled node", async () => {
  const editor = createEditor();
  editor.dispatch({ type: "create-data-connection", connection: {
    id: "plant", name: "Plant", baseUrl: "https://example.test", auth: { kind: "none" }, headers: {}, timeoutMs: 5000
  } });
  editor.dispatch({
    type: "create-data-display", nodeId: "temperature", name: "Temperature",
    source: { connectionId: "plant", deviceId: "pump", fieldKey: "temperature" }
  });
  editor.dispatch({ type: "update-data-display-style", nodeId: "temperature", style: {
    width: 120, height: 40, backgroundColor: "#ff0000", borderColor: "#ff0000"
  } });
  editor.dispatch({ type: "create-group", nodeId: "scaled-model", transform: { scale: [3, 2, 1] } });
  editor.dispatch({ type: "set-data-display-anchor", nodeId: "temperature", anchorNodeId: "scaled-model" });
  editor.dispatch({ type: "select-node", nodeId: null });
  const host = document.body.appendChild(document.createElement("div"));
  host.style.height = "700px";
  const root = createRoot(host);
  const cover = new Mesh(new BoxGeometry(4, 4, 0.1), new MeshBasicMaterial({ color: "#00ff00" }));
  cover.position.z = 1;
  cover.visible = false;
  const renderState: { renderer?: WebGLRenderer } = {};
  function rendererFactory(): RendererLike {
    const renderer = new WebGLRenderer({ preserveDrawingBuffer: true });
    renderState.renderer = renderer;
    return {
      domElement: renderer.domElement,
      setSize: (width, height) => renderer.setSize(width, height),
      render(scene, camera) {
        if (!cover.parent) scene.add(cover);
        renderer.render(scene, camera);
      },
      dispose: () => renderer.dispose()
    };
  }
  function readPixel(offsetX: number): number[] {
    const renderer = renderState.renderer;
    if (!renderer) return [];
    const gl = renderer.getContext();
    const pixel = new Uint8Array(4);
    gl.readPixels(Math.floor(gl.drawingBufferWidth / 2) + offsetX, Math.floor(gl.drawingBufferHeight / 2) + 16,
      1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return Array.from(pixel.slice(0, 3));
  }
  try {
    root.render(<EditorWorkbench editor={editor} locale="en" rendererFactory={rendererFactory}
      interactions={{ resize: true }} />);
    await expect.poll(() => editor.getRuntime()?.getNodeTarget("temperature")?.parent?.type).toBe("Group");
    const runtime = editor.getRuntime()!;
    for (const distance of [6, 20]) {
      runtime.applyCameraView({
        id: "front", name: "Front", projection: { kind: "perspective", fov: 50 },
        position: [0, 0, distance], target: [0, 0, 0], near: 0.1, far: 1000
      });
      await expect.poll(() => readPixel(58)).toEqual([255, 0, 0]);
      expect(readPixel(61)).not.toEqual([255, 0, 0]);
    }
    cover.visible = true;
    runtime.invalidateRender();
    await expect.poll(() => readPixel(0)).toEqual([0, 255, 0]);
  } finally {
    root.unmount();
    editor.dispose();
    cover.geometry.dispose();
    cover.material.dispose();
    host.remove();
  }
});
