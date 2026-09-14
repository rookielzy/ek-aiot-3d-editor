import { WebGLRenderer } from "three";
import type { RendererLike } from "@ek-aiot/3d-editor-core";

/** Shell chrome only: an authored scene background still takes precedence. */
export function createWorkbenchRenderer(container: HTMLElement): RendererLike {
  try {
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setClearColor(0xf1f3f5);
    return renderer;
  } catch {
    // Preserve the existing headless/non-WebGL host fallback.
    const canvas = container.ownerDocument.createElement("canvas");
    return {
      domElement: canvas,
      setSize(width, height) {
        canvas.width = width;
        canvas.height = height;
      },
      render() {},
      dispose() {}
    };
  }
}
