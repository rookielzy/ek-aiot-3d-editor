# @ek-aiot/3d-editor-react

Thin React adapter over `@ek-aiot/3d-editor-core`.

`useEditor()` creates or returns a core editor. `useEditorSnapshot()` uses React external-store subscription semantics. `EditorViewport` mounts and disposes the core runtime through React effects.

`useInspector()` and `InspectorPanel` render the shared core inspector model for selected-object transform/material fields, scene environment/background, lights, and runtime problems. Edits dispatch core commands on commit boundaries, so undo/redo remains owned by core history.

`useWorkbench()` and `EditorWorkbench` compose the primitive pieces into a compact viewport-plus-inspector shell. Pass an existing editor when the host owns editor lifetime; the workbench will not dispose it on unmount. If no editor is passed, the shell creates one and disposes it with the workbench.

```tsx
import { AssetResolverBridge } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor } from "@ek-aiot/3d-editor-react";

const resolver = new AssetResolverBridge((asset) => asset.kind === "glb" ? { uri: `/assets/${asset.id}.glb` } : null);

function Workbench() {
  const editor = useEditor();

  return (
    <EditorWorkbench
      editor={editor}
      resolver={resolver}
      toolbar={({ dispatch }) => (
        <button onClick={() => dispatch({ type: "set-transform", objectId: "box", transform: { position: [1, 0, 0] } })}>
          Move
        </button>
      )}
      status={({ runtimeProblems }) => <span>{runtimeProblems.length} runtime problems</span>}
    />
  );
}
```

Render-prop regions receive the core editor, current snapshot, inspector model, runtime problems, active light state, and a dispatch helper. Runtime options such as `resolver`, loader, and renderer factory are passed through to core runtime mounting; React shell code does not resolve assets or serialize runtime problems.

The workbench and inspector do not implement hierarchy selection, asset replacement, texture upload, persisted layouts, schema-driven inspector plugins, or material texture runtime projection.
