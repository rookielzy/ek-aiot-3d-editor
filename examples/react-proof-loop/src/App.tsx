import { useEffect, useMemo } from "react";
import { AssetResolverBridge } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor } from "@ek-aiot/3d-editor-react";

export function App() {
  const editor = useEditor();
  const resolver = useMemo(() => new AssetResolverBridge((asset) => asset.kind === "glb" ? { uri: `/assets/${asset.id}.glb` } : null), []);

  useEffect(() => {
    if (editor.getSnapshot().objects.box) {
      return;
    }

    editor.dispatch({ type: "import-glb", objectId: "box", asset: { id: "simple-box", label: "Simple box" } });
    editor.dispatch({ type: "select-object", objectId: "box" });
    editor.dispatch({ type: "register-asset", asset: { id: "studio-hdr", kind: "hdr", label: "Studio HDR" } });
    editor.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: { assetId: "studio-hdr", intensity: 1, rotation: { x: 0, y: 0, z: 0 } },
        background: { mode: "solid", color: "#eef3f8" }
      }
    });
    editor.dispatch({ type: "add-light", light: { id: "fill", kind: "ambient", intensity: 0.6 } });
  }, [editor]);

  return (
    <EditorWorkbench
      editor={editor}
      resolver={resolver}
      toolbar={({ dispatch, editor: workbenchEditor }) => (
        <>
          <button
            type="button"
            onClick={() => dispatch({ type: "set-transform", objectId: "box", transform: { position: [1.5, 0, 0] } })}
          >
            Move box
          </button>
          <button
            type="button"
            onClick={() => {
              const saved = workbenchEditor.serialize();
              workbenchEditor.dispatch({ type: "set-transform", objectId: "box", transform: { position: [3, 0, 0] } });
              workbenchEditor.restore(saved);
            }}
          >
            Save / restore
          </button>
        </>
      )}
      sidePanel={({ snapshot, inspector }) => (
        <dl className="proof-summary">
          <div>
            <dt>Objects</dt>
            <dd>{Object.keys(snapshot.objects).length}</dd>
          </div>
          <div>
            <dt>Selection</dt>
            <dd>{inspector.selection.objectId ?? "None"}</dd>
          </div>
        </dl>
      )}
      viewportOverlay={({ runtimeProblems }) => (
        <span className="proof-overlay">{runtimeProblems.length} runtime problems</span>
      )}
      status={({ snapshot, runtimeProblems }) => (
        <span>
          Snapshot v{snapshot.version} · {runtimeProblems.length} runtime problems
        </span>
      )}
    />
  );
}
