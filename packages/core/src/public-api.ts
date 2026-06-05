export { AssetResolverBridge } from "./assets/resolver";
export type { AssetInput, AssetReference, AssetResolver, RegisteredAsset, ResolvedAsset } from "./assets/types";
export type {
  AssetReferenceLocation,
  AssetWorkspaceItem,
  AssetWorkspaceModel,
  AssetWorkspacePackageStatus,
  AssetWorkspacePayloadStatus,
  AssetWorkspacePayloadSummary,
  AssetWorkspaceProblemSummary,
  AssetWorkspaceReadiness,
  AssetWorkspaceReferenceKind,
  AssetWorkspaceSortKey,
  AssetWorkspaceStatus,
  BuildAssetWorkspaceOptions,
  FilterAssetWorkspaceOptions,
  SortAssetWorkspaceOptions
} from "./assets/workspace";
export type {
  AddLightCommand,
  BatchCommand,
  Command,
  CommandResult,
  CreateGroupCommand,
  DeleteNodesCommand,
  DeleteObjectsCommand,
  DuplicateObjectsCommand,
  GroupNodesCommand,
  GroupObjectsCommand,
  ImportGlbCommand,
  PasteObjectsCommand,
  RegisterAssetCommand,
  ReparentNodeCommand,
  ReparentObjectCommand,
  RemoveLightCommand,
  SelectNodeCommand,
  SelectNodesCommand,
  SelectObjectCommand,
  SelectObjectsCommand,
  SceneEnvironmentPatch,
  SetEnvironmentCommand,
  SetMaterialCommand,
  SetNodeTransformCommand,
  SetTransformCommand,
  UngroupNodesCommand,
  UngroupObjectsCommand,
  UpdateLightCommand
} from "./commands/types";
export type { AssetWorkspaceSubscriber, Editor, EditorOptions, MountRuntimeOptions, RuntimeSubscriber, SnapshotSubscriber } from "./editor/editor-api";
export type { AdvancedEditorOperations, EditorClipboard } from "./editor/operations";
export type { SnapChannel, SnapSubscriber } from "./editor/snap-state";
export type {
  ClipboardLightDefinition,
  ClipboardSceneNode,
  ClipboardSceneObject,
  EditorClipboardPayload,
  EditorNodeClipboardPayload,
  EditorObjectClipboardPayload
} from "./clipboard/types";
export type { BackgroundMode, EnvironmentMode, EnvironmentRotation, SceneEnvironment } from "./environment/types";
export type { HistoryState } from "./history/history";
export type { NodeSelectionInput, SelectionInput, SelectionMode, SelectionState } from "./selection/selection";
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
  BuildWorkbenchModelOptions,
  WorkbenchAssetItem,
  WorkbenchAssetModel,
  WorkbenchHierarchyModel,
  WorkbenchHierarchyRow,
  WorkbenchMissingAssetItem,
  WorkbenchModel,
  WorkbenchProblemsModel,
  WorkbenchProblemItem,
  WorkbenchProjectModel,
  WorkbenchSelectionModel,
  WorkbenchStatusModel,
  WorkbenchToolbarModel
} from "./workbench/workbench-model";
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
export type { RuntimeTransformControlsOptions } from "./runtime/transform/transform-controls-adapter";
export type { EditorTransformModeState, TransformMode, TransformModeSubscriber } from "./runtime/transform/transform-mode";
export type { SnapSettings } from "./runtime/transform/snap";
export type { EditorAction, ShortcutInput, ShortcutResolution } from "./shortcuts/types";
export type {
  AssetKind,
  JsonPrimitive,
  JsonValue,
  LegacySceneSnapshot,
  NodeId,
  SceneGroupNode,
  SceneLightNode,
  SceneNode,
  SceneObject,
  SceneObjectNode,
  SceneSnapshot,
  SerializedSceneSnapshot,
  Transform,
  V3SceneSnapshot
} from "./snapshot/types";

export { createEditor } from "./editor/create-editor";
export { createAdvancedEditorOperations, createMemoryClipboard } from "./editor/operations";
export { createClipboardPayload, createNodeClipboardPayload } from "./clipboard/create-clipboard";
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
  buildAssetWorkspaceModel,
  collectAssetReferenceLocations,
  filterAssetWorkspaceItems,
  sortAssetWorkspaceItems
} from "./assets/workspace";
export {
  buildWorkbenchModel
} from "./workbench/workbench-model";
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
export { getSelectedNodeIds, getSelectedObjectIds, getTopLevelSelectedObjectIds, normalizeNodeSelection, normalizeSelection } from "./selection/selection";
export { collectNodeSubtreeIds, getTopLevelNodeIds, isNodeAncestorOf } from "./snapshot/hierarchy";
export { migrateSerializedSnapshot, validateSerializedSceneSnapshot } from "./snapshot/migrations";
export { isJsonCompatible, validateSceneSnapshot } from "./snapshot/validation";
export { getLocalNodeTransformForParent, getWorldNodeTransform, normalizeTransform } from "./snapshot/transforms";
export { snapNumber, snapTransform, snapVector } from "./runtime/transform/snap";
export { executeEditorAction } from "./shortcuts/actions";
export { isEditableTarget, resolveEditorShortcut } from "./shortcuts/resolve-shortcut";
