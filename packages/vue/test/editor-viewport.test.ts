import { mount } from "@vue/test-utils";
import { markRaw } from "vue";
import { describe, expect, it, vi } from "vitest";
import { createEditor, type RendererLike } from "@ek-aiot/3d-editor-core";
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
});
