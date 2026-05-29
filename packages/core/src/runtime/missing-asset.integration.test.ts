import { describe, expect, it } from "vitest";
import { AssetResolverBridge } from "../assets/resolver";
import { createEditor } from "../editor/create-editor";
import type { RendererLike } from "./editor-runtime";

describe("missing asset integration", () => {
  it("preserves scene objects and exposes problem state when a GLB cannot be resolved", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const runtime = editor.mountRuntime({
      container: document.createElement("div"),
      resolver: new AssetResolverBridge(() => null),
      rendererFactory: fakeRenderer
    });

    await runtime.project();

    expect(editor.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
    expect(runtime.getObject("object-a")?.userData.problem).toBe(true);
    expect(runtime.getProblems()).toMatchObject([{ code: "asset-unresolved", target: { kind: "object", objectId: "object-a" } }]);
    expect(editor.serialize().problems.acknowledged).toEqual({});
  });
});

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
