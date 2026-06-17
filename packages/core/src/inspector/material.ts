import type { SetMaterialCommand } from "../commands/types";
import type { ImportedGlbMaterialSlotLookup } from "../imported-targets/slots";
import { findImportedGlbMaterialSlot } from "../imported-targets/slots";
import { createMaterialAssignmentId } from "../materials/defaults";
import type { MaterialAssignmentTarget, MaterialPatch, MaterialSide, MeshStandardMaterialOverride, TextureSlotName } from "../materials/types";
import type { Problem } from "../problems/types";
import { isColorString } from "../snapshot/primitives";
import type { SceneImportedGlbNode, SceneObject, SceneSnapshot } from "../snapshot/types";
import { createDisplayMessageDescriptor } from "../i18n/display-messages";
import { inspectorCommandMessageDescriptor, inspectorSectionReasonDescriptor, inspectorSectionTitleDescriptor } from "./display-messages";
import { assetField, checkboxField, colorField, numberField, parseBoolean, parseFiniteNumber, selectField, validateAssetKind, type NumberRange } from "./fields";
import type { InspectorCommandProblem, InspectorCommandResult, InspectorFieldDescriptor, MaterialFieldId, MaterialInspectorSection, MaterialInspectorTarget } from "./types";

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

export function buildMaterialSection(snapshot: SceneSnapshot, runtimeProblems: readonly Problem[] = []): MaterialInspectorSection {
  const targets = buildMaterialTargets(snapshot, runtimeProblems);
  const activeTarget = targets.find((target) => target.preferred && target.canSelect) ??
    targets.find((target) => target.canSelect) ??
    targets[0] ??
    null;
  const disabled = !activeTarget || !activeTarget.canSelect;
  const assignmentId = activeTarget?.assignmentId ?? null;
  const material = activeTarget?.materialId ? snapshot.materials.definitions[activeTarget.materialId] : undefined;

  return {
    id: "material",
    title: "Material",
    titleDescriptor: inspectorSectionTitleDescriptor("material", "Material"),
    enabled: !disabled,
    empty: disabled,
    reason: disabled ? getDisabledReason(snapshot, targets) : undefined,
    ...(disabled ? { reasonDescriptor: inspectorSectionReasonDescriptor("material", getDisabledReason(snapshot, targets)) } : {}),
    assignmentId,
    materialId: material?.id ?? null,
    activeTargetKey: activeTarget?.key ?? null,
    targets,
    sideOptions: MATERIAL_SIDES.map(sideOption),
    fields: buildMaterialFieldsForTarget(snapshot, activeTarget, disabled)
  };
}

export function buildMaterialFieldsForTarget(
  snapshot: SceneSnapshot,
  target?: MaterialInspectorTarget | MaterialAssignmentTarget | null,
  disabled = false
): InspectorFieldDescriptor[] {
  const commandTarget = target ? getCommandTarget(target) : getDefaultCommandTarget(snapshot);
  const assignmentId = commandTarget ? createMaterialAssignmentId(commandTarget) : null;
  const assignment = assignmentId ? snapshot.materials.assignments[assignmentId] : undefined;
  const material = assignment ? snapshot.materials.definitions[assignment.materialId] : undefined;
  const override = material?.override ?? {};
  return [
    colorField("color", "Base color", override.color ?? "#ffffff", disabled),
    numberField("metalness", "Metalness", override.metalness ?? 0, { disabled, min: 0, max: 1, step: 0.01 }),
    numberField("roughness", "Roughness", override.roughness ?? 1, { disabled, min: 0, max: 1, step: 0.01 }),
    colorField("emissive", "Emissive", override.emissive ?? "#000000", disabled),
    numberField("emissiveIntensity", "Emissive intensity", override.emissiveIntensity ?? 0, { disabled, min: 0, step: 0.01 }),
    numberField("opacity", "Opacity", override.opacity ?? 1, { disabled, min: 0, max: 1, step: 0.01 }),
    checkboxField("transparent", "Transparent", override.transparent ?? false, disabled),
    selectField("side", "Side", override.side ?? "front", MATERIAL_SIDES.map(sideOption), disabled),
    numberField("envMapIntensity", "Environment intensity", override.envMapIntensity ?? 1, { disabled, min: 0, step: 0.01 }),
    ...TEXTURE_SLOTS.map((slot) =>
      assetField(`textures.${slot}.assetId`, formatTextureSlot(slot), override.textures?.[slot]?.assetId ?? "", snapshot, ["texture", "image"], disabled)
    )
  ];
}

