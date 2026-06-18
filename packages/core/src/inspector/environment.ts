import type { SetEnvironmentCommand } from "../commands/types";
import {
  buildClearEnvironmentPreset,
  buildEnvironmentBackgroundAssetPreset,
  buildEnvironmentCubemapPreset,
  buildEnvironmentLightingAssetPreset,
  buildEnvironmentSharedAssetPreset,
  buildSolidBackgroundPreset
} from "../environment/presets";
import type {
  CubemapFaceRole,
  EnvironmentBackgroundSource,
  EnvironmentBackgroundSourceKind,
  EnvironmentLightingSource,
  EnvironmentLightingSourceKind,
  EnvironmentRotation,
  SceneEnvironment
} from "../environment/types";
import { CUBEMAP_FACE_ROLES } from "../environment/validation";
import type { AssetKind, AssetReference, SceneSnapshot } from "../snapshot/types";
import { createDisplayMessageDescriptor } from "../i18n/display-messages";
import { inspectorActionLabelDescriptor, inspectorCommandMessageDescriptor, inspectorSectionTitleDescriptor } from "./display-messages";
import { assetField, colorField, numberField, parseFiniteNumber, selectField, validateAssetKind, type NumberRange } from "./fields";
import type {
  EnvironmentFieldId,
  InspectorActionDescriptor,
  InspectorCommandProblem,
  InspectorCommandResult,
  InspectorSection
} from "./types";

const LIGHTING_SOURCE_KINDS: EnvironmentLightingSourceKind[] = ["none", "equirectangular", "hdr", "cubemap"];
const BACKGROUND_SOURCE_KINDS: EnvironmentBackgroundSourceKind[] = ["none", "solid", "flat-image", "equirectangular", "hdr", "cubemap"];
type EnvironmentPatch = SetEnvironmentCommand["environment"];
type EnvironmentPatchResult = { ok: true; environment: EnvironmentPatch } | { ok: false; problem: InspectorCommandProblem };

export function buildEnvironmentSection(snapshot: SceneSnapshot): InspectorSection {
  const environment = snapshot.environment;
  const lightingAssetId = getLightingAssetId(environment.lighting.source);
  const backgroundAssetId = getBackgroundAssetId(environment.background.source);
  const backgroundRotation = environment.background.rotation ?? { x: 0, y: 0, z: 0 };

  return {
    id: "environment",
    title: "Environment",
    titleDescriptor: inspectorSectionTitleDescriptor("environment", "Environment"),
    enabled: true,
    actions: buildEnvironmentActions(snapshot),
    fields: [
      selectField("lighting.source.kind", "Lighting source", environment.lighting.source.kind, LIGHTING_SOURCE_KINDS.map(sourceKindOption)),
      assetField("lighting.source.assetId", "Lighting asset", lightingAssetId, snapshot, ["texture", "image", "hdr"]),
      numberField("environment.intensity", "Lighting intensity", environment.lighting.intensity, { min: 0, step: 0.01 }),
      numberField("environment.rotation.x", "Lighting rotation X", environment.lighting.rotation.x, { step: 0.01 }),
      numberField("environment.rotation.y", "Lighting rotation Y", environment.lighting.rotation.y, { step: 0.01 }),
      numberField("environment.rotation.z", "Lighting rotation Z", environment.lighting.rotation.z, { step: 0.01 }),
      selectField("background.source.kind", "Background source", environment.background.source.kind, BACKGROUND_SOURCE_KINDS.map(sourceKindOption)),
      colorField("background.color", "Background color", getBackgroundColor(environment.background.source), environment.background.source.kind !== "solid"),
      assetField("background.source.assetId", "Background asset", backgroundAssetId, snapshot, ["texture", "image", "hdr"]),
      numberField("background.intensity", "Background intensity", environment.background.intensity ?? 1, { min: 0, step: 0.01 }),
      numberField("background.blur", "Background blur", environment.background.blur ?? 0, { min: 0, max: 1, step: 0.01, problem: flatBackgroundBlurProblem(environment) }),
      numberField("background.rotation.x", "Background rotation X", backgroundRotation.x, { step: 0.01 }),
      numberField("background.rotation.y", "Background rotation Y", backgroundRotation.y, { step: 0.01 }),
      numberField("background.rotation.z", "Background rotation Z", backgroundRotation.z, { step: 0.01 }),
      ...cubemapFaceFields("lighting", environment.lighting.source, snapshot),
      ...cubemapFaceFields("background", environment.background.source, snapshot)
    ]
  };
}

