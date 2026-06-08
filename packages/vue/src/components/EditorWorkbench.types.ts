import type { AssetResolverBridge, EditorOptions, EditorRuntime, EditorRuntimeOptions, EditorWithGlbImport } from "@ek-aiot/3d-editor-core";
import type { WorkbenchContext } from "../composables/use-workbench";

export type WorkbenchRegionName = "toolbar" | "leftPanel" | "sidePanel" | "viewportOverlay" | "rightPanel" | "status";

export interface EditorWorkbenchProps {
  editor?: EditorWithGlbImport;
  snapshot?: EditorOptions["snapshot"];
  resolver?: AssetResolverBridge;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
  interactions?: EditorRuntimeOptions["interactions"];
  showDefaultToolbar?: boolean;
  class?: string;
  viewportClassName?: string;
  inspectorClassName?: string;
}

export interface EditorWorkbenchSlots {
  toolbar?(context: WorkbenchContext): unknown;
  leftPanel?(context: WorkbenchContext): unknown;
  /**
   * @deprecated Use leftPanel for the install-ready workbench's left project panel.
   */
  sidePanel?(context: WorkbenchContext): unknown;
  viewportOverlay?(context: WorkbenchContext): unknown;
  rightPanel?(context: WorkbenchContext): unknown;
  status?(context: WorkbenchContext): unknown;
}

export interface EditorWorkbenchEmits {
  runtimeReady: [runtime: EditorRuntime | null];
}
