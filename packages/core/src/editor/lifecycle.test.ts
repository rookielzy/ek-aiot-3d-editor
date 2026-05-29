import { describe, expect, it, vi } from "vitest";
import { createEditor } from "./create-editor";
import type { RendererLike } from "../runtime/editor-runtime";

describe("editor lifecycle", () => {
  it("mounts runtime and disposes runtime plus store subscriptions idempotently", () => {
    const editor = createEditor();
    const rendererDispose = vi.fn();
    const runtime = editor.mountRuntime({
      container: document.createElement("div"),
      rendererFactory: (container): RendererLike => {
        const canvas = container.ownerDocument.createElement("canvas");
        return {
          domElement: canvas,
          setSize() {},
          render() {},
          dispose: rendererDispose
        };
      }
    });

    editor.dispose();
    editor.dispose();

    expect(runtime.disposed).toBe(true);
    expect(rendererDispose).toHaveBeenCalledTimes(1);
    expect(editor.disposed).toBe(true);
  });
});