export function buildSetMaterialCommand(
  snapshot: SceneSnapshot,
  fieldId: MaterialFieldId,
  value: unknown,
  target?: MaterialInspectorTarget | MaterialAssignmentTarget | null
): InspectorCommandResult {
  const inspectorTarget = target && isMaterialInspectorTarget(target) ? target : null;
  const commandTarget = target ? getCommandTarget(target) : getDefaultCommandTarget(snapshot);
  if (!commandTarget) {
    return problem(fieldId, "No selected object to edit.");
  }
  const assignmentId = createMaterialAssignmentId(commandTarget);
  const existingAssignment = snapshot.materials.assignments[assignmentId];
  if (inspectorTarget && !canWriteInspectorTarget(inspectorTarget, Boolean(existingAssignment))) {
    return problem(fieldId, getInspectorTargetProblemMessage(inspectorTarget, Boolean(existingAssignment)));
  }
  if (!canWriteTarget(snapshot, commandTarget, Boolean(existingAssignment))) {
    return problem(fieldId, commandTarget.kind === "material-slot"
      ? "Material slot is unresolved and cannot create a new assignment."
      : "Material target is not editable.");
  }

  const patch = buildMaterialPatch(snapshot, fieldId, value);
  if (!patch.ok) {
    return patch;
  }

  const command: SetMaterialCommand = {
    type: "set-material",
    target: commandTarget,
    material: patch.material
  };
  return { ok: true, command };
}

function buildMaterialTargets(snapshot: SceneSnapshot, runtimeProblems: readonly Problem[]): MaterialInspectorTarget[] {
  if (isMultiSelection(snapshot)) {
    return [];
  }

  const selectedNode = snapshot.selection.nodeId ? snapshot.nodes[snapshot.selection.nodeId] : null;
  const selectedObject = selectedNode?.kind === "object"
    ? snapshot.objects[selectedNode.objectId] ?? null
    : null;
  const selectedImported = selectedNode?.kind === "imported" ? selectedNode : null;
  const ownerObject = selectedObject ?? (selectedImported ? snapshot.objects[selectedImported.ownerObjectId] ?? null : null);
  if (!ownerObject) {
    return collectStaleSelectedObjectTargets(snapshot, runtimeProblems);
  }

  const targets: MaterialInspectorTarget[] = [
    createObjectTarget(snapshot, ownerObject, selectedNode?.kind === "object", !selectedImported)
  ];

  const importedNodes = getImportedNodesForOwner(snapshot, ownerObject.id)
    .filter((node) => !selectedImported || node.id === selectedImported.id);
  for (const node of importedNodes) {
    for (const slot of node.materialSlots ?? []) {
      targets.push(createSlotTarget(snapshot, runtimeProblems, ownerObject, {
        ownerObjectId: ownerObject.id,
        nodeId: node.id,
        importKey: node.importKey,
        slot,
        label: slot.label
      }, selectedImported?.id === node.id));
    }
  }

  appendStaleAssignmentTargets(snapshot, runtimeProblems, ownerObject, targets);
  return targets;
}

function createObjectTarget(
  snapshot: SceneSnapshot,
  object: SceneObject,
  selected: boolean,
  preferred: boolean
): MaterialInspectorTarget {
  const commandTarget = { kind: "object" as const, objectId: object.id };
  const assignmentId = createMaterialAssignmentId(commandTarget);
  const assignment = snapshot.materials.assignments[assignmentId];
  return {
    key: assignmentId,
    kind: "object",
    label: "Object override",
    ownerObjectId: object.id,
    importedNodeId: null,
    slotId: null,
    assignmentId,
    materialId: assignment?.materialId ?? null,
    selected,
    preferred,
    hasOverride: Boolean(assignment),
    unresolved: false,
    problemIds: [],
    canSelect: true,
    canEditExistingAssignment: Boolean(assignment),
    canCreateAssignment: true,
    canClear: Boolean(assignment),
    commandTarget
  };
}

