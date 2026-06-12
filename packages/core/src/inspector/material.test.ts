import { describe, expect, it } from "vitest";
import { attachGlbImportManifestMetadata, createGlbImportManifest } from "../assets/import-pipeline";
import { createEditor } from "../editor/create-editor";
import { createImportedMaterialSlotAssignmentUnresolvedProblem } from "../runtime/problems";
import type { SceneImportedGlbNode } from "../snapshot/types";
import { buildInspectorModel } from "./selection";
import { buildSetMaterialCommand } from "./material";

describe("material inspector commands", () => {
  it("describes broad object and imported material slot targets for selected GLB objects", () => {
    const editor = createExpandedMaterialSlotEditor();
    const slotIds = getSlotIds(editor.getSnapshot());
    editor.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId: slotIds[1]! },
      material: { color: "#336699" }
    });
    editor.dispatch({ type: "select-node", nodeId: "object-a" });

    const section = buildInspectorModel(editor.getSnapshot()).material;

    expect(section.activeTargetKey).toBe("object:object-a");
    expect(section.targets.map((target) => target.kind)).toEqual(["object", "material-slot", "material-slot"]);
    expect(section.targets[0]).toMatchObject({
      label: "Object override",
      commandTarget: { kind: "object", objectId: "object-a" },
      canCreateAssignment: true
    });
    expect(section.targets[1]).toMatchObject({
      ownerObjectId: "object-a",
      importedNodeId: expect.any(String),
      slotId: slotIds[0],
      hasOverride: false,
      canCreateAssignment: true
    });
    expect(section.targets[2]).toMatchObject({
      slotId: slotIds[1],
      materialId: `material:material-slot:object-a:${slotIds[1]}`,
      hasOverride: true
    });
    expect(JSON.stringify(section)).not.toContain("Object3D");
    expect(JSON.stringify(section)).not.toContain("Texture");
  });

  it("prefers the selected imported node's first selectable material slot", () => {
    const editor = createExpandedMaterialSlotEditor();
    const importedNode = getImportedPrimitiveNodes(editor.getSnapshot())[0]!;
    const slotId = importedNode.materialSlots![0]!.slotKey;

    editor.dispatch({ type: "select-node", nodeId: importedNode.id });
    const section = buildInspectorModel(editor.getSnapshot()).material;

    expect(section.activeTargetKey).toBe(`material-slot:object-a:${slotId}`);
    expect(section.assignmentId).toBe(`material-slot:object-a:${slotId}`);
    expect(section.targets.map((target) => target.kind)).toEqual(["object", "material-slot"]);
    expect(section.targets[1]).toMatchObject({
      selected: true,
      preferred: true,
      commandTarget: { kind: "material-slot", objectId: "object-a", slotId }
    });
  });

  it("shows stale material slot assignments as unresolved selectable targets", () => {
    const editor = createExpandedMaterialSlotEditor();
    const slotId = getSlotIds(editor.getSnapshot())[0]!;
    editor.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId },
      material: { color: "#336699" }
    });
    editor.dispatch({
      type: "create-imported-glb-targets",
      ownerObjectId: "object-a",
      replaceExisting: true
    });
    editor.dispatch({ type: "select-node", nodeId: "object-a" });
    const snapshot = {
      ...editor.getSnapshot(),
      nodes: Object.fromEntries(Object.entries(editor.getSnapshot().nodes).map(([id, node]) => [
        id,
        node.kind === "imported" ? { ...node, materialSlots: [] } : node
      ]))
    };

    const section = buildInspectorModel(snapshot, {
      runtimeProblems: [createImportedMaterialSlotAssignmentUnresolvedProblem("object-a", slotId)]
    }).material;

    const staleTarget = section.targets.find((target) => target.slotId === slotId);
    expect(staleTarget).toMatchObject({
      unresolved: true,
      canSelect: true,
      canEditExistingAssignment: true,
      canCreateAssignment: false,
      hasOverride: true,
      problemIds: [`imported-material-slot-unresolved:object-a:assignment:${slotId}`]
    });
  });

  it("disables unresolved material slot targets without existing assignments", () => {
    const editor = createExpandedMaterialSlotEditor();
    const importedNode = getImportedPrimitiveNodes(editor.getSnapshot())[0]!;
    const slotId = importedNode.materialSlots![0]!.slotKey;
    editor.dispatch({ type: "select-node", nodeId: importedNode.id });

    const section = buildInspectorModel(editor.getSnapshot(), {
      runtimeProblems: [createImportedMaterialSlotAssignmentUnresolvedProblem("object-a", slotId)]
    }).material;

    expect(section.activeTargetKey).toBe("object:object-a");
    expect(section.targets[1]).toMatchObject({
      unresolved: true,
      canSelect: false,
      canCreateAssignment: false,
      disabledReason: "Slot is unresolved and cannot create a new assignment."
    });
  });

  it("disables material editing for multi-selection instead of inventing mixed values", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
    editor.dispatch({ type: "select-nodes", mode: "replace", nodeIds: ["object-a", "object-b"] });

    const section = buildInspectorModel(editor.getSnapshot()).material;

    expect(section.empty).toBe(true);
    expect(section.reason).toContain("Select one GLB object");
    expect(section.targets).toEqual([]);
  });

  it("builds target-aware commands for selected material slot targets", () => {
    const editor = createExpandedMaterialSlotEditor();
    const importedNode = getImportedPrimitiveNodes(editor.getSnapshot())[0]!;
    const slotId = importedNode.materialSlots![0]!.slotKey;
    editor.dispatch({ type: "select-node", nodeId: importedNode.id });
    const slotTarget = buildInspectorModel(editor.getSnapshot()).material.targets.find((target) => target.slotId === slotId)!;

    const result = buildSetMaterialCommand(editor.getSnapshot(), "color", "#336699", slotTarget);

    expect(result).toEqual({
      ok: true,
      command: {
        type: "set-material",
        target: { kind: "material-slot", objectId: "object-a", slotId },
        material: { color: "#336699" }
      }
    });
  });

  it("rejects new commands for unresolved material slot targets without assignments", () => {
    const editor = createExpandedMaterialSlotEditor();

    const result = buildSetMaterialCommand(
      editor.getSnapshot(),
      "color",
      "#336699",
      { kind: "material-slot", objectId: "object-a", slotId: "missing-slot" }
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.problem.message).toContain("unresolved");
  });

  it("rejects disabled inspector material targets before dispatch", () => {
    const editor = createExpandedMaterialSlotEditor();
    const importedNode = getImportedPrimitiveNodes(editor.getSnapshot())[0]!;
    const slotId = importedNode.materialSlots![0]!.slotKey;
    editor.dispatch({ type: "select-node", nodeId: importedNode.id });
    const disabledTarget = buildInspectorModel(editor.getSnapshot(), {
      runtimeProblems: [createImportedMaterialSlotAssignmentUnresolvedProblem("object-a", slotId)]
    }).material.targets.find((target) => target.slotId === slotId)!;

    const result = buildSetMaterialCommand(editor.getSnapshot(), "color", "#336699", disabledTarget);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.problem.message).toBe("Slot is unresolved and cannot create a new assignment.");
  });

  it("edits existing stale material slot assignments through inspector targets", () => {
    const editor = createExpandedMaterialSlotEditor();
    const slotId = getSlotIds(editor.getSnapshot())[0]!;
    editor.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture" } });
    editor.dispatch({
      type: "set-material",
      target: { kind: "material-slot", objectId: "object-a", slotId },
      material: { color: "#336699", textures: { map: { assetId: "texture-a" } } }
    });
    editor.dispatch({ type: "select-node", nodeId: "object-a" });
    const snapshot = {
      ...editor.getSnapshot(),
      nodes: Object.fromEntries(Object.entries(editor.getSnapshot().nodes).map(([id, node]) => [
        id,
        node.kind === "imported" ? { ...node, materialSlots: [] } : node
      ]))
    };
    const staleTarget = buildInspectorModel(snapshot, {
      runtimeProblems: [createImportedMaterialSlotAssignmentUnresolvedProblem("object-a", slotId)]
    }).material.targets.find((target) => target.slotId === slotId)!;

    const roughness = buildSetMaterialCommand(snapshot, "roughness", 0.35, staleTarget);
    const textureClear = buildSetMaterialCommand(snapshot, "textures.map.assetId", "", staleTarget);

    expect(roughness).toEqual({
      ok: true,
      command: {
        type: "set-material",
        target: { kind: "material-slot", objectId: "object-a", slotId },
        material: { roughness: 0.35 }
      }
    });
    expect(textureClear).toEqual({
      ok: true,
      command: {
        type: "set-material",
        target: { kind: "material-slot", objectId: "object-a", slotId },
        material: { textures: { map: null } }
      }
    });
  });

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

  it("rejects invalid material color drafts before dispatch", () => {
    const editor = createExpandedMaterialSlotEditor();
    editor.dispatch({ type: "select-node", nodeId: "object-a" });
    const slotId = getSlotIds(editor.getSnapshot())[0]!;
    const slotTarget = buildInspectorModel(editor.getSnapshot()).material.targets.find((target) => target.slotId === slotId)!;

    const broadColor = buildSetMaterialCommand(editor.getSnapshot(), "color", "not-a-color");
    const slotEmissive = buildSetMaterialCommand(editor.getSnapshot(), "emissive", "hsl(0, 50%, 50%)", slotTarget);

    expect(broadColor.ok).toBe(false);
    expect(broadColor.ok ? undefined : broadColor.problem.message).toContain("#rrggbb");
    expect(slotEmissive.ok).toBe(false);
    expect(slotEmissive.ok ? undefined : slotEmissive.problem.message).toContain("#rrggbb");
  });
});