export function buildEnvironmentActions(snapshot: SceneSnapshot): InspectorActionDescriptor[] {
  const actions: InspectorActionDescriptor[] = [
    presetAction("environment-preset-clear", "Clear", buildClearEnvironmentPreset()),
    presetAction("environment-preset-solid-background", "Solid background", buildSolidBackgroundPreset(getBackgroundColor(snapshot.environment.background.source)))
  ];
  const firstLightingAsset = firstAsset(snapshot, ["hdr", "texture", "image"]);
  const firstBackgroundAsset = firstAsset(snapshot, ["hdr", "texture", "image"]);
  const cubemapFaces = firstCubemapFaces(snapshot);

  actions.push(firstLightingAsset
    ? presetAction("environment-preset-lighting-asset", "Use asset lighting", buildEnvironmentLightingAssetPreset(firstLightingAsset))
    : disabledAction("environment-preset-lighting-asset", "Use asset lighting", "Add an HDR, texture, or image asset first."));
  actions.push(firstBackgroundAsset
    ? presetAction("environment-preset-background-asset", "Use asset background", buildEnvironmentBackgroundAssetPreset(firstBackgroundAsset))
    : disabledAction("environment-preset-background-asset", "Use asset background", "Add an HDR, texture, or image asset first."));
  actions.push(firstLightingAsset
    ? presetAction("environment-preset-shared-asset", "Shared lighting/background", buildEnvironmentSharedAssetPreset(firstLightingAsset))
    : disabledAction("environment-preset-shared-asset", "Shared lighting/background", "Add an HDR, texture, or image asset first."));
  actions.push(cubemapFaces
    ? presetAction("environment-preset-cubemap-skybox", "Use six textures as skybox", buildEnvironmentCubemapPreset(cubemapFaces, "background"))
    : disabledAction("environment-preset-cubemap-skybox", "Use six textures as skybox", "Register six texture or image assets named px, nx, py, ny, pz, and nz."));
  actions.push(cubemapFaces
    ? presetAction("environment-preset-cubemap-both", "Use six textures for both", buildEnvironmentCubemapPreset(cubemapFaces, "both"))
    : disabledAction("environment-preset-cubemap-both", "Use six textures for both", "Register six texture or image assets named px, nx, py, ny, pz, and nz."));

  return actions;
}

export function buildSetEnvironmentCommand(snapshot: SceneSnapshot, fieldId: EnvironmentFieldId, value: unknown): InspectorCommandResult {
  const patch = buildEnvironmentPatch(snapshot, fieldId, value);
  if (!patch.ok) {
    return patch;
  }
  return { ok: true, command: { type: "set-environment", environment: patch.environment } };
}

