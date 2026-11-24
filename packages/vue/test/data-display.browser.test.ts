import { createApp, h, markRaw } from "vue";
import { Box3, Mesh, Sprite, Vector3 } from "three";
import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { createEditor, type EditorRuntime, type RendererLike } from "@ek-aiot/3d-editor-core";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";
import "../src/styles.css";

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
      camera.updateMatrixWorld();
      scene.updateMatrixWorld();
      const handle = new Vector3();
      scene.children.find((object) => object.userData.transformControlsHelper)?.traverseVisible((object) => {
        if (object instanceof Mesh && object.name === "X") {
          const center = new Box3().setFromObject(object).getCenter(new Vector3());
          if (center.x > handle.x) handle.copy(center);
        }
      });
      if (handle.x > 0) {
        // Use the position of the rendered positive X arrow at the current camera and viewport size.
        const point = handle.project(camera);
        canvas.dataset.transformX = String((point.x + 1) / 2);
        canvas.dataset.transformY = String((1 - point.y) / 2);
      }
    },
    dispose() {}
  };
}

it("searches and selects devices, adds the same live field twice, and restores both cards", async () => {
  const requests: string[] = [];
  let temperature = 0;
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
            data: [{ key: "temperature", desc: "Temperature", valueType: "number", value: temperature, unit: "°C" }] }])
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
  const runtime: { current: EditorRuntime | null } = { current: null };
  const app = createApp({
    render: () => h(EditorWorkbench, {
      editor: markRaw(editor), locale: "en", rendererFactory: canvasRenderer,
      onRuntimeReady: (value) => { runtime.current = value; }
    })
  });
  app.mount(host);
  try {
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
    const addField = page.getByRole("button", { name: "Add Temperature to canvas" });
    await addField.click();
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
    temperature = 18.2;
    await expect.poll(() => preview.element().textContent?.trim(), { timeout: 7000 }).toBe("Inlet: 18.2 °C");
    await expect.element(addField).toBeEnabled();
    await addField.click();
    const secondId = editor.getSnapshot().selection.nodeId!;
    expect(secondId).not.toBe(nodeId);
    expect(editor.getSnapshot().nodes[secondId]).toMatchObject({
      source: { connectionId: "plant", deviceId: "pump-1999", fieldKey: "temperature" },
      transform: { position: [0, 0.7, 0] }
    });
    await expect.poll(() => runtime.current?.getNodeTarget(secondId)?.parent?.type).toBe("Scene");
    await expect.element(preview).toHaveTextContent(/^18.2$/);
    const cardButtons = page.getByRole("button", { name: "Water pump 1999 · Temperature", exact: true });
    await expect.poll(() => cardButtons.elements().length).toBe(2);
    await cardButtons.first().click();
    await expect.element(preview).toHaveTextContent(/^Inlet: 18.2 °C$/);
    const saved = editor.serialize();
    expect(JSON.stringify(saved)).not.toContain("runningStatusEnum");
    const readsBeforeRestore = requests.filter((path) => path === "/realtime").length;
    editor.restore(saved);
    await expect.poll(() => cardButtons.elements().length).toBe(2);
    await expect.element(width).toHaveValue(200);
    await expect.element(prefix).toHaveValue("Inlet: ");
    await expect.element(page.getByRole("textbox", { name: "Suffix", exact: true })).toHaveValue(" °C");
    await expect.poll(() => requests.filter((path) => path === "/realtime").length).toBeGreaterThan(readsBeforeRestore);
  } finally {
    app.unmount();
    editor.dispose();
    host.remove();
  }
}, 20000);

it("picks a card in the viewport and drags its X translation handle", async () => {
  const editor = createEditor();
  editor.dispatch({ type: "create-data-connection", connection: {
    id: "plant", name: "Plant", baseUrl: "https://example.test", auth: { kind: "none" }, headers: {}, timeoutMs: 5000
  } });
  editor.dispatch({
    type: "create-data-display", nodeId: "temperature", name: "Temperature",
    source: { connectionId: "plant", deviceId: "pump", fieldKey: "temperature" }
  });
  editor.dispatch({ type: "create-group", nodeId: "pump-frame", name: "Pump assembly" });
  editor.dispatch({ type: "select-node", nodeId: null });
  await editor.getDataService()?.startPreview();
  editor.transformMode.set("rotate");
  const host = document.body.appendChild(document.createElement("div"));
  host.style.height = "700px";
  const app = createApp({
    render: () => h(EditorWorkbench, {
      editor: markRaw(editor), locale: "en", rendererFactory: canvasRenderer,
      onRuntimeReady: (runtime) => runtime?.applyCameraView({
        id: "front", name: "Front", projection: { kind: "perspective", fov: 50 },
        position: [0, 0, 6], target: [0, 0, 0], near: 0.1, far: 1000
      })
    })
  });
  app.mount(host);
  try {
    await expect.poll(() => editor.getRuntime()?.getNodeTarget("temperature")?.parent?.type).toBe("Scene");
    const canvas = page.getByTestId("data-display-canvas");
    await canvas.click();
    await expect.element(page.getByRole("tab", { name: "Data display" })).toHaveAttribute("aria-selected", "true");
    expect(editor.getSnapshot().selection.nodeId).toBe("temperature");
    await page.getByRole("combobox", { name: "Model attachment" }).click();
    await page.getByRole("option", { name: "Pump assembly" }).click();
    await expect.element(page.getByText("Position relative to model")).toBeVisible();
    expect(editor.getSnapshot().nodes.temperature).toMatchObject({ anchorNodeId: "pump-frame" });
    await expect.poll(() => editor.getRuntime()?.getNodeTarget("temperature")?.parent?.type).toBe("Group");
    const element = canvas.element() as HTMLCanvasElement;
    await expect.poll(() => Number(element.dataset.transformX)).toBeGreaterThan(0);
    const bounds = element.getBoundingClientRect();
    const start = { x: bounds.width * Number(element.dataset.transformX), y: bounds.height * Number(element.dataset.transformY) };
    await canvas.dropTo(canvas, {
      sourcePosition: start,
      targetPosition: { x: start.x + 28, y: start.y }
    });
    const position = editor.getSnapshot().nodes.temperature.transform!.position;
    expect(position[0]).toBeGreaterThan(0);
    expect(position.slice(1)).toEqual([0, 0]);
    const positionX = page.getByRole("spinbutton", { name: "X", exact: true });
    await expect.poll(() => Number((positionX.element() as HTMLInputElement).value)).toBeCloseTo(position[0]);
    expect(editor.undo().snapshot.nodes.temperature).toMatchObject({
      anchorNodeId: "pump-frame", transform: { position: [0, 0, 0] }
    });
  } finally {
    app.unmount();
    editor.dispose();
    host.remove();
  }
});
