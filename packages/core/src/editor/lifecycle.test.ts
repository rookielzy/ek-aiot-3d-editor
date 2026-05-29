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

  it("notifies runtime subscribers when runtime mounts and editor disposes", () => {
    const editor = createEditor();
    const runtimes: Array<ReturnType<typeof editor.getRuntime>> = [];
    const unsubscribe = editor.subscribeRuntime((runtime) => {
      runtimes.push(runtime);
    });
    const runtime = editor.mountRuntime({
      container: document.createElement("div"),
      rendererFactory: (container): RendererLike => ({
        domElement: container.ownerDocument.createElement("canvas"),
        setSize() {},
        render() {},
        dispose() {}
      })
    });

    unsubscribe();
    editor.dispose();

    expect(runtimes).toEqual([null, runtime]);
  });

  it("exposes disposed runtimes as null when remounting", () => {
    const editor = createEditor();
    const runtimes: Array<ReturnType<typeof editor.getRuntime>> = [];
    editor.subscribeRuntime((runtime) => {
      runtimes.push(runtime);
    });
    const first = editor.mountRuntime({
      container: document.createElement("div"),
      rendererFactory: createFakeRenderer
    });
    const second = editor.mountRuntime({
      container: document.createElement("div"),
      rendererFactory: createFakeRenderer
    });

    expect(first.disposed).toBe(true);
    expect(editor.getRuntime()).toBe(second);
    expect(runtimes).toEqual([null, first, null, second]);
  });
});

function createFakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