function buildEnvironmentPatch(snapshot: SceneSnapshot, fieldId: EnvironmentFieldId, value: unknown): EnvironmentPatchResult {
  switch (fieldId) {
    case "lighting.source.kind":
    case "mode":
      return lightingKindPatch(snapshot, fieldId, value);
    case "background.source.kind":
    case "background.mode":
      return backgroundKindPatch(snapshot, fieldId, value);
    case "background.color":
      return { ok: true, environment: { background: { source: { kind: "solid", color: String(value) } } } };
    case "lighting.source.assetId":
    case "environment.assetId":
      return lightingAssetPatch(snapshot, fieldId, String(value));
    case "background.source.assetId":
    case "background.assetId":
      return backgroundAssetPatch(snapshot, fieldId, String(value));
    case "environment.intensity":
      return numericPatch(fieldId, value, (numberValue) => ({ lighting: { intensity: numberValue } }), { min: 0 });
    case "background.intensity":
      return numericPatch(fieldId, value, (numberValue) => ({ background: { intensity: numberValue } }), { min: 0 });
    case "background.blur":
      return numericPatch(fieldId, value, (numberValue) => ({ background: { blur: numberValue } }), { min: 0, max: 1 });
    case "environment.rotation.x":
    case "environment.rotation.y":
    case "environment.rotation.z": {
      const axis = fieldId.split(".")[2] as keyof EnvironmentRotation;
      return numericPatch(fieldId, value, (numberValue) => ({ lighting: { rotation: { [axis]: numberValue } } }));
    }
    case "background.rotation.x":
    case "background.rotation.y":
    case "background.rotation.z": {
      const axis = fieldId.split(".")[2] as keyof EnvironmentRotation;
      return numericPatch(fieldId, value, (numberValue) => ({ background: { rotation: { [axis]: numberValue } } }));
    }
    default:
      if (fieldId.startsWith("lighting.source.faces.")) {
        return cubemapFacePatch(snapshot, "lighting", fieldId, String(value));
      }
      if (fieldId.startsWith("background.source.faces.")) {
        return cubemapFacePatch(snapshot, "background", fieldId, String(value));
      }
      return problem(fieldId, "Unsupported environment field.");
  }
}

function lightingKindPatch(snapshot: SceneSnapshot, fieldId: string, value: unknown): EnvironmentPatchResult {
  const kind = legacyLightingKind(value);
  if (!LIGHTING_SOURCE_KINDS.includes(kind)) {
    return problem(fieldId, "Environment lighting source kind is unsupported.");
  }
  if (kind === "none") {
    return { ok: true, environment: { lighting: { source: { kind: "none" } } } };
  }
  if (kind === "cubemap") {
    return { ok: true, environment: { lighting: { source: cubemapSourceFromExisting(snapshot.environment.lighting.source) } } };
  }

  const currentAssetId = getLightingAssetId(snapshot.environment.lighting.source);
  if (!currentAssetId) {
    return problem(fieldId, `${formatSourceKind(kind)} lighting requires an asset.`);
  }
  const valid = validateAssetKind(snapshot, currentAssetId, assetKindsForLightingKind(kind), "Environment lighting asset");
  if (!valid.ok) {
    return problem(fieldId, valid.message);
  }
  return { ok: true, environment: { lighting: { source: { kind, assetId: currentAssetId } } } };
}

function backgroundKindPatch(snapshot: SceneSnapshot, fieldId: string, value: unknown): EnvironmentPatchResult {
  const kind = legacyBackgroundKind(value);
  if (!BACKGROUND_SOURCE_KINDS.includes(kind)) {
    return problem(fieldId, "Environment background source kind is unsupported.");
  }
  if (kind === "none") {
    return { ok: true, environment: { background: { source: { kind: "none" } } } };
  }
  if (kind === "solid") {
    return { ok: true, environment: { background: { source: { kind: "solid", color: getBackgroundColor(snapshot.environment.background.source) } } } };
  }
  if (kind === "cubemap") {
    return { ok: true, environment: { background: { source: cubemapSourceFromExisting(snapshot.environment.background.source) } } };
  }

  const currentAssetId = getBackgroundAssetId(snapshot.environment.background.source);
  if (!currentAssetId) {
    return problem(fieldId, `${formatSourceKind(kind)} background requires an asset.`);
  }
  const valid = validateAssetKind(snapshot, currentAssetId, assetKindsForBackgroundKind(kind), "Environment background asset");
  if (!valid.ok) {
    return problem(fieldId, valid.message);
  }
  return { ok: true, environment: { background: { source: { kind, assetId: currentAssetId } } } };
}

function lightingAssetPatch(snapshot: SceneSnapshot, fieldId: string, assetId: string): EnvironmentPatchResult {
  const valid = validateAssetKind(snapshot, assetId, ["texture", "image", "hdr"], "Environment lighting asset");
  if (!valid.ok) {
    return problem(fieldId, valid.message);
  }
  return {
    ok: true,
    environment: {
      lighting: {
        source: {
          kind: valid.asset.kind === "hdr" ? "hdr" : "equirectangular",
          assetId
        }
      }
    }
  };
}

