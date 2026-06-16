import type { AddLightCommand, Command, RemoveLightCommand, UpdateLightCommand } from "../commands/types";
import { buildLightingPresetCommands, type LightingPresetId } from "../lights/presets";
import type { LightDefinition, LightKind } from "../lights/types";
import type { Problem } from "../problems/types";
import { findLightNodeId } from "../snapshot/nodes";
import { checkboxField, colorField, numberField, parseBoolean, parseFiniteNumber, textField, type NumberRange } from "./fields";
import { toProblemItem } from "./problems";
import type { InspectorActionDescriptor, InspectorCommandProblem, InspectorCommandResult, InspectorFieldDescriptor, LightFieldId, LightInspectorSection, LightListItem } from "./types";
import type { SceneSnapshot } from "../snapshot/types";

const LIGHT_KINDS: LightKind[] = ["ambient", "hemisphere", "directional", "point", "spot"];
const LIGHTING_PRESET_OPTIONS: { id: LightingPresetId; label: string }[] = [
  { id: "conservative-key-light", label: "Key shadow" },
  { id: "soft-spotlight", label: "Soft spot" },
  { id: "point-shadow-preview", label: "Point preview" },
  { id: "disable-all-shadows", label: "Disable shadows" }
];
const AXES = ["x", "y", "z"] as const;
const NUMBER_RANGES: Partial<Record<LightFieldId, NumberRange>> = {
  intensity: { min: 0 },
  distance: { min: 0 },
  decay: { min: 0 },
  angle: { min: 0, max: Math.PI / 2 },
  penumbra: { min: 0, max: 1 },
  "shadow.mapSize.width": { min: 1 },
  "shadow.mapSize.height": { min: 1 },
  "shadow.bias": {},
  "shadow.normalBias": { min: 0 },
  "shadow.radius": { min: 0 },
  "shadow.camera.near": { min: 0 },
  "shadow.camera.far": { min: 0 },
  "shadow.camera.left": {},
  "shadow.camera.right": {},
  "shadow.camera.top": {},
  "shadow.camera.bottom": {}
};
type ShadowNumberFieldId =
  | "shadow.mapSize.width"
  | "shadow.mapSize.height"
  | "shadow.bias"
  | "shadow.normalBias"
  | "shadow.radius"
  | "shadow.camera.near"
  | "shadow.camera.far"
  | "shadow.camera.left"
  | "shadow.camera.right"
  | "shadow.camera.top"
  | "shadow.camera.bottom";
type LightPatchResult = { ok: true; patch: Partial<LightDefinition> } | { ok: false; problem: InspectorCommandProblem };

export function resolveActiveLightId(snapshot: SceneSnapshot, activeLightId?: string | null): string | null {
  void activeLightId;
  const selectedLightId = getSelectedLightId(snapshot);
  if (selectedLightId) {
    return selectedLightId;
  }
  return null;
}

