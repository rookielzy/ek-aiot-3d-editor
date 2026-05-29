import type { SetMaterialCommand } from "../commands/types";
import { createMaterialAssignmentId } from "../materials/defaults";
import type { MaterialPatch, MaterialSide, MeshStandardMaterialOverride, TextureSlotName } from "../materials/types";
import type { SceneSnapshot } from "../snapshot/types";
import { assetField, checkboxField, colorField, numberField, parseBoolean, parseFiniteNumber, selectField, validateAssetKind, type NumberRange } from "./fields";
import type { InspectorCommandProblem, InspectorCommandResult, MaterialFieldId, MaterialInspectorSection } from "./types";

const MATERIAL_SIDES: MaterialSide[] = ["front", "back", "double"];
const TEXTURE_SLOTS: TextureSlotName[] = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "alphaMap"];
const NUMBER_RANGES = {
  metalness: { min: 0, max: 1 },
  roughness: { min: 0, max: 1 },
  emissiveIntensity: { min: 0 },
  opacity: { min: 0, max: 1 },
  envMapIntensity: { min: 0 }
} satisfies Partial<Record<MaterialFieldId, NumberRange>>;
type MaterialPatchResult = { ok: true; material: MaterialPatch } | { ok: false; problem: InspectorCommandProblem };

export function buildMaterialSection(snapshot: SceneSnapshot): MaterialInspectorSection {
  const object = getSelectedObject(snapshot);
  const disabled = !object;
  const target = object ? { kind: "object" as const, objectId: object.id } : null;
  const assignmentId = target ? createMaterialAssignmentId(target) : null;
  const assignment = assignmentId ? snapshot.materials.assignments[assignmentId] : undefined;
  const material = assignment ? snapshot.materials.definitions[assignment.materialId] : undefined;
  const override = material?.override ?? {};

  return {
    id: "material",
    title: "Material",
    enabled: !disabled,
    empty: disabled,
    reason: disabled ? "Select a GLB object to edit material overrides." : undefined,
    assignmentId,
    materialId: material?.id ?? null,
    sideOptions: MATERIAL_SIDES.map((side) => ({ value: side, label: formatSide(side) })),
    fields: [
      colorField("color", "Base color", override.color ?? "#ffffff", disabled),
      numberField("metalness", "Metalness", override.metalness ?? 0, { disabled, min: 0, max: 1, step: 0.01 }),
      numberField("roughness", "Roughness", override.roughness ?? 1, { disabled, min: 0, max: 1, step: 0.01 }),
      colorField("emissive", "Emissive", override.emissive ?? "#000000", disabled),
      numberField("emissiveIntensity", "Emissive intensity", override.emissiveIntensity ?? 0, { disabled, min: 0, step: 0.01 }),
      numberField("opacity", "Opacity", override.opacity ?? 1, { disabled, min: 0, max: 1, step: 0.01 }),
      checkboxField("transparent", "Transparent", override.transparent ?? false, disabled),
      selectField("side", "Side", override.side ?? "front", MATERIAL_SIDES.map((side) => ({ value: side, label: formatSide(side) })), disabled),
      numberField("envMapIntensity", "Environment intensity", override.envMapIntensity ?? 1, { disabled, min: 0, step: 0.01 }),
      ...TEXTURE_SLOTS.map((slot) =>
        assetField(`textures.${slot}.assetId`, formatTextureSlot(slot), override.textures?.[slot]?.assetId ?? "", snapshot, ["texture", "image"], disabled)
      )
    ]
  };
}

export function buildSetMaterialCommand(snapshot: SceneSnapshot, fieldId: MaterialFieldId, value: unknown): InspectorCommandResult {
  const object = getSelectedObject(snapshot);
  if (!object) {
    return problem(fieldId, "No selected object to edit.");
  }

  const patch = buildMaterialPatch(snapshot, fieldId, value);
  if (!patch.ok) {
    return patch;
  }

  const command: SetMaterialCommand = {
    type: "set-material",
    target: { kind: "object", objectId: object.id },
    material: patch.material
  };
  return { ok: true, command };
}

function buildMaterialPatch(snapshot: SceneSnapshot, fieldId: MaterialFieldId, value: unknown): MaterialPatchResult {
  if (fieldId.startsWith("textures.")) {
    const [, slot] = fieldId.split(".") as ["textures", TextureSlotName, "assetId"];
    const assetId = String(value);
    if (assetId === "") {
      return { ok: true, material: { textures: { [slot]: null } } };
    }
    const validation = validateAssetKind(snapshot, assetId, ["texture", "image"], `Texture slot ${slot}`);
    if (!validation.ok) {
      return problem(fieldId, validation.message);
    }
    return {
      ok: true,
      material: {
        textures: {
          [slot]: { assetId }
        }
      }
    };
  }

  switch (fieldId) {
    case "color":
    case "emissive":
      return { ok: true, material: { [fieldId]: String(value) } as Pick<MeshStandardMaterialOverride, typeof fieldId> };
    case "transparent":
      return { ok: true, material: { transparent: parseBoolean(value) } };
    case "side":
      if (!MATERIAL_SIDES.includes(value as MaterialSide)) {
        return problem(fieldId, "Material side must be front, back, or double.");
      }
      return { ok: true, material: { side: value as MaterialSide } };
    case "metalness":
    case "roughness":
    case "emissiveIntensity":
    case "opacity":
    case "envMapIntensity": {
      const parsed = parseFiniteNumber(value, fieldId, NUMBER_RANGES[fieldId]);
      if (!parsed.ok) {
        return problem(fieldId, parsed.message);
      }
      return { ok: true, material: { [fieldId]: parsed.value } as Pick<MeshStandardMaterialOverride, typeof fieldId> };
    }
    default:
      return problem(fieldId, "Unsupported material field.");
  }
}

function getSelectedObject(snapshot: SceneSnapshot) {
  const objectId = snapshot.selection.objectId;
  return objectId ? snapshot.objects[objectId] ?? null : null;
}

function formatSide(side: MaterialSide): string {
  return side.charAt(0).toUpperCase() + side.slice(1);
}

function formatTextureSlot(slot: TextureSlotName): string {
  return slot.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);
}

function problem(fieldId: string, message: string): { ok: false; problem: InspectorCommandProblem } {
  return { ok: false, problem: { code: "inspector-material-invalid", fieldId, message, severity: "warning" } };
}
