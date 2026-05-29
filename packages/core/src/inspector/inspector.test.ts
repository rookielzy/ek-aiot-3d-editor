import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { buildInspectorModel } from "./selection";

describe("inspector model", () => {
  it("derives disabled object sections and available scene sections from an empty snapshot", () => {
    const editor = createEditor();
    const model = buildInspectorModel(editor.getSnapshot());

    expect(model.selection.object).toBeNull();
    expect(model.transform.enabled).toBe(false);
    expect(model.material.enabled).toBe(false);
    expect(model.environment.enabled).toBe(true);
    expect(model.lights.enabled).toBe(true);
    const serializedModel = JSON.stringify(model);
    expect(serializedModel).not.toContain("Object3D");
    expect(serializedModel).not.toContain("domElement");
  });

  it("exposes selected object transform and material target state", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, transform: { position: [1, 2, 3] } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    const model = buildInspectorModel(editor.getSnapshot());

    expect(model.selection.objectId).toBe("object-a");
    expect(model.transform.fields.find((field) => field.id === "position.x")?.value).toBe(1);
    expect(model.material.assignmentId).toBe("object:object-a");
  });

  it("filters asset options by supported inspector field kind", () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture", label: "Texture A" } });
    editor.dispatch({ type: "register-asset", asset: { id: "image-a", kind: "image", label: "Image A" } });
    editor.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr", label: "HDR A" } });
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    const model = buildInspectorModel(editor.getSnapshot());
    const textureField = model.material.fields.find((field) => field.id === "textures.map.assetId");
    const environmentField = model.environment.fields.find((field) => field.id === "environment.assetId");

    expect(textureField?.options?.map((option) => option.value)).toEqual(["image-a", "texture-a"]);
    expect(environmentField?.options?.map((option) => option.value)).toEqual(["hdr-a", "image-a", "texture-a"]);
  });
});
