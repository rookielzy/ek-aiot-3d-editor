import { Group } from "three";
import { describe, expect, it } from "vitest";
import { h, markRaw, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createEditor, AssetResolverBridge, type RendererLike } from "@ek-aiot/3d-editor-core";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";
import { useEditor } from "../src/composables/use-editor";
import VueProofLoopApp from "../../../examples/vue-proof-loop/src/App.vue";

describe("Vue proof-loop parity", () => {
  it("uses core command, asset, history, and runtime behavior for restored snapshots", async () => {
    const core = createEditor();
    core.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    core.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture" } });
    core.registerAsset({ id: "hdr-a", kind: "hdr" });
    core.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });
    core.dispatch({
      type: "set-material",
      target: { kind: "object", objectId: "object-a" },
      material: { color: "#ffffff", textures: { map: { assetId: "texture-a" } } }
    });
    core.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: { assetId: "hdr-a", intensity: 1, rotation: { x: 0, y: 0, z: 0 } },
        background: { mode: "hdr", assetId: "hdr-a" }
      }
    });
    core.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    core.dispatch({ type: "update-light", lightId: "light-a", patch: { intensity: 2 } });
    core.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [3, 0, 0] } });
    const vue = useEditor({ editor: markRaw(createEditor({ snapshot: core.serialize() })) });
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor: vue.editor,
        resolver: new AssetResolverBridge((asset) => asset.kind === "glb" ? { uri: "/box.glb" } : null),
        loader: { load: async () => new Group() },
        rendererFactory: fakeRenderer
      },
      slots: {
        status: ({ runtimeProblems }) => h("span", `Runtime problems ${runtimeProblems.length}`)
      }
    });
    const runtime = vue.editor.getRuntime();

    await runtime?.project();
    await nextTick();

    expect(vue.snapshot.value.objects["object-a"].transform.position).toEqual([3, 0, 0]);
    expect(vue.snapshot.value.materials.definitions["material:object:object-a"].override.textures?.map?.assetId).toBe("texture-a");
    expect(vue.snapshot.value.environment.environment.assetId).toBe("hdr-a");
    expect(vue.snapshot.value.lights["light-a"].intensity).toBe(2);
    expect(runtime?.getObject("object-a")).toBeTruthy();
    expect(runtime?.getProblems()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "environment-asset-unresolved", assetId: "hdr-a", metadata: { role: "background" } }),
      expect.objectContaining({ code: "environment-asset-unresolved", assetId: "hdr-a", metadata: { role: "environment" } })
    ]));
    expect(wrapper.text()).toContain("Runtime problems 2");
    expect(JSON.stringify(vue.editor.serialize())).not.toContain("environment-asset-unresolved");
    wrapper.unmount();
    vue.dispose();
  });

  it("renders the same local hierarchy, asset, and checklist validation surface", async () => {
    const wrapper = mount(VueProofLoopApp, {
      props: {
        rendererFactory: fakeRenderer
      }
    });
    await nextTick();
    await nextTick();

    expect(wrapper.get('[data-testid="demo-hierarchy"]').text()).toContain("Simple box");
    expect(wrapper.get('[data-testid="demo-hierarchy"]').text()).toContain("simple-box");
    expect(wrapper.get('[data-testid="demo-hierarchy"]').text()).toContain("Recoverable asset");
    expect(wrapper.get('[data-testid="demo-selection-count"]').text()).toContain("Simple box (1)");
    expect(wrapper.get('[data-testid="demo-assets"]').text()).toContain("recoverable-box");

    await clickButton(wrapper, "Nudge primary");
    expect(checklistItem(wrapper, "Transform command changed history").attributes("data-complete")).toBe("true");
    expect(checklistItem(wrapper, "Undo is available").attributes("data-complete")).toBe("true");

    await clickButton(wrapper, "Undo");
    expect(checklistItem(wrapper, "Redo is available").attributes("data-complete")).toBe("true");
    await clickButton(wrapper, "Redo");

    await clickButton(wrapper, "Frame selected");
    expect(checklistItem(wrapper, "Camera helper used").attributes("data-complete")).toBe("true");

    await clickButton(wrapper, "Snap move");
    expect(checklistItem(wrapper, "Snap/mode status visible").attributes("data-complete")).toBe("true");

    await clickButton(wrapper, "Duplicate");
    expect(checklistItem(wrapper, "Copy/paste or duplicate ran").attributes("data-complete")).toBe("true");

    await clickButton(wrapper, "Group demo");
    expect(checklistItem(wrapper, "Hierarchy operation changed nesting").attributes("data-complete")).toBe("true");

    await clickButton(wrapper, "Export project");
    expect(checklistItem(wrapper, "Project exported").attributes("data-complete")).toBe("true");

    await clickButton(wrapper, "Reopen package");
    expect(checklistItem(wrapper, "Project reopened").attributes("data-complete")).toBe("true");
    expect(wrapper.get('[data-testid="demo-status"]').text()).not.toContain("OK");

    await waitForVue(() => {
      expect(checklistItem(wrapper, "Missing asset surfaced").attributes("data-complete")).toBe("true");
      expect(wrapper.get('[data-testid="demo-problem-badge"]').text()).toContain("1 problems");
    });
    expect(wrapper.get('[data-testid="demo-status"]').text()).not.toContain("asset-unresolved");

    await clickButton(wrapper, "Replace missing asset");
    await waitForVue(() => {
      expect(checklistItem(wrapper, "Missing asset recovered").attributes("data-complete")).toBe("true");
      expect(wrapper.get('[data-testid="demo-problem-badge"]').text()).toContain("0 problems");
    });
    expect(wrapper.get('[data-testid="demo-assets"]').text()).toContain("recoverable-box");

    wrapper.unmount();
  }, 10000);
});

async function clickButton(wrapper: ReturnType<typeof mount>, text: string): Promise<void> {
  const button = wrapper.findAll("button").filter((candidate) => candidate.text() === text).at(-1);
  expect(button, `Expected button ${text}`).toBeTruthy();
  await button!.trigger("click");
  await nextTick();
  await nextTick();
}

function checklistItem(wrapper: ReturnType<typeof mount>, label: string) {
  const item = wrapper.findAll('[data-testid="demo-checklist"] li').find((candidate) => candidate.text().includes(label));
  expect(item, `Expected checklist item ${label}`).toBeTruthy();
  return item!;
}

async function waitForVue(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let index = 0; index < 10; index += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  throw lastError;
}

function fakeRenderer(container: HTMLElement): RendererLike {
  return {
    domElement: container.ownerDocument.createElement("canvas"),
    setSize() {},
    render() {},
    dispose() {}
  };
}
