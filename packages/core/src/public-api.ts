export { AssetResolverBridge } from "./assets/resolver";
export type { AssetInput, AssetReference, AssetResolver, RegisteredAsset, ResolvedAsset } from "./assets/types";
export type {
  AddLightCommand,
  Command,
  CommandResult,
  ImportGlbCommand,
  RegisterAssetCommand,
  RemoveLightCommand,
  SelectObjectCommand,
  SetEnvironmentCommand,
  SetMaterialCommand,
  SetTransformCommand,
  UpdateLightCommand
} from "./commands/types";
export type { Editor, EditorOptions, MountRuntimeOptions, SnapshotSubscriber } from "./editor/editor-api";
export type { BackgroundMode, EnvironmentMode, EnvironmentRotation, SceneEnvironment } from "./environment/types";
export type { HistoryState } from "./history/history";
export type {
  AmbientLightDefinition,
  DirectionalLightDefinition,
  HemisphereLightDefinition,
  LightDefinition,
  LightKind,
  PointLightDefinition,
  SpotLightDefinition
} from "./lights/types";
export type {
  MaterialAssignment,
  MaterialAssignmentTarget,
  MaterialDefinition,
  MaterialPatch,
  MaterialSide,
  MaterialState,
  MeshStandardMaterialOverride,
  TextureColorSpace,
  TextureFilterMode,
  TextureSlot,
  TextureSlotName,
  TextureTransform,
  TextureWrapMode
} from "./materials/types";
export type {
  AuthoredProblemState,
  Problem,
  ProblemDisplay,
  ProblemRecoverability,
  ProblemSeverity,
  ProblemSource,
  ProblemTarget
} from "./problems/types";
export type { EditorRuntime, EditorRuntimeOptions, RendererLike } from "./runtime/editor-runtime";
export type { AssetKind, JsonPrimitive, JsonValue, LegacySceneSnapshot, SceneObject, SceneSnapshot, SerializedSceneSnapshot, Transform } from "./snapshot/types";

export { createEditor } from "./editor/create-editor";
export { createEmptySnapshot, createTransform } from "./snapshot/defaults";
export { migrateSerializedSnapshot, validateSerializedSceneSnapshot } from "./snapshot/migrations";
export { isJsonCompatible, validateSceneSnapshot } from "./snapshot/validation";
export { normalizeTransform } from "./snapshot/transforms";
