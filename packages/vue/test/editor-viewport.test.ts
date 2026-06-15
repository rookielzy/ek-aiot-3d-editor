import { mount } from "@vue/test-utils";
import { defineComponent, h, markRaw, nextTick, ref } from "vue";
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
      transform: true,
      viewportHelpers: true
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

  it("remounts when ref-backed runtime option values change", async () => {
    const editor = markRaw(createEditor());
    const firstRendererDispose = vi.fn();
    const secondRendererDispose = vi.fn();
    const interactions = ref<EditorRuntimeOptions["interactions"]>({
      camera: true,
      viewportHelpers: false
    });
    const rendererFactory = ref((container: HTMLElement): RendererLike => fakeRenderer(container, firstRendererDispose));
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    const Host = defineComponent({
      setup() {
        return () => h(EditorViewport, {
          editor,
          interactions,
          rendererFactory
        });
      }
    });
    const wrapper = mount(Host);

    interactions.value = {
      camera: true,
      viewportHelpers: true
    };
    rendererFactory.value = (container: HTMLElement): RendererLike => fakeRenderer(container, secondRendererDispose);
    await nextTick();

    expect(firstRendererDispose).toHaveBeenCalledTimes(1);
    expect(mountRuntime).toHaveBeenLastCalledWith(expect.objectContaining({
      interactions: {
        camera: true,
        viewportHelpers: true
      }
    }));

    wrapper.unmount();

    expect(secondRendererDispose).toHaveBeenCalledTimes(1);
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

  it("renders a pointer-transparent marquee overlay from core session state", async () => {
    const editor = markRaw(createEditor());
    const wrapper = mount(EditorViewport, {
      props: {
        editor,
        interactions: { marqueeSelection: true },
        rendererFactory: sizedFakeRenderer
      }
    });
    const canvas = wrapper.element.querySelector("canvas");

    canvas?.dispatchEvent(new PointerEvent("pointerdown", { clientX: 20, clientY: 30, button: 0 }));
    canvas?.dispatchEvent(new PointerEvent("pointermove", { clientX: 90, clientY: 110, button: 0, buttons: 1 }));
    await nextTick();

    const overlay = wrapper.find(".ek-editor-viewport__marquee");
    expect(overlay.exists()).toBe(true);
    expect(overlay.attributes("aria-hidden")).toBe("true");
    expect(overlay.attributes("style")).toContain("left: 20px");
    expect(overlay.attributes("style")).toContain("top: 30px");
    expect(overlay.attributes("style")).toContain("width: 70px");
    expect(overlay.attributes("style")).toContain("height: 80px");

    canvas?.dispatchEvent(new PointerEvent("pointerup", { clientX: 90, clientY: 110, button: 0 }));
    await nextTick();

    expect(wrapper.find(".ek-editor-viewport__marquee").exists()).toBe(false);
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
