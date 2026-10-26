import type { AssetResolverBridge, EditorOptions, EditorRuntime, EditorRuntimeOptions, EditorWithGlbImport } from "@ek-aiot/3d-editor-core";
import type { ResolvedWorkbenchContext } from "../composables/use-workbench";
import type { WorkbenchLocale, WorkbenchTranslate } from "../i18n/workbench-i18n";

export type WorkbenchRegionName = "toolbar" | "leftPanel" | "sidePanel" | "viewportOverlay" | "rightPanel" | "status";

export interface EditorWorkbenchProps {
  editor?: EditorWithGlbImport;
  snapshot?: EditorOptions["snapshot"];
  executor?: EditorOptions["executor"];
  resolver?: AssetResolverBridge;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
  interactions?: EditorRuntimeOptions["interactions"];
  locale?: WorkbenchLocale;
  defaultLocale?: WorkbenchLocale;
  translate?: WorkbenchTranslate;
  showDefaultToolbar?: boolean;
  showLocaleSwitcher?: boolean;
  localeSwitcherDisabled?: boolean;
  class?: string;
  viewportClassName?: string;
  inspectorClassName?: string;
}

export interface EditorWorkbenchSlots {
  toolbar?(context: ResolvedWorkbenchContext): unknown;
  leftPanel?(context: ResolvedWorkbenchContext): unknown;
  /**
   * @deprecated Use leftPanel for the install-ready workbench's left project panel.
   */
  sidePanel?(context: ResolvedWorkbenchContext): unknown;
  viewportOverlay?(context: ResolvedWorkbenchContext): unknown;
  rightPanel?(context: ResolvedWorkbenchContext): unknown;
  status?(context: ResolvedWorkbenchContext): unknown;
}

export interface EditorWorkbenchEmits {
  runtimeReady: [runtime: EditorRuntime | null];
  "update:locale"?: [locale: WorkbenchLocale];
}

export interface EditorWorkbenchEmitDefinitions {
  runtimeReady: [runtime: EditorRuntime | null];
  "update:locale": [locale: WorkbenchLocale];
}
