import type { AddLightCommand, RemoveLightCommand, UpdateLightCommand } from "../commands/types";
import type { LightDefinition, LightKind } from "../lights/types";
import { findLightNodeId } from "../snapshot/nodes";
import { colorField, numberField, parseFiniteNumber, selectField, textField, type NumberRange } from "./fields";
import type { InspectorCommandProblem, InspectorCommandResult, LightFieldId, LightInspectorSection, LightListItem } from "./types";
import type { SceneSnapshot } from "../snapshot/types";

const LIGHT_KINDS: LightKind[] = ["ambient", "hemisphere", "directional", "point", "spot"];
const AXES = ["x", "y", "z"] as const;
const NUMBER_RANGES = {
  intensity: { min: 0 },
  distance: { min: 0 },
  decay: { min: 0 },
  angle: { min: 0, max: Math.PI / 2 },
  penumbra: { min: 0, max: 1 }
} satisfies Partial<Record<LightFieldId, NumberRange>>;
type LightPatchResult = { ok: true; patch: Partial<LightDefinition> } | { ok: false; problem: InspectorCommandProblem };

export function resolveActiveLightId(snapshot: SceneSnapshot, activeLightId?: string | null): string | null {
  void activeLightId;
  const selectedLightId = getSelectedLightId(snapshot);
  if (selectedLightId) {
    return selectedLightId;
  }
  return null;
}

export function buildLightSection(snapshot: SceneSnapshot, activeLightId?: string | null): LightInspectorSection {
  const resolvedActiveLightId = resolveActiveLightId(snapshot, activeLightId);
  const activeLightNodeId = resolvedActiveLightId ? findLightNodeId(snapshot, resolvedActiveLightId) : null;
  const activeLight = resolvedActiveLightId ? snapshot.lights[resolvedActiveLightId] : null;

  return {
    id: "lights",
    title: "Lights",
    enabled: true,
    empty: !activeLight,
    reason: activeLight ? undefined : getLightSectionEmptyReason(snapshot),
    activeLightId: resolvedActiveLightId,
    activeLightNodeId,
    lights: buildLightList(snapshot, resolvedActiveLightId),
    addOptions: LIGHT_KINDS.map((kind) => ({ value: kind, label: formatLightKind(kind) })),
    fields: activeLight ? buildLightFields(activeLight) : []
  };
}

export function buildAddLightCommand(kind: LightKind): InspectorCommandResult {
  if (!LIGHT_KINDS.includes(kind)) {
    return problem("kind", "Light kind is unsupported.");
  }
  const command: AddLightCommand = {
    type: "add-light",
    light: { kind }
  };
  return { ok: true, command };
}

export function buildUpdateLightCommand(snapshot: SceneSnapshot, lightId: string, fieldId: LightFieldId, value: unknown): InspectorCommandResult {
  const light = snapshot.lights[lightId];
  if (!light) {
    return problem(fieldId, "Light does not exist.");
  }

  const patch = buildLightPatch(light, fieldId, value);
  if (!patch.ok) {
    return patch;
  }

  const command: UpdateLightCommand = {
    type: "update-light",
    lightId,
    patch: patch.patch
  };
  return { ok: true, command };
}

export function buildRemoveLightCommand(snapshot: SceneSnapshot, lightId: string): InspectorCommandResult {
  if (!snapshot.lights[lightId]) {
    return problem("lightId", "Light does not exist.");
  }
  const command: RemoveLightCommand = {
    type: "remove-light",
    lightId
  };
  return { ok: true, command };
}

export function getNextActiveLightId(snapshot: SceneSnapshot, removedLightId: string): string | null {
  return Object.keys(snapshot.lights).find((lightId) => lightId !== removedLightId) ?? null;
}

function buildLightList(snapshot: SceneSnapshot, activeLightId: string | null): LightListItem[] {
  return Object.values(snapshot.lights).map((light) => {
    const nodeId = findLightNodeId(snapshot, light.id);
    const selected = Boolean(nodeId && snapshot.selection.nodeIds.includes(nodeId));
    return {
      id: light.id,
      nodeId,
      label: light.name,
      kind: light.kind,
      active: light.id === activeLightId,
      selected
    };
  });
}

function getSelectedLightId(snapshot: SceneSnapshot): string | null {
  const node = snapshot.selection.nodeId ? snapshot.nodes[snapshot.selection.nodeId] : undefined;
  return node?.kind === "light" && snapshot.lights[node.lightId] ? node.lightId : null;
}

