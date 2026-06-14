import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { resolveEditorShortcut, type AssetResolverBridge, type EditorRuntime, type EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";
import { useWorkbench, type UseWorkbenchOptions, type WorkbenchContext } from "../hooks/use-workbench";
import { EditorViewport } from "./EditorViewport";
import { InspectorView } from "./InspectorView";
import { WorkbenchLeftPanel } from "./WorkbenchLeftPanel";
import { WorkbenchStatusBar } from "./WorkbenchStatusBar";
import { WorkbenchToolbar } from "./WorkbenchToolbar";
import "./workbench.css";

export type WorkbenchRenderRegion = (context: WorkbenchContext) => ReactNode;
export type WorkbenchRegionName = "toolbar" | "leftPanel" | "sidePanel" | "viewportOverlay" | "rightPanel" | "status";

const DEFAULT_WORKBENCH_INTERACTIONS = {
  camera: true,
  pointerSelection: true,
  marqueeSelection: true,
  resize: true,
  selectionVisuals: true,
  transform: true,
  viewportHelpers: true
} satisfies EditorRuntimeOptions["interactions"];

export interface EditorWorkbenchProps extends UseWorkbenchOptions {
  resolver?: AssetResolverBridge;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
  interactions?: EditorRuntimeOptions["interactions"];
  showDefaultToolbar?: boolean;
  onRuntimeReady?(runtime: EditorRuntime | null): void;
  className?: string;
  style?: CSSProperties;
  viewportClassName?: string;
  inspectorClassName?: string;
  toolbar?: WorkbenchRenderRegion;
  leftPanel?: WorkbenchRenderRegion;
  /**
   * @deprecated Use leftPanel for the install-ready workbench's left project panel.
   */
  sidePanel?: WorkbenchRenderRegion;
  rightPanel?: WorkbenchRenderRegion;
  viewportOverlay?: WorkbenchRenderRegion;
  status?: WorkbenchRenderRegion;
}

export function EditorWorkbench({
  editor: providedEditor,
  snapshot,
  resolver,
  loader,
  rendererFactory,
  interactions = DEFAULT_WORKBENCH_INTERACTIONS,
  showDefaultToolbar = true,
  onRuntimeReady,
  className,
  style,
  viewportClassName,
  inspectorClassName,
  toolbar,
  leftPanel,
  sidePanel,
  rightPanel,
  viewportOverlay,
  status
}: EditorWorkbenchProps) {
  const workbench = useWorkbench({ editor: providedEditor, snapshot, loader });
  const pendingDisposeRef = useRef<{ dispose(): void; timer: ReturnType<typeof setTimeout> } | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (pendingDisposeRef.current?.dispose === workbench.dispose) {
      clearTimeout(pendingDisposeRef.current.timer);
      pendingDisposeRef.current = null;
    }

    return () => {
      const pending = {
        dispose: workbench.dispose,
        timer: setTimeout(() => {
          if (pendingDisposeRef.current === pending) {
            pendingDisposeRef.current = null;
          }
          pending.dispose();
        }, 0)
      };
      pendingDisposeRef.current = pending;
    };
  }, [workbench.dispose]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      const resolution = resolveEditorShortcut({
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        target: event.target
      });
      if (!resolution.handled || !resolution.action) {
        return;
      }
      if (resolution.preventDefault) {
        event.preventDefault();
      }
      workbench.runAction(resolution.action);
    }

    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
    };
  }, [workbench.editor]);

  const rootClassName = className ? `ek-workbench ${className}` : "ek-workbench";
  const hasToolbar = showDefaultToolbar || toolbar;
  const renderLeftPanel = leftPanel ?? sidePanel;

  return (
    <main ref={rootRef} className={rootClassName} style={style} tabIndex={0}>
      {hasToolbar ? (
        <div className="ek-workbench__toolbar">
          {showDefaultToolbar ? <WorkbenchToolbar context={workbench} /> : null}
          {toolbar ? <div className="ek-workbench__toolbar-region">{toolbar(workbench)}</div> : null}
        </div>
      ) : null}
      <section className="ek-workbench__viewport-shell" aria-label="3D viewport">
        <EditorViewport
          editor={workbench.editor}
          resolver={resolver}
          loader={loader}
          rendererFactory={rendererFactory}
          interactions={interactions}
          onRuntimeReady={onRuntimeReady}
          className={viewportClassName ? `ek-workbench__viewport ${viewportClassName}` : "ek-workbench__viewport"}
        />
        {viewportOverlay ? <div className="ek-workbench__overlay">{viewportOverlay(workbench)}</div> : null}
      </section>
      <aside className="ek-workbench__side-panel" aria-label="Project panel">
        {renderLeftPanel ? renderLeftPanel(workbench) : <WorkbenchLeftPanel context={workbench} />}
      </aside>
      <aside className="ek-workbench__right-panel" aria-label="Inspector panel">
        {rightPanel ? rightPanel(workbench) : (
          <InspectorView
            editor={workbench.editor}
            snapshot={workbench.snapshot}
            inspector={workbench.inspector}
            setActiveLightId={workbench.setActiveLightId}
            onReplaceAsset={(assetId, file) => {
              void workbench.replaceAsset({ assetId, source: file, label: file.name, mimeType: file.type });
            }}
            className={inspectorClassName}
          />
        )}
      </aside>
      <footer className="ek-workbench__status" aria-label="Editor status">
        {status ? status(workbench) : <WorkbenchStatusBar context={workbench} />}
      </footer>
    </main>
  );
}
