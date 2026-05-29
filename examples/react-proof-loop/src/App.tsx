import { useEffect, useMemo } from "react";
import { AssetResolverBridge } from "@ek-aiot/3d-editor-core";
import { EditorViewport, useEditor } from "@ek-aiot/3d-editor-react";

export function App() {
  const editor = useEditor();
  const resolver = useMemo(() => new AssetResolverBridge((asset) => ({ uri: `/assets/${asset.id}.glb` })), []);

  useEffect(() => {
    if (editor.getSnapshot().objects.box) {
      return;
    }

    editor.dispatch({ type: "import-glb", objectId: "box", asset: { id: "simple-box", label: "Simple box" } });
  }, [editor]);

  return <EditorViewport editor={editor} resolver={resolver} className="viewport" />;
}
