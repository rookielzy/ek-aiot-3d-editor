import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { isJsonCompatible } from "../snapshot/validation";
import { createClipboardPayload, createNodeClipboardPayload } from "./create-clipboard";

describe("create clipboard payload", () => {
  it("creates a JSON-compatible selected subtree payload without runtime values", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", source: new Uint8Array([1, 2, 3]) } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, parentId: "object-a" });
    editor.dispatch({ type: "set-material", target: { kind: "object", objectId: "object-b" }, material: { color: "#224466" } });
    editor.dispatch({ type: "select-objects", mode: "replace", objectIds: ["object-a", "object-b"], primaryObjectId: "object-a" });

    const payload = createClipboardPayload(editor.getSnapshot());

    expect(payload.rootObjectIds).toEqual(["object-a"]);
    expect(Object.keys(payload.objects)).toEqual(["object-a", "object-b"]);
    expect(payload.assetIds).toEqual(["asset-a", "asset-b"]);
    expect(payload.materials.assignments["object:object-b"]).toBeTruthy();
    expect(isJsonCompatible(payload)).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("Uint8Array");
    expect(JSON.stringify(payload)).not.toContain("runtime");
  });

  it("creates a JSON-compatible node subtree payload for mixed groups, objects, and lights", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Assembly" });
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, parentId: "group-a" });
    editor.dispatch({ type: "add-light", light: { id: "point-a", kind: "point", transform: { position: [1, 2, 3] } } });
    editor.dispatch({ type: "reparent-node", nodeId: "point-a", parentId: "group-a" });
    editor.dispatch({ type: "set-material", target: { kind: "object", objectId: "object-a" }, material: { color: "#224466" } });
    editor.dispatch({ type: "select-node", nodeId: "group-a" });

    const payload = createNodeClipboardPayload(editor.getSnapshot());

    expect(payload.kind).toBe("ek-aiot-3d-editor-nodes");
    expect(payload.version).toBe(2);
    expect(payload.rootNodeIds).toEqual(["group-a"]);
    expect(Object.keys(payload.nodes)).toEqual(["group-a", "object-a", "point-a"]);
    expect(payload.nodes["group-a"].children).toEqual(["object-a", "point-a"]);
    expect(payload.objects["object-a"].asset.id).toBe("asset-a");
    expect(payload.lights["point-a"].kind).toBe("point");
    expect(payload.materials.assignments["object:object-a"]).toBeTruthy();
    expect(isJsonCompatible(payload)).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("runtime");
  });
});
