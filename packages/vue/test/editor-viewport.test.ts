import { mount } from "@vue/test-utils";
import { markRaw } from "vue";
import { describe, expect, it, vi } from "vitest";
import { AssetResolverBridge, createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
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
});

function fakeRenderer(container: HTMLElement, dispose: () => void): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose
  };
}