function backgroundAssetPatch(snapshot: SceneSnapshot, fieldId: string, assetId: string): EnvironmentPatchResult {
  const valid = validateAssetKind(snapshot, assetId, ["texture", "image", "hdr"], "Environment background asset");
  if (!valid.ok) {
    return problem(fieldId, valid.message);
  }
  return {
    ok: true,
    environment: {
      background: {
        source: {
          kind: valid.asset.kind === "hdr" ? "hdr" : "flat-image",
          assetId
        }
      }
    }
  };
}

function cubemapFacePatch(snapshot: SceneSnapshot, target: "lighting" | "background", fieldId: string, assetId: string): EnvironmentPatchResult {
  const valid = validateAssetKind(snapshot, assetId, ["texture", "image"], "Cubemap face asset");
  if (!valid.ok) {
    return problem(fieldId, valid.message);
  }
  const match = fieldId.match(/faces\.(\d+)\.assetId$/);
  const index = match ? Number(match[1]) : -1;
  const role = CUBEMAP_FACE_ROLES[index];
  if (!role) {
    return problem(fieldId, "Cubemap face role is unsupported.");
  }
  const current = target === "lighting" ? snapshot.environment.lighting.source : snapshot.environment.background.source;
  const source = cubemapSourceFromExisting(current);
  source.faces[index] = { role, assetId };
  return target === "lighting"
    ? { ok: true, environment: { lighting: { source } } }
    : { ok: true, environment: { background: { source } } };
}

function numericPatch(fieldId: EnvironmentFieldId, value: unknown, toPatch: (value: number) => EnvironmentPatch, range?: NumberRange): EnvironmentPatchResult {
  const parsed = parseFiniteNumber(value, fieldId, range);
  if (!parsed.ok) {
    return problem(fieldId, parsed.message);
  }
  return { ok: true, environment: toPatch(parsed.value) };
}

function cubemapFaceFields(
  target: "lighting" | "background",
  source: EnvironmentLightingSource | EnvironmentBackgroundSource,
  snapshot: SceneSnapshot
) {
  if (source.kind !== "cubemap") {
    return [];
  }
  return CUBEMAP_FACE_ROLES.map((role, index) => {
    const face = source.faces.find((candidate) => candidate.role === role);
    return assetField(`${target}.source.faces.${index}.assetId`, `${target === "lighting" ? "Lighting" : "Skybox"} ${formatFaceRole(role)}`, face?.assetId ?? "", snapshot, ["texture", "image"]);
  });
}

function cubemapSourceFromExisting(source: EnvironmentLightingSource | EnvironmentBackgroundSource): Extract<EnvironmentLightingSource, { kind: "cubemap" }> {
  if (source.kind === "cubemap") {
    return { kind: "cubemap", faces: source.faces.map((face) => ({ ...face })) };
  }
  return {
    kind: "cubemap",
    faces: CUBEMAP_FACE_ROLES.map((role) => ({ role, assetId: "missing" }))
  };
}

function assetKindsForLightingKind(kind: EnvironmentLightingSourceKind): AssetKind[] {
  return kind === "hdr" ? ["hdr"] : ["texture", "image"];
}

function assetKindsForBackgroundKind(kind: EnvironmentBackgroundSourceKind): AssetKind[] {
  return kind === "hdr" ? ["hdr"] : ["texture", "image"];
}

function legacyLightingKind(value: unknown): EnvironmentLightingSourceKind {
  if (value === "texture") {
    return "equirectangular";
  }
  if (value === "solid") {
    return "none";
  }
  return value as EnvironmentLightingSourceKind;
}

function legacyBackgroundKind(value: unknown): EnvironmentBackgroundSourceKind {
  if (value === "texture") {
    return "flat-image";
  }
  return value as EnvironmentBackgroundSourceKind;
}

function getLightingAssetId(source: EnvironmentLightingSource): string {
  return source.kind === "equirectangular" || source.kind === "hdr" ? source.assetId : "";
}

