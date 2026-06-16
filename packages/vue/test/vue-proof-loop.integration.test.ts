import { Group } from "three";
import { describe, expect, it } from "vitest";
import { h, markRaw, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createEditor, AssetResolverBridge, resolveDefaultPresentationView, type RendererLike } from "@ek-aiot/3d-editor-core";
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
        lighting: { source: { kind: "hdr", assetId: "hdr-a" }, intensity: 1, rotation: { x: 0, y: 0, z: 0 } },
        background: { source: { kind: "hdr", assetId: "hdr-a" } }
      }
    });
    core.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    core.dispatch({ type: "update-light", lightId: "light-a", patch: { intensity: 2 } });
    core.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [3, 0, 0] } });
    core.dispatch({
      type: "create-camera-view",
      view: {
        id: "hero-view",
        name: "Hero view",
        projection: { kind: "perspective", fov: 45 },
        position: [3, 2, 6],
        target: [0, 0, 0],
        near: 0.1,
        far: 200
      }
    });
    core.dispatch({ type: "set-default-camera-view", viewId: "hero-view" });
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
    expect(vue.snapshot.value.environment.lighting.source).toEqual({ kind: "hdr", assetId: "hdr-a" });
    expect(vue.snapshot.value.lights["light-a"].intensity).toBe(2);
    expect(resolveDefaultPresentationView(vue.editor.getSnapshot())).toMatchObject({
      status: "resolved",
      defaultCameraId: "hero-view",
      view: { id: "hero-view", name: "Hero view" }
    });
    expect(runtime?.getObject("object-a")).toBeTruthy();
    expect(runtime?.getProblems()).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "material-texture-asset-unresolved", assetId: "texture-a" }),
      expect.objectContaining({ code: "environment-asset-unresolved", assetId: "hdr-a", metadata: { role: "background" } }),
      expect.objectContaining({ code: "environment-asset-unresolved", assetId: "hdr-a", metadata: { role: "environment" } })
    ]));
    expect(wrapper.text()).toContain("Runtime problems 3");
    expect(JSON.stringify(vue.editor.serialize())).not.toContain("material-texture-asset-unresolved");
    expect(JSON.stringify(vue.editor.serialize())).not.toContain("environment-asset-unresolved");
    wrapper.unmount();
    vue.dispose();
  });

  it("uses the package default workbench as the local starter proof", async () => {
    const restoreDownloadCapture = installDownloadCapture();
    try {
      const wrapper = mount(VueProofLoopApp, {
        props: {
          rendererFactory: fakeRenderer
        }
      });
      await nextTick();
      await nextTick();

      const toolbar = wrapper.get('[aria-label="Editor controls"]');
      expect(buttonByText(toolbar, "Export").exists()).toBe(true);
      expect(buttonByText(toolbar, "Move").attributes("aria-pressed")).toBe("true");
      expect((buttonByText(toolbar, "Duplicate").element as HTMLButtonElement).disabled).toBe(false);

      const projectPanel = wrapper.get('[aria-label="Project panel"]');
      const hierarchy = projectPanel.get('[aria-label="Hierarchy"]');
      expect(hierarchy.text()).toContain("Simple box");
      expect(hierarchy.text()).toContain("Recoverable asset");
      expect(hierarchy.text()).toContain("Ambient light");
      const assets = projectPanel.get('[aria-label="Assets"]');
      expect(assets.text()).toContain("Recoverable asset");
      expect(assets.text()).toContain("glb");
      expect(assets.text()).toContain("missing payload");
      expect(assets.text()).toContain("1 refs");
      expect(wrapper.get('[data-testid="starter-overlay"]').text()).toContain("3 objects");
      expect(wrapper.text()).toContain("Selection Simple box");

      await clickButton(wrapper, "Capture view");
      await waitForVue(() => expect(wrapper.text()).toContain("Camera view 1"));
      await clickButton(wrapper, "Set default");
      expect(wrapper.text()).toContain("Default");
      await clickButton(wrapper, "Apply view");

      await clickButton(wrapper, "Snap move");
      expect(buttonByText(toolbar, "Snap move").attributes("aria-pressed")).toBe("true");

      const positionX = fieldInput(wrapper, "Position X");
      await positionX.setValue("2");
      await positionX.trigger("blur");
      await nextTick();
      await waitForVue(() => expect(wrapper.text()).toContain("Undo 3"));

      await clickButton(wrapper, "Undo");
      expect(wrapper.text()).toContain("Redo 1");
      await clickButton(wrapper, "Redo");

      const baseColorInput = fieldInput(wrapper, "Base color");
      await baseColorInput.setValue("#00aa88");
      await nextTick();
      await waitForVue(() => expect(wrapper.text()).toContain("Dirty"));

      await clickButton(wrapper, "Duplicate");
      await waitForVue(() => expect(projectPanel.text()).toContain("Objects4"));

      await clickButton(wrapper, "Export partial");
      expect(wrapper.text()).toContain("Exported partial project");
      await waitForVue(() => expect(window.__lastDownloadedProject).toBeInstanceOf(Uint8Array));
      expect(JSON.stringify(window.__lastDownloadedProject)).not.toContain("asset-unresolved");

      const bytes = window.__lastDownloadedProject;
      expect(bytes).toBeInstanceOf(Uint8Array);
      const openInput = toolbar.find('input[type="file"]');
      await uploadFile(openInput.element as HTMLInputElement, new File([copyBytes(bytes!)], "starter.ek3d", { type: "application/octet-stream" }));
      await waitForVue(() => expect(wrapper.text()).toContain("Opened starter.ek3d"));
      await waitForVue(() => expect(wrapper.text()).toContain("Camera view 1"));
      expect(wrapper.text()).toContain("Default");

      await waitForVue(() => expect(projectPanel.text()).toContain("Replace asset"));
      expect(projectPanel.text()).toContain("1 problems");

      const recoveryInput = projectPanel.find('[aria-label="Missing asset recovery"] input[type="file"]');
      expect(recoveryInput.exists()).toBe(true);
      await uploadFile(recoveryInput.element as HTMLInputElement, new File([new Uint8Array([1, 2, 3, 4])], "recovered.glb", { type: "model/gltf-binary" }));
      await waitForVue(() => expect(projectPanel.text()).not.toContain("Replace asset"));
      await waitForVue(() => expect(wrapper.text()).toContain("Problems 0"));
      expect(projectPanel.text()).toContain("Recoverable asset");
      expect(JSON.stringify(window.__lastDownloadedProject)).not.toContain("Blob");

      wrapper.unmount();
    } finally {
      restoreDownloadCapture();
    }
  }, 10000);
});

