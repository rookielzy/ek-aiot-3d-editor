import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { executeEditorAction, resolveEditorShortcut, type AssetResolverBridge, type EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";
import { useWorkbench, type UseWorkbenchOptions, type WorkbenchContext } from "../hooks/use-workbench";
import { EditorViewport } from "./EditorViewport";
import { InspectorView } from "./InspectorView";
import "./workbench.css";

export type WorkbenchRenderRegion = (context: WorkbenchContext) => ReactNode;

export interface EditorWorkbenchProps extends UseWorkbenchOptions {
  resolver?: AssetResolverBridge;
  loader?: EditorRuntimeOptions["loader"];
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
  className?: string;
  style?: CSSProperties;
  viewportClassName?: string;
  inspectorClassName?: string;
  toolbar?: WorkbenchRenderRegion;
  sidePanel?: WorkbenchRenderRegion;
  viewportOverlay?: WorkbenchRenderRegion;
  status?: WorkbenchRenderRegion;
}

export function EditorWorkbench({
  editor: providedEditor,
  snapshot,
  resolver,
  loader,
  rendererFactory,
  className,
  style,
  viewportClassName,
  inspectorClassName,
  toolbar,
  sidePanel,
  viewportOverlay,
  status
}: EditorWorkbenchProps) {
  const workbench = useWorkbench({ editor: providedEditor, snapshot });
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
      executeEditorAction(workbench.editor, resolution.action);
    }

    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
    };
  }, [workbench.editor]);

  const rootClassName = className ? `ek-workbench ${className}` : "ek-workbench";

  return (
    <main ref={rootRef} className={rootClassName} style={style} tabIndex={0}>
      {toolbar ? <div className="ek-workbench__toolbar">{toolbar(workbench)}</div> : null}
      <section className="ek-workbench__viewport-shell" aria-label="3D viewport">
        <EditorViewport
          editor={workbench.editor}
          resolver={resolver}
          loader={loader}
          rendererFactory={rendererFactory}
          className={viewportClassName ? `ek-workbench__viewport ${viewportClassName}` : "ek-workbench__viewport"}
        />
        {viewportOverlay ? <div className="ek-workbench__overlay">{viewportOverlay(workbench)}</div> : null}
      </section>
      {sidePanel ? <aside className="ek-workbench__side-panel">{sidePanel(workbench)}</aside> : null}
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
      {status ? <footer className="ek-workbench__status">{status(workbench)}</footer> : null}
    </main>
  );
}
