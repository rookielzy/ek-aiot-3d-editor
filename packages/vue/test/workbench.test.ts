import { mount } from "@vue/test-utils";
import { defineComponent, h, markRaw, nextTick } from "vue";
import { Group } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  AssetResolverBridge,
  createEditor,
  type EditorRuntimeOptions,
  type RendererLike
} from "@ek-aiot/3d-editor-core";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";
import { useWorkbench } from "../src/composables/use-workbench";

describe("Vue EditorWorkbench", () => {
  it("composes viewport, inspector, and scoped slots around one raw editor", () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });

    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer },
      slots: {
        toolbar: ({ snapshot }) => h("span", `Objects ${Object.keys(snapshot.objects).length}`),
        status: ({ inspector }) => h("span", `Problems ${inspector.problems.problems.length}`)
      }
    });

    expect(wrapper.text()).toContain("Objects 1");
    expect(wrapper.text()).toContain("Problems 0");
    expect(wrapper.text()).toContain("Transform");
    expect(wrapper.text()).toContain("Material");
    expect(wrapper.text()).toContain("Lights");

    wrapper.unmount();
  });

  it("lets scoped-slot controls dispatch core commands and observe shared state", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer },
      slots: {
        toolbar: ({ dispatch, snapshot }) => [
          h("button", {
            onClick: () => dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [2, 0, 0] } })
          }, "Move object"),
          h("span", `Position ${snapshot.objects["object-a"].transform.position[0]}`)
        ]
      }
    });

    await wrapper.find("button").trigger("click");
    await nextTick();

    expect(wrapper.text()).toContain("Position 2");
    const positionInput = wrapper.find('input[type="number"]').element as HTMLInputElement;
    expect(positionInput.value).toBe("2");

    wrapper.unmount();
  });

  it("shares active light state between slot context and the built-in inspector", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    editor.dispatch({ type: "add-light", light: { id: "light-b", kind: "point" } });

    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer },
      slots: {
        status: ({ activeLightId }) => h("span", `Active ${activeLightId}`)
      }
    });

    expect(wrapper.text()).toContain("Active light-a");

    await wrapper.findAll(".ek-inspector-light-list button")[1].trigger("click");
    await nextTick();

    expect(wrapper.text()).toContain("Active light-b");
    wrapper.unmount();
  });

  it("forwards runtime options to core runtime mounting", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const loader: EditorRuntimeOptions["loader"] = { load: vi.fn(async () => new Group()) };
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor,
        resolver: new AssetResolverBridge((asset) => asset.kind === "glb" ? { uri: "/box.glb" } : null),
        loader,
        rendererFactory: fakeRenderer
      }
    });

    await editor.getRuntime()?.project();

    expect(loader.load).toHaveBeenCalledWith(expect.objectContaining({ uri: "/box.glb" }));
    wrapper.unmount();
  });

  it("moves viewport, inspector, and slot context when the editor prop changes", async () => {
    const first = markRaw(createEditor());
    first.dispatch({ type: "import-glb", objectId: "first-object", asset: { id: "asset-a" } });
    first.dispatch({ type: "select-object", objectId: "first-object" });
    const second = markRaw(createEditor());
    second.dispatch({ type: "import-glb", objectId: "second-object", asset: { id: "asset-b" } });
    second.dispatch({ type: "select-object", objectId: "second-object" });

    const wrapper = mount(EditorWorkbench, {
      props: { editor: first, rendererFactory: fakeRenderer },
      slots: {
        status: ({ snapshot, inspector }) => h("span", `${inspector.selection.objectId}:${Object.keys(snapshot.objects).join(",")}`)
      }
    });

    expect(wrapper.text()).toContain("first-object:first-object");
    const firstRuntime = first.getRuntime();
    expect(firstRuntime).toBeTruthy();

    await wrapper.setProps({ editor: second });
    await nextTick();

    expect(firstRuntime?.disposed).toBe(true);
    expect(first.getRuntime()).toBeNull();
    expect(wrapper.text()).toContain("second-object:second-object");
    expect(wrapper.text()).not.toContain("first-object:first-object");

    wrapper.unmount();
  });

  it("exposes runtime problems through built-in UI and slot context without serializing them", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor,
        resolver: new AssetResolverBridge(() => null),
        rendererFactory: fakeRenderer
      },
      slots: {
        status: ({ runtimeProblems }) => h("span", `Runtime problems ${runtimeProblems.length}`)
      }
    });

    await editor.getRuntime()?.project();
    await nextTick();

    expect(wrapper.text()).toContain("Runtime problems 1");
    expect(wrapper.text()).toContain("Asset could not be resolved");
    expect(JSON.stringify(editor.serialize())).not.toContain("asset-unresolved");

    wrapper.unmount();
  });

  it("does not dispose a host-owned editor on unmount", () => {
    const editor = markRaw(createEditor());
    const wrapper = mount(EditorWorkbench, { props: { editor, rendererFactory: fakeRenderer } });

    wrapper.unmount();

    expect(editor.disposed).toBe(false);
    expect(editor.getSnapshot().version).toBe(2);
  });

  it("disposes a shell-created editor on unmount", () => {
    let captured = createEditor();
    const wrapper = mount(EditorWorkbench, {
      props: { rendererFactory: fakeRenderer },
      slots: {
        toolbar: ({ editor }) => {
          captured = editor;
          return h("span");
        }
      }
    });

    wrapper.unmount();

    expect(captured.disposed).toBe(true);
  });

  it("keeps useWorkbench editor raw and ownership explicit", () => {
    const editor = markRaw(createEditor());
    let workbench!: ReturnType<typeof useWorkbench>;
    const Harness = defineComponent({
      setup() {
        workbench = useWorkbench({ editor });
        return () => null;
      }
    });
    const wrapper = mount(Harness);

    expect(workbench.editor).toBe(editor);
    expect(workbench.ownsEditor).toBe(false);

    wrapper.unmount();
    expect(editor.disposed).toBe(false);
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
