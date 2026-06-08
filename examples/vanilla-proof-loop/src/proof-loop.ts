import { AssetResolverBridge, createEditor, ThreeGltfLoaderAdapter } from "@ek-aiot/3d-editor-core";

export async function runVanillaProofLoop(container: HTMLElement) {
  const editor = createEditor();
  const runtime = editor.mountRuntime({
    container,
    resolver: new AssetResolverBridge((asset) => ({
      uri: `/assets/${asset.id}.glb`
    })),
    loader: new ThreeGltfLoaderAdapter({
      decoders: {
        // Hosts provide ready decoder instances or factories here when their GLBs require them.
        // draco: () => dracoLoader,
        // ktx2: () => ktx2Loader,
        // meshopt: () => MeshoptDecoder
      }
    })
  });

  editor.dispatch({ type: "import-glb", objectId: "box", asset: { id: "simple-box", label: "Simple box" } });
  editor.dispatch({ type: "add-light", light: { id: "fill", kind: "ambient", intensity: 0.6 } });
  runtime.pickObject("box");
  editor.dispatch({ type: "set-node-transform", nodeId: "box", transform: { position: [1, 0, 0] } });

  const saved = editor.serialize();
  const exportedProject = editor.exportProject({ partial: true });
  const restored = createEditor();
  restored.restore(saved);
  if (exportedProject.packageBytes instanceof Uint8Array) {
    restored.importProject(exportedProject.packageBytes);
  }

  return { editor, runtime, saved, exportedProject, restored };
}
