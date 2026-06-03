import { useEffect, useMemo, useState } from "react";
import { BoxGeometry, Mesh, MeshStandardMaterial } from "three";
import {
  AssetResolverBridge,
  type Editor,
  type EditorRuntimeOptions,
  type SceneNode,
  type SceneSnapshot
} from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor, type WorkbenchContext } from "@ek-aiot/3d-editor-react";

const RECOVERABLE_ASSET_ID = "recoverable-box";
const DEMO_ASSET_BYTES = new Uint8Array([1, 2, 3, 4]);

const demoLoader: EditorRuntimeOptions["loader"] = {
  async load(resolved) {
    const assetId = typeof resolved.metadata?.assetId === "string" ? resolved.metadata.assetId : undefined;
    const label = typeof resolved.metadata?.label === "string" ? resolved.metadata.label : undefined;
    const color = assetId === RECOVERABLE_ASSET_ID ? "#f59e0b" : "#3b82f6";
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color }));
    mesh.name = label ?? assetId ?? "Demo mesh";
    return mesh;
  }
};

interface DemoSessionState {
  camera: boolean;
  copied: boolean;
  pasted: boolean;
  duplicated: boolean;
  deleted: boolean;
  grouped: boolean;
  ungrouped: boolean;
  exported: boolean;
  reopened: boolean;
  missingAssetSeen: boolean;
  missingAssetRecovered: boolean;
}

type DemoSessionKey = keyof DemoSessionState;

const initialSession: DemoSessionState = {
  camera: false,
  copied: false,
  pasted: false,
  duplicated: false,
  deleted: false,
  grouped: false,
  ungrouped: false,
  exported: false,
  reopened: false,
  missingAssetSeen: false,
  missingAssetRecovered: false
};

export interface AppProps {
  rendererFactory?: EditorRuntimeOptions["rendererFactory"];
}

export function App({ rendererFactory }: AppProps = {}) {
  const editor = useEditor();
  const resolver = useMemo(() => new AssetResolverBridge((asset) => {
    if (asset.kind !== "glb" || asset.id === RECOVERABLE_ASSET_ID) {
      return null;
    }
    return { uri: `/assets/${asset.id}.glb`, metadata: { assetId: asset.id, ...(asset.label ? { label: asset.label } : {}) } };
  }), []);
  const [status, setStatus] = useState("Project controls ready");
  const [session, setSession] = useState<DemoSessionState>(initialSession);

  useEffect(() => {
    if (editor.getSnapshot().objects.box) {
      return;
    }

    editor.dispatch({ type: "import-glb", objectId: "box", name: "Simple box", asset: { id: "simple-box", label: "Simple box" } });
    editor.dispatch({
      type: "import-glb",
      objectId: "detail",
      name: "Detail block",
      asset: { id: "detail-box", label: "Detail block" },
      transform: { position: [-1.35, 0, 0] }
    });
    editor.dispatch({
      type: "import-glb",
      objectId: "recoverable",
      name: "Recoverable asset",
      asset: { id: RECOVERABLE_ASSET_ID, label: "Recoverable asset" },
      transform: { position: [1.35, 0, 0] }
    });
    editor.dispatch({ type: "select-object", objectId: "box" });
    editor.dispatch({
      type: "set-environment",
      environment: {
        mode: "none",
        background: { mode: "solid", color: "#eef3f8" }
      }
    });
    editor.dispatch({ type: "add-light", light: { id: "fill", kind: "ambient", intensity: 0.6 } });
    editor.restore(editor.serialize());
  }, [editor]);

  function markSession(key: DemoSessionKey, value = true): void {
    setSession((current) => current[key] === value ? current : { ...current, [key]: value });
  }

  return (
    <EditorWorkbench
      editor={editor}
      resolver={resolver}
      loader={demoLoader}
      rendererFactory={rendererFactory}
      viewportClassName="demo-viewport"
      showDefaultToolbar={false}
      toolbar={(context) => (
        <DemoToolbar
          context={context}
          session={session}
          setStatus={setStatus}
          markSession={markSession}
        />
      )}
      sidePanel={(context) => (
        <DemoSidePanel
          context={context}
          session={session}
          setStatus={setStatus}
          markSession={markSession}
        />
      )}
      viewportOverlay={({ runtimeProblems, inspector, transformMode, snap }) => (
        <div className="proof-overlay" data-testid="demo-viewport-overlay">
          <span>{runtimeProblems.length} runtime problems</span>
          <span>Primary {inspector.selection.objectId ?? "None"}</span>
          <span>{transformMode} · {formatSnapSummary(snap)}</span>
        </div>
      )}
      status={({ snapshot, runtimeProblems, historyState, transformMode, snap }) => (
        <span data-testid="demo-status">
          Snapshot v{snapshot.version} · {Object.keys(snapshot.objects).length} objects · {runtimeProblems.length} runtime problems · Undo {historyState.undoCount} / Redo {historyState.redoCount} · {transformMode} · {formatSnapSummary(snap)} · {status}
        </span>
      )}
    />
  );
}

