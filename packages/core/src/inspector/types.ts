import type { Command } from "../commands/types";
import type { LightKind } from "../lights/types";
import type { MaterialSide, TextureSlotName } from "../materials/types";
import type { Problem, ProblemRecoverability, ProblemSeverity, ProblemSource, ProblemTarget } from "../problems/types";
import type { AssetKind, AssetReference, SceneObject } from "../snapshot/types";

export type InspectorSectionId = "transform" | "material" | "environment" | "lights" | "problems";
export type InspectorFieldKind = "number" | "color" | "select" | "checkbox" | "asset" | "text";

export interface InspectorFieldOption<T extends string = string> {
  value: T;
  label: string;
}

export interface InspectorFieldDescriptor<T = unknown> {
  id: string;
  label: string;
  kind: InspectorFieldKind;
  value: T;
  disabled?: boolean;
  readOnly?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: InspectorFieldOption[];
  assetKinds?: AssetKind[];
  problem?: InspectorCommandProblem;
}

export interface InspectorCommandProblem {
  code: string;
  message: string;
  fieldId?: string;
  severity?: ProblemSeverity;
}

export type InspectorCommandResult =
  | { ok: true; command: Command }
  | { ok: false; problem: InspectorCommandProblem };

export interface InspectorSection<TField extends InspectorFieldDescriptor = InspectorFieldDescriptor> {
  id: InspectorSectionId;
  title: string;
  enabled: boolean;
  empty?: boolean;
  reason?: string;
  fields: TField[];
}

export type TransformVectorName = "position" | "rotation" | "scale";
export type TransformAxis = "x" | "y" | "z";
export type TransformFieldId = `${TransformVectorName}.${TransformAxis}`;

export type MaterialFieldId =
  | "color"
  | "metalness"
  | "roughness"
  | "emissive"
  | "emissiveIntensity"
  | "opacity"
  | "transparent"
  | "side"
  | "envMapIntensity"
  | `textures.${TextureSlotName}.assetId`;

export type EnvironmentFieldId =
  | "mode"
  | "background.mode"
  | "background.color"
  | "background.assetId"
  | "background.intensity"
  | "background.blur"
  | "background.rotation.x"
  | "background.rotation.y"
  | "background.rotation.z"
  | "environment.assetId"
  | "environment.intensity"
  | "environment.rotation.x"
  | "environment.rotation.y"
  | "environment.rotation.z";

export type LightFieldId =
  | "name"
  | "color"
  | "intensity"
  | "groundColor"
  | "position.x"
  | "position.y"
  | "position.z"
  | "target.x"
  | "target.y"
  | "target.z"
  | "distance"
  | "decay"
  | "angle"
  | "penumbra";

export interface InspectorSelectionModel {
  objectId: string | null;
  object: SceneObject | null;
}

export interface MaterialInspectorSection extends InspectorSection {
  assignmentId: string | null;
  materialId: string | null;
  sideOptions: InspectorFieldOption<MaterialSide>[];
}

export interface LightListItem {
  id: string;
  label: string;
  kind: LightKind;
  active: boolean;
}

export interface LightInspectorSection extends InspectorSection {
  activeLightId: string | null;
  lights: LightListItem[];
  addOptions: InspectorFieldOption<LightKind>[];
}

export interface InspectorProblemItem {
  id: string;
  severity: ProblemSeverity;
  code: string;
  source: ProblemSource;
  target: ProblemTarget;
  title: string;
  detail?: string;
  assetId?: string;
  objectId?: string;
  recoverability: ProblemRecoverability;
  acknowledged: boolean;
  actionLabel?: string;
  runtime: boolean;
}

export interface ProblemInspectorSection {
  id: "problems";
  title: string;
  enabled: true;
  fields: [];
  problems: InspectorProblemItem[];
}

export interface InspectorModel {
  selection: InspectorSelectionModel;
  transform: InspectorSection;
  material: MaterialInspectorSection;
  environment: InspectorSection;
  lights: LightInspectorSection;
  problems: ProblemInspectorSection;
}

export interface BuildInspectorModelOptions {
  activeLightId?: string | null;
  runtimeProblems?: readonly Problem[];
}

export interface AssetOption extends InspectorFieldOption {
  kind: AssetReference["kind"];
}
