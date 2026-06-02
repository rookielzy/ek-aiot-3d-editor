import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { executeEditorAction, resolveEditorShortcut, type AssetResolverBridge, type EditorRuntime, type EditorRuntimeOptions } from "@ek-aiot/3d-editor-core";
import { useWorkbench, type UseWorkbenchOptions, type WorkbenchContext } from "../hooks/use-workbench";
import { EditorViewport } from "./EditorViewport";
import { InspectorView } from "./InspectorView";
import "./workbench.css";

export type WorkbenchRenderRegion = (context: WorkbenchContext) => ReactNode;

const DEFAULT_WORKBENCH_INTERACTIONS = {
  camera: true,
  pointerSelection: true,
  resize: true,
  selectionVisuals: true,
  transform: true
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
  interactions = DEFAULT_WORKBENCH_INTERACTIONS,
  showDefaultToolbar = true,
  onRuntimeReady,
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
  const hasToolbar = showDefaultToolbar || toolbar;

  return (
    <main ref={rootRef} className={rootClassName} style={style} tabIndex={0}>
      {hasToolbar ? (
        <div className="ek-workbench__toolbar">
          {showDefaultToolbar ? <DefaultWorkbenchToolbar context={workbench} /> : null}
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

function DefaultWorkbenchToolbar({ context }: { context: WorkbenchContext }) {
  const history = context.historyState;
  const snap = context.snap;

  return (
    <div className="ek-workbench__default-toolbar" aria-label="Editor controls">
      <div className="ek-workbench__tool-group" aria-label="History">
        <button type="button" onClick={() => context.runAction("undo")} disabled={history.undoCount === 0} title="Undo">
          Undo
        </button>
        <button type="button" onClick={() => context.runAction("redo")} disabled={history.redoCount === 0} title="Redo">
          Redo
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label="Transform mode">
        <button type="button" onClick={() => context.runAction("transform-translate")} aria-pressed={context.transformMode === "translate"} title="Move mode">
          Move
        </button>
        <button type="button" onClick={() => context.runAction("transform-rotate")} aria-pressed={context.transformMode === "rotate"} title="Rotate mode">
          Rotate
        </button>
        <button type="button" onClick={() => context.runAction("transform-scale")} aria-pressed={context.transformMode === "scale"} title="Scale mode">
          Scale
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label="Snap">
        <button type="button" onClick={() => context.runAction("toggle-translate-snap")} aria-pressed={isSnapEnabled(snap.translate)} title="Toggle move snap">
          Snap move
        </button>
        <button type="button" onClick={() => context.runAction("toggle-rotate-snap")} aria-pressed={isSnapEnabled(snap.rotate)} title="Toggle rotate snap">
          Snap rotate
        </button>
        <button type="button" onClick={() => context.runAction("toggle-scale-snap")} aria-pressed={isSnapEnabled(snap.scale)} title="Toggle scale snap">
          Snap scale
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label="Camera">
        <button type="button" onClick={context.resetCamera} disabled={!context.runtimeReady} title="Reset camera">
          Reset
        </button>
        <button type="button" onClick={() => context.frameSelected()} disabled={!context.runtimeReady || context.selectionCount === 0} title="Frame selected">
          Frame sel
        </button>
        <button type="button" onClick={() => context.frameAll()} disabled={!context.runtimeReady || Object.keys(context.snapshot.objects).length === 0} title="Frame all">
          Frame all
        </button>
      </div>
      <div className="ek-workbench__tool-group" aria-label="Object operations">
        <button type="button" onClick={() => context.runAction("copy")} disabled={context.selectionCount === 0} title="Copy selection">
          Copy
        </button>
        <button type="button" onClick={() => context.runAction("paste")} title="Paste objects">
          Paste
        </button>
        <button type="button" onClick={() => context.runAction("duplicate")} disabled={context.selectionCount === 0} title="Duplicate selection">
          Duplicate
        </button>
        <button type="button" onClick={() => context.runAction("delete")} disabled={context.selectionCount === 0} title="Delete selection">
          Delete
        </button>
        <button type="button" onClick={() => context.runAction("group")} disabled={context.selectionCount < 2} title="Group selection">
          Group
        </button>
        <button type="button" onClick={() => context.runAction("ungroup")} disabled={context.selectionCount === 0} title="Ungroup selection">
          Ungroup
        </button>
        <button type="button" onClick={() => context.runAction("select-all")} disabled={Object.keys(context.snapshot.objects).length === 0} title="Select all">
          Select all
        </button>
        <button type="button" onClick={() => context.runAction("clear-selection")} disabled={context.selectionCount === 0} title="Clear selection">
          Clear
        </button>
      </div>
    </div>
  );
}

function isSnapEnabled(value: number | null | undefined): boolean {
  return value !== null && value !== undefined;
}
