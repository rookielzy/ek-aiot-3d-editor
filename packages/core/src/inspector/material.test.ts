import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { buildSetMaterialCommand } from "./material";

describe("material inspector commands", () => {
  it("preserves existing override fields when patching one material field", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { color: "#336699", metalness: 0.2, roughness: 0.8 }
    });

    const command = buildSetMaterialCommand(editor.getSnapshot(), "roughness", 0.4);
    if (!command.ok) {
      throw new Error(command.problem.message);
    }
    editor.dispatch(command.command);

    expect(editor.getSnapshot().materials.definitions["material:object:object-a"].override).toMatchObject({
      color: "#336699",
      metalness: 0.2,
      roughness: 0.4
    });
  });

  it("builds texture slot commands with stable asset references only", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture" } });
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    const result = buildSetMaterialCommand(editor.getSnapshot(), "textures.map.assetId", "texture-a");

    expect(result).toEqual({
      ok: true,
      command: {
        type: "set-material",
        target: { kind: "object", objectId: "object-a" },
        material: { textures: { map: { assetId: "texture-a" } } }
      }
    });
  });

  it("builds texture slot clear commands from the None option", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture" } });
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { textures: { map: { assetId: "texture-a" } } }
    });

    const result = buildSetMaterialCommand(editor.getSnapshot(), "textures.map.assetId", "");

    expect(result).toEqual({
      ok: true,
      command: {
        type: "set-material",
        target: { kind: "object", objectId: "object-a" },
        material: { textures: { map: null } }
      }
    });
  });

  it("rejects texture slot drafts that reference unsupported asset kinds", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    const result = buildSetMaterialCommand(editor.getSnapshot(), "textures.map.assetId", "asset-a");

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.problem.message).toContain("texture or image");
  });

  it("rejects out-of-range material numeric drafts before dispatch", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    const result = buildSetMaterialCommand(editor.getSnapshot(), "opacity", 1.2);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.problem.message).toContain("less than or equal to 1");
  });
});
