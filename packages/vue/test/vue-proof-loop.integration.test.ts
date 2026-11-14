import { menuItem, menuTrigger, runMenuCommand } from "./support/workbench-menu";
import { setInspectorColor } from "./support/inspector-controls";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Group } from "three";
import { describe, expect, it, vi } from "vitest";
import { h, markRaw, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createEditor, AssetResolverBridge, resolveDefaultPresentationView, type RendererLike } from "@ek-aiot/3d-editor-core";
import EditorWorkbench from "../src/components/EditorWorkbench.vue";
import { useEditor } from "../src/composables/use-editor";
import VueProofLoopApp from "../../../examples/vue-proof-loop/src/App.vue";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

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

  it("keeps the package default workbench empty before a host supplies authored state", async () => {
    const vue = useEditor();
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor: vue.editor,
        rendererFactory: fakeRenderer,
        loader: fakeLoader
      }
    });
    await nextTick();

    expect(wrapper.get('[aria-label="Hierarchy"]').text()).toContain("No scene nodes");
    expect(vue.editor.getSnapshot().objects).toEqual({});
    expect(vue.editor.getSnapshot().assets).toEqual({});

    wrapper.unmount();
    vue.dispose();
  });

  it("opens the demo-owned showcase with recoverable assets and presentation", async () => {
    const restoreDownloadCapture = installDownloadCapture();
    const modelBytes = await readFile(resolve(repoRoot, "examples/showcase/assets/ToyCar.glb"));
    const environmentBytes = await readFile(resolve(repoRoot, "examples/showcase/assets/studio.hdr"));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      return new Response(url.includes("studio.hdr") ? environmentBytes : modelBytes);
    });
    try {
      const wrapper = mount(VueProofLoopApp, {
        props: {
          rendererFactory: fakeRenderer,
          loader: fakeLoader
        }
      });
      await waitForVue(() => expect(wrapper.text()).toContain("Toy Car"));
      await waitForVue(() => expect(wrapper.text()).toContain("Studio view"));

      const toolbar = wrapper.get('[aria-label="Editor controls"]');
      await menuTrigger(wrapper, "Project menu").trigger("click");
      expect(menuItem("Export").exists()).toBe(true);
      await menuTrigger(wrapper, "Project menu").trigger("click");
      expect(buttonByText(wrapper, "Move").attributes("aria-pressed")).toBe("true");
      await menuTrigger(wrapper, "Node operations").trigger("click");
      expect(menuItem("Duplicate").attributes("aria-disabled")).toBe("true");
      await menuTrigger(wrapper, "Node operations").trigger("click");

      const projectPanel = wrapper.get('[aria-label="Project panel"]');
      const hierarchy = projectPanel.get('[aria-label="Hierarchy"]');
      expect(hierarchy.text()).toContain("Toy Car");
      expect(wrapper.text()).toContain("Assets2");
      expect(wrapper.text()).toContain("Selection none");

      await clickPanelTab(wrapper, "Assets");
      const importInput = projectPanel.find('[aria-label="Import assets"]').element as HTMLInputElement;
      await uploadFile(importInput, await glbFixtureFile("simple-box.glb"));
      await clickPanelTab(wrapper, "Scene");
      await waitForVue(() => expect(hierarchy.text()).toContain("simple-box"));
      expect(wrapper.text()).toContain("Assets3");

      const hierarchyRow = hierarchy.findAll("button").find((candidate) => candidate.text().includes("simple-box"));
      expect(hierarchyRow, "Expected hierarchy row for simple-box").toBeTruthy();
      await hierarchyRow!.trigger("click");
      await nextTick();
      await waitForVue(() => expect(wrapper.text()).toContain("Selection simple-box"));

      await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Scene")!.trigger("click");
      await waitForVue(() => expect(wrapper.text()).toContain("Studio view"));
      expect(wrapper.text()).toContain("Default");
      await runMenuCommand(wrapper, "Camera", "Apply view");

      await clickButton(wrapper, "Snap move");
      expect(buttonByText(wrapper, "Snap move").attributes("aria-pressed")).toBe("true");

      await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "Properties")!.trigger("click");
      const positionX = fieldInput(wrapper, "Position X");
      await positionX.setValue("2");
      await positionX.trigger("blur");
      await nextTick();
      await waitForVue(() => expect(wrapper.text()).toMatch(/Undo [1-9]/));

      await clickButton(wrapper, "Undo");
      expect(wrapper.text()).toMatch(/Redo [1-9]/);
      await clickButton(wrapper, "Redo");

      const baseColorInput = wrapper.get('[aria-label="Base color"]');
      await setInspectorColor(baseColorInput, "#00aa88");
      await nextTick();
      await waitForVue(() => expect(wrapper.text()).toContain("Dirty"));

      await runMenuCommand(wrapper, "Node operations", "Duplicate");
      await clickPanelTab(wrapper, "Project");
      await waitForVue(() => expect(projectPanel.text()).toContain("Objects3"));

      await runMenuCommand(wrapper, "Project menu", "Export partial");
      await waitForVue(() => expect(wrapper.text()).toMatch(/Exported (partial )?project/));
      await waitForVue(() => expect(window.__lastDownloadedProject).toBeInstanceOf(Uint8Array));
      expect(JSON.stringify(window.__lastDownloadedProject)).not.toContain("asset-unresolved");

      const bytes = window.__lastDownloadedProject;
      expect(bytes).toBeInstanceOf(Uint8Array);
      await runMenuCommand(wrapper, "Project menu", "Open");
      const openInput = toolbar.find('input[type="file"]');
      await uploadFile(openInput.element as HTMLInputElement, new File([copyBytes(bytes!)], "starter.ek3d", { type: "application/octet-stream" }));
      await waitForVue(() => expect(wrapper.text()).toContain("Opened starter.ek3d"));
      await waitForVue(() => expect(wrapper.text()).toContain("Studio view"));
      expect(wrapper.text()).toContain("Default");
      expect(projectPanel.text()).toContain("Objects3");
      expect(JSON.stringify(window.__lastDownloadedProject)).not.toContain("Blob");

      wrapper.unmount();
    } finally {
      fetchMock.mockRestore();
      restoreDownloadCapture();
    }
  }, 30000);
});

