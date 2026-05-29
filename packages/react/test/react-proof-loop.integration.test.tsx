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
    editor.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture" } });
    editor.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });
    editor.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { color: "#ffffff", textures: { map: { assetId: "texture-a" } } }
    });
    editor.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: { assetId: "hdr-a", intensity: 1, rotation: { x: 0, y: 0, z: 0 } },
        background: { mode: "hdr", assetId: "hdr-a" }
      }
    });
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    editor.dispatch({ type: "update-light", lightId: "light-a", patch: { intensity: 2 } });
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
    expect(restored.getSnapshot().materials.definitions["material:object:object-a"].override.textures?.map?.assetId).toBe("texture-a");
    expect(restored.getSnapshot().environment.environment.assetId).toBe("hdr-a");
    expect(restored.getSnapshot().lights["light-a"].intensity).toBe(2);
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