function createExpandedMaterialSlotEditor() {
  const editor = createEditor();
  editor.dispatch({
    type: "import-glb",
    objectId: "object-a",
    asset: {
      id: "asset-a",
      metadata: attachGlbImportManifestMetadata(undefined, createTwoSlotManifest())
    },
    expandImportedTargets: true
  });
  return editor;
}

function getImportedPrimitiveNodes(snapshot: ReturnType<ReturnType<typeof createEditor>["getSnapshot"]>): SceneImportedGlbNode[] {
  return Object.values(snapshot.nodes)
    .filter((node): node is SceneImportedGlbNode => node.kind === "imported" && node.source.kind === "primitive")
    .sort((left, right) => left.importKey.localeCompare(right.importKey));
}

function getSlotIds(snapshot: ReturnType<ReturnType<typeof createEditor>["getSnapshot"]>): string[] {
  return getImportedPrimitiveNodes(snapshot).flatMap((node) => node.materialSlots?.map((slot) => slot.slotKey) ?? []);
}

function createTwoSlotManifest() {
  return createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name: "Panel", mesh: 0 }],
          meshes: [{
            name: "Panel mesh",
            primitives: [
              { attributes: { POSITION: 0, NORMAL: 1 }, material: 0 },
              { attributes: { POSITION: 2, NORMAL: 3 }, material: 1 }
            ]
          }],
          materials: [{ name: "Body" }, { name: "Screen" }]
        }
      }
    }
  });
}
