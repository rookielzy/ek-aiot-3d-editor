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
  expect(editor.dispatch({ type: "update-data-display-style", nodeId: "temperature", style: { width: 144, fontSize: 18 } }).ok).toBe(true);
  expect(editor.dispatch({ type: "set-node-transform", nodeId: "temperature", transform: { position: [1, 2, 3] } }).ok).toBe(true);

  const restored = createEditor();
  restored.restore(editor.serialize());
  expect(restored.getSnapshot().nodes.temperature).toMatchObject({
    kind: "data-display", style: { width: 144, fontSize: 18 }, transform: { position: [1, 2, 3] },
    source: { connectionId: "devices", deviceId: "pump-1", fieldKey: "temperature" }
  });
  expect(editor.undo().snapshot.nodes.temperature.transform?.position).toEqual([0, 0, 0]);
  restored.dispose();
  editor.dispose();
});
