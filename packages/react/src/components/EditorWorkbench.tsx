import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { executeEditorAction, resolveEditorShortcut, type AssetResolverBridge, type EditorRuntime, type EditorRuntimeOptions, type SceneNode } from "@ek-aiot/3d-editor-core";
import { useWorkbench, type UseWorkbenchOptions, type WorkbenchContext } from "../hooks/use-workbench";
import { EditorViewport } from "./EditorViewport";
import { InspectorView } from "./InspectorView";
import "./workbench.css";

export type WorkbenchRenderRegion = (context: WorkbenchContext) => ReactNode;
export type WorkbenchRegionName = "toolbar" | "leftPanel" | "sidePanel" | "viewportOverlay" | "rightPanel" | "status";

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
  const renderLeftPanel = leftPanel ?? sidePanel;

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
      <aside className="ek-workbench__side-panel" aria-label="Project panel">
        {renderLeftPanel ? renderLeftPanel(workbench) : <DefaultWorkbenchLeftPanel context={workbench} />}
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
        {status ? status(workbench) : <DefaultWorkbenchStatus context={workbench} />}
      </footer>
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
      <div className="ek-workbench__tool-group" aria-label="Node operations">
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

function DefaultWorkbenchLeftPanel({ context }: { context: WorkbenchContext }) {
  const roots = context.snapshot.rootNodeIds
    .map((nodeId) => context.snapshot.nodes[nodeId])
    .filter((node): node is SceneNode => Boolean(node));
  const assets = Object.values(context.snapshot.assets);
  const problemItems = context.problems.items;

  return (
    <div className="ek-workbench__default-left-panel">
      <section className="ek-workbench__panel-section" aria-label="Hierarchy">
        <div className="ek-workbench__section-header">
          <h2>Hierarchy</h2>
          <span>{Object.keys(context.snapshot.nodes).length}</span>
        </div>
        {roots.length > 0 ? (
          <ul className="ek-workbench__tree">
            {roots.map((node) => (
              <WorkbenchNodeRow key={node.id} context={context} node={node} depth={0} />
            ))}
          </ul>
        ) : (
          <p className="ek-workbench__empty">No scene nodes.</p>
        )}
      </section>
      <section className="ek-workbench__panel-section" aria-label="Assets">
        <div className="ek-workbench__section-header">
          <h2>Assets</h2>
          <span>{assets.length}</span>
        </div>
        {assets.length > 0 ? (
          <ul className="ek-workbench__asset-list">
            {assets.map((asset) => (
              <li key={asset.id}>
                <span>{asset.label ?? asset.id}</span>
                <small>{asset.kind}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ek-workbench__empty">No registered assets.</p>
        )}
      </section>
      <section className="ek-workbench__panel-section" aria-label="Project">
        <div className="ek-workbench__section-header">
          <h2>Project</h2>
          <span>{problemItems.length === 0 ? "Ready" : `${problemItems.length} problems`}</span>
        </div>
        <dl className="ek-workbench__summary-list">
          <div>
            <dt>Scene</dt>
            <dd>{context.snapshot.scene.name}</dd>
          </div>
          <div>
            <dt>Objects</dt>
            <dd>{Object.keys(context.snapshot.objects).length}</dd>
          </div>
          <div>
            <dt>Lights</dt>
            <dd>{Object.keys(context.snapshot.lights).length}</dd>
          </div>
        </dl>
        {problemItems.length > 0 ? (
          <ul className="ek-workbench__problem-list" aria-label="Project problems">
            {problemItems.slice(0, 3).map((problem) => (
              <li key={problem.id} data-severity={problem.severity}>
                <span>{problem.title}</span>
                {problem.actionLabel ? <small>{problem.actionLabel}</small> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function WorkbenchNodeRow({ context, node, depth }: { context: WorkbenchContext; node: SceneNode; depth: number }) {
  const selected = context.selectedNodeIds.includes(node.id);
  const children = node.children
    .map((childId) => context.snapshot.nodes[childId])
    .filter((child): child is SceneNode => Boolean(child));

  return (
    <li>
      <button
        type="button"
        className="ek-workbench__tree-row"
        data-selected={selected ? "true" : undefined}
        onClick={() => context.dispatch({ type: "select-node", nodeId: node.id })}
        style={{ "--ek-workbench-tree-depth": depth } as CSSProperties}
      >
        <span>{node.name}</span>
        <small>{node.kind}</small>
      </button>
      {children.length > 0 ? (
        <ul>
          {children.map((child) => (
            <WorkbenchNodeRow key={child.id} context={context} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function DefaultWorkbenchStatus({ context }: { context: WorkbenchContext }) {
  return (
    <div className="ek-workbench__default-status">
      <span>Selection {formatSelection(context)}</span>
      <span>Undo {context.historyState.undoCount}</span>
      <span>Redo {context.historyState.redoCount}</span>
      <span>Runtime {context.runtimeReady ? "ready" : "missing"}</span>
      <span>Problems {context.problems.totalCount}</span>
    </div>
  );
}

function formatSelection(context: WorkbenchContext): string {
  if (context.selectionCount === 0) {
    return "none";
  }
  const node = context.selectedNodeId ? context.snapshot.nodes[context.selectedNodeId] : undefined;
  if (context.selectionCount === 1 && node) {
    return node.name;
  }
  return `${context.selectionCount} nodes`;
}