async function clickButton(wrapper: ReturnType<typeof mount>, text: string): Promise<void> {
  const button = wrapper.findAll("button").filter((candidate) => candidate.text() === text).at(-1);
  expect(button, `Expected button ${text}`).toBeTruthy();
  await button!.trigger("click");
  await nextTick();
  await nextTick();
}

function buttonByText(wrapper: ReturnType<typeof mount> | ReturnType<ReturnType<typeof mount>["get"]>, text: string) {
  const button = wrapper.findAll("button").find((candidate) => candidate.text() === text);
  expect(button, `Expected button ${text}`).toBeTruthy();
  return button!;
}

function fieldInput(wrapper: ReturnType<typeof mount>, label: string) {
  const input = wrapper.findAll("label").find((candidate) => candidate.text().includes(label))?.find("input");
  expect(input, `Expected input for ${label}`).toBeTruthy();
  return input!;
}

async function waitForVue(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let index = 0; index < 20; index += 1) {
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

function installDownloadCapture(): () => void {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = ((blob: Blob) => {
    void blob.arrayBuffer().then((buffer) => {
      window.__lastDownloadedProject = new Uint8Array(buffer);
    });
    return "blob:starter-project";
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  HTMLAnchorElement.prototype.click = () => undefined;

  return () => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    HTMLAnchorElement.prototype.click = originalAnchorClick;
    delete window.__lastDownloadedProject;
  };
}

async function uploadFile(input: HTMLInputElement, file: File): Promise<void> {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file]
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await nextTick();
  await nextTick();
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

declare global {
  interface Window {
    __lastDownloadedProject?: Uint8Array;
  }
}
