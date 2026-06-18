export { default as EditorViewport } from "./components/EditorViewport.vue";
export { default as EditorWorkbench } from "./components/EditorWorkbench.vue";
export { default as InspectorPanel } from "./components/InspectorPanel.vue";
export { default as TransformInspector } from "./components/TransformInspector.vue";
export { default as MaterialInspector } from "./components/MaterialInspector.vue";
export { default as EnvironmentInspector } from "./components/EnvironmentInspector.vue";
export { default as LightInspector } from "./components/LightInspector.vue";
export { default as CameraInspector } from "./components/CameraInspector.vue";
export { default as ProblemsPanel } from "./components/ProblemsPanel.vue";
export type { EditorWorkbenchEmits, EditorWorkbenchProps, EditorWorkbenchSlots, WorkbenchRegionName } from "./components/EditorWorkbench.types";
export {
  DEFAULT_WORKBENCH_LOCALE,
  WORKBENCH_LOCALE_LABELS,
  WORKBENCH_LOCALES,
  getWorkbenchLocaleLabel,
  isWorkbenchLocale,
  normalizeWorkbenchLocale,
  resolveWorkbenchMessage
} from "./i18n/workbench-i18n";
export type {
  WorkbenchI18n,
  WorkbenchLocale,
  WorkbenchMessageDescriptor,
  WorkbenchMessageInput,
  WorkbenchMessageKey,
  WorkbenchMessageValues,
  WorkbenchTranslate
} from "./i18n/workbench-i18n";
export { useEditor } from "./composables/use-editor";
export type { UseEditorOptions, UseEditorResult } from "./composables/use-editor";
export { useInspector } from "./composables/use-inspector";
export type { UseInspectorOptions, UseInspectorResult } from "./composables/use-inspector";
export { useWorkbench } from "./composables/use-workbench";
export type {
  ResolvedWorkbenchContext,
  UseWorkbenchOptions,
  UseWorkbenchResult,
  WorkbenchAssetContext,
  WorkbenchCameraContext,
  WorkbenchContext,
  WorkbenchProblemsContext,
  WorkbenchProjectContext,
  WorkbenchSelectionContext,
  WorkbenchTransformContext
} from "./composables/use-workbench";
