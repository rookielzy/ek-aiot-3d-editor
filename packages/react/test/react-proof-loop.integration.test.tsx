import React from "react";
import { Group } from "three";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssetResolverBridge, createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorViewport } from "../src/components/EditorViewport";

describe("React proof-loop parity", () => {
  it("renders a restored core snapshot without React-local editor behavior", async () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [6, 0, 0] } });
    const restored = createEditor({ snapshot: editor.serialize() });

    render(
      <EditorViewport
        editor={restored}
        resolver={new AssetResolverBridge(() => ({ uri: "/box.glb" }))}
        loader={{ load: async () => new Group() }}
        rendererFactory={fakeRenderer}
      />
    );
    await restored.getRuntime()?.project();

    expect(restored.getSnapshot().objects["object-a"].transform.position).toEqual([6, 0, 0]);
    expect(restored.getRuntime()?.getObject("object-a")).toBeTruthy();
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