async function clickButton(wrapper: ReturnType<typeof mount>, text: string): Promise<void> {
  const button = wrapper.findAll("button").filter((candidate) => (candidate.attributes("aria-label") ?? candidate.text()) === text).at(-1);
  expect(button, `Expected button ${text}`).toBeTruthy();
  await button!.trigger("click");
  await nextTick();
  await nextTick();
}

async function clickPanelTab(wrapper: ReturnType<typeof mount>, text: string): Promise<void> {
  const button = wrapper.findAll(".ek-workbench__nav-button").find((candidate) => candidate.text().includes(text));
  expect(button, `Expected panel tab ${text}`).toBeTruthy();
  await button!.trigger("click");
  await nextTick();
  await nextTick();
}

function buttonByText(wrapper: ReturnType<typeof mount> | ReturnType<ReturnType<typeof mount>["get"]>, text: string) {
  const button = wrapper.findAll("button").find((candidate) => (candidate.attributes("aria-label") ?? candidate.text()) === text);
  expect(button, `Expected button ${text}`).toBeTruthy();
  return button!;
}

function fieldInput(wrapper: ReturnType<typeof mount>, label: string) {
  const named = wrapper.find(`input[aria-label="${label}"]`);
  const input = named.exists() ? named : wrapper.findAll("label").find((candidate) => candidate.text().includes(label))?.find("input");
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

const fakeLoader = {
  load: async () => new Group()
};

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

async function glbFixtureFile(fileName = "recovered.glb"): Promise<File> {
  const bytes = await readFile(resolve(repoRoot, "packages/core/test/fixtures/simple-box.glb"));
  return new File([toArrayBuffer(bytes)], fileName, { type: "model/gltf-binary" });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

declare global {
  interface Window {
    __lastDownloadedProject?: Uint8Array;
  }
}
