import { Group } from "three";
import { expect, it } from "vitest";
import { AssetResolverBridge, attachGlbImportManifestMetadata, createEditor, createGlbImportManifest, type RendererLike } from "../index";

it("keeps an expanded GLB owner's edited transform through projection, undo, redo and fresh runtime restore", async () => {
  const manifest = createGlbImportManifest({ gltf: { parser: { json: { scenes: [{ nodes: [] }], nodes: [] } } } });
  const editor = createEditor();
  const restored = createEditor();
  const mount = (host: typeof editor) => host.mountRuntime({
    container: document.createElement("div"),
    resolver: new AssetResolverBridge(() => ({ uri: "/model.glb" })),
    loader: { load: async () => new Group() },
    rendererFactory: (container): RendererLike => ({
      domElement: container.ownerDocument.createElement("canvas"),
      setSize() {}, render() {}, dispose() {}
    })
  });
  try {
    editor.dispatch({ type: "import-glb", objectId: "car", asset: { id: "model", metadata: attachGlbImportManifestMetadata(undefined, manifest) }, expandImportedTargets: true });
    const runtime = mount(editor);
    await runtime.project();
    const target = Object.values(editor.getSnapshot().nodes).find((node) => node.kind === "imported" && node.source.kind === "scene")!;
    expect(runtime.getNodeTarget(target.id)).toBe(runtime.getObject("car"));
    editor.dispatch({ type: "set-transform", objectId: "car", transform: { position: [0.2, 1, 2], rotation: [0, 0.5, 0], scale: [2, 3, 4] } });
    await runtime.project();
    expect(runtime.getObject("car")!.position.toArray()).toEqual([0.2, 1, 2]);
    expect(runtime.getObject("car")!.rotation.y).toBe(0.5);
    expect(runtime.getObject("car")!.scale.toArray()).toEqual([2, 3, 4]);
    editor.undo();
    await runtime.project();
    expect(runtime.getObject("car")!.position.toArray()).toEqual([0, 0, 0]);
    editor.redo();
    await runtime.project();
    expect(runtime.getObject("car")!.position.toArray()).toEqual([0.2, 1, 2]);
    restored.restore(editor.serialize());
    const fresh = mount(restored);
    await fresh.project();
    expect(fresh.getObject("car")!.matrixWorld.elements).toEqual(runtime.getObject("car")!.matrixWorld.elements);
    editor.dispatch({ type: "delete-nodes", nodeIds: [target.id] });
    await runtime.project();
    expect(runtime.getNodeTarget(target.id)).toBeUndefined();
    expect(runtime.getObject("car")!.position.toArray()).toEqual([0.2, 1, 2]);
  } finally {
    editor.dispose();
    restored.dispose();
  }
});
