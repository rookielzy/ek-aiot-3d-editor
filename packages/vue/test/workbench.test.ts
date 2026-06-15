import { mount } from "@vue/test-utils";
import { defineComponent, h, markRaw, nextTick } from "vue";
import { Group } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  AssetResolverBridge,
  attachGlbImportManifestMetadata,
  buildAssetWorkspaceModel,
  createGlbImportManifest,
  createEditor,
  filterAssetWorkspaceItems,
  ThreeGltfLoaderAdapter,
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

    const moveButton = wrapper.findAll("button").find((button) => button.text() === "Move object");
    expect(moveButton).toBeTruthy();
    await moveButton!.trigger("click");
    await nextTick();

    expect(wrapper.text()).toContain("Position 2");
    const positionInput = wrapper.find('input[type="number"]').element as HTMLInputElement;
    expect(positionInput.value).toBe("2");

    wrapper.unmount();
  });

  it("exposes advanced operations and routes shortcuts outside editable controls", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer },
      slots: {
        toolbar: ({ operations, selectionCount, snap }) => [
          h("button", { onClick: () => operations.duplicate() }, "Duplicate"),
          h("span", `Selected ${selectionCount}`),
          h("span", `Translate snap ${snap.translate ?? "off"}`),
          h("input", { "aria-label": "Toolbar input" })
        ]
      }
    });

    expect(wrapper.text()).toContain("Selected 1");
    await wrapper.trigger("keydown", { key: "d", ctrlKey: true });
    expect(Object.keys(editor.getSnapshot().objects)).toHaveLength(3);

    await wrapper.find("input").trigger("keydown", { key: "a", ctrlKey: true });
    expect(editor.getSnapshot().selection.objectIds).not.toEqual(["object-a", "object-b"]);

    await wrapper.trigger("keydown", { key: "w", ctrlKey: true, altKey: true });
    await nextTick();
    expect(wrapper.text()).toContain("Translate snap 0.5");

    wrapper.unmount();
  });

  it("renders default workbench controls that route transform, snap, camera, and operations through core", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });

    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer }
    });
    const runtime = editor.getRuntime();
    const resetCamera = vi.spyOn(runtime!, "resetCamera");
    const frameSelected = vi.spyOn(runtime!, "frameSelected");
    const duplicate = vi.spyOn(editor.operations, "duplicate");

    await wrapper.find('[title="Rotate mode"]').trigger("click");
    await nextTick();
    expect(editor.transformMode.get()).toBe("rotate");
    expect(wrapper.find('[title="Rotate mode"]').attributes("aria-pressed")).toBe("true");

    await wrapper.find('[title="Toggle move snap"]').trigger("click");
    await nextTick();
    expect(editor.snap.get().translate).toBe(0.5);
    expect(wrapper.find('[title="Toggle move snap"]').attributes("aria-pressed")).toBe("true");

    await waitForAssertion(() => {
      expect(wrapper.find('[title="Toggle viewport grid"]').attributes("aria-pressed")).toBe("true");
    });
    await wrapper.find('[title="Toggle viewport grid"]').trigger("click");
    await nextTick();
    expect(editor.viewportHelpers.get().visibility.grid).toBe(false);
    expect(wrapper.find('[title="Toggle viewport grid"]').attributes("aria-pressed")).toBe("false");

    await wrapper.find('[title="Toggle viewport floor"]').trigger("click");
    await nextTick();
    expect(editor.viewportHelpers.get().visibility.floor).toBe(true);
    expect(wrapper.find('[title="Toggle viewport floor"]').attributes("aria-pressed")).toBe("true");

    for (const title of [
      "Toggle viewport axes",
      "Toggle hover feedback",
      "Toggle selection bounds",
      "Toggle snap feedback",
      "Toggle viewport floor"
    ]) {
      await wrapper.find(`[title="${title}"]`).trigger("click");
      await nextTick();
      expect(wrapper.find(`[title="${title}"]`).attributes("aria-pressed")).toBe("false");
    }
    expect(Object.values(editor.viewportHelpers.get().visibility)).toEqual([false, false, false, false, false, false]);

    await wrapper.find('[title="Move mode"]').trigger("click");
    await nextTick();
    expect(Object.values(editor.viewportHelpers.get().visibility)).toEqual([false, false, false, false, false, false]);
    expect(JSON.stringify(editor.serialize())).not.toContain("viewportHelpers");

    await wrapper.find('[title="Reset camera"]').trigger("click");
    await wrapper.find('[title="Frame selected"]').trigger("click");
    expect(resetCamera).toHaveBeenCalledTimes(1);
    expect(frameSelected).toHaveBeenCalledTimes(1);

    await wrapper.find('[title="Duplicate selection"]').trigger("click");
    expect(duplicate).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("passes decoder-aware loader adapters through to the core runtime", () => {
    const editor = markRaw(createEditor());
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    const loader = new ThreeGltfLoaderAdapter({ decoders: {} });
    const wrapper = mount(EditorWorkbench, {
      props: { editor, loader, rendererFactory: fakeRenderer }
    });

    expect(mountRuntime).toHaveBeenCalledWith(expect.objectContaining({ loader }));

    wrapper.unmount();
  });

  it("imports GLB files through the default asset workspace using the Workbench loader", async () => {
    const editor = markRaw(createEditor());
    const scene = new Group();
    const loader: EditorRuntimeOptions["loader"] = {
      load: vi.fn(async () => scene),
      analyze: vi.fn(async () => ({ scene }))
    };
    const urls = mockObjectUrls();
    const wrapper = mount(EditorWorkbench, {
      props: { editor, loader, rendererFactory: fakeRenderer }
    });

    const input = wrapper.find('[aria-label="Import assets"]').element as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "robot.glb", { type: "model/gltf-binary" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file]
    });
    await wrapper.find('[aria-label="Import assets"]').trigger("change");
    await waitForAssertion(() => {
      expect(wrapper.find('[aria-label="Asset import queue"]').text()).toContain("Imported asset-");
    });

    expect(loader.analyze).toHaveBeenCalledWith(expect.objectContaining({
      uri: "blob:vue-workbench-0",
      mimeType: "model/gltf-binary"
    }));
    expect(wrapper.find('[aria-label="Asset workspace rows"]').text()).toContain("robot.glb");
    expect(wrapper.find('[aria-label="Asset workspace rows"]').text()).toContain("glb");
    expect(Object.values(editor.getSnapshot().objects)[0]).toMatchObject({
      name: "robot",
      asset: { kind: "glb", label: "robot.glb" }
    });
    urls.restore();
    wrapper.unmount();
  });

  it("keeps failed import queue rows visible while committing successful batch assets", async () => {
    const editor = markRaw(createEditor());
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer }
    });
    const input = wrapper.find('[aria-label="Import assets"]').element as HTMLInputElement;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [
        new File([new Uint8Array([1])], "paint.png", { type: "image/png" }),
        new File([new Uint8Array([2])], "notes.txt", { type: "text/plain" })
      ]
    });

    await wrapper.find('[aria-label="Import assets"]').trigger("change");
    await waitForAssertion(() => {
      expect(Object.values(editor.getSnapshot().assets)).toEqual([
        expect.objectContaining({ kind: "texture", label: "paint.png" })
      ]);
    });

    expect(wrapper.find('[aria-label="Asset import queue"]').text()).toContain("paint.png");
    expect(wrapper.find('[aria-label="Asset import queue"]').text()).toContain("Unsupported asset type");
    expect(wrapper.find('[aria-label="Asset workspace rows"]').text()).toContain("texture");
    wrapper.unmount();
  });

  it("filters asset rows using core workspace search semantics", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture", label: "Panel paint", source: new Uint8Array([1]) } });
    editor.dispatch({ type: "register-asset", asset: { id: "image-a", kind: "image", label: "Manual label", source: new Uint8Array([2]) } });
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer }
    });
    const expectedIds = filterAssetWorkspaceItems(
      buildAssetWorkspaceModel(editor.getSnapshot(), {
        payloads: editor.getAssetWorkspacePayloads()
      }).items,
      { query: "manual" }
    ).map((item) => item.id);

    await wrapper.find('[aria-label="Search assets"]').setValue("manual");
    await nextTick();

    expect(expectedIds).toEqual(["image-a"]);
    expect(wrapper.find('[aria-label="Asset workspace rows"]').text()).toContain("Manual label");
    expect(wrapper.find('[aria-label="Asset workspace rows"]').text()).not.toContain("Panel paint");
    wrapper.unmount();
  });

  it("reimports GLB assets from the default asset row through core remap API", async () => {
    const editor = markRaw(createEditor());
    const initialManifest = createWorkbenchManifest();
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      name: "Robot arm",
      asset: {
        id: "asset-a",
        label: "robot.glb",
        source: new Uint8Array([1, 2, 3]),
        metadata: attachGlbImportManifestMetadata(undefined, initialManifest)
      },
      expandImportedTargets: true
    });
    const replacementManifest = withPrimitivePath(createWorkbenchManifest(), "meshes/panel/primitives/0");
    const loader: EditorRuntimeOptions["loader"] = {
      load: vi.fn(async () => new Group()),
      analyze: vi.fn(async () => ({ scene: new Group(), manifest: replacementManifest }))
    };
    const reimport = vi.spyOn(editor, "reimportGlbAsset");
    const urls = mockObjectUrls();
    const wrapper = mount(EditorWorkbench, {
      props: { editor, loader, rendererFactory: fakeRenderer }
    });
    const project = vi.spyOn(editor.getRuntime()!, "project");
    const projectCallsBeforeReimport = project.mock.calls.length;

    const input = wrapper.find('[aria-label="Reimport robot.glb"]').element as HTMLInputElement;
    const file = new File([new Uint8Array([4, 5, 6])], "robot-v2.glb", { type: "model/gltf-binary" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file]
    });
    await wrapper.find('[aria-label="Reimport robot.glb"]').trigger("change");
    await waitForAssertion(() => {
      expect(reimport).toHaveBeenCalledWith(expect.objectContaining({
        assetId: "asset-a",
        source: file,
        loader
      }));
    });

    await waitForAssertion(() => {
      expect(wrapper.text()).toContain("remapped");
    });
    expect(editor.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
    expect(Object.values(editor.getSnapshot().nodes).some((node) =>
      node.kind === "imported" && node.importKey === "glb:object-a/primitive:meshes/panel/primitives/0"
    )).toBe(true);
    expect(project).toHaveBeenCalledTimes(projectCallsBeforeReimport + 2);
    urls.restore();
    wrapper.unmount();
  });

  it("routes default project open and export controls through core project APIs", async () => {
    const source = markRaw(createEditor());
    source.dispatch({
      type: "import-glb",
      objectId: "restored-object",
      name: "Restored robot",
      asset: { id: "restored-asset", label: "restored.glb", source: new Uint8Array([1, 2, 3]) }
    });
    const packageBytes = source.exportProject().packageBytes as Uint8Array;
    const editor = markRaw(createEditor());
    const importProject = vi.spyOn(editor, "importProject");
    const exportProject = vi.spyOn(editor, "exportProject");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer }
    });

    const fileInput = wrapper.find(".ek-workbench__file-input").element as HTMLInputElement;
    const file = new File([packageBytes], "restored.ek3d", { type: "application/octet-stream" });
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [file]
    });
    await wrapper.find(".ek-workbench__file-input").trigger("change");
    await nextTick();

    expect(wrapper.text()).toContain("Opened restored.ek3d");
    expect(importProject.mock.calls[0]?.[0]).toBeInstanceOf(Uint8Array);
    expect(wrapper.text()).toContain("Restored robot");

    await wrapper.find('[title="Export complete project"]').trigger("click");
    await nextTick();

    expect(exportProject).toHaveBeenLastCalledWith({ partial: false });
    expect(wrapper.text()).toContain("Exported project");
    wrapper.unmount();
  });

  it("renders the install-ready default shell when no slots are provided", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Robot arm", asset: { id: "asset-a", label: "robot.glb" } });
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });

    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer }
    });

    expect(wrapper.find('[aria-label="Editor controls"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Project panel"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="3D viewport"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Inspector panel"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Editor status"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Hierarchy");
    expect(wrapper.text()).toContain("Assets");
    expect(wrapper.text()).toContain("Project");
    expect(wrapper.text()).toContain("Robot arm");
    expect(wrapper.text()).toContain("robot.glb");
    expect(wrapper.text()).toContain("Project Partial");
    expect(wrapper.text()).toContain("Selection none");

    await wrapper.find('[title="Select all"]').trigger("click");
    await nextTick();

    expect(wrapper.text()).toContain("Selection 2 nodes");
    wrapper.unmount();
  });

  it("selects hierarchy rows through core node selection and updates inspector and status", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Assembly" });
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Robot arm", asset: { id: "asset-a", label: "robot.glb" }, parentId: "group-a" });

    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer }
    });

    await wrapper.findAll(".ek-workbench__tree-row").find((button) => button.text().includes("Robot arm"))!.trigger("click");
    await nextTick();

    expect(editor.getSnapshot().selection.nodeId).toBe("object-a");
    expect(wrapper.text()).toContain("Selection Robot arm");
    const transformSection = wrapper.findAll(".ek-inspector-section").find((section) => section.text().includes("Transform"));
    expect(transformSection?.text()).toContain("Position X");
    wrapper.unmount();
  });

  it("edits material slots through the default Workbench inspector", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      name: "Panel",
      asset: {
        id: "asset-a",
        label: "panel.glb",
        metadata: attachGlbImportManifestMetadata(undefined, createWorkbenchManifest({ twoSlots: true }))
      },
      expandImportedTargets: true
    });
    editor.dispatch({ type: "select-node", nodeId: "object-a" });
    const slotId = getWorkbenchSlotIds(editor)[1]!;
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer }
    });

    const screenTarget = wrapper.findAll(".ek-material-target-option").find((option) => option.text().includes("Screen"));
    expect(screenTarget).toBeTruthy();
    await screenTarget!.find('input[type="radio"]').setValue(true);
    await wrapper.findAll('input[type="color"]')[0].setValue("#336699");

    expect(editor.getSnapshot().materials.assignments[`material-slot:object-a:${slotId}`]).toMatchObject({
      target: { kind: "material-slot", objectId: "object-a", slotId }
    });
    expect(editor.getSnapshot().materials.assignments["object:object-a"]).toBeUndefined();
    expect(JSON.stringify(editor.getSnapshot())).not.toContain("ek-material-target");
    wrapper.unmount();
  });

  it("supports explicit left/right slot overrides while keeping sidePanel compatible", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });

    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer },
      slots: {
        leftPanel: ({ assets, project, snapshot }) =>
          h("span", `Left ${Object.keys(snapshot.assets).length}:${project.exportProject().ok ? "exportable" : "blocked"}:${typeof assets.replaceAsset}`),
        rightPanel: ({ inspector }) => h("span", `Right ${inspector.selection.count}`)
      }
    });

    expect(wrapper.text()).toContain("Left 1:blocked:function");
    expect(wrapper.text()).toContain("Right 0");
    expect(wrapper.text()).not.toContain("Hierarchy");
    expect(wrapper.text()).not.toContain("Transform");

    wrapper.unmount();

    const compatible = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer },
      slots: {
        sidePanel: ({ selection, history, transform, camera, problems }) =>
          h("span", `Side ${selection.count}:${history.undoCount}:${transform.mode}:${camera.ready ? "ready" : "missing"}:${problems.totalCount}`),
        rightPanel: ({ editor }) => h("span", `Custom right ${editor.disposed ? "disposed" : "usable"}`)
      }
    });

    await nextTick();

    expect(compatible.text()).toContain("Side 0:1:translate:ready:0");
    expect(compatible.text()).toContain("Custom right usable");
    compatible.unmount();
  });

  it("can hide the default toolbar while preserving scoped slots", async () => {
    const editor = markRaw(createEditor());
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer, showDefaultToolbar: false },
      slots: {
        toolbar: ({ runtimeReady }) => h("span", `Runtime ${runtimeReady ? "ready" : "missing"}`)
      }
    });

    await nextTick();

    expect(wrapper.find('[title="Move mode"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Runtime ready");

    wrapper.unmount();
  });

  it("routes light list choices through node selection and exposes node-aware context", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    editor.dispatch({ type: "add-light", light: { id: "light-b", kind: "point" } });

    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer },
      slots: {
        status: ({ activeLightId, selectedNodeId, selectedNodeKind, selectedObjectId, selectedLightId }) =>
          h("span", `Active ${activeLightId ?? "none"} · Node ${selectedNodeId}:${selectedNodeKind} · Object ${selectedObjectId ?? "none"} · Light ${selectedLightId ?? "none"}`)
      }
    });

    expect(wrapper.text()).toContain("Active none · Node object-a:object · Object object-a · Light none");

    await wrapper.findAll(".ek-inspector-light-list button")[1].trigger("click");
    await nextTick();

    expect(editor.getSnapshot().selection).toMatchObject({
      nodeId: "light-b",
      nodeIds: ["light-b"],
      objectId: null,
      objectIds: []
    });
    expect(wrapper.text()).toContain("Active light-b · Node light-b:light · Object none · Light light-b");
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

  it("forwards interaction options and runtime readiness through workbench", async () => {
    const editor = markRaw(createEditor());
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    const interactions: EditorRuntimeOptions["interactions"] = {
      camera: { enableDamping: true },
      pointerSelection: true,
      marqueeSelection: { defaultMode: "add" },
      resize: true,
      selectionVisuals: true,
      transform: true
    };
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor,
        interactions,
        rendererFactory: fakeRenderer
      },
      slots: {
        status: ({ runtimeReady }) => h("span", `Runtime ${runtimeReady ? "ready" : "missing"}`)
      }
    });

    await nextTick();

    expect(mountRuntime).toHaveBeenCalledWith(expect.objectContaining({ interactions }));
    expect(wrapper.emitted("runtimeReady")?.[0]?.[0]).toEqual(expect.objectContaining({ disposed: false }));
    expect(wrapper.text()).toContain("Runtime ready");

    wrapper.unmount();

    expect(wrapper.emitted("runtimeReady")?.at(-1)?.[0]).toBeNull();
  });

  it("keeps marquee selection off by default and enables it from the toolbar", async () => {
    const editor = markRaw(createEditor());
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor,
        rendererFactory: fakeRenderer
      }
    });

    expect(mountRuntime).toHaveBeenCalledWith(expect.objectContaining({
      interactions: expect.objectContaining({
        pointerSelection: true,
        marqueeSelection: false,
        viewportHelpers: true
      })
    }));
    const viewport = wrapper.find(".ek-workbench__viewport");
    expect(viewport.exists()).toBe(true);
    const marqueeButton = wrapper.findAll("button").find((candidate) => candidate.text() === "Marquee");
    expect(marqueeButton?.attributes("aria-pressed")).toBe("false");

    await marqueeButton!.trigger("click");

    expect(wrapper.findAll("button").find((candidate) => candidate.text() === "Marquee")?.attributes("aria-pressed")).toBe("true");
    expect(mountRuntime).toHaveBeenLastCalledWith(expect.objectContaining({
      interactions: expect.objectContaining({
        marqueeSelection: true
      })
    }));

    wrapper.unmount();
  });

  it("uses default Workbench interactions when the interactions prop is explicitly undefined", () => {
    const editor = markRaw(createEditor());
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor,
        interactions: undefined,
        rendererFactory: fakeRenderer
      }
    });

    expect(mountRuntime).toHaveBeenCalledWith(expect.objectContaining({
      interactions: expect.objectContaining({
        pointerSelection: true,
        marqueeSelection: false,
        viewportHelpers: true
      })
    }));

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

  it("routes problem-panel replacement files through the core project API", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const replaceAsset = vi.spyOn(editor, "replaceAsset");
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor,
        resolver: new AssetResolverBridge(() => null),
        rendererFactory: fakeRenderer
      }
    });

    await editor.getRuntime()?.project();
    await nextTick();

    const file = new File([new Uint8Array([1, 2, 3])], "box.glb", { type: "model/gltf-binary" });
    const input = wrapper.find(".ek-inspector-file-action input").element as HTMLInputElement;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file]
    });
    await wrapper.find(".ek-inspector-file-action input").trigger("change");

    expect(replaceAsset).toHaveBeenCalledWith({
      assetId: "asset-a",
      source: file,
      label: "box.glb",
      mimeType: "model/gltf-binary"
    });
    wrapper.unmount();
  });

  it("surfaces missing asset recovery in the default left panel", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", label: "Missing box" } });
    const replaceAsset = vi.spyOn(editor, "replaceAsset");
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor,
        resolver: new AssetResolverBridge(() => null),
        rendererFactory: fakeRenderer
      }
    });

    await editor.getRuntime()?.project();
    await nextTick();

    expect(wrapper.find('[aria-label="Missing asset recovery"]').exists()).toBe(true);
    const input = wrapper.find('[aria-label="Missing asset recovery"] input').element as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "recovered.glb", { type: "model/gltf-binary" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file]
    });
    await wrapper.find('[aria-label="Missing asset recovery"] input').trigger("change");
    await waitForAssertion(() => {
      expect(wrapper.find('[aria-label="Missing asset recovery"]').exists()).toBe(false);
      expect(wrapper.text()).toContain("Problems 0");
    });

    expect(replaceAsset).toHaveBeenCalledWith({
      assetId: "asset-a",
      source: file,
      label: "recovered.glb",
      mimeType: "model/gltf-binary"
    });
    expect(editor.exportProject().ok).toBe(true);
    wrapper.unmount();
  });

  it("does not dispose a host-owned editor on unmount", () => {
    const editor = markRaw(createEditor());
    const wrapper = mount(EditorWorkbench, { props: { editor, rendererFactory: fakeRenderer } });

    wrapper.unmount();

    expect(editor.disposed).toBe(false);
    expect(editor.getSnapshot().version).toBe(5);
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
    expect(workbench.exportProject().ok).toBe(true);

    wrapper.unmount();
    expect(editor.disposed).toBe(false);
  });

  it("refreshes useWorkbench asset workspace after payload-only replacement", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    let workbench!: ReturnType<typeof useWorkbench>;
    const Harness = defineComponent({
      setup() {
        workbench = useWorkbench({ editor });
        return () => null;
      }
    });
    const wrapper = mount(Harness);

    expect(workbench.model.value.assets.workspace!.items.find((asset) => asset.id === "asset-a")?.payloadStatus).toBe("missing");
    await editor.replaceAsset({ assetId: "asset-a", source: new Uint8Array([1, 2, 3]) });
    await nextTick();

    expect(workbench.model.value.assets.workspace!.items.find((asset) => asset.id === "asset-a")?.payloadStatus).toBe("available");
    wrapper.unmount();
  });

  it("keeps activeLightId as a writable compatibility selector for light nodes only", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    editor.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    let workbench!: ReturnType<typeof useWorkbench>;
    const Harness = defineComponent({
      setup() {
        workbench = useWorkbench({ editor });
        return () => null;
      }
    });
    const wrapper = mount(Harness);

    workbench.activeLightId.value = null;
    await nextTick();
    expect(editor.getSnapshot().selection.nodeId).toBe("object-a");

    workbench.activeLightId.value = "light-a";
    await nextTick();
    expect(editor.getSnapshot().selection.nodeId).toBe("light-a");

    workbench.activeLightId.value = null;
    await nextTick();
    expect(editor.getSnapshot().selection.nodeId).toBeNull();

    wrapper.unmount();
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

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

async function waitForAssertion(assertion: () => void, timeout = 1000): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeout) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
      await flushPromises();
    }
  }
  throw lastError;
}

