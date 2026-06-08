import { mount } from "@vue/test-utils";
import { markRaw } from "vue";
import { describe, expect, it, vi } from "vitest";
import { AssetResolverBridge, createEditor, ThreeGltfLoaderAdapter, type EditorRuntimeOptions, type RendererLike } from "@ek-aiot/3d-editor-core";
import EditorViewport from "../src/components/EditorViewport.vue";

describe("EditorViewport", () => {
  it("mounts and disposes core runtime through Vue lifecycle", () => {
    const editor = markRaw(createEditor());
    const rendererDispose = vi.fn();
    const wrapper = mount(EditorViewport, {
      props: {
        editor,
        rendererFactory: (container: HTMLElement): RendererLike => ({
          domElement: container.ownerDocument.createElement("canvas"),
          setSize() {},
          render() {},
          dispose: rendererDispose
        })
      }
    });

    wrapper.unmount();

    expect(rendererDispose).toHaveBeenCalledTimes(1);
  });

  it("remounts core runtime when runtime option identities change", async () => {
    const editor = markRaw(createEditor());
    const firstRendererDispose = vi.fn();
    const secondRendererDispose = vi.fn();
    const firstResolver = new AssetResolverBridge(() => null);
    const secondResolver = new AssetResolverBridge(() => null);
    const firstRendererFactory = (container: HTMLElement): RendererLike => fakeRenderer(container, firstRendererDispose);
    const secondRendererFactory = (container: HTMLElement): RendererLike => fakeRenderer(container, secondRendererDispose);
    const wrapper = mount(EditorViewport, {
      props: {
        editor,
        resolver: firstResolver,
        rendererFactory: firstRendererFactory
      }
    });

    await wrapper.setProps({
      resolver: secondResolver,
      rendererFactory: secondRendererFactory
    });

    expect(firstRendererDispose).toHaveBeenCalledTimes(1);

    wrapper.unmount();

    expect(secondRendererDispose).toHaveBeenCalledTimes(1);
  });

  it("forwards interaction options and emits runtime readiness", () => {
    const editor = markRaw(createEditor());
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    const interactions = {
      camera: true,
      pointerSelection: { defaultMode: "toggle" },
      resize: true,
      selectionVisuals: true,
      transform: true
    } satisfies EditorRuntimeOptions["interactions"];
    const wrapper = mount(EditorViewport, {
      props: {
        editor,
        interactions,
        rendererFactory: fakeRenderer
      }
    });

    expect(mountRuntime).toHaveBeenCalledWith(expect.objectContaining({ interactions }));
    expect(wrapper.emitted("runtimeReady")?.[0]?.[0]).toEqual(expect.objectContaining({ disposed: false }));

    wrapper.unmount();

    expect(wrapper.emitted("runtimeReady")?.at(-1)?.[0]).toBeNull();
  });

  it("forwards decoder-aware loader adapters as raw core runtime options", () => {
    const editor = markRaw(createEditor());
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    const loader = new ThreeGltfLoaderAdapter({ decoders: {} });
    const wrapper = mount(EditorViewport, {
      props: {
        editor,
        loader,
        rendererFactory: fakeRenderer
      }
    });

    expect(mountRuntime).toHaveBeenCalledWith(expect.objectContaining({ loader }));

    wrapper.unmount();
  });
});

function fakeRenderer(container: HTMLElement, dispose: () => void = () => {}): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose
  };
}
