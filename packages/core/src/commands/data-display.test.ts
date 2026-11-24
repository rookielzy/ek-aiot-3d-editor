import { expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";

it("restores a data display with its authored style and undoes its position change", () => {
  const editor = createEditor();
  editor.dispatch({ type: "create-data-connection", connection: {
    id: "devices", name: "Devices", baseUrl: "https://example.test", auth: { kind: "none" }, headers: {}, timeoutMs: 5000
  } });
  expect(editor.dispatch({
    type: "create-data-display", nodeId: "temperature", name: "Pump temperature",
    source: { connectionId: "devices", deviceId: "pump-1", fieldKey: "temperature" }
  }).ok).toBe(true);
  expect(editor.getSnapshot().selection.nodeId).toBe("temperature");
  expect(editor.dispatch({
    type: "update-data-display-style", nodeId: "temperature",
    style: { width: 144, fontSize: 18, prefix: "Pump: ", suffix: " °C" }
  }).ok).toBe(true);
  expect(editor.dispatch({ type: "set-node-transform", nodeId: "temperature", transform: { position: [1, 2, 3] } }).ok).toBe(true);

  const restored = createEditor();
  restored.restore(editor.serialize());
  expect(restored.getSnapshot().nodes.temperature).toMatchObject({
    kind: "data-display", style: { width: 144, fontSize: 18, prefix: "Pump: ", suffix: " °C" },
    transform: { position: [1, 2, 3] },
    source: { connectionId: "devices", deviceId: "pump-1", fieldKey: "temperature" }
  });
  expect(editor.undo().snapshot.nodes.temperature.transform?.position).toEqual([0, 0, 0]);
  restored.dispose();
  editor.dispose();
});

it("attaches at the model origin, restores the local offset, and detaches at its world position", () => {
  const editor = createEditor();
  editor.dispatch({ type: "create-data-connection", connection: {
    id: "devices", name: "Devices", baseUrl: "https://example.test", auth: { kind: "none" }, headers: {}, timeoutMs: 5000
  } });
  editor.dispatch({
    type: "import-glb", objectId: "pump", asset: { id: "pump-model" },
    transform: { position: [10, 1, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 3, 1] }
  });
  editor.dispatch({
    type: "create-data-display", nodeId: "temperature", name: "Pump temperature", position: [6, 5, 4],
    source: { connectionId: "devices", deviceId: "pump-1", fieldKey: "temperature" }
  });
  expect(editor.dispatch({ type: "set-data-display-anchor", nodeId: "temperature", anchorNodeId: "temperature" }).ok).toBe(false);
  expect(editor.dispatch({ type: "set-data-display-anchor", nodeId: "temperature", anchorNodeId: "pump" }).snapshot.nodes.temperature)
    .toMatchObject({ anchorNodeId: "pump", transform: { position: [0, 0, 0] } });
  editor.dispatch({ type: "set-node-transform", nodeId: "temperature", transform: { position: [2, 3, 4] } });

  const restored = createEditor();
  restored.restore(editor.serialize());
  expect(restored.getSnapshot().nodes.temperature).toMatchObject({ anchorNodeId: "pump", transform: { position: [2, 3, 4] } });
  const detached = restored.dispatch({ type: "set-data-display-anchor", nodeId: "temperature", anchorNodeId: null });
  expect(detached.ok).toBe(true);
  expect(detached.snapshot.nodes.temperature).not.toHaveProperty("anchorNodeId");
  expect(detached.snapshot.nodes.temperature.transform?.position).toEqual([expect.closeTo(1), expect.closeTo(5), 4]);
  expect(restored.undo().snapshot.nodes.temperature).toMatchObject({ anchorNodeId: "pump", transform: { position: [2, 3, 4] } });
  restored.dispose();
  editor.dispose();
});
