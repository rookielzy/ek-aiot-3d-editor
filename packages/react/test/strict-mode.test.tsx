import React, { StrictMode } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
import { EditorViewport } from "../src/components/EditorViewport";
import { InspectorPanel } from "../src/components/InspectorPanel";

describe("React StrictMode lifecycle", () => {
  it("balances runtime setup and cleanup under double mount behavior", () => {
    const editor = createEditor();
    const rendererDispose = vi.fn();
    const { unmount } = render(
      <StrictMode>
        <EditorViewport
          editor={editor}
          rendererFactory={(container: HTMLElement): RendererLike => ({
            domElement: container.ownerDocument.createElement("canvas"),
            setSize() {},
            render() {},
            dispose: rendererDispose
          })}
        />
      </StrictMode>
    );

    unmount();

    expect(rendererDispose.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(editor.getRuntime()?.disposed ?? true).toBe(true);
  });

  it("does not recreate a provided editor when the inspector remounts", () => {
    const editor = createEditor();
    const subscribeSpy = vi.spyOn(editor, "subscribe");
    const { unmount } = render(
      <StrictMode>
        <InspectorPanel editor={editor} />
      </StrictMode>
    );

    unmount();

    expect(editor.disposed).toBe(false);
    expect(subscribeSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
