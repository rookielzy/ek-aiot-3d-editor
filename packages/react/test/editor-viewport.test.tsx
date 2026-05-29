import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
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
});
