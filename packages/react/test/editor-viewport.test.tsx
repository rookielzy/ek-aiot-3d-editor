import React from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEditor, ThreeGltfLoaderAdapter, type EditorRuntime, type EditorRuntimeOptions, type RendererLike } from "@ek-aiot/3d-editor-core";
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
      transform: true,
      viewportHelpers: true
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

  it("forwards decoder-aware loader adapters without React-owned loader semantics", () => {
    const editor = createEditor();
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    const loader = new ThreeGltfLoaderAdapter({ decoders: {} });

    const { unmount } = render(
      <EditorViewport
        editor={editor}
        loader={loader}
        rendererFactory={fakeRenderer}
      />
    );

    expect(mountRuntime).toHaveBeenCalledWith(expect.objectContaining({ loader }));

    unmount();
  });

  it("renders a pointer-transparent marquee overlay from core session state", () => {
    const editor = createEditor();
    const { container, unmount } = render(
      <EditorViewport
        editor={editor}
        interactions={{ marqueeSelection: true }}
        rendererFactory={sizedFakeRenderer}
      />
    );
    const canvas = container.querySelector("canvas");

    act(() => {
      canvas?.dispatchEvent(new PointerEvent("pointerdown", { clientX: 20, clientY: 30, button: 0 }));
      canvas?.dispatchEvent(new PointerEvent("pointermove", { clientX: 90, clientY: 110, button: 0, buttons: 1 }));
    });

    const overlay = container.querySelector(".ek-editor-viewport__marquee") as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute("aria-hidden")).toBe("true");
    expect(overlay?.style.left).toBe("20px");
    expect(overlay?.style.top).toBe("30px");
    expect(overlay?.style.width).toBe("70px");
    expect(overlay?.style.height).toBe("80px");

    act(() => {
      canvas?.dispatchEvent(new PointerEvent("pointerup", { clientX: 90, clientY: 110, button: 0 }));
    });

    expect(container.querySelector(".ek-editor-viewport__marquee")).toBeNull();
    unmount();
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

function sizedFakeRenderer(container: HTMLElement): RendererLike {
  Object.defineProperty(container, "clientWidth", { configurable: true, value: 200 });
  Object.defineProperty(container, "clientHeight", { configurable: true, value: 200 });
  container.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 200,
    width: 200,
    height: 200,
    toJSON() {}
  });
  return fakeRenderer(container);
}
