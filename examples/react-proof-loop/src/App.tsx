import { useEffect, useMemo } from "react";
import { AssetResolverBridge } from "@ek-aiot/3d-editor-core";
import { EditorViewport, InspectorPanel, useEditor } from "@ek-aiot/3d-editor-react";

export function App() {
  const editor = useEditor();
  const resolver = useMemo(() => new AssetResolverBridge((asset) => ({ uri: `/assets/${asset.id}.glb` })), []);

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
        mode: "solid",
        background: { mode: "solid", color: "#eef3f8" }
      }
    });
    editor.dispatch({ type: "add-light", light: { id: "fill", kind: "ambient", intensity: 0.6 } });
  }, [editor]);

  return (
    <main className="workbench">
      <section className="viewport-shell" aria-label="3D viewport">
        <EditorViewport editor={editor} resolver={resolver} className="viewport" />
      </section>
      <InspectorPanel editor={editor} />
    </main>
  );
}
