export { AssetResolverBridge } from "./assets/resolver";
export type { AssetInput, AssetReference, AssetResolver, RegisteredAsset, ResolvedAsset } from "./assets/types";
export type {
  GlbAnimationDescriptor,
  GlbImageDescriptor,
  GlbImportDescriptor,
  GlbImportDiagnostic,
  GlbImportDiagnosticCode,
  GlbImportManifest,
  GlbImportPipelineResult,
  GlbImportStatus,
  GlbImportTarget,
  GlbMeshDescriptor,
  GlbMeshPrimitiveDescriptor,
  GlbNodeDescriptor,
  GlbTextureDescriptor,
  GltfLoaderResult
} from "./assets/import-pipeline";
export type {
  GlbImportNewTarget,
  GlbImportRemapConfidence,
  GlbImportRemapMatchKind,
  GlbImportRemapPlan,
  GlbImportRemapSummary,
  GlbImportSlotRemap,
  GlbImportTargetRemap,
  GlbImportUnresolvedSlot,
  GlbImportUnresolvedTarget,
  PlanGlbImportRemapOptions
} from "./assets/import-remap";
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
  WorkbenchAssetImportDiagnostic,
  WorkbenchAssetImportFile,
  WorkbenchAssetImportOptions,
  WorkbenchAssetImportResult,
  WorkbenchImportStatus,
  WorkbenchRasterImportKind
} from "./assets/workspace-import";
export type {
  AddLightCommand,
  BatchCommand,
  Command,
  CommandResult,
  CreateCameraViewCommand,
  CreateDataConnectionCommand,
  CreateGroupCommand,
  CreateImportedGlbTargetsCommand,
  DeleteCameraViewCommand,
  DeleteDataConnectionCommand,
  DeleteNodesCommand,
  DeleteObjectsCommand,
  DuplicateDataConnectionCommand,
  DuplicateObjectsCommand,
  GroupNodesCommand,
  GroupObjectsCommand,
  ImportGlbCommand,
  PasteObjectsCommand,
  RegisterAssetCommand,
  ReimportGlbCommand,
  ReparentNodeCommand,
  ReparentObjectCommand,
  RemoveLightCommand,
  SelectNodeCommand,
  SelectNodesCommand,
  SelectObjectCommand,
  SelectObjectsCommand,
  LegacySceneEnvironmentPatch,
  SceneEnvironmentPatch,
  SetDefaultCameraViewCommand,
  SetEnvironmentCommand,
  SetMaterialCommand,
  SetNodeTransformCommand,
  SetTransformCommand,
  UngroupNodesCommand,
  UngroupObjectsCommand,
  UpdateCameraViewCommand,
  UpdateDataConnectionCommand,
  UpdateLightCommand
} from "./commands/types";
export type {
  BuildDataSourcesWorkspaceOptions,
  DataConnectionListItem,
  DataSourcesWorkspaceModel,
  FilterDataConnectionsOptions
} from "./data-sources/workspace";
export type {
  DataConnectionCommand,
  DataConnectionCommandBuildResult,
  SaveDataConnectionOptions
} from "./data-sources/commands";
export type {
  DataConnection,
  DataConnectionAuth,
  DataConnectionAuthBearer,
  DataConnectionAuthNone,
  DataConnectionDraft,
  DataConnectionField,
  DataConnectionId,
  DataConnectionInput,
  DataConnectionProblem,
  DataConnectionProblemCode,
  DataConnectionReferenceCounts,
  DataConnectionValidationResult,
  DataCredentialDescriptor,
  DataObjectBinding,
  DataQuery,
  DataQueryId,
  SceneDataSources
} from "./data-sources/types";
export type {
  AssetWorkspaceSubscriber,
  Editor,
  EditorOptions,
  EditorWithGlbImport,
  ImportGlbAssetOptions,
  ImportGlbAssetResult,
  MountRuntimeOptions,
  ReimportGlbAssetOptions,
  ReimportGlbAssetResult,
  RuntimeSubscriber,
  SnapshotSubscriber
} from "./editor/editor-api";
export type { AdvancedEditorOperations, EditorClipboard } from "./editor/operations";
export type {
  EditorMarqueeSelectionStateSnapshot,
  MarqueeSelectionPoint,
  MarqueeSelectionRect,
  MarqueeSelectionStatus,
  MarqueeSelectionSubscriber,
  ReadonlyEditorMarqueeSelectionState
} from "./editor/marquee-selection-state";
export type { SnapChannel, SnapSubscriber } from "./editor/snap-state";
export type {
  ViewportHelperKey,
  ViewportHelperStateSnapshot,
  ViewportHelperSubscriber,
  ViewportHelperVisibility,
  ViewportSnapFeedbackState
} from "./editor/viewport-helper-state";
export {
  IDLE_MARQUEE_SELECTION_STATE,
  normalizeMarqueeSelectionRect
} from "./editor/marquee-selection-state";
export {
  EditorViewportHelperState,
  DEFAULT_WORKBENCH_VIEWPORT_HELPER_VISIBILITY
} from "./editor/viewport-helper-state";
export type {
  ClipboardLightDefinition,
  ClipboardSceneNode,
  ClipboardSceneObject,
  EditorClipboardPayload,
  EditorNodeClipboardPayload,
  EditorObjectClipboardPayload
} from "./clipboard/types";
export type {
  AuthoredCameraView,
  AuthoredCameraViewInput,
  AuthoredCameraViewPatch,
  AuthoredCameraViewProjection,
  CameraViewId,
  PerspectiveCameraViewProjection,
  ScenePresentationState
} from "./cameras/types";
export type { DefaultPresentationViewResolution } from "./cameras/resolve";
export type {
  BackgroundMode,
  CubemapFaceReference,
  CubemapFaceRole,
  EnvironmentBackgroundSource,
  EnvironmentBackgroundSourceKind,
  EnvironmentLightingSource,
  EnvironmentLightingSourceKind,
  EnvironmentMode,
  EnvironmentRotation,
  LegacySceneEnvironment,
  SceneEnvironment
} from "./environment/types";
export type {
  EnvironmentConservativeLightOptions,
  EnvironmentPresetCommand,
  EnvironmentPresetProblem,
  EnvironmentPresetResult
} from "./environment/presets";
export type { HistoryState } from "./history/history";
export type {
  CreateMessageDescriptorInput,
  MessageDescriptor,
  MessageDescriptorValues,
  MessageFallback,
  MessageKey,
  SupportedLocale
} from "./i18n/messages";
export type {
  DisplayMessageDescriptorInput,
  DisplayMessageField,
  DisplayMessageNamespace
} from "./i18n/display-messages";
export type { NodeSelectionInput, SelectionInput, SelectionMode, SelectionState } from "./selection/selection";
export type {
  AssetOption,
  BuildInspectorModelOptions,
  CameraInspectorSection,
  CameraViewFieldId,
  CameraViewListItem,
  EnvironmentFieldId,
  InspectorActionDescriptor,
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
  MaterialInspectorTarget,
  ProblemInspectorSection,
  TransformAxis,
  TransformFieldId,
  TransformVectorName
} from "./inspector/types";
export type {
  ImportedGlbMaterialSlotDescriptor,
  ImportedGlbProblemTarget,
  ImportedGlbRemapMetadata,
  ImportedGlbSourceDescriptor,
  ImportedGlbSourceKind,
  ImportedGlbTargetBindingDescriptor,
  ImportedGlbTargetBuildOptions,
  ImportedGlbTargetDescriptor
} from "./imported-targets/types";
export type {
  ImportedGlbMaterialSlotLookup,
  ImportedGlbMaterialSlotLookup as ImportedGlbSlotLookup
} from "./imported-targets/slots";
export type {
  AmbientLightDefinition,
  BaseLightShadowSettings,
  DirectionalLightDefinition,
  DirectionalLightShadowSettings,
  HemisphereLightDefinition,
  LightDefinition,
  LightKind,
  LightShadowMapSize,
  LightShadowSettings,
  PointLightDefinition,
  PointLightShadowSettings,
  ShadowCapableLightKind,
  SpotLightShadowSettings,
  SpotLightDefinition
} from "./lights/types";
export type {
  LightingPresetId,
  LightingPresetResult
} from "./lights/presets";
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
  ProjectAssetPayloadSummary,
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
export type { RuntimeCameraViewCaptureResult } from "./runtime/authored-camera-view";
export type {
  GltfDecoderConfiguration,
  GltfDecoderProvider,
  GltfLoaderAdapter,
  GltfLoaderFactory,
  ThreeGltfLoaderAdapterOptions
} from "./runtime/gltf-loader-adapter";
export type {
  RuntimeCameraControlsOptions,
  RuntimeCameraFrameOptions,
  RuntimeInteractionOptions,
  RuntimeMarqueeSelectionOptions,
  RuntimePointerSelectionInput,
  RuntimePointerSelectionModifiers,
  RuntimePointerSelectionOptions,
  RuntimeSelectionVisualOptions,
  RuntimeViewportHelperOptions
} from "./runtime/viewport-controls";
export type { RuntimeTransformControlsOptions } from "./runtime/transform/transform-controls-adapter";
export { applyAuthoredCameraViewToRuntime, captureAuthoredCameraView } from "./runtime/authored-camera-view";
export type { EditorTransformModeState, TransformMode, TransformModeSubscriber } from "./runtime/transform/transform-mode";
export type { SnapSettings } from "./runtime/transform/snap";
export type { EditorAction, ShortcutInput, ShortcutResolution } from "./shortcuts/types";
export type {
  AssetKind,
  JsonPrimitive,
  JsonValue,
  LegacySceneSnapshot,
  NodeId,
  SceneCameraNode,
  SceneGroupNode,
  SceneImportedGlbNode,
  SceneLightNode,
  SceneNode,
  SceneObject,
  SceneObjectNode,
  SceneSnapshot,
  SerializedSceneSnapshot,
  Transform,
  V8SceneSnapshot,
  V7SceneSnapshot,
  V6SceneSnapshot,
  V5SceneNode,
  V5SceneSnapshot,
  V4SceneSnapshot,
  V3SceneSnapshot
} from "./snapshot/types";