function DemoToolbar({
  context,
  session,
  setStatus,
  markSession
}: {
  context: WorkbenchContext;
  session: DemoSessionState;
  setStatus(value: string): void;
  markSession(key: DemoSessionKey, value?: boolean): void;
}) {
  return (
    <div className="demo-toolbar" aria-label="Demo validation controls">
      <button
        type="button"
        onClick={() => {
          context.runAction("transform-translate");
          setStatus("Transform mode set to translate");
        }}
        aria-pressed={context.transformMode === "translate"}
      >
        Move mode
      </button>
      <button
        type="button"
        onClick={() => {
          context.runAction("transform-rotate");
          setStatus("Transform mode set to rotate");
        }}
        aria-pressed={context.transformMode === "rotate"}
      >
        Rotate mode
      </button>
      <button
        type="button"
        onClick={() => {
          context.runAction("transform-scale");
          setStatus("Transform mode set to scale");
        }}
        aria-pressed={context.transformMode === "scale"}
      >
        Scale mode
      </button>
      <button
        type="button"
        onClick={() => {
          context.runAction("toggle-translate-snap");
          setStatus("Translate snap toggled");
        }}
        aria-pressed={isSnapEnabled(context.snap.translate)}
      >
        Snap move
      </button>
      <button
        type="button"
        onClick={() => {
          context.frameSelected();
          markSession("camera");
          setStatus("Framed selected object");
        }}
        disabled={!context.runtimeReady || context.selectionCount === 0}
      >
        Frame selected
      </button>
      <button
        type="button"
        onClick={() => {
          context.resetCamera();
          markSession("camera");
          setStatus("Camera reset");
        }}
        disabled={!context.runtimeReady}
      >
        Reset camera
      </button>
      <button
        type="button"
        onClick={() => {
          movePrimary(context);
          setStatus("Moved primary object through core command");
        }}
        disabled={context.selectionCount === 0}
      >
        Nudge primary
      </button>
      <button
        type="button"
        onClick={() => {
          context.runAction("undo");
          setStatus("Undo applied");
        }}
        disabled={context.historyState.undoCount === 0}
      >
        Undo
      </button>
      <button
        type="button"
        onClick={() => {
          context.runAction("redo");
          setStatus("Redo applied");
        }}
        disabled={context.historyState.redoCount === 0}
      >
        Redo
      </button>
      <button
        type="button"
        onClick={() => {
          const result = context.exportProject({ partial: true });
          if (result.packageBytes instanceof Uint8Array) {
            markSession("exported");
            setStatus("Exported .ek3d project package");
          } else {
            setStatus(result.problems[0]?.message ?? "Export failed");
          }
        }}
      >
        Export project
      </button>
      <button
        type="button"
        onClick={() => reopenProject(context.editor, setStatus, markSession)}
      >
        Reopen package
      </button>
      <span className="demo-toolbar__status" data-testid="demo-toolbar-state">
        {context.transformMode} · {formatSnapSummary(context.snap)} · {session.reopened ? "Restored" : "Live"}
      </span>
    </div>
  );
}

