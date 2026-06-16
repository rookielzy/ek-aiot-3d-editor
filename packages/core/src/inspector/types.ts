import type { Command } from "../commands/types";
import type { AuthoredCameraView } from "../cameras/types";
import type { LightKind } from "../lights/types";
import type { MaterialAssignmentTarget, MaterialSide, TextureSlotName } from "../materials/types";
import type { Problem, ProblemRecoverability, ProblemSeverity, ProblemSource, ProblemTarget } from "../problems/types";
import type { AssetKind, AssetReference, SceneNode, SceneObject } from "../snapshot/types";
import type { LightDefinition } from "../lights/types";

export type InspectorSectionId = "transform" | "material" | "environment" | "lights" | "cameras" | "problems";
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

export interface InspectorActionDescriptor {
  id: string;
  label: string;
  command?: Command;
  disabled?: boolean;
  problem?: InspectorCommandProblem;
}

export interface InspectorSection<TField extends InspectorFieldDescriptor = InspectorFieldDescriptor> {
  id: InspectorSectionId;
  title: string;
  enabled: boolean;
  empty?: boolean;
  reason?: string;
  fields: TField[];
  actions?: InspectorActionDescriptor[];
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

export interface MaterialInspectorTarget {
  key: string;
  kind: MaterialAssignmentTarget["kind"];
  label: string;
  ownerObjectId: string;
  importedNodeId: string | null;
  importedNodeName?: string;
  importKey?: string;
  slotId: string | null;
  assignmentId: string;
  materialId: string | null;
  selected: boolean;
  preferred: boolean;
  hasOverride: boolean;
  unresolved: boolean;
  problemIds: string[];
  canSelect: boolean;
  canEditExistingAssignment: boolean;
  canCreateAssignment: boolean;
  canClear: boolean;
  disabledReason?: string;
  commandTarget: MaterialAssignmentTarget;
}

export type EnvironmentFieldId =
  | "lighting.source.kind"
  | "lighting.source.assetId"
  | `lighting.source.faces.${number}.assetId`
  | "mode"
  | "background.mode"
  | "background.source.kind"
  | "background.color"
  | "background.source.assetId"
  | "background.assetId"
  | `background.source.faces.${number}.assetId`
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
  | "penumbra"
  | "shadow.enabled"
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

export type CameraViewFieldId =
  | "name"
  | "fov"
  | "near"
  | "far"
  | "position.x"
  | "position.y"
  | "position.z"
  | "target.x"
  | "target.y"
  | "target.z";

export interface InspectorSelectionModel {
  nodeId: string | null;
  nodeIds: string[];
  nodeKind: SceneNode["kind"] | null;
  node: SceneNode | null;
  objectId: string | null;
  objectIds: string[];
  lightId: string | null;
  light: LightDefinition | null;
  cameraViewId: string | null;
  cameraView: AuthoredCameraView | null;
  count: number;
  object: SceneObject | null;
  transformAvailable: boolean;
  transformUnavailableReason?: string;
}

export interface MaterialInspectorSection extends InspectorSection {
  assignmentId: string | null;
  materialId: string | null;
  activeTargetKey: string | null;
  targets: MaterialInspectorTarget[];
  sideOptions: InspectorFieldOption<MaterialSide>[];
}

export interface LightListItem {
  id: string;
  nodeId: string | null;
  label: string;
  kind: LightKind;
  active: boolean;
  selected: boolean;
}

export interface LightInspectorSection extends InspectorSection {
  activeLightId: string | null;
  activeLightNodeId: string | null;
  lights: LightListItem[];
  addOptions: InspectorFieldOption<LightKind>[];
}

export interface CameraViewListItem {
  id: string;
  label: string;
  active: boolean;
  default: boolean;
  projection: AuthoredCameraView["projection"]["kind"];
  summary: string;
}

export interface CameraInspectorSection extends InspectorSection {
  activeCameraViewId: string | null;
  defaultCameraViewId: string | null;
  cameraViews: CameraViewListItem[];
  canCapture: boolean;
  canApply: boolean;
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
  cameras: CameraInspectorSection;
  problems: ProblemInspectorSection;
}

export interface BuildInspectorModelOptions {
  /**
   * @deprecated Light inspector targeting is derived from node selection.
   */
  activeLightId?: string | null;
  activeCameraViewId?: string | null;
  runtimeReady?: boolean;
  runtimeProblems?: readonly Problem[];
}

export interface AssetOption extends InspectorFieldOption {
  kind: AssetReference["kind"];
}