export {
  buildDataSourcesWorkspaceModel,
  countDataConnectionReferences,
  filterDataConnectionItems
} from "./data-sources/workspace";
export {
  buildDeleteDataConnectionCommand,
  buildDuplicateDataConnectionCommand,
  buildSaveDataConnectionCommand
} from "./data-sources/commands";
export {
  DEFAULT_DATA_CONNECTION_TIMEOUT_MS,
  createDataConnectionId,
  createEmptyDataSources,
  createUniqueDataConnectionName
} from "./data-sources/defaults";
export { validateDataConnectionDraft } from "./data-sources/validation";

export { createAuthoredCameraView, createAuthoredCameraViewInput, createEmptyPresentationState } from "./cameras/defaults";
export {
  BUILTIN_LOCALES,
  createMessageDescriptor,
  isMessageDescriptorValues,
  isMessageKey
} from "./i18n/messages";
export {
  createDisplayMessageDescriptor,
  createFallbackDisplayMessageDescriptor,
  descriptorValues
} from "./i18n/display-messages";
export { resolveDefaultPresentationView } from "./cameras/resolve";
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
  buildClearEnvironmentPreset,
  buildEnvironmentBackgroundAssetPreset,
  buildEnvironmentCubemapPreset,
  buildEnvironmentLightingAssetPreset,
  buildEnvironmentSharedAssetPreset,
  buildEnvironmentWithConservativeLightsPreset,
  buildSolidBackgroundPreset
} from "./environment/presets";
export {
  buildAddLightCommand,
  buildCreateCameraViewCommand,
  buildCreateCameraViewInput,
  buildDeleteCameraViewCommand,
  buildRemoveLightCommand,
  buildSetDefaultCameraViewCommand,
  buildSetEnvironmentCommand,
  buildSetMaterialCommand,
  buildSetTransformCommand,
  buildUpdateCameraViewCommand,
  buildUpdateLightCommand,
  getNextActiveCameraViewId,
  getNextActiveLightId,
  resolveActiveCameraViewId,
  resolveActiveLightId
} from "./inspector/commands";
export {
  buildLightingPresetCommands
} from "./lights/presets";
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
  classifyWorkbenchAssetImportFile,
  importWorkbenchAssets
} from "./assets/workspace-import";
export {
  GLB_IMPORT_MANIFEST_METADATA_KEY,
  GLB_IMPORT_MANIFEST_VERSION,
  attachGlbImportManifestMetadata,
  createGlbImportManifest,
  getGlbImportManifestFromMetadata,
  resolveGlbImportStatus,
  validateGlbImportManifest
} from "./assets/import-pipeline";
export {
  planGlbImportRemap
} from "./assets/import-remap";
export {
  ThreeGltfLoaderAdapter
} from "./runtime/gltf-loader-adapter";
export {
  createImportedGlbImportKey,
  createImportedGlbMaterialSlotKey,
  createImportedGlbTargetDescriptors
} from "./imported-targets/keys";
export {
  createImportedGlbBindingDescriptor,
  findImportedGlbMaterialSlot,
  isImportedGlbMaterialAssignmentTarget
} from "./imported-targets/slots";
export {
  buildWorkbenchModel
} from "./workbench/workbench-model";
export {
  buildCameraSection
} from "./inspector/cameras";
export {
  buildEnvironmentSection
} from "./inspector/environment";
export {
  buildLightSection
} from "./inspector/lights";
export {
  buildMaterialFieldsForTarget,
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