function DemoSidePanel({
  context,
  session,
  setStatus,
  markSession
}: {
  context: WorkbenchContext;
  session: DemoSessionState;
  setStatus(value: string): void;
  markSession(key: DemoSessionKey, value?: boolean): void;
}) {
  const state = deriveDemoState(context, session);

  useEffect(() => {
    if (state.problemCount > 0) {
      markSession("missingAssetSeen");
    }
  }, [state.problemCount, markSession]);

  return (
    <div className="demo-panel-grid">
      <section className="demo-panel" aria-labelledby="demo-hierarchy-title">
        <div className="demo-panel__header">
          <h2 id="demo-hierarchy-title">Scene hierarchy</h2>
          <span data-testid="demo-selection-count">{state.selectionLabel}</span>
        </div>
        {state.hierarchy.length > 0 ? (
          <ul className="demo-hierarchy" data-testid="demo-hierarchy">
            {state.hierarchy.map((node) => (
              <HierarchyNode
                key={node.node.id}
                node={node}
                primaryNodeId={context.snapshot.selection.nodeId}
                selectedIds={context.snapshot.selection.nodeIds}
                problemObjectIds={state.problemObjectIds}
                onSelect={(nodeId) => {
                  context.dispatch({ type: "select-node", nodeId });
                  setStatus(`Selected ${nodeId} from hierarchy`);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="demo-empty">No scene objects</p>
        )}
      </section>

      <section className="demo-panel" aria-labelledby="demo-operations-title">
        <div className="demo-panel__header">
          <h2 id="demo-operations-title">Object operations</h2>
          <span>{context.operations.canPaste() ? "Clipboard ready" : "Clipboard empty"}</span>
        </div>
        <div className="demo-command-grid">
          <button
            type="button"
            onClick={() => {
              context.runAction("select-all");
              setStatus("Selected all objects");
            }}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => {
              const payload = context.operations.copy();
              markSession("copied", Boolean(payload));
              setStatus(payload ? "Copied selection" : "Nothing to copy");
            }}
            disabled={context.selectionCount === 0}
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => {
              const result = context.operations.paste();
              markSession("pasted", result.ok);
              setStatus(result.ok ? "Pasted clipboard objects" : result.error ?? "Paste failed");
            }}
            disabled={!context.operations.canPaste()}
          >
            Paste
          </button>
          <button
            type="button"
            onClick={() => {
              const result = context.operations.duplicate();
              markSession("duplicated", result.ok);
              setStatus(result.ok ? "Duplicated selection" : result.error ?? "Duplicate failed");
            }}
            disabled={context.selectionCount === 0}
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              const result = context.operations.delete();
              markSession("deleted", result.ok);
              setStatus(result.ok ? "Deleted selection" : result.error ?? "Delete failed");
            }}
            disabled={context.selectionCount === 0}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => {
              context.dispatch({ type: "select-objects", mode: "replace", objectIds: ["box", "detail"], primaryObjectId: "box" });
              const result = context.operations.group(["box", "detail"]);
              markSession("grouped", result.ok);
              setStatus(result.ok ? "Grouped detail under Simple box" : result.error ?? "Group failed");
            }}
            disabled={!context.snapshot.objects.box || !context.snapshot.objects.detail}
          >
            Group demo
          </button>
          <button
            type="button"
            onClick={() => {
              const result = context.operations.ungroup("box");
              markSession("ungrouped", result.ok);
              setStatus(result.ok ? "Ungrouped Simple box children" : result.error ?? "Ungroup failed");
            }}
            disabled={!context.snapshot.objects.box?.children.length}
          >
            Ungroup
          </button>
        </div>
      </section>

      <section className="demo-panel" aria-labelledby="demo-assets-title">
        <div className="demo-panel__header">
          <h2 id="demo-assets-title">Assets and problems</h2>
          <span data-testid="demo-problem-badge">{state.problemCount} problems</span>
        </div>
        <ul className="demo-assets" data-testid="demo-assets">
          {state.assets.map((asset) => (
            <li key={asset.id}>
              <span>{asset.label ?? asset.id}</span>
              <small>{asset.kind} · {asset.id}</small>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={async () => {
            const result = await context.replaceAsset({
              assetId: RECOVERABLE_ASSET_ID,
              kind: "glb",
              source: DEMO_ASSET_BYTES,
              label: "Recovered box.glb",
              mimeType: "model/gltf-binary"
            });
            if (result.ok) {
              await context.runtime?.project();
              context.refreshProblems();
              markSession("missingAssetRecovered");
              setStatus("Recovered missing asset without changing its asset ID");
            } else {
              setStatus(result.problems[0]?.message ?? "Replacement failed");
            }
          }}
        >
          Replace missing asset
        </button>
      </section>

      <section className="demo-panel" aria-labelledby="demo-checklist-title">
        <div className="demo-panel__header">
          <h2 id="demo-checklist-title">Proof checklist</h2>
          <span data-testid="demo-checklist-score">{state.completedCount}/{state.checklist.length}</span>
        </div>
        <ol className="demo-checklist" data-testid="demo-checklist">
          {state.checklist.map((item) => (
            <li key={item.label} data-complete={item.complete ? "true" : "false"}>
              <span aria-hidden="true">{item.complete ? "OK" : "--"}</span>
              {item.label}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

interface HierarchyNodeModel {
  node: SceneNode;
  secondary: string;
  depth: number;
  children: HierarchyNodeModel[];
}

function HierarchyNode({
  node,
  primaryNodeId,
  selectedIds,
  problemObjectIds,
  onSelect
}: {
  node: HierarchyNodeModel;
  primaryNodeId: string | null;
  selectedIds: string[];
  problemObjectIds: Set<string>;
  onSelect(nodeId: string): void;
}) {
  const selected = selectedIds.includes(node.node.id);
  const primary = primaryNodeId === node.node.id;
  const problem = node.node.kind === "object" && problemObjectIds.has(node.node.objectId);

  return (
    <li>
      <button
        type="button"
        className="demo-hierarchy__row"
        style={{ "--depth": node.depth } as React.CSSProperties}
        data-node-id={node.node.id}
        data-node-kind={node.node.kind}
        data-object-id={node.node.kind === "object" ? node.node.objectId : undefined}
        data-light-id={node.node.kind === "light" ? node.node.lightId : undefined}
        data-selected={selected ? "true" : "false"}
        data-primary={primary ? "true" : "false"}
        onClick={() => onSelect(node.node.id)}
      >
        <span className="demo-hierarchy__marker">{primary ? "Primary" : selected ? "Selected" : formatNodeKind(node.node.kind)}</span>
        <span className="demo-hierarchy__name">{node.node.name}</span>
        <span className="demo-hierarchy__asset">{node.secondary}</span>
        {problem ? <span className="demo-problem-dot">Problem</span> : null}
      </button>
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <HierarchyNode
              key={child.node.id}
              node={child}
              primaryNodeId={primaryNodeId}
              selectedIds={selectedIds}
              problemObjectIds={problemObjectIds}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function deriveDemoState(context: WorkbenchContext, session: DemoSessionState) {
  const snapshot = context.snapshot;
  const objectCount = Object.keys(snapshot.objects).length;
  const selectedNode = snapshot.selection.nodeId ? snapshot.nodes[snapshot.selection.nodeId] : undefined;
  const selectedObject = snapshot.selection.objectId ? snapshot.objects[snapshot.selection.objectId] : undefined;
  const transformMoved = Boolean(selectedObject && selectedObject.transform.position[0] > 0);
  const materialEdited = Object.keys(snapshot.materials.assignments).length > 0;
  const problemObjectIds = new Set(context.runtimeProblems.map((problem) => problem.objectId).filter((objectId): objectId is string => Boolean(objectId)));
  const checklist = [
    { label: "Hierarchy lists seeded scene", complete: objectCount >= 3 && Object.keys(snapshot.lights).length > 0 },
    { label: "Selection is visible", complete: context.selectionCount > 0 },
    { label: "Camera helper used", complete: session.camera },
    { label: "Transform command changed history", complete: transformMoved && context.historyState.undoCount > 0 },
    { label: "Material inspector changed runtime", complete: materialEdited },
    { label: "Undo is available", complete: context.historyState.undoCount > 0 },
    { label: "Redo is available", complete: context.historyState.redoCount > 0 },
    { label: "Hierarchy operation changed nesting", complete: session.grouped || Object.values(snapshot.objects).some((object) => object.children.length > 0) },
    { label: "Copy/paste or duplicate ran", complete: session.pasted || session.duplicated },
    { label: "Project exported", complete: session.exported },
    { label: "Project reopened", complete: session.reopened },
    { label: "Missing asset surfaced", complete: session.missingAssetSeen || context.runtimeProblems.some((problem) => problem.assetId === RECOVERABLE_ASSET_ID) },
    { label: "Missing asset recovered", complete: session.missingAssetRecovered && context.runtimeProblems.every((problem) => problem.assetId !== RECOVERABLE_ASSET_ID) },
    { label: "Snap/mode status visible", complete: isSnapEnabled(context.snap.translate) || context.transformMode !== "translate" }
  ];

  return {
    hierarchy: buildHierarchy(snapshot),
    assets: Object.values(snapshot.assets),
    checklist,
    completedCount: checklist.filter((item) => item.complete).length,
    problemCount: context.runtimeProblems.length,
    problemObjectIds,
    selectionLabel: selectedNode ? `${selectedNode.name} (${context.selectionCount})` : `None (${context.selectionCount})`
  };
}

function buildHierarchy(snapshot: SceneSnapshot): HierarchyNodeModel[] {
  const visit = (nodeId: string, depth: number): HierarchyNodeModel | null => {
    const node = snapshot.nodes[nodeId];
    if (!node) {
      return null;
    }

    return {
      node,
      secondary: getHierarchySecondary(snapshot, node),
      depth,
      children: node.children.map((childId) => visit(childId, depth + 1)).filter((child): child is HierarchyNodeModel => Boolean(child))
    };
  };

  return snapshot.rootNodeIds.map((nodeId) => visit(nodeId, 0)).filter((node): node is HierarchyNodeModel => Boolean(node));
}

function getHierarchySecondary(snapshot: SceneSnapshot, node: SceneNode): string {
  if (node.kind === "object") {
    return snapshot.objects[node.objectId]?.asset.id ?? node.objectId;
  }
  if (node.kind === "light") {
    return snapshot.lights[node.lightId]?.kind ?? node.lightId;
  }
  return `${node.children.length} nodes`;
}

function formatNodeKind(kind: SceneNode["kind"]): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function movePrimary(context: WorkbenchContext): void {
  const objectId = context.snapshot.selection.objectId;
  if (!objectId) {
    return;
  }
  const object = context.snapshot.objects[objectId];
  context.dispatch({
    type: "set-transform",
    objectId,
    transform: {
      position: [object.transform.position[0] + 0.5, object.transform.position[1], object.transform.position[2]]
    }
  });
}

function reopenProject(editor: Editor, setStatus: (value: string) => void, markSession: (key: DemoSessionKey, value?: boolean) => void): void {
  const result = editor.exportProject({ partial: true });
  if (!(result.packageBytes instanceof Uint8Array)) {
    setStatus("Project contains async browser file payloads");
    return;
  }
  const imported = editor.importProject(result.packageBytes);
  if (imported.ok) {
    markSession("exported");
    markSession("reopened");
    setStatus("Imported .ek3d project package");
  } else {
    setStatus(imported.problems[0]?.message ?? "Import failed");
  }
}

function formatSnapSummary(snap: WorkbenchContext["snap"]): string {
  return `snap ${isSnapEnabled(snap.translate) ? "move" : "off"}`;
}

function isSnapEnabled(value: number | null | undefined): boolean {
  return value !== null && value !== undefined;
}