function getBackgroundAssetId(source: EnvironmentBackgroundSource): string {
  return source.kind === "flat-image" || source.kind === "equirectangular" || source.kind === "hdr" ? source.assetId : "";
}

function getBackgroundColor(source: EnvironmentBackgroundSource): string {
  return source.kind === "solid" ? source.color : "#000000";
}

function firstAsset(snapshot: SceneSnapshot, kinds: AssetKind[]): AssetReference | undefined {
  return Object.values(snapshot.assets)
    .sort((left, right) => left.id.localeCompare(right.id))
    .find((asset) => kinds.includes(asset.kind));
}

function firstCubemapFaces(snapshot: SceneSnapshot) {
  const assets = Object.values(snapshot.assets);
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const preferredIds: Record<CubemapFaceRole, string[]> = {
    "positive-x": ["px", "positive-x", "right"],
    "negative-x": ["nx", "negative-x", "left"],
    "positive-y": ["py", "positive-y", "top"],
    "negative-y": ["ny", "negative-y", "bottom"],
    "positive-z": ["pz", "positive-z", "front"],
    "negative-z": ["nz", "negative-z", "back"]
  };
  const faces = CUBEMAP_FACE_ROLES.map((role) => {
    const asset = preferredIds[role]
      .map((id) => byId.get(id))
      .find((candidate) => candidate && (candidate.kind === "texture" || candidate.kind === "image"));
    return asset ? { role, assetId: asset.id } : null;
  });
  return faces.every(Boolean) ? faces as { role: CubemapFaceRole; assetId: string }[] : undefined;
}

function presetAction(
  id: string,
  label: string,
  result: ReturnType<typeof buildClearEnvironmentPreset>
): InspectorActionDescriptor {
  if (!result.ok) {
    return disabledAction(id, label, result.problem.message);
  }
  return { id, label, labelDescriptor: inspectorActionLabelDescriptor(id, label), command: result.command };
}

function disabledAction(id: string, label: string, message: string): InspectorActionDescriptor {
  return {
    id,
    label,
    labelDescriptor: inspectorActionLabelDescriptor(id, label),
    disabled: true,
    problem: {
      code: "environment-preset-unavailable",
      message,
      messageDescriptor: createDisplayMessageDescriptor({
        namespace: "inspector",
        path: "action.environment.presetUnavailable",
        field: "message",
        fallback: message,
        values: { actionId: id, message }
      }),
      severity: "info"
    }
  };
}

function flatBackgroundBlurProblem(environment: SceneEnvironment): InspectorCommandProblem | undefined {
  if (environment.background.source.kind !== "flat-image" || !environment.background.blur || environment.background.blur <= 0) {
    return undefined;
  }
  return {
    code: "environment-background-blur-unsupported",
    message: "Background blur does not affect flat image backgrounds.",
    messageDescriptor: createDisplayMessageDescriptor({
      namespace: "inspector",
      path: "problem.environment.backgroundBlurUnsupported",
      field: "message",
      fallback: "Background blur does not affect flat image backgrounds."
    }),
    severity: "info"
  };
}

function formatSourceKind(kind: string): string {
  return kind.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatFaceRole(role: CubemapFaceRole): string {
  return role.replace("-", " ");
}

function problem(fieldId: string, message: string): { ok: false; problem: InspectorCommandProblem } {
  return {
    ok: false,
    problem: {
      code: "inspector-environment-invalid",
      fieldId,
      message,
      messageDescriptor: inspectorCommandMessageDescriptor("command.environment.invalid", fieldId, message),
      severity: "warning"
    }
  };
}

function sourceKindOption(kind: EnvironmentLightingSourceKind | EnvironmentBackgroundSourceKind) {
  const label = formatSourceKind(kind);
  return {
    value: kind,
    label,
    labelDescriptor: createDisplayMessageDescriptor({
      namespace: "inspector",
      path: `option.environment.source.${kind}`,
      field: "label",
      fallback: label,
      values: { kind }
    })
  };
}
