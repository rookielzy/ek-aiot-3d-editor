import { describe, expect, it } from "vitest";
import { createEditor } from "../editor/create-editor";
import { EditorStore } from "../editor/store";
import { createLightDefinition } from "../lights/defaults";
import { createEmptySnapshot, createLightNode, createTransform } from "../snapshot/defaults";
import type { SceneGroupNode, SceneSnapshot } from "../snapshot/types";
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
    expect(model.selection.nodeId).toBe("object-a");
    expect(model.selection.nodeKind).toBe("object");
    expect(model.selection.count).toBe(1);
    expect(model.selection.transformAvailable).toBe(true);
    expect(model.transform.fields.find((field) => field.id === "position.x")?.value).toBe(1);
    expect(model.material.assignmentId).toBe("object:object-a");
  });

  it("describes selected group nodes without object or material targets", () => {
    const store = new EditorStore(createGroupSnapshot());
    store.replaceSnapshot({
      ...store.getSnapshot(),
      selection: {
        nodeId: "group-a",
        nodeIds: ["group-a"],
        objectId: null,
        objectIds: []
      }
    });

    const model = buildInspectorModel(store.getSnapshot());

    expect(model.selection.nodeId).toBe("group-a");
    expect(model.selection.nodeKind).toBe("group");
    expect(model.selection.objectId).toBeNull();
    expect(model.selection.object).toBeNull();
    expect(model.selection.transformAvailable).toBe(true);
    expect(model.transform.enabled).toBe(true);
    expect(model.material.enabled).toBe(false);
  });

  it("describes selected non-spatial lights as selected but not transformable", () => {
    const editor = createEditor();
    editor.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient", name: "Fill" } });
    editor.dispatch({ type: "select-node", nodeId: "ambient-a" });

    const model = buildInspectorModel(editor.getSnapshot());

    expect(model.selection.nodeId).toBe("ambient-a");
    expect(model.selection.nodeKind).toBe("light");
    expect(model.selection.lightId).toBe("ambient-a");
    expect(model.selection.light?.kind).toBe("ambient");
    expect(model.selection.transformAvailable).toBe(false);
    expect(model.selection.transformUnavailableReason).toBe("Ambient lights do not have transform controls.");
    expect(model.transform.enabled).toBe(false);
    expect(model.transform.reason).toBe("Ambient lights do not have transform controls.");
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

function createGroupSnapshot(): SceneSnapshot {
  const snapshot = createEmptySnapshot("scene-a");
  const ambient = createLightDefinition("ambient", { id: "ambient-a", name: "Ambient" });
  const group: SceneGroupNode = {
    id: "group-a",
    kind: "group",
    name: "Group",
    parentId: null,
    children: ["object-a"],
    transform: createTransform()
  };

  return {
    ...snapshot,
    version: 5,
    scene: {
      id: "scene-a",
      name: "Scene"
    },
    nodes: {
      "group-a": group,
      "object-a": {
        id: "object-a",
        kind: "object",
        name: "Box",
        objectId: "object-a",
        parentId: "group-a",
        children: [],
        transform: createTransform()
      },
      "ambient-a": createLightNode(ambient)
    },
    rootNodeIds: ["group-a", "ambient-a"],
    objects: {
      "object-a": {
        id: "object-a",
        name: "Box",
        kind: "glb",
        parentId: null,
        children: [],
        asset: { id: "asset-a", kind: "glb" },
        transform: createTransform()
      }
    },
    rootObjectIds: ["object-a"],
    selection: {
      nodeId: null,
      nodeIds: [],
      objectId: null,
      objectIds: []
    },
    assets: {
      "asset-a": { id: "asset-a", kind: "glb" }
    },
    materials: {
      definitions: {},
      assignments: {}
    },
    lights: {
      "ambient-a": ambient
    },
    problems: {
      acknowledged: {}
    }
  };
}
