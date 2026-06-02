export { AssetResolverBridge } from "./assets/resolver";
export type { AssetInput, AssetReference, AssetResolver, RegisteredAsset, ResolvedAsset } from "./assets/types";
export type {
  AddLightCommand,
  BatchCommand,
  Command,
  CommandResult,
  DeleteObjectsCommand,
  DuplicateObjectsCommand,
  GroupObjectsCommand,
  ImportGlbCommand,
  PasteObjectsCommand,
  RegisterAssetCommand,
  ReparentObjectCommand,
  RemoveLightCommand,
  SelectObjectCommand,
  SelectObjectsCommand,
  SceneEnvironmentPatch,
  SetEnvironmentCommand,
  SetMaterialCommand,
  SetTransformCommand,
  UngroupObjectsCommand,
  UpdateLightCommand
} from "./commands/types";
export type { Editor, EditorOptions, MountRuntimeOptions, RuntimeSubscriber, SnapshotSubscriber } from "./editor/editor-api";
export type { AdvancedEditorOperations, EditorClipboard } from "./editor/operations";
export type { SnapChannel, SnapSubscriber } from "./editor/snap-state";
export type { EditorClipboardPayload } from "./clipboard/types";
export type { BackgroundMode, EnvironmentMode, EnvironmentRotation, SceneEnvironment } from "./environment/types";
export type { HistoryState } from "./history/history";
export type { SelectionMode, SelectionState } from "./selection/selection";
export type {
  AssetOption,
  BuildInspectorModelOptions,
  EnvironmentFieldId,
  InspectorCommandProblem,
  InspectorCommandResult,
  InspectorFieldDescriptor,
  InspectorFieldKind,
  InspectorFieldOption,
  InspectorModel,
  InspectorProblemItem,
  InspectorSection,
  InspectorSectionId,
  InspectorSelectionModel,
  LightFieldId,
  LightInspectorSection,
  LightListItem,
  MaterialFieldId,
  MaterialInspectorSection,
  ProblemInspectorSection,
  TransformAxis,
  TransformFieldId,
  TransformVectorName
} from "./inspector/types";
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
  MaterialTexturePatch,
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
export type {
  ProjectAssetManifestRecord,
  ProjectAssetSourceInput,
  ProjectCompleteness,
  ProjectExportOptions,
  ProjectExportResult,
  ProjectImportOptions,
  ProjectImportResult,
  ProjectPackage,
  ProjectPackageLimits,
  ProjectPackageManifest,
  ProjectPackageVersion,
  ProjectProblem,
  ReplaceAssetInput,
  ReplaceAssetResult
} from "./project/project-api";
export type {
  EditorRuntime,
  EditorRuntimeOptions,
  RendererLike,
  RuntimeProblemSnapshot,
  RuntimeProblemSubscriber
} from "./runtime/editor-runtime";
export type {
  RuntimeCameraControlsOptions,
  RuntimeCameraFrameOptions,
  RuntimeInteractionOptions,
  RuntimePointerSelectionInput,
  RuntimePointerSelectionModifiers,
  RuntimePointerSelectionOptions,
  RuntimeSelectionVisualOptions
} from "./runtime/viewport-controls";
export type { SnapSettings } from "./runtime/transform/snap";
export type { EditorAction, ShortcutInput, ShortcutResolution } from "./shortcuts/types";
export type { AssetKind, JsonPrimitive, JsonValue, LegacySceneSnapshot, SceneObject, SceneSnapshot, SerializedSceneSnapshot, Transform } from "./snapshot/types";

export { createEditor } from "./editor/create-editor";
export { createAdvancedEditorOperations, createMemoryClipboard } from "./editor/operations";
export { createClipboardPayload } from "./clipboard/create-clipboard";
export {
  DEFAULT_PROJECT_PACKAGE_LIMITS,
  PROJECT_ASSET_DIR,
  PROJECT_MANIFEST_PATH,
  PROJECT_PACKAGE_VERSION,
  PROJECT_SCENE_PATH
} from "./project/project-api";
export {
  buildAddLightCommand,
  buildRemoveLightCommand,
  buildSetEnvironmentCommand,
  buildSetMaterialCommand,
  buildSetTransformCommand,
  buildUpdateLightCommand,
  getNextActiveLightId,
  resolveActiveLightId
} from "./inspector/commands";
export {
  buildInspectorModel,
  getInspectorSelection
} from "./inspector/selection";
export {
  buildEnvironmentSection
} from "./inspector/environment";
export {
  buildLightSection
} from "./inspector/lights";
export {
  buildMaterialSection
} from "./inspector/material";
export {
  buildProblemSection
} from "./inspector/problems";
export {
  buildTransformSection
} from "./inspector/transform";
export { createEmptySnapshot, createTransform } from "./snapshot/defaults";
export { getSelectedObjectIds, getTopLevelSelectedObjectIds } from "./selection/selection";
export { migrateSerializedSnapshot, validateSerializedSceneSnapshot } from "./snapshot/migrations";
export { isJsonCompatible, validateSceneSnapshot } from "./snapshot/validation";
export { normalizeTransform } from "./snapshot/transforms";
export { snapNumber, snapTransform, snapVector } from "./runtime/transform/snap";
export { executeEditorAction } from "./shortcuts/actions";
export { isEditableTarget, resolveEditorShortcut } from "./shortcuts/resolve-shortcut";
