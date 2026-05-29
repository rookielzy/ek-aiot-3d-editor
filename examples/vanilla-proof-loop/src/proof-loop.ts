import { AssetResolverBridge, createEditor } from "@ek-aiot/3d-editor-core";

export async function runVanillaProofLoop(container: HTMLElement) {
  const editor = createEditor();
  const runtime = editor.mountRuntime({
    container,
    resolver: new AssetResolverBridge((asset) => ({
      uri: `/assets/${asset.id}.glb`
    }))
  });

  editor.dispatch({ type: "import-glb", objectId: "box", asset: { id: "simple-box", label: "Simple box" } });
  editor.dispatch({ type: "add-light", light: { id: "fill", kind: "ambient", intensity: 0.6 } });
  runtime.pickObject("box");
  editor.dispatch({ type: "set-transform", objectId: "box", transform: { position: [1, 0, 0] } });

  const saved = editor.serialize();
  const restored = createEditor();
  restored.restore(saved);

  return { editor, runtime, saved, restored };
}
