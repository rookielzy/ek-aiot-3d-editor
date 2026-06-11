import type { AssetInput } from "../assets/types";
import type { GlbImportManifest } from "../assets/import-pipeline";
import type { GlbImportRemapPlan } from "../assets/import-remap";
import type { SceneEnvironment } from "../environment/types";
import type { LightDefinition, LightKind } from "../lights/types";
import type { MaterialAssignmentTarget, MaterialPatch } from "../materials/types";
import type { EditorClipboardPayload } from "../clipboard/types";
import type { JsonValue, NodeId, SceneSnapshot, Transform } from "../snapshot/types";

export type Command =
  | BatchCommand
  | SingleCommand;

export type SingleCommand =
  | ImportGlbCommand
  | ReimportGlbCommand
  | RegisterAssetCommand
  | CreateImportedGlbTargetsCommand
  | SelectNodeCommand
  | SelectNodesCommand
  | CreateGroupCommand
  | DeleteNodesCommand
  | GroupNodesCommand
  | UngroupNodesCommand
  | ReparentNodeCommand
  | SetNodeTransformCommand
  | SelectObjectCommand
  | SelectObjectsCommand
  | DeleteObjectsCommand
  | PasteObjectsCommand
  | DuplicateObjectsCommand
  | GroupObjectsCommand
  | UngroupObjectsCommand
  | ReparentObjectCommand
  | SetTransformCommand
  | SetMaterialCommand
  | SetEnvironmentCommand
  | AddLightCommand
  | UpdateLightCommand
  | RemoveLightCommand;

export interface ImportGlbCommand {
  type: "import-glb";
  asset: AssetInput;
  objectId?: string;
  name?: string;
  parentId?: string | null;
  transform?: Partial<Transform>;
  expandImportedTargets?: boolean;
}

export interface ReimportGlbCommand {
  type: "reimport-glb";
  ownerObjectId: string;
  assetId: string;
  manifest: GlbImportManifest;
  remap: GlbImportRemapPlan;
}

export interface CreateImportedGlbTargetsCommand {
  type: "create-imported-glb-targets";
  ownerObjectId: string;
  replaceExisting?: boolean;
}

export interface SelectObjectCommand {
  type: "select-object";
  objectId: string | null;
}

export interface SelectNodeCommand {
  type: "select-node";
  nodeId: NodeId | null;
}

export interface SelectNodesCommand {
  type: "select-nodes";
  mode: "replace" | "add" | "remove" | "toggle" | "clear" | "all";
  nodeId?: NodeId | null;
  nodeIds?: NodeId[];
  primaryNodeId?: NodeId | null;
}

export interface CreateGroupCommand {
  type: "create-group";
  nodeId?: NodeId;
  name?: string;
  parentId?: NodeId | null;
  transform?: Partial<Transform>;
  metadata?: Record<string, JsonValue>;
  select?: boolean;
}

export interface DeleteNodesCommand {
  type: "delete-nodes";
  nodeIds?: NodeId[];
}

export interface GroupNodesCommand {
  type: "group-nodes";
  nodeIds?: NodeId[];
  primaryNodeId?: NodeId;
  nodeId?: NodeId;
  name?: string;
  parentId?: NodeId | null;
  transform?: Partial<Transform>;
  metadata?: Record<string, JsonValue>;
  preserveWorldTransform?: boolean;
}

export interface UngroupNodesCommand {
  type: "ungroup-nodes";
  nodeId?: NodeId;
  preserveWorldTransform?: boolean;
}

export interface ReparentNodeCommand {
  type: "reparent-node";
  nodeId: NodeId;
  parentId: NodeId | null;
  transform?: Transform;
  preserveWorldTransform?: boolean;
}

export interface SetNodeTransformCommand {
  type: "set-node-transform";
  nodeId: NodeId;
  transform: Partial<Transform>;
}

export interface SelectObjectsCommand {
  type: "select-objects";
  mode: "replace" | "add" | "remove" | "toggle" | "clear" | "all";
  objectId?: string | null;
  objectIds?: string[];
  primaryObjectId?: string | null;
}

export interface SetTransformCommand {
  type: "set-transform";
  objectId: string;
  transform: Partial<Transform>;
}

export interface DeleteObjectsCommand {
  type: "delete-objects";
  objectIds?: string[];
}

export interface PasteObjectsCommand {
  type: "paste-objects";
  payload: EditorClipboardPayload;
  objectIdMap?: Record<string, string>;
}

export interface DuplicateObjectsCommand {
  type: "duplicate-objects";
  objectIds?: string[];
  objectIdMap?: Record<string, string>;
}

export interface GroupObjectsCommand {
  type: "group-objects";
  objectIds?: string[];
  primaryObjectId?: string;
}

export interface UngroupObjectsCommand {
  type: "ungroup-objects";
  objectId?: string;
}

export interface ReparentObjectCommand {
  type: "reparent-object";
  objectId: string;
  parentId: string | null;
  transform?: Transform;
}

export interface RegisterAssetCommand {
  type: "register-asset";
  asset: AssetInput;
}

export interface SetMaterialCommand {
  type: "set-material";
  target: MaterialAssignmentTarget;
  material: MaterialPatch;
  materialId?: string;
  materialName?: string;
  assignmentId?: string;
}

export interface SetEnvironmentCommand {
  type: "set-environment";
  environment: SceneEnvironmentPatch;
}

export interface SceneEnvironmentPatch extends Partial<Omit<SceneEnvironment, "background" | "environment">> {
  background?: Partial<Omit<SceneEnvironment["background"], "rotation">> & {
    rotation?: Partial<NonNullable<SceneEnvironment["background"]["rotation"]>>;
  };
  environment?: Partial<Omit<SceneEnvironment["environment"], "rotation">> & {
      rotation?: Partial<SceneEnvironment["environment"]["rotation"]>;
  };
}

export interface AddLightCommand {
  type: "add-light";
  light: { kind: LightKind; id?: string; name?: string } & Partial<LightDefinition>;
}

export interface UpdateLightCommand {
  type: "update-light";
  lightId: string;
  patch: Partial<LightDefinition>;
}

export interface RemoveLightCommand {
  type: "remove-light";
  lightId: string;
}

export interface BatchCommand {
  type: "batch";
  label?: string;
  commands: Command[];
}

export type UndoableCommand = Command;

export interface CommandResult {
  ok: boolean;
  snapshot: SceneSnapshot;
  error?: string;
}

export interface AppliedCommand {
  command: Command;
  before: SceneSnapshot;
  after: SceneSnapshot;
}
