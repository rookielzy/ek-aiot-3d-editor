import { describe, expect, it } from "vitest";
import {
  createDisplayMessageDescriptor,
  createFallbackDisplayMessageDescriptor,
  descriptorValues
} from "./display-messages";

describe("display message descriptors", () => {
  it("creates stable namespaced keys for display fields", () => {
    const descriptor = createDisplayMessageDescriptor({
      namespace: "inspector",
      path: "field.textures.normalMap.assetId",
      field: "label",
      fallback: "Normal map",
      values: descriptorValues({
        fieldId: "textures.normalMap.assetId",
        slot: "normalMap"
      })
    });

    expect(descriptor).toEqual({
      key: "inspector.field.textures.normalMap.assetId.label",
      fallback: "Normal map",
      values: {
        fieldId: "textures.normalMap.assetId",
        slot: "normalMap"
      }
    });
  });

  it("keeps authored labels and technical ids as values instead of keys", () => {
    const descriptor = createDisplayMessageDescriptor({
      namespace: "workbench",
      path: "selection.single",
      field: "label",
      fallback: "{name}",
      values: {
        name: "Pump A",
        fileName: "motor-control-panel.glb",
        importKey: "glb:object-a/node:nodes/0",
        extension: "KHR_draco_mesh_compression"
      }
    });

    expect(descriptor.key).toBe("workbench.selection.single.label");
    expect(descriptor.key).not.toContain("Pump A");
    expect(descriptor.key).not.toContain("motor-control-panel");
    expect(descriptor.values).toMatchObject({
      name: "Pump A",
      fileName: "motor-control-panel.glb",
      importKey: "glb:object-a/node:nodes/0",
      extension: "KHR_draco_mesh_compression"
    });
  });

  it("normalizes fallback code paths without translating text", () => {
    const descriptor = createFallbackDisplayMessageDescriptor(
      "problem",
      "project-export-payload-missing",
      "actionLabel",
      "Replace asset",
      { assetId: "asset-a" }
    );

    expect(descriptor).toEqual({
      key: "problem.fallback.project.export.payload.missing.actionLabel",
      fallback: "Replace asset",
      values: {
        assetId: "asset-a"
      }
    });
  });
});