export function buildLightSection(
  snapshot: SceneSnapshot,
  activeLightId?: string | null,
  runtimeProblems: readonly Problem[] = []
): LightInspectorSection {
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
    fields: activeLight ? buildLightFields(activeLight) : [],
    actions: buildLightActions(snapshot, resolvedActiveLightId),
    diagnostics: activeLight ? buildLightDiagnostics(snapshot, activeLight.id, runtimeProblems) : []
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

function buildLightActions(snapshot: SceneSnapshot, activeLightId: string | null): InspectorActionDescriptor[] {
  return LIGHTING_PRESET_OPTIONS.map(({ id, label }) => {
    const result = buildLightingPresetCommands(snapshot.lights, id, activeLightId ? { lightId: activeLightId } : {});
    const command = commandsToActionCommand(label, result.commands);
    return {
      id: `lighting-preset-${id}`,
      label,
      ...(command ? { command } : {}),
      disabled: !result.ok || !command,
      ...(result.problem ? { problem: result.problem } : {})
    };
  });
}

function commandsToActionCommand(label: string, commands: Command[]): Command | undefined {
  if (commands.length === 0) {
    return undefined;
  }
  if (commands.length === 1) {
    return commands[0];
  }
  return {
    type: "batch",
    label,
    commands
  };
}

function buildLightDiagnostics(
  snapshot: SceneSnapshot,
  lightId: string,
  runtimeProblems: readonly Problem[]
) {
  const acknowledged = snapshot.problems.acknowledged;
  return runtimeProblems
    .filter((runtimeProblem) => runtimeProblem.target.kind === "light" && runtimeProblem.target.lightId === lightId)
    .map((runtimeProblem) => toProblemItem(runtimeProblem, Boolean(acknowledged[runtimeProblem.id]), true));
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

function buildLightFields(light: LightDefinition): InspectorFieldDescriptor<unknown>[] {
  const fields: InspectorFieldDescriptor<unknown>[] = [
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
  if (isShadowCapableLight(light)) {
    fields.push(
      checkboxField("shadow.enabled", "Cast shadows", light.shadow.enabled),
      numberField("shadow.mapSize.width", "Shadow map width", light.shadow.mapSize.width, { min: 1, step: 1 }),
      numberField("shadow.mapSize.height", "Shadow map height", light.shadow.mapSize.height, { min: 1, step: 1 }),
      numberField("shadow.bias", "Shadow bias", light.shadow.bias, { step: 0.0001 }),
      numberField("shadow.normalBias", "Shadow normal bias", light.shadow.normalBias, { min: 0, step: 0.001 }),
      numberField("shadow.radius", "Shadow radius", light.shadow.radius, { min: 0, step: 0.1 }),
      numberField("shadow.camera.near", "Shadow near", light.shadow.camera.near, { min: 0, step: 0.1 }),
      numberField("shadow.camera.far", "Shadow far", light.shadow.camera.far, { min: 0, step: 1 })
    );
    if (light.kind === "directional") {
      fields.push(
        numberField("shadow.camera.left", "Shadow left", light.shadow.camera.left, { step: 0.1 }),
        numberField("shadow.camera.right", "Shadow right", light.shadow.camera.right, { step: 0.1 }),
        numberField("shadow.camera.top", "Shadow top", light.shadow.camera.top, { step: 0.1 }),
        numberField("shadow.camera.bottom", "Shadow bottom", light.shadow.camera.bottom, { step: 0.1 })
      );
    }
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
  if (fieldId === "shadow.enabled") {
    if (!isShadowCapableLight(light)) {
      return problem(fieldId, "Shadows are not supported by this light kind.");
    }
    return { ok: true, patch: { shadow: { ...light.shadow, enabled: parseBoolean(value) } } as Partial<LightDefinition> };
  }
  if (fieldId.startsWith("shadow.")) {
    if (!isShadowCapableLight(light)) {
      return problem(fieldId, "Shadows are not supported by this light kind.");
    }
    const shadowFieldId = fieldId as ShadowNumberFieldId;
    const parsed = parseFiniteNumber(value, fieldId, NUMBER_RANGES[shadowFieldId]);
    if (!parsed.ok) {
      return problem(fieldId, parsed.message);
    }
    return buildShadowPatch(light, shadowFieldId, parsed.value);
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

function buildShadowPatch(light: LightDefinition, fieldId: ShadowNumberFieldId, value: number): LightPatchResult {
  if (!isShadowCapableLight(light)) {
    return problem(fieldId, "Shadows are not supported by this light kind.");
  }
  if (fieldId === "shadow.mapSize.width" || fieldId === "shadow.mapSize.height") {
    const dimension = Math.trunc(value);
    const axis = fieldId.endsWith("width") ? "width" : "height";
    return {
      ok: true,
      patch: {
        shadow: {
          ...light.shadow,
          mapSize: { ...light.shadow.mapSize, [axis]: dimension }
        }
      } as Partial<LightDefinition>
    };
  }
  if (fieldId === "shadow.bias" || fieldId === "shadow.normalBias" || fieldId === "shadow.radius") {
    const key = fieldId.split(".")[1] as "bias" | "normalBias" | "radius";
    return {
      ok: true,
      patch: {
        shadow: {
          ...light.shadow,
          [key]: value
        }
      } as Partial<LightDefinition>
    };
  }
  if (fieldId === "shadow.camera.near" || fieldId === "shadow.camera.far") {
    const key = fieldId.endsWith("near") ? "near" : "far";
    return {
      ok: true,
      patch: {
        shadow: {
          ...light.shadow,
          camera: { ...light.shadow.camera, [key]: value }
        }
      } as Partial<LightDefinition>
    };
  }
  if (fieldId.startsWith("shadow.camera.")) {
    if (light.kind !== "directional") {
      return problem(fieldId, "Directional shadow bounds are only supported by directional lights.");
    }
    const key = fieldId.split(".")[2] as "left" | "right" | "top" | "bottom";
    return {
      ok: true,
      patch: {
        shadow: {
          ...light.shadow,
          camera: { ...light.shadow.camera, [key]: value }
        }
      } as Partial<LightDefinition>
    };
  }
  return problem(fieldId, "Unsupported light shadow field.");
}

function formatLightKind(kind: LightKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function hasTransform(light: LightDefinition): light is LightDefinition & { transform: NonNullable<LightDefinition["transform"]> } {
  return Boolean(light.transform);
}

function isShadowCapableLight(light: LightDefinition): light is Extract<LightDefinition, { kind: "directional" | "point" | "spot" }> {
  return light.kind === "directional" || light.kind === "point" || light.kind === "spot";
}

function problem(fieldId: string, message: string): { ok: false; problem: InspectorCommandProblem } {
  return { ok: false, problem: { code: "inspector-light-invalid", fieldId, message, severity: "warning" } };
}