function createSlotTarget(
  snapshot: SceneSnapshot,
  runtimeProblems: readonly Problem[],
  object: SceneObject,
  lookup: ImportedGlbMaterialSlotLookup,
  selectedImported: boolean
): MaterialInspectorTarget {
  const commandTarget = { kind: "material-slot" as const, objectId: object.id, slotId: lookup.slot.slotKey };
  const assignmentId = createMaterialAssignmentId(commandTarget);
  const assignment = snapshot.materials.assignments[assignmentId];
  const problems = getSlotProblems(runtimeProblems, object.id, lookup.nodeId, lookup.importKey, lookup.slot.slotKey);
  const unresolved = problems.length > 0;
  return {
    key: assignmentId,
    kind: "material-slot",
    label: formatSlotLabel(lookup.label, lookup.nodeId),
    ownerObjectId: object.id,
    importedNodeId: lookup.nodeId,
    importedNodeName: snapshot.nodes[lookup.nodeId]?.name,
    importKey: lookup.importKey,
    slotId: lookup.slot.slotKey,
    assignmentId,
    materialId: assignment?.materialId ?? null,
    selected: selectedImported,
    preferred: selectedImported && !unresolved,
    hasOverride: Boolean(assignment),
    unresolved,
    problemIds: problems.map((problem) => problem.id),
    canSelect: !unresolved || Boolean(assignment),
    canEditExistingAssignment: Boolean(assignment),
    canCreateAssignment: !unresolved,
    canClear: Boolean(assignment),
    ...(unresolved && !assignment ? { disabledReason: "Slot is unresolved and cannot create a new assignment." } : {}),
    commandTarget
  };
}

function appendStaleAssignmentTargets(
  snapshot: SceneSnapshot,
  runtimeProblems: readonly Problem[],
  object: SceneObject,
  targets: MaterialInspectorTarget[]
): void {
  const knownKeys = new Set(targets.map((target) => target.key));
  const staleAssignments = Object.values(snapshot.materials.assignments)
    .filter((assignment) =>
      assignment.target.kind === "material-slot" &&
      assignment.target.objectId === object.id &&
      !findImportedGlbMaterialSlot(snapshot, object.id, assignment.target.slotId)
    )
    .sort((left, right) => left.target.kind === "material-slot" && right.target.kind === "material-slot"
      ? left.target.slotId.localeCompare(right.target.slotId)
      : 0);

  for (const assignment of staleAssignments) {
    if (assignment.target.kind !== "material-slot" || knownKeys.has(assignment.id)) {
      continue;
    }
    const problems = getSlotProblems(runtimeProblems, object.id, null, null, assignment.target.slotId);
    targets.push({
      key: assignment.id,
      kind: "material-slot",
      label: `Unresolved slot ${assignment.target.slotId}`,
      ownerObjectId: object.id,
      importedNodeId: null,
      slotId: assignment.target.slotId,
      assignmentId: assignment.id,
      materialId: assignment.materialId,
      selected: false,
      preferred: false,
      hasOverride: true,
      unresolved: true,
      problemIds: problems.map((problem) => problem.id),
      canSelect: true,
      canEditExistingAssignment: true,
      canCreateAssignment: false,
      canClear: true,
      commandTarget: assignment.target
    });
  }
}

function collectStaleSelectedObjectTargets(
  snapshot: SceneSnapshot,
  runtimeProblems: readonly Problem[]
): MaterialInspectorTarget[] {
  const objectId = snapshot.selection.objectId;
  const object = objectId ? snapshot.objects[objectId] : null;
  if (!object) {
    return [];
  }
  const targets = [createObjectTarget(snapshot, object, true, true)];
  appendStaleAssignmentTargets(snapshot, runtimeProblems, object, targets);
  return targets;
}

function getImportedNodesForOwner(snapshot: SceneSnapshot, ownerObjectId: string): SceneImportedGlbNode[] {
  return Object.values(snapshot.nodes)
    .filter((node): node is SceneImportedGlbNode => node.kind === "imported" && node.ownerObjectId === ownerObjectId)
    .sort((left, right) => compareHierarchyOrder(snapshot, left.id, right.id));
}

function compareHierarchyOrder(snapshot: SceneSnapshot, leftId: string, rightId: string): number {
  const order = getHierarchyOrder(snapshot);
  return (order.get(leftId) ?? Number.MAX_SAFE_INTEGER) - (order.get(rightId) ?? Number.MAX_SAFE_INTEGER);
}

function getHierarchyOrder(snapshot: SceneSnapshot): Map<string, number> {
  const order = new Map<string, number>();
  const visit = (nodeId: string): void => {
    if (order.has(nodeId)) {
      return;
    }
    order.set(nodeId, order.size);
    for (const childId of snapshot.nodes[nodeId]?.children ?? []) {
      visit(childId);
    }
  };
  for (const nodeId of snapshot.rootNodeIds) {
    visit(nodeId);
  }
  for (const nodeId of Object.keys(snapshot.nodes)) {
    visit(nodeId);
  }
  return order;
}