function mockObjectUrls(): {
  createObjectURL: ReturnType<typeof vi.fn>;
  revokeObjectURL: ReturnType<typeof vi.fn>;
  restore(): void;
} {
  let count = 0;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const createObjectURL = vi.fn(() => `blob:vue-workbench-${count++}`);
  const revokeObjectURL = vi.fn();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  return {
    createObjectURL,
    revokeObjectURL,
    restore() {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  };
}

function createWorkbenchManifest(options: { twoSlots?: boolean } = {}) {
  return createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name: "Panel", mesh: 0 }],
          meshes: [{
            name: "Panel mesh",
            primitives: options.twoSlots
              ? [
                  { attributes: { POSITION: 0 }, material: 0 },
                  { attributes: { POSITION: 1 }, material: 1 }
                ]
              : [{ attributes: { POSITION: 0 }, material: 0 }]
          }],
          materials: options.twoSlots ? [{ name: "Body" }, { name: "Screen" }] : [{ name: "Red" }]
        }
      }
    }
  });
}

function getWorkbenchSlotIds(editor: ReturnType<typeof createEditor>) {
  return Object.values(editor.getSnapshot().nodes)
    .filter((node) => node.kind === "imported")
    .flatMap((node) => node.materialSlots?.map((slot) => slot.slotKey) ?? []);
}

function withPrimitivePath(manifest: ReturnType<typeof createWorkbenchManifest>, path: string) {
  const mesh = manifest.meshes[0]!;
  const primitive = mesh.primitives[0]!;
  return {
    ...manifest,
    meshes: [{
      ...mesh,
      primitives: [{
        ...primitive,
        path
      }]
    }]
  };
}
