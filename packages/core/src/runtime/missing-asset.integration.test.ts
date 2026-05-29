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

  it("preserves environment state and exposes runtime problems when an HDR cannot be resolved", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });
    editor.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: { assetId: "hdr-a", intensity: 1, rotation: { x: 0, y: 0, z: 0 } }
      }
    });
    const runtime = editor.mountRuntime({
      container: document.createElement("div"),
      resolver: new AssetResolverBridge(() => null),
      rendererFactory: fakeRenderer
    });

    await runtime.project();

    expect(editor.getSnapshot().environment.environment.assetId).toBe("hdr-a");
    expect(runtime.getProblems()).toMatchObject([{ code: "environment-asset-unresolved", target: { kind: "environment", assetId: "hdr-a" } }]);
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