function getSlotProblems(
  runtimeProblems: readonly Problem[],
  objectId: string,
  nodeId: string | null,
  importKey: string | null,
  slotId: string
): Problem[] {
  return runtimeProblems.filter((problem) => {
    if (problem.code !== "imported-material-slot-unresolved" &&
      problem.code !== "imported-material-slot-projection-failed") {
      return false;
    }
    const target = problem.target;
    if (target.kind === "imported-material-slot") {
      return target.objectId === objectId &&
        target.slotId === slotId &&
        (!nodeId || target.nodeId === nodeId) &&
        (!importKey || target.importKey === importKey);
    }
    return target.kind === "object" &&
      target.objectId === objectId &&
      problem.metadata?.slotId === slotId;
  });
}

function getDefaultCommandTarget(snapshot: SceneSnapshot): MaterialAssignmentTarget | null {
  const object = getSelectedObject(snapshot);
  return object ? { kind: "object", objectId: object.id } : null;
}

function getCommandTarget(target: MaterialInspectorTarget | MaterialAssignmentTarget): MaterialAssignmentTarget {
  return "commandTarget" in target ? target.commandTarget : target;
}

function isMaterialInspectorTarget(target: MaterialInspectorTarget | MaterialAssignmentTarget): target is MaterialInspectorTarget {
  return "commandTarget" in target;
}

function canWriteInspectorTarget(target: MaterialInspectorTarget, hasExistingAssignment: boolean): boolean {
  if (!target.canSelect) {
    return false;
  }
  return hasExistingAssignment ? target.canEditExistingAssignment : target.canCreateAssignment;
}

function getInspectorTargetProblemMessage(target: MaterialInspectorTarget, hasExistingAssignment: boolean): string {
  if (target.disabledReason) {
    return target.disabledReason;
  }
  if (!target.canSelect) {
    return "Material target is not selectable.";
  }
  if (!hasExistingAssignment && !target.canCreateAssignment) {
    return target.kind === "material-slot"
      ? "Material slot is unresolved and cannot create a new assignment."
      : "Material target is not editable.";
  }
  if (hasExistingAssignment && !target.canEditExistingAssignment) {
    return "Material target is not editable.";
  }
  return "Material target is not editable.";
}

function canWriteTarget(snapshot: SceneSnapshot, target: MaterialAssignmentTarget, hasExistingAssignment: boolean): boolean {
  if (!snapshot.objects[target.objectId]) {
    return false;
  }
  return target.kind === "object" ||
    hasExistingAssignment ||
    Boolean(findImportedGlbMaterialSlot(snapshot, target.objectId, target.slotId));
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
    case "emissive": {
      const color = String(value);
      if (!isColorString(color)) {
        return problem(fieldId, `${fieldId === "color" ? "Base color" : "Emissive"} must be a #rrggbb or rgb(r, g, b) color string.`);
      }
      return { ok: true, material: { [fieldId]: color } as Pick<MeshStandardMaterialOverride, typeof fieldId> };
    }
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

function isMultiSelection(snapshot: SceneSnapshot): boolean {
  return snapshot.selection.nodeIds.length > 1 || snapshot.selection.objectIds.length > 1;
}

function getDisabledReason(snapshot: SceneSnapshot, targets: readonly MaterialInspectorTarget[]): string {
  if (isMultiSelection(snapshot)) {
    return "Select one GLB object or imported material slot to edit material overrides.";
  }
  return targets[0]?.disabledReason ?? "Select a GLB object to edit material overrides.";
}

function formatSide(side: MaterialSide): string {
  return side.charAt(0).toUpperCase() + side.slice(1);
}

function formatTextureSlot(slot: TextureSlotName): string {
  return slot.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);
}

function formatSlotLabel(label: string, nodeId: string): string {
  return `${label} (${nodeId})`;
}

function problem(fieldId: string, message: string): { ok: false; problem: InspectorCommandProblem } {
  return {
    ok: false,
    problem: {
      code: "inspector-material-invalid",
      fieldId,
      message,
      messageDescriptor: inspectorCommandMessageDescriptor("command.material.invalid", fieldId, message),
      severity: "warning"
    }
  };
}

function sideOption(side: MaterialSide) {
  const label = formatSide(side);
  return {
    value: side,
    label,
    labelDescriptor: createDisplayMessageDescriptor({
      namespace: "inspector",
      path: `option.material.side.${side}`,
      field: "label",
      fallback: label,
      values: { side }
    })
  };
}
