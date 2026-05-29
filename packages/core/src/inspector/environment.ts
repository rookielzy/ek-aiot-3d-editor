import type { SetEnvironmentCommand } from "../commands/types";
import type { BackgroundMode, EnvironmentMode, SceneEnvironment } from "../environment/types";
import type { SceneSnapshot } from "../snapshot/types";
import { assetField, colorField, numberField, parseFiniteNumber, selectField, validateAssetKind, type NumberRange } from "./fields";
import type { EnvironmentFieldId, InspectorCommandProblem, InspectorCommandResult, InspectorSection } from "./types";

const ENVIRONMENT_MODES: EnvironmentMode[] = ["none", "solid", "texture", "hdr"];
const BACKGROUND_MODES: BackgroundMode[] = ["none", "solid", "texture", "hdr"];
type EnvironmentPatch = SetEnvironmentCommand["environment"];
type EnvironmentPatchResult = { ok: true; environment: EnvironmentPatch } | { ok: false; problem: InspectorCommandProblem };

export function buildEnvironmentSection(snapshot: SceneSnapshot): InspectorSection {
  const environment = snapshot.environment;
  const backgroundRotation = environment.background.rotation ?? { x: 0, y: 0, z: 0 };

  return {
    id: "environment",
    title: "Environment",
    enabled: true,
    fields: [
      selectField("mode", "Lighting mode", environment.mode, ENVIRONMENT_MODES.map((mode) => ({ value: mode, label: formatMode(mode) }))),
      assetField("environment.assetId", "Lighting asset", environment.environment.assetId ?? "", snapshot, ["texture", "image", "hdr"]),
      numberField("environment.intensity", "Lighting intensity", environment.environment.intensity, { min: 0, step: 0.01 }),
      numberField("environment.rotation.x", "Lighting rotation X", environment.environment.rotation.x, { step: 0.01 }),
      numberField("environment.rotation.y", "Lighting rotation Y", environment.environment.rotation.y, { step: 0.01 }),
      numberField("environment.rotation.z", "Lighting rotation Z", environment.environment.rotation.z, { step: 0.01 }),
      selectField("background.mode", "Background mode", environment.background.mode, BACKGROUND_MODES.map((mode) => ({ value: mode, label: formatMode(mode) }))),
      colorField("background.color", "Background color", environment.background.color ?? "#000000", environment.background.mode !== "solid"),
      assetField("background.assetId", "Background asset", environment.background.assetId ?? "", snapshot, ["texture", "image", "hdr"]),
      numberField("background.intensity", "Background intensity", environment.background.intensity ?? 1, { min: 0, step: 0.01 }),
      numberField("background.blur", "Background blur", environment.background.blur ?? 0, { min: 0, max: 1, step: 0.01 }),
      numberField("background.rotation.x", "Background rotation X", backgroundRotation.x, { step: 0.01 }),
      numberField("background.rotation.y", "Background rotation Y", backgroundRotation.y, { step: 0.01 }),
      numberField("background.rotation.z", "Background rotation Z", backgroundRotation.z, { step: 0.01 })
    ]
  };
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
    case "mode": {
      if (!ENVIRONMENT_MODES.includes(value as EnvironmentMode)) {
        return problem(fieldId, "Environment mode is unsupported.");
      }
      const mode = value as EnvironmentMode;
      if (mode === "texture" || mode === "hdr") {
        const currentAssetId = snapshot.environment.environment.assetId;
        if (!currentAssetId) {
          return problem(fieldId, `${formatMode(mode)} environment requires an asset.`);
        }
        const valid = validateAssetKind(snapshot, currentAssetId, mode === "hdr" ? ["hdr"] : ["texture", "image"], "Environment asset");
        if (!valid.ok) {
          return problem(fieldId, valid.message);
        }
      }
      return { ok: true, environment: { mode } };
    }
    case "background.mode": {
      if (!BACKGROUND_MODES.includes(value as BackgroundMode)) {
        return problem(fieldId, "Background mode is unsupported.");
      }
      const mode = value as BackgroundMode;
      if (mode === "texture" || mode === "hdr") {
        const currentAssetId = snapshot.environment.background.assetId;
        if (!currentAssetId) {
          return problem(fieldId, `${formatMode(mode)} background requires an asset.`);
        }
        const valid = validateAssetKind(snapshot, currentAssetId, mode === "hdr" ? ["hdr"] : ["texture", "image"], "Background asset");
        if (!valid.ok) {
          return problem(fieldId, valid.message);
        }
      }
      return { ok: true, environment: { background: { mode } } };
    }
    case "background.color":
      return { ok: true, environment: { background: { mode: "solid", color: String(value) } } };
    case "environment.assetId": {
      const assetId = String(value);
      const valid = validateAssetKind(snapshot, assetId, ["texture", "image", "hdr"], "Environment asset");
      if (!valid.ok) {
        return problem(fieldId, valid.message);
      }
      return {
        ok: true,
        environment: {
          mode: valid.asset.kind === "hdr" ? "hdr" : "texture",
          environment: { assetId }
        }
      };
    }
    case "background.assetId": {
      const assetId = String(value);
      const valid = validateAssetKind(snapshot, assetId, ["texture", "image", "hdr"], "Background asset");
      if (!valid.ok) {
        return problem(fieldId, valid.message);
      }
      return {
        ok: true,
        environment: {
          background: {
            mode: valid.asset.kind === "hdr" ? "hdr" : "texture",
            assetId
          }
        }
      };
    }
    case "environment.intensity":
      return numericPatch(fieldId, value, (numberValue) => ({ environment: { intensity: numberValue } }), { min: 0 });
    case "background.intensity":
      return numericPatch(fieldId, value, (numberValue) => ({ background: { intensity: numberValue } }), { min: 0 });
    case "background.blur":
      return numericPatch(fieldId, value, (numberValue) => ({ background: { blur: numberValue } }), { min: 0, max: 1 });
    case "environment.rotation.x":
    case "environment.rotation.y":
    case "environment.rotation.z": {
      const axis = fieldId.split(".")[2] as keyof SceneEnvironment["environment"]["rotation"];
      return numericPatch(fieldId, value, (numberValue) => ({ environment: { rotation: { [axis]: numberValue } } }));
    }
    case "background.rotation.x":
    case "background.rotation.y":
    case "background.rotation.z": {
      const axis = fieldId.split(".")[2] as "x" | "y" | "z";
      return numericPatch(fieldId, value, (numberValue) => ({ background: { rotation: { [axis]: numberValue } } }));
    }
    default:
      return problem(fieldId, "Unsupported environment field.");
  }
}

function numericPatch(fieldId: EnvironmentFieldId, value: unknown, toPatch: (value: number) => EnvironmentPatch, range?: NumberRange): EnvironmentPatchResult {
  const parsed = parseFiniteNumber(value, fieldId, range);
  if (!parsed.ok) {
    return problem(fieldId, parsed.message);
  }
  return { ok: true, environment: toPatch(parsed.value) };
}

function formatMode(mode: string): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function problem(fieldId: string, message: string): { ok: false; problem: InspectorCommandProblem } {
  return { ok: false, problem: { code: "inspector-environment-invalid", fieldId, message, severity: "warning" } };
}