function getLightSectionEmptyReason(snapshot: SceneSnapshot): string {
  return Object.keys(snapshot.lights).length === 0
    ? "Add a light to edit scene lighting."
    : "Select a light node to edit scene lighting.";
}

function buildLightFields(light: LightDefinition) {
  const fields = [
    textField("name", "Name", light.name),
    colorField("color", "Color", light.color),
    numberField("intensity", "Intensity", light.intensity, { min: 0, step: 0.01 })
  ];

  if (light.kind === "hemisphere") {
    fields.push(colorField("groundColor", "Ground color", light.groundColor));
  }

  if (hasTransform(light)) {
    fields.push(
      ...AXES.map((axis, index) => numberField(`position.${axis}`, `Position ${axis.toUpperCase()}`, light.transform.position[index], { step: 0.01 }))
    );
  }

  if ("target" in light) {
    fields.push(...AXES.map((axis, index) => numberField(`target.${axis}`, `Target ${axis.toUpperCase()}`, light.target[index], { step: 0.01 })));
  }

  if ("distance" in light || light.kind === "point" || light.kind === "spot") {
    fields.push(numberField("distance", "Distance", light.distance ?? 0, { min: 0, step: 0.01 }));
  }
  if ("decay" in light || light.kind === "point" || light.kind === "spot") {
    fields.push(numberField("decay", "Decay", light.decay ?? 1, { min: 0, step: 0.01 }));
  }
  if (light.kind === "spot") {
    fields.push(numberField("angle", "Angle", light.angle, { min: 0, max: Math.PI / 2, step: 0.01 }));
    fields.push(numberField("penumbra", "Penumbra", light.penumbra ?? 0, { min: 0, max: 1, step: 0.01 }));
  }

  return fields;
}

function buildLightPatch(
  light: LightDefinition,
  fieldId: LightFieldId,
  value: unknown
): LightPatchResult {
  if (fieldId === "name") {
    return { ok: true, patch: { name: String(value) } };
  }
  if (fieldId === "color") {
    return { ok: true, patch: { color: String(value) } };
  }
  if (fieldId === "groundColor") {
    return light.kind === "hemisphere"
      ? { ok: true, patch: { groundColor: String(value) } }
      : problem(fieldId, "Ground color is only supported by hemisphere lights.");
  }
  if (fieldId === "intensity" || fieldId === "distance" || fieldId === "decay" || fieldId === "angle" || fieldId === "penumbra") {
    const parsed = parseFiniteNumber(value, fieldId, NUMBER_RANGES[fieldId]);
    if (!parsed.ok) {
      return problem(fieldId, parsed.message);
    }
    return { ok: true, patch: { [fieldId]: parsed.value } as Partial<LightDefinition> };
  }
  if (fieldId.startsWith("position.")) {
    if (!hasTransform(light)) {
      return problem(fieldId, "Position is not supported by this light kind.");
    }
    const parsed = parseFiniteNumber(value, fieldId);
    if (!parsed.ok) {
      return problem(fieldId, parsed.message);
    }
    const axis = AXES.indexOf(fieldId.split(".")[1] as (typeof AXES)[number]);
    const position = [...light.transform.position] as [number, number, number];
    position[axis] = parsed.value;
    return { ok: true, patch: { transform: { ...light.transform, position } } as Partial<LightDefinition> };
  }
  if (fieldId.startsWith("target.")) {
    if (!("target" in light)) {
      return problem(fieldId, "Target is not supported by this light kind.");
    }
    const parsed = parseFiniteNumber(value, fieldId);
    if (!parsed.ok) {
      return problem(fieldId, parsed.message);
    }
    const axis = AXES.indexOf(fieldId.split(".")[1] as (typeof AXES)[number]);
    const target = [...light.target] as [number, number, number];
    target[axis] = parsed.value;
    return { ok: true, patch: { target } as Partial<LightDefinition> };
  }
  return problem(fieldId, "Unsupported light field.");
}

function formatLightKind(kind: LightKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function hasTransform(light: LightDefinition): light is LightDefinition & { transform: NonNullable<LightDefinition["transform"]> } {
  return Boolean(light.transform);
}

function problem(fieldId: string, message: string): { ok: false; problem: InspectorCommandProblem } {
  return { ok: false, problem: { code: "inspector-light-invalid", fieldId, message, severity: "warning" } };
}
