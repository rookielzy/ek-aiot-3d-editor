import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEditor, type EditorRuntime, type EditorRuntimeOptions, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorViewport } from "../src/components/EditorViewport";

describe("EditorViewport", () => {
  it("mounts and disposes core runtime through React lifecycle", () => {
    const editor = createEditor();
    const rendererDispose = vi.fn();
    const { unmount } = render(
      <EditorViewport
        editor={editor}
        rendererFactory={(container: HTMLElement): RendererLike => ({
          domElement: container.ownerDocument.createElement("canvas"),
          setSize() {},
          render() {},
          dispose: rendererDispose
        })}
      />
    );

    unmount();

    expect(rendererDispose).toHaveBeenCalledTimes(1);
  });

  it("forwards interaction options and clears runtime readiness on unmount", () => {
    const editor = createEditor();
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    const runtimeReady = vi.fn<(runtime: EditorRuntime | null) => void>();
    const interactions = {
      camera: true,
      pointerSelection: { defaultMode: "toggle" },
      resize: true,
      selectionVisuals: true,
      transform: true
    } satisfies EditorRuntimeOptions["interactions"];
    const { unmount } = render(
      <EditorViewport
        editor={editor}
        interactions={interactions}
        onRuntimeReady={runtimeReady}
        rendererFactory={fakeRenderer}
      />
    );

    expect(mountRuntime).toHaveBeenCalledWith(expect.objectContaining({ interactions }));
    expect(runtimeReady).toHaveBeenCalledWith(expect.objectContaining({ disposed: false }));

    unmount();

    expect(runtimeReady).toHaveBeenLastCalledWith(null);
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
