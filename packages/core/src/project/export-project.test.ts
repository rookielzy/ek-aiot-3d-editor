import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";

describe("project export", () => {
  it("exports scene, manifest, and payload entries when payloads are available", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", label: "Box", source: new Uint8Array([1, 2, 3]) }
    });

    const result = editor.exportProject();

    expect(result.ok).toBe(true);
    expect(result.packageBytes).toBeInstanceOf(Uint8Array);
    expect(result.manifest?.assets["asset-a"]).toMatchObject({
      id: "asset-a",
      kind: "glb",
      payloadPath: "assets/asset-a.glb",
      byteSize: 3
    });
  });

  it("fails complete export when a referenced payload is unavailable", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });

    const result = editor.exportProject();

    expect(result.ok).toBe(false);
    expect(result.packageBytes).toBeUndefined();
    expect(result.problems).toMatchObject([{ code: "project-export-payload-missing" }]);
  });

  it("marks partial packages when explicitly requested", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });

    const result = editor.exportProject({ partial: true });

    expect(result.ok).toBe(false);
    expect(result.packageBytes).toBeInstanceOf(Uint8Array);
    expect(result.manifest?.completeness).toBe("partial");
  });

  it("exports payloads registered by import commands inside a batch", () => {
    const editor = createEditor();
    editor.dispatch({
      type: "batch",
      commands: [
        {
          type: "import-glb",
          objectId: "object-a",
          asset: { id: "asset-a", label: "Box", source: new Uint8Array([1, 2, 3]) }
        }
      ]
    });

    const result = editor.exportProject();

    expect(result.ok).toBe(true);
    expect(result.manifest?.assets["asset-a"]).toMatchObject({
      id: "asset-a",
      payloadPath: "assets/asset-a.glb",
      byteSize: 3
    });
  });

  it("exports v4 node graph scenes without changing the project package layout", () => {
    const editor = createEditor();
    editor.dispatch({ type: "create-group", nodeId: "group-a" });
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      parentId: "group-a",
      asset: { id: "asset-a", label: "Box", source: new Uint8Array([1, 2, 3]) }
    });
    editor.dispatch({ type: "add-light", light: { id: "point-a", kind: "point" } });
    editor.dispatch({ type: "reparent-node", nodeId: "point-a", parentId: "group-a" });

    const result = editor.exportProject();

    expect(result.ok).toBe(true);
    expect(result.manifest?.version).toBe(1);
    expect(result.manifest?.scenePath).toBe("scene.json");
    expect(result.manifest?.assets["asset-a"].payloadPath).toBe("assets/asset-a.glb");
  });
});
