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
import { expectAuthoredValuesPresent, expectNoI18nDurableLeakage, expectNoRuntimeOnlyLeakage } from "../../test/i18n-durable-sentinels";
import { decodeProjectPackageText, resolveProjectPackageBytes, seedI18nDurableEditor } from "../../test/i18n-durable-fixture";

describe("Vue EditorWorkbench", () => {
  it("distinguishes blocked complete exports from explicit partial packages and updates repaired diagnostics", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const urls = mockObjectUrls();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer, defaultLocale: "zh-CN" },
      slots: { rightPanel: () => null }
    });

    await wrapper.get('button[aria-controls^="project-menu"]').trigger("click");
    await wrapper.get('[title="导出完整项目"]').trigger("click");
    await waitForAssertion(() => expect(wrapper.text()).toContain("无法完整导出：资源载荷缺失"));
    expect(urls.createObjectURL).not.toHaveBeenCalled();

    await wrapper.get('[aria-label="问题详情"]').trigger("click");
    const drawer = wrapper.get('[aria-label="问题详情"]');
    expect(drawer.text()).toContain("资源 asset-a 没有可导出的载荷");

    await wrapper.get('button[aria-controls^="project-menu"]').trigger("click");
    await wrapper.get('[title="导出部分项目"]').trigger("click");
    await waitForAssertion(() => expect(wrapper.text()).toContain("已导出部分项目"));
    expect(urls.createObjectURL).toHaveBeenCalled();

    const input = drawer.get("input").element as HTMLInputElement;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([new Uint8Array([1, 2, 3])], "repaired.glb")]
    });
    await drawer.get("input").trigger("change");
    await waitForAssertion(() => expect(drawer.text()).not.toContain("无法完整导出"));

    await wrapper.get('button[aria-controls^="project-menu"]').trigger("click");
    await wrapper.get('[title="导出完整项目"]').trigger("click");
    await waitForAssertion(() => expect(wrapper.text()).toContain("已导出项目"));

    urls.restore();
    wrapper.unmount();
  });

  it("keeps failed project-open diagnostics in the drawer without replacing the scene", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "add-group", groupId: "keep", name: "Keep me" });
    const wrapper = mount(EditorWorkbench, {
      attachTo: document.body,
      props: { editor, rendererFactory: fakeRenderer },
      slots: { rightPanel: () => null }
    });
    const before = editor.serialize();

    await wrapper.get('button[aria-controls^="project-menu"]').trigger("click");
    const input = wrapper.get('[aria-label="Open project package"]');
    const file = new File(["invalid"], "broken.ek3d");
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode("invalid").buffer
    });
    Object.defineProperty(input.element, "files", { configurable: true, value: [file] });
    await input.trigger("change");
    await wrapper.get('[aria-label="Problem details"]').trigger("click");
    const drawer = wrapper.get('.ek-workbench__problems-drawer[aria-label="Problem details"]');
    await waitForAssertion(() => expect(drawer.text()).toContain("Project Archive Invalid"));
    expect(editor.serialize()).toEqual(before);

    await drawer.get("button").trigger("click");
    await wrapper.get('[aria-label="Problem details"]').trigger("click");
    expect(drawer.text()).toContain("Project Archive Invalid");
    wrapper.unmount();
  });

  it("keeps project commands in a dismissible global menu with the locale switch", async () => {
    const editor = markRaw(createEditor());
    const wrapper = mount(EditorWorkbench, {
      attachTo: document.body,
      props: { editor, rendererFactory: fakeRenderer },
      slots: { rightPanel: () => null }
    });
    const trigger = wrapper.get('button[aria-controls^="project-menu"]');
    expect(wrapper.find('[title="Export complete project"]:not([disabled])').isVisible()).toBe(false);

    await trigger.trigger("click");
    const menu = wrapper.get('[role="region"][aria-label="Project actions"]');
    expect(menu.text()).toContain("Open");
    expect(menu.text()).toContain("Export partial");
    await menu.get('[aria-label="Language"]').setValue("zh-CN");
    expect(editor.getRuntime()).toBeTruthy();

    await menu.get('[aria-label="语言"]').trigger("keydown", { key: "Escape" });
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger.element);

    await trigger.trigger("click");
    document.querySelector<HTMLElement>('[aria-label="3D 视口"]')?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();
    expect(trigger.attributes("aria-expanded")).toBe("false");
    wrapper.unmount();
  });

  it("reports rejected asynchronous project bytes as an error without downloading", async () => {
    const editor = markRaw(createEditor());
    const rejected = createDeferred<Uint8Array>();
    vi.spyOn(editor, "exportProject").mockReturnValueOnce({
      ok: true,
      packageBytes: rejected.promise,
      problems: []
    });
    const urls = mockObjectUrls();
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer },
      slots: { rightPanel: () => null }
    });

    await wrapper.get('button[aria-controls^="project-menu"]').trigger("click");
    await wrapper.get('[title="Export complete project"]').trigger("click");
    rejected.reject(new Error("archive stream failed"));
    await waitForAssertion(() => expect(wrapper.text()).toContain("Project export failed"));
    expect(urls.createObjectURL).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("archive stream failed");

    urls.restore();
    wrapper.unmount();
  });

  it.each(["material", "camera"] as const)("reports a rejected %s edit, translates it and retries the same draft", async (kind) => {
    const editor = markRaw(createEditor());
    if (kind === "material") {
      editor.dispatch({ type: "import-glb", objectId: "target", asset: { id: "asset" } });
    } else {
      editor.dispatch({ type: "create-camera-view", view: { id: "target" } });
    }
    editor.dispatch({ type: "select-node", nodeId: "target" });
    const wrapper = mount(EditorWorkbench, { props: { editor, rendererFactory: fakeRenderer, locale: "en" } });
    const field = kind === "camera" ? wrapper.get('[aria-label="FOV"]')
      : wrapper.findAll("label").find((label) => label.text() === "Opacity")!.get("input");
    const before = editor.getSnapshot();
    // The host-supplied Editor command boundary can reject an otherwise valid draft.
    vi.spyOn(editor, "dispatch").mockReturnValueOnce({ ok: false, snapshot: before, error: "Host rejected edit" });
    await field.setValue(kind === "camera" ? "35" : "0.5");
    await field.trigger("keydown", { key: "Enter" });
    expect(editor.getSnapshot()).toEqual(before);
    expect(field.attributes("aria-invalid")).toBe("true");
    expect(wrapper.get('[role="alert"]').text()).toContain("Host rejected edit");
    await wrapper.setProps({ locale: "zh-CN" });
    expect(wrapper.get('[role="alert"]').text()).toContain(kind === "camera" ? "更新相机视图失败" : "材质编辑失败");
    await field.trigger("keydown", { key: "Enter" });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    if (kind === "camera") expect(editor.getSnapshot().cameras.target.projection.fov).toBe(35);
    else expect(editor.getSnapshot().materials.definitions["material:object:target"].override.opacity).toBe(0.5);
    wrapper.unmount();
  });

  it("disables empty clipboard paste and refreshes it after scoped-slot copy", async () => {
    const editor = markRaw(createEditor());
    // Host implementations may inherit their operations instead of using own properties.
    Object.defineProperty(editor, "operations", { value: Object.create(editor.operations) });
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer },
      slots: { toolbar: ({ operations }) => [
        h("button", { "data-host-copy": "", onClick: () => operations.copy() }, "Host copy"),
        h("button", { "data-host-paste": "", onClick: () => operations.paste() }, "Host paste")
      ] }
    });
    const paste = () => wrapper.findAll("button").find((button) => button.text() === "Paste")!;
    expect(paste().attributes("disabled")).toBeDefined();
    expect(paste().attributes("title")).toBe("Copy a node before pasting.");
    await wrapper.get('[data-host-copy]').trigger("click");
    expect(paste().attributes("disabled")).toBeUndefined();
    await wrapper.get('[data-host-paste]').trigger("click");
    expect(Object.keys(editor.getSnapshot().objects)).toHaveLength(2);
    wrapper.unmount();
  });

  it("organizes nodes through real operations and preserves native editing in host controls", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const wrapper = mount(EditorWorkbench, {
      attachTo: document.body,
      props: { editor, rendererFactory: fakeRenderer },
      slots: { toolbar: () => [h("input", { type: "number" }), h("textarea"), h("select", [h("option", "One")]), h("div", { contenteditable: "true", role: "textbox" }, "Notes")] }
    });
    const trigger = wrapper.get('[aria-label="Node operations"]');
    const command = async (name: string) => {
      await trigger.trigger("click");
      const panel = wrapper.get(`#${trigger.attributes("aria-controls")}`);
      await panel.findAll("button").find((button) => button.text() === name)!.trigger("click");
      expect(trigger.attributes("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(trigger.element);
    };
    await command("Copy");
    await waitForAssertion(() => {
      expect(wrapper.findAll("button").find((button) => button.text() === "Paste")!.attributes("disabled")).toBeUndefined();
    });
    await command("Paste");
    expect(Object.keys(editor.getSnapshot().objects)).toHaveLength(2);
    await command("Duplicate");
    expect(Object.keys(editor.getSnapshot().objects)).toHaveLength(3);
    await command("Delete");
    expect(Object.keys(editor.getSnapshot().objects)).toHaveLength(2);
    await wrapper.get('[aria-label="Undo"]').trigger("click");
    expect(Object.keys(editor.getSnapshot().objects)).toHaveLength(3);
    await wrapper.get('[aria-label="Redo"]').trigger("click");
    expect(Object.keys(editor.getSnapshot().objects)).toHaveLength(2);
    await command("Select all");
    await command("Group");
    expect(editor.getSnapshot().objects[editor.getSnapshot().selection.objectId!].children).toHaveLength(1);
    await command("Ungroup");
    expect(Object.values(editor.getSnapshot().objects).every((object) => object.parentId === null)).toBe(true);
    await command("Clear");
    expect(editor.getSnapshot().selection.nodeIds).toEqual([]);
    for (const mode of ["move", "rotate", "scale"]) await wrapper.get(`[title="Toggle ${mode} snap"]`).trigger("click");
    await wrapper.get('[title="Scale mode"]').trigger("click");
    const snapshot = editor.getSnapshot();
    for (const control of wrapper.get(".ek-workbench__toolbar-region").findAll("input, textarea, select, [contenteditable]")) {
      for (const event of [{ key: "w" }, { key: "z", ctrlKey: true }, { key: "e", ctrlKey: true, altKey: true }]) {
        const keydown = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...event });
        expect(control.element.dispatchEvent(keydown)).toBe(true);
      }
    }
    expect(editor.getSnapshot()).toEqual(snapshot);
    expect(editor.transformMode.get()).toBe("scale");
    expect(editor.snap.get()).toEqual({ translate: 0.5, rotate: Math.PI / 12, scale: 0.1 });
    await wrapper.get('[title="Toggle move snap"]').trigger("click");
    expect(editor.snap.get()).toEqual({ translate: null, rotate: Math.PI / 12, scale: 0.1 });
    await trigger.trigger("click");
    await wrapper.get("textarea").trigger("pointerdown");
    expect(trigger.attributes("aria-expanded")).toBe("false");
    wrapper.unmount();
  });

  it.each(["en", "zh-CN"] as const)("explains unavailable node operations from Core in %s", async (locale) => {
    const editor = markRaw(createEditor());
    const wrapper = mount(EditorWorkbench, { props: { editor, defaultLocale: locale, rendererFactory: fakeRenderer } });
    const label = (en: string, zh: string) => locale === "en" ? en : zh;
    await wrapper.get(`[aria-label="${label("Node operations", "节点操作")}"]`).trigger("click");
    const copy = wrapper.findAll("button").find((button) => button.text() === label("Copy", "复制"))!;
    expect(copy.attributes("disabled")).toBeDefined();
    expect(copy.attributes("title")).toBe(label("Select a node first.", "请先选择节点。"));
    editor.dispatch({ type: "create-camera-view", view: { id: "view-a" } });
    const camera = Object.values(editor.getSnapshot().nodes).find((node) => node.kind === "camera")!;
    editor.dispatch({ type: "select-node", nodeId: camera.id });
    await nextTick();
    expect(copy.attributes("title")).toBe(label("Camera nodes cannot be copied or grouped.", "相机节点不能复制或组合。"));
    wrapper.unmount();
  });

  it("lets Escape clear selection from direct tools but only dismisses an open group", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const wrapper = mount(EditorWorkbench, { attachTo: document.body, props: { editor, rendererFactory: fakeRenderer } });
    const trigger = wrapper.get('[aria-label="Node operations"]');
    await trigger.trigger("click");
    await trigger.trigger("keydown", { key: "Escape" });
    expect(editor.getSnapshot().selection.objectId).toBe("object-a");
    expect(document.activeElement).toBe(trigger.element);
    await wrapper.get('[title="Move mode"]').trigger("keydown", { key: "Escape" });
    expect(editor.getSnapshot().selection.nodeIds).toEqual([]);
    wrapper.unmount();
  });

  it("keeps light and camera selection and search drafts across locale and panel changes", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "add-light", light: { id: "light-a", name: "Key light", kind: "point" } });
    editor.dispatch({ type: "create-camera-view", view: { id: "camera-a", name: "Front view" } });
    const wrapper = mount(EditorWorkbench, { props: { editor, rendererFactory: fakeRenderer } });
    await wrapper.get('[title="Key light"]').trigger("click");
    expect(editor.getSnapshot().nodes[editor.getSnapshot().selection.nodeId!].kind).toBe("light");
    expect(wrapper.text()).toContain("Selection Key light");
    await wrapper.get('[title="Front view"]').trigger("click");
    expect(editor.getSnapshot().nodes[editor.getSnapshot().selection.nodeId!].kind).toBe("camera");
    expect(wrapper.text()).toContain("Selection Front view");
    await wrapper.get('input[type="search"]').setValue("Front");
    const before = editor.getSnapshot();
    const history = editor.getHistoryState();
    const runtime = editor.getRuntime();
    const canvas = wrapper.get("canvas").element;
    await openPanelView(wrapper, "Assets");
    await wrapper.get('[aria-label="Resize left panel"]').trigger("keydown", { key: "ArrowRight" });
    await openPanelView(wrapper, "Scene");
    await wrapper.get('[aria-label="Language"]').setValue("zh-CN");
    expect(wrapper.get(".ek-workbench__hierarchy-search").text()).toBe("搜索层级");
    expect((wrapper.get('input[type="search"]').element as HTMLInputElement).value).toBe("Front");
    expect(wrapper.text()).toContain("选择 Front view");
    expect(editor.getSnapshot()).toEqual(before);
    expect(editor.getHistoryState()).toEqual(history);
    expect(editor.getRuntime()).toBe(runtime);
    expect(wrapper.get("canvas").element).toBe(canvas);
    await wrapper.get('input[type="search"]').setValue("absent");
    expect(wrapper.text()).toContain("没有匹配的节点");
    wrapper.unmount();
  });

  it("synchronizes modifier selection and reveals imported descendants through live slot context", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Robot", asset: {
      id: "asset-a", metadata: attachGlbImportManifestMetadata(undefined, createWorkbenchManifest({ twoSlots: true }))
    }, expandImportedTargets: true });
    const imported = Object.values(editor.getSnapshot().nodes).find((node) => node.kind === "imported")!;
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer },
      slots: { toolbar: ({ snapshot, dispatch }) => h("button", {
        "data-host-selection": snapshot.selection.nodeIds.join(","),
        onClick: () => dispatch({ type: "select-node", nodeId: imported.id })
      }, "Locate imported target") }
    });
    const hierarchy = wrapper.get('[aria-label="Hierarchy"]');
    const importedButton = () => hierarchy.findAll(".ek-workbench__tree-row").find((row) => row.text().startsWith(imported.name))!;
    await hierarchy.get('[title="Robot"]').trigger("click");
    await importedButton().trigger("click", { ctrlKey: true });
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-a", imported.id]);
    expect(wrapper.text()).toContain("Selection 2 nodes");
    expect(wrapper.get('[data-host-selection]').attributes("data-host-selection")).toBe(`object-a,${imported.id}`);
    expect(importedButton().attributes("aria-pressed")).toBe("true");
    await importedButton().trigger("click", { metaKey: true });
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-a"]);
    await importedButton().trigger("click", { shiftKey: true });
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-a", imported.id]);
    await importedButton().trigger("click", { altKey: true });
    expect(editor.getSnapshot().selection.nodeIds).toEqual(["object-a"]);
    await hierarchy.get('[aria-label="Collapse Robot"]').trigger("click");
    await hierarchy.get('input[type="search"]').setValue("absent");
    await openPanelView(wrapper, "Assets");
    await wrapper.get('[data-host-selection]').trigger("click");
    await openPanelView(wrapper, "Scene");
    expect((hierarchy.get('input[type="search"]').element as HTMLInputElement).value).toBe("");
    expect(importedButton().attributes("aria-pressed")).toBe("true");
    expect(wrapper.text()).toContain(`Selection ${imported.name}`);
    expect(wrapper.get('[aria-label="Position X"]').exists()).toBe(true);
    await wrapper.get('[title="Clear selection"]').trigger("click");
    expect(editor.getSnapshot().selection.nodeIds).toEqual([]);
    expect(importedButton().attributes("aria-pressed")).toBe("false");
    wrapper.unmount();
  });

  it("searches descendants and retains collapsed branches across navigation without changing the scene", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Assembly" });
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Robot arm", asset: { id: "asset-a" }, parentId: "group-a" });
    const wrapper = mount(EditorWorkbench, { props: { editor, rendererFactory: fakeRenderer } });
    const hierarchy = wrapper.get('[aria-label="Hierarchy"]');
    const before = editor.getSnapshot();
    await hierarchy.get('[aria-label="Collapse Assembly"]').trigger("click");
    expect(hierarchy.text()).not.toContain("Robot arm");
    await hierarchy.get('input[type="search"]').setValue("  ROBOT  ");
    expect(hierarchy.text()).toContain("Assembly");
    expect(hierarchy.text()).toContain("Robot arm");
    await openPanelView(wrapper, "Assets");
    await openPanelView(wrapper, "Scene");
    expect((hierarchy.get('input[type="search"]').element as HTMLInputElement).value).toBe("  ROBOT  ");
    await hierarchy.get('input[type="search"]').setValue("absent");
    expect(hierarchy.get('[role="status"]').text()).toBe("No matching nodes");
    await hierarchy.get('input[type="search"]').setValue("");
    expect(hierarchy.text()).not.toContain("Robot arm");
    await hierarchy.get('[aria-label="Expand Assembly"]').trigger("click");
    expect(hierarchy.text()).toContain("Robot arm");
    expect(editor.getSnapshot()).toEqual(before);
    wrapper.unmount();
  });

  it("opens secondary tools with the keyboard and restores focus when dismissed", async () => {
    const wrapper = mount(EditorWorkbench, {
      attachTo: document.body,
      props: { editor: markRaw(createEditor()), rendererFactory: fakeRenderer }
    });
    const trigger = wrapper.get('button[aria-label="Viewport helpers"]');
    await trigger.trigger("click");
    const panel = wrapper.get(`#${trigger.attributes("aria-controls")}`);
    expect(panel.attributes("hidden")).toBeUndefined();
    expect(panel.element.contains(document.activeElement)).toBe(true);
    await panel.trigger("keydown", { key: "Escape" });
    expect(panel.attributes("hidden")).toBeDefined();
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  it("keeps panel navigation, widths and locale in the shell without replacing the runtime", async () => {
    const editor = markRaw(createEditor());
    const ready = vi.fn();
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer, onRuntimeReady: ready }
    });
    await waitForAssertion(() => expect(ready).toHaveBeenCalled());
    const canvas = wrapper.find("canvas").element;
    const snapshot = editor.serialize();
    const left = wrapper.get('[aria-label="Resize left panel"]');
    await left.trigger("keydown", { key: "Home" });
    expect(left.attributes("aria-valuenow")).toBe("220");
    await left.trigger("keydown", { key: "ArrowRight" });
    expect(left.attributes("aria-valuenow")).toBe("236");
    await openPanelView(wrapper, "Assets");
    await wrapper.get('[aria-label="Search assets"]').setValue("keep this filter");
    await openPanelView(wrapper, "Assets");
    expect(wrapper.get('[aria-label="Project panel"]').attributes("hidden")).toBeDefined();
    await wrapper.get('[aria-label="Expand left panel"]').trigger("click");
    expect((wrapper.get('[aria-label="Search assets"]').element as HTMLInputElement).value).toBe("keep this filter");
    await wrapper.get('[aria-label="Language"]').setValue("zh-CN");
    expect(wrapper.get('[aria-label="调整左面板宽度"]').attributes("aria-valuenow")).toBe("236");
    expect(wrapper.find("canvas").element).toBe(canvas);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(editor.serialize()).toEqual(snapshot);
    wrapper.unmount();
  });

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
    const frameAll = vi.spyOn(runtime!, "frameAll");
    const captureCameraView = vi.spyOn(runtime!, "captureCameraView");
    const applyCameraView = vi.spyOn(runtime!, "applyCameraView");
    const operationResult = { ok: true as const, snapshot: editor.getSnapshot() };
    const copy = vi.spyOn(editor.operations, "copy");
    const paste = vi.spyOn(editor.operations, "paste").mockReturnValue(operationResult);
    const duplicate = vi.spyOn(editor.operations, "duplicate").mockReturnValue(operationResult);
    const remove = vi.spyOn(editor.operations, "delete").mockReturnValue(operationResult);
    const group = vi.spyOn(editor.operations, "group").mockReturnValue(operationResult);
    const ungroup = vi.spyOn(editor.operations, "ungroup").mockReturnValue(operationResult);
    const selectAll = vi.spyOn(editor.operations, "selectAll").mockReturnValue(operationResult);
    const clearSelection = vi.spyOn(editor.operations, "clearSelection").mockReturnValue(operationResult);

    await wrapper.find('[title="Rotate mode"]').trigger("click");
    await nextTick();
    expect(editor.transformMode.get()).toBe("rotate");
    expect(wrapper.find('[title="Rotate mode"]').attributes("aria-pressed")).toBe("true");

    await wrapper.find('[title="Scale mode"]').trigger("click");
    await nextTick();
    expect(editor.transformMode.get()).toBe("scale");
    expect(wrapper.find('[title="Scale mode"]').attributes("aria-pressed")).toBe("true");

    await wrapper.find('[title="Toggle move snap"]').trigger("click");
    await nextTick();
    expect(editor.snap.get().translate).toBe(0.5);
    expect(wrapper.find('[title="Toggle move snap"]').attributes("aria-pressed")).toBe("true");

    await wrapper.find('[title="Toggle rotate snap"]').trigger("click");
    await wrapper.find('[title="Toggle scale snap"]').trigger("click");
    await nextTick();
    expect(editor.snap.get().rotate).toBe(Math.PI / 12);
    expect(editor.snap.get().scale).toBe(0.1);
    expect(wrapper.find('[title="Toggle rotate snap"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.find('[title="Toggle scale snap"]').attributes("aria-pressed")).toBe("true");

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
    expect(Object.values(editor.viewportHelpers.get().visibility)).toEqual([false, false, false, false, false, false, true, true, false]);

    await wrapper.find('[title="Move mode"]').trigger("click");
    await nextTick();
    expect(editor.transformMode.get()).toBe("translate");
    expect(Object.values(editor.viewportHelpers.get().visibility)).toEqual([false, false, false, false, false, false, true, true, false]);
    expect(JSON.stringify(editor.serialize())).not.toContain("viewportHelpers");

    await wrapper.find('[title="Reset camera"]').trigger("click");
    await wrapper.find('[title="Frame selected"]').trigger("click");
    await wrapper.find('[title="Frame all"]').trigger("click");
    expect(resetCamera).toHaveBeenCalledTimes(1);
    expect(frameSelected).toHaveBeenCalledTimes(1);
    expect(frameAll).toHaveBeenCalledTimes(1);

    captureCameraView.mockReturnValueOnce({
      ok: true,
      view: {
        id: "view-a",
        name: "Hero",
        projection: { kind: "perspective", fov: 50 },
        position: [1, 2, 3],
        target: [0, 0, 0],
        near: 0.1,
        far: 1000
      }
    });
    await wrapper.find('[title="Capture camera view"]').trigger("click");
    await nextTick();
    expect(editor.getSnapshot().cameras["view-a"]).toBeDefined();
    await wrapper.find('[title="Apply camera view"]').trigger("click");
    expect(applyCameraView).toHaveBeenCalledWith(editor.getSnapshot().cameras["view-a"]);

    await wrapper.find('[title="Duplicate selection"]').trigger("click");
    await wrapper.find('[title="Copy selection"]').trigger("click");
    await wrapper.find('[title="Paste objects"]').trigger("click");
    await wrapper.find('[title="Delete selection"]').trigger("click");
    await wrapper.find('[title="Select all"]').trigger("click");
    await wrapper.find('[title="Clear selection"]').trigger("click");
    editor.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
    editor.dispatch({ type: "select-nodes", mode: "replace", nodeIds: ["object-a", "object-b"], primaryNodeId: "object-a" });
    await nextTick();
    await wrapper.find('[title="Group selection"]').trigger("click");
    editor.dispatch({ type: "create-group", nodeId: "group-a", name: "Group A" });
    editor.dispatch({ type: "select-node", nodeId: "group-a" });
    await nextTick();
    await wrapper.find('[title="Ungroup selection"]').trigger("click");
    expect(duplicate).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(paste).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(group).toHaveBeenCalledTimes(1);
    expect(ungroup).toHaveBeenCalledTimes(1);
    expect(selectAll).toHaveBeenCalledTimes(1);
    expect(clearSelection).toHaveBeenCalledTimes(1);

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

    await openPanelView(wrapper, "Assets");
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
    const importedAssetId = Object.values(editor.getSnapshot().objects)[0]?.asset.id;

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

    await wrapper.find(".ek-workbench__locale-switcher select").setValue("zh-CN");
    await nextTick();

    expect(wrapper.find('[aria-label="资源导入队列"]').text()).toContain(`已导入 ${importedAssetId}`);
    expect(wrapper.find('[aria-label="资源工作区行"]').text()).toContain("robot.glb");
    urls.restore();
    wrapper.unmount();
  });

  it("keeps failed import queue rows visible while committing successful batch assets", async () => {
    const editor = markRaw(createEditor());
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer }
    });
    await openPanelView(wrapper, "Assets");
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
    expect(wrapper.find('[aria-label="Asset workspace rows"]').text()).toContain("Texture");
    wrapper.unmount();
  });

  it("keeps every result in a batch larger than eight files", async () => {
    const editor = markRaw(createEditor());
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer }
    });
    await openPanelView(wrapper, "Assets");
    const input = wrapper.find('[aria-label="Import assets"]').element as HTMLInputElement;
    const files = Array.from({ length: 10 }, (_, index) => new File(["unsupported"], `notes-${index}.txt`));
    Object.defineProperty(input, "files", {
      configurable: true,
      value: files
    });

    await wrapper.find('[aria-label="Import assets"]').trigger("change");
    await waitForAssertion(() => {
      expect(wrapper.findAll('[aria-label="Asset import queue"] li')).toHaveLength(10);
    });
    for (const file of files) {
      expect(wrapper.find('[aria-label="Asset import queue"]').text()).toContain(file.name);
    }
    wrapper.unmount();
  });

  it("keeps same-name queue entries independent across imports in the same millisecond", async () => {
    const editor = markRaw(createEditor());
    const snapshot = editor.getSnapshot();
    vi.spyOn(Date, "now").mockReturnValue(42);
    const importWorkbenchAssets = vi.spyOn(editor, "importWorkbenchAssets")
      .mockResolvedValueOnce([{
        label: "same.png",
        kind: "image",
        status: "succeeded",
        assetId: "first-image",
        committed: true,
        diagnostics: [],
        snapshot
      }])
      .mockResolvedValueOnce([{
        label: "same.png",
        kind: "image",
        status: "failed",
        committed: false,
        diagnostics: [{
          id: "second-failed",
          severity: "error",
          code: "test-failure",
          title: "Second import failed"
        }],
        snapshot
      }]);
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer }
    });
    try {
      await openPanelView(wrapper, "Assets");
      const upload = async () => {
        const input = wrapper.find('[aria-label="Import assets"]');
        Object.defineProperty(input.element, "files", {
          configurable: true,
          value: [new File([new Uint8Array([1])], "same.png", { type: "image/png" })]
        });
        await input.trigger("change");
        await flushPromises();
      };

      await upload();
      expect(importWorkbenchAssets).toHaveBeenCalledTimes(1);
      expect(wrapper.findAll('[aria-label="Asset import queue"] li[data-status="succeeded"]')).toHaveLength(1);
      await upload();
      expect(importWorkbenchAssets).toHaveBeenCalledTimes(2);
      expect(wrapper.findAll('[aria-label="Asset import queue"] li[data-status="succeeded"]')).toHaveLength(1);
      expect(wrapper.findAll('[aria-label="Asset import queue"] li[data-status="failed"]')).toHaveLength(1);
    } finally {
      vi.restoreAllMocks();
      wrapper.unmount();
    }
  });

  it("replaces an available image and retains feedback across filters", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "register-asset", asset: { id: "image-a", kind: "image", label: "Original image", source: new Uint8Array([1]) } });
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer }
    });
    await openPanelView(wrapper, "Assets");
    const input = wrapper.find('[aria-label="Replace Original image"]').element as HTMLInputElement;
    const file = new File([new Uint8Array([2, 3, 4])], "updated.png", { type: "image/png" });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file]
    });

    await wrapper.find('[aria-label="Replace Original image"]').trigger("change");
    await waitForAssertion(() => {
      expect(wrapper.find('[aria-label="Asset workspace rows"]').text()).toContain("Replaced with updated.png");
    });
    expect(editor.getAssetWorkspacePayloads().find((payload) => payload.assetId === "image-a")?.byteSize).toBe(3);
    await wrapper.find('[aria-label="Search assets"]').setValue("no-match");
    await wrapper.find('[aria-label="Search assets"]').setValue("");
    expect(wrapper.find('[aria-label="Asset workspace rows"]').text()).toContain("Replaced with updated.png");
    wrapper.unmount();
  });

  it("shows every referencing object and imports dropped rasters with the chosen intent", async () => {
    const editor = markRaw(createEditor());
    for (const name of ["Arm", "Body", "Wheel", "Cabin"]) {
      editor.dispatch({ type: "import-glb", objectId: name, name, asset: { id: "shared", label: "Shared model" } });
    }
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer }
    });
    await openPanelView(wrapper, "Assets");
    const rows = wrapper.find('[aria-label="Asset workspace rows"]');
    expect(rows.text()).toContain("4 refs");
    for (const name of ["Arm", "Body", "Wheel", "Cabin"]) {
      expect(rows.text()).toContain(name);
    }

    await wrapper.find('[aria-label="Raster intent"]').setValue("image");
    const file = new File([new Uint8Array([1])], "backdrop.png", { type: "image/png" });
    await wrapper.find(".ek-workbench__asset-import").trigger("drop", {
      dataTransfer: { files: [file] }
    });
    await waitForAssertion(() => {
      expect(Object.values(editor.getSnapshot().assets)).toContainEqual(expect.objectContaining({ kind: "image", label: "backdrop.png" }));
    });
    expect(wrapper.find('[aria-label="Asset import queue"]').text()).toContain("succeeded · Image");
    wrapper.unmount();
  });

  it("filters asset rows using core workspace search semantics", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "register-asset", asset: { id: "texture-a", kind: "texture", label: "Panel paint", source: new Uint8Array([1]) } });
    editor.dispatch({ type: "register-asset", asset: { id: "image-a", kind: "image", label: "Manual label", source: new Uint8Array([2]) } });
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer }
    });
    await openPanelView(wrapper, "Assets");
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
    await wrapper.find('[aria-label="Search assets"]').setValue("");
    await wrapper.find('[aria-label="Kind"]').setValue("texture");
    expect(wrapper.find('[aria-label="Asset workspace rows"]').text()).toContain("Panel paint");
    expect(wrapper.find('[aria-label="Asset workspace rows"]').text()).not.toContain("Manual label");
    await wrapper.find('[aria-label="Status"]').setValue("missing-payload");
    expect(wrapper.text()).toContain("No matching assets");
    await wrapper.find('[aria-label="Status"]').setValue("all");
    await wrapper.find('[aria-label="Kind"]').setValue("all");
    await wrapper.find('[aria-label="Sort"]').setValue("label");
    const labels = wrapper.findAll(".ek-workbench__asset-row-main > span").map((label) => label.text());
    expect(labels).toEqual(["Manual label", "Panel paint"]);
    wrapper.unmount();
  });

  it.each([false, true])("serializes GLB maintenance and preserves the latest payload/remap (older fails: %s)", async (olderFails) => {
    const editor = markRaw(createEditor());
    editor.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: {
        id: "asset-a",
        label: "robot.glb",
        source: new Uint8Array([1]),
        metadata: attachGlbImportManifestMetadata(undefined, createWorkbenchManifest())
      }
    });
    const first = createDeferred<{ scene: Group; manifest: ReturnType<typeof createWorkbenchManifest> }>();
    const second = createDeferred<{ scene: Group; manifest: ReturnType<typeof createWorkbenchManifest> }>();
    const loader: EditorRuntimeOptions["loader"] = {
      load: async () => new Group(),
      analyze: vi.fn(async () => ({ scene: new Group(), manifest: createWorkbenchManifest() }))
    };
    const urls = mockObjectUrls();
    const wrapper = mount(EditorWorkbench, {
      props: { editor, loader, rendererFactory: fakeRenderer }
    });
    await openPanelView(wrapper, "Assets");
    await editor.getRuntime()!.project();
    vi.mocked(loader.analyze!).mockClear().mockImplementation(async (resolved) => {
      if (resolved.metadata?.byteSize === 3) {
        return first.promise;
      }
      if (resolved.metadata?.byteSize === 4) {
        return second.promise;
      }
      return { scene: new Group(), manifest: createWorkbenchManifest() };
    });
    const input = wrapper.find('[aria-label="Reimport robot.glb"]');
    const inputElement = input.element as HTMLInputElement;
    Object.defineProperty(inputElement, "files", {
      configurable: true,
      value: [new File([new Uint8Array([1, 2, 3])], "older.glb", { type: "model/gltf-binary" })]
    });
    await input.trigger("change");
    await waitForAssertion(() => expect(loader.analyze).toHaveBeenCalledTimes(1));
    const newerInput = wrapper.find('[aria-label="Reimport robot.glb"]');
    Object.defineProperty(newerInput.element, "files", {
      configurable: true,
      value: [new File([new Uint8Array([4, 5, 6, 7])], "newer.glb", { type: "model/gltf-binary" })]
    });
    await newerInput.trigger("change");
    await flushPromises();
    expect(loader.analyze).toHaveBeenCalledTimes(1);

    if (olderFails) {
      first.reject(new Error("Older analysis failed"));
    } else {
      first.resolve({ scene: new Group(), manifest: withPrimitivePath(createWorkbenchManifest(), "meshes/older/primitives/0") });
    }
    await waitForAssertion(() => {
      expect(loader.analyze).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ byteSize: 4 }) }));
    });
    second.resolve({ scene: new Group(), manifest: withPrimitivePath(createWorkbenchManifest(), "meshes/newer/primitives/0") });
    await waitForAssertion(() => {
      expect(wrapper.text()).toContain("remapped");
    });

    expect(editor.getSnapshot().objects["object-a"].asset.id).toBe("asset-a");
    expect(editor.getAssetWorkspacePayloads().find((item) => item.assetId === "asset-a")?.byteSize).toBe(4);
    expect(Object.values(editor.getSnapshot().nodes).some((node) =>
      node.kind === "imported" && node.importKey === "glb:object-a/primitive:meshes/newer/primitives/0"
    )).toBe(true);
    urls.restore();
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
    await openPanelView(wrapper, "Assets");
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

    await wrapper.find(".ek-workbench__locale-switcher select").setValue("zh-CN");
    await nextTick();

    expect(wrapper.text()).toContain("个重映射");
    expect(wrapper.text()).toContain("robot.glb");
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

    await wrapper.find(".ek-workbench__locale-switcher select").setValue("zh-CN");
    await nextTick();
    expect(wrapper.text()).toContain("已打开 restored.ek3d");

    await wrapper.find(".ek-workbench__locale-switcher select").setValue("en");
    await nextTick();
    await wrapper.find('[title="Export complete project"]').trigger("click");
    await nextTick();

    expect(exportProject).toHaveBeenLastCalledWith({ partial: false });
    expect(wrapper.text()).toContain("Exported project");

    await wrapper.find(".ek-workbench__locale-switcher select").setValue("zh-CN");
    await nextTick();
    expect(wrapper.text()).toContain("已导出项目");
    wrapper.unmount();
  });

  it("localizes project failure statuses while preserving raw problem details", async () => {
    const editor = markRaw(createEditor());
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer, defaultLocale: "en" }
    });
    const fileInput = wrapper.find(".ek-workbench__file-input").element as HTMLInputElement;
    const file = new File([new Uint8Array([123, 34, 109, 34, 58, 49, 125])], "broken.ek3d", { type: "application/octet-stream" });
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [file]
    });

    await wrapper.find(".ek-workbench__file-input").trigger("change");
    await waitForAssertion(() => {
      expect(wrapper.text()).toContain("Project Archive Invalid");
      expect(wrapper.text()).toContain("invalid zip data");
    });

    await wrapper.find(".ek-workbench__locale-switcher select").setValue("zh-CN");
    await nextTick();

    expect(wrapper.text()).toContain("项目包无效");
    expect(wrapper.text()).toContain("invalid zip data");
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
    expect(wrapper.find(".ek-workbench__command-button svg").exists()).toBe(true);
    expect(wrapper.find(".ek-workbench__navigation").exists()).toBe(true);
    expect(wrapper.find(".ek-inspector-summary").exists()).toBe(true);
    expect(wrapper.find(".ek-workbench__status-chip").exists()).toBe(true);
    expect(wrapper.text()).toContain("Hierarchy");
    expect(wrapper.text()).toContain("Scene");
    expect(wrapper.text()).toContain("Assets");
    expect(wrapper.text()).toContain("Project");
    expect(wrapper.text()).toContain("Robot arm");
    expect(wrapper.text()).toContain("Project Partial");
    expect(wrapper.text()).toContain("Selection none");
    expect(wrapper.text()).toContain("No editable selection");
    expect(wrapper.find('[aria-label="Hierarchy"]').attributes("hidden")).toBeUndefined();
    expect(wrapper.find('[aria-label="Assets"]').attributes("hidden")).toBeDefined();
    expect(wrapper.find('[aria-label="Project"]').attributes("hidden")).toBeDefined();

    await wrapper.findAll(".ek-workbench__nav-button").find((button) => button.text().includes("Assets"))!.trigger("click");
    await nextTick();
    expect(wrapper.find('[aria-label="Assets"]').attributes("hidden")).toBeUndefined();
    expect(wrapper.text()).toContain("robot.glb");

    await wrapper.findAll(".ek-workbench__nav-button").find((button) => button.text().includes("Project"))!.trigger("click");
    await nextTick();
    expect(wrapper.find('[aria-label="Project"]').attributes("hidden")).toBeUndefined();

    await wrapper.find('[title="Select all"]').trigger("click");
    await nextTick();

    expect(wrapper.text()).toContain("Selection 2 nodes");
    expect(JSON.stringify(editor.serialize())).not.toContain("activeView");
    expect(JSON.stringify(editor.serialize())).not.toContain("Scene");
    wrapper.unmount();
  });

  it("renders default workbench chrome in Simplified Chinese without translating authored values", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Robot arm", asset: { id: "asset-a", label: "robot.glb" } });

    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer, locale: "zh-CN" }
    });

    expect(wrapper.find('[aria-label="编辑器控件"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="项目面板"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="3D 视口"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="检查器面板"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="编辑器状态"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="场景检查器"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("层级");
    expect(wrapper.text()).toContain("资源");
    expect(wrapper.text()).toContain("项目");
    expect(wrapper.text()).toContain("变换");
    expect(wrapper.text()).toContain("材质");
    expect(wrapper.text()).toContain("环境");
    expect(wrapper.text()).toContain("灯光");
    expect(wrapper.text()).toContain("相机视图");
    expect(wrapper.text()).toContain("问题");
    expect(wrapper.text()).toContain("选择可变换节点以编辑变换。");
    expect(wrapper.text()).toContain("选择 GLB 对象以编辑材质覆盖。");
    expect(wrapper.text()).toContain("添加灯光以编辑场景灯光。");
    expect(wrapper.text()).toContain("捕获相机视图以编写展示状态。");
    expect(wrapper.text()).toContain("没有运行时问题。");
    expect(wrapper.findAll("label").some((label) => label.text().includes("灯光源"))).toBe(true);
    expect(wrapper.find('[aria-label="添加灯光"]').exists()).toBe(true);
    expect(wrapper.findAll("button").some((button) => button.text() === "纯色背景")).toBe(true);
    expect(wrapper.text()).toContain("选择 无");
    expect(wrapper.text()).toContain("Robot arm");
    expect(wrapper.text()).not.toContain("Hierarchy");
    await openPanelView(wrapper, "资源");
    expect(wrapper.text()).toContain("robot.glb");
    await openPanelView(wrapper, "场景");

    await wrapper.findAll(".ek-workbench__tree-row").find((button) => button.text().includes("Robot arm"))!.trigger("click");
    await nextTick();
    const positionInput = wrapper.get('[aria-label="位置 X"]');
    const opacityLabel = wrapper.findAll("label").find((label) => label.text().includes("不透明度"));
    if (!positionInput.exists() || !opacityLabel) {
      throw new Error("Localized transform/material fields were not rendered");
    }
    expect((positionInput.element as HTMLInputElement).value).toBe("0");
    await opacityLabel.find("input").setValue("2");
    await opacityLabel.find("input").trigger("blur");
    await nextTick();
    expect(wrapper.text()).toMatch(/输入无效：.*less than or equal to 1/);
    expect(wrapper.text()).toContain("选择 Robot arm");

    expect(JSON.stringify(editor.serialize())).not.toContain("zh-CN");
    expect(JSON.stringify(editor.serialize())).not.toContain("层级");

    wrapper.unmount();
  });

  it("switches uncontrolled locale without changing editor state or viewport helper state", async () => {
    const editor = markRaw(createEditor());
    const mountRuntime = vi.spyOn(editor, "mountRuntime");
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Robot arm", asset: { id: "asset-a" } });
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer, defaultLocale: "en" }
    });

    await waitForAssertion(() => {
      expect(wrapper.find('[title="Toggle viewport grid"]').attributes("aria-pressed")).toBe("true");
    });
    const mountCallsBeforeSwitch = mountRuntime.mock.calls.length;
    await wrapper.find('[title="Toggle viewport grid"]').trigger("click");
    const helperState = editor.viewportHelpers.get();
    const snapshotBefore = editor.serialize();
    const selector = wrapper.find(".ek-workbench__locale-switcher select");

    await selector.setValue("zh-CN");
    await nextTick();

    expect(wrapper.text()).toContain("层级");
    expect(wrapper.text()).toContain("Robot arm");
    expect(wrapper.emitted("update:locale")?.[0]).toEqual(["zh-CN"]);
    expect(mountRuntime).toHaveBeenCalledTimes(mountCallsBeforeSwitch);
    expect(editor.viewportHelpers.get()).toEqual(helperState);
    expect(editor.serialize()).toEqual(snapshotBefore);
    expect(JSON.stringify(editor.serialize())).not.toContain("locale");
    wrapper.unmount();
  });

  it("renders grouped status chips with counts, tones, and problem breakdown", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", name: "Missing box", asset: { id: "asset-a" } });
    editor.dispatch({ type: "select-object", objectId: "object-a" });
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor,
        resolver: new AssetResolverBridge(() => null),
        rendererFactory: fakeRenderer
      }
    });

    await editor.getRuntime()?.project();
    await nextTick();

    const status = wrapper.get('[aria-label="Editor status"]');
    const chips = status.findAll(".ek-workbench__status-chip");
    expect(chips).toHaveLength(9);
    expect(chips.map((chip) => chip.find("strong").exists() ? chip.find("strong").text() : "")).toEqual([
      "Selection",
      "History",
      "Runtime",
      "Snap",
      "Project",
      "Assets",
      "Save",
      "Problems",
      ""
    ]);
    expect(chips[0].attributes("data-tone")).toBe("active");
    expect(chips[0].text()).toContain("Selection Missing box");
    expect(chips[1].text()).toContain("Undo 2");
    expect(chips[2].attributes("data-tone")).toBe("success");
    expect(chips[4].attributes("data-tone")).toBe("warning");
    expect(chips[5].attributes("data-tone")).toBe("warning");
    expect(chips[6].attributes("data-tone")).toBe("warning");
    expect(chips[7].attributes("data-tone")).toBe("warning");
    expect(chips[7].text()).toContain("Problems 1");
    expect(chips[8].text()).toContain("Authored 0 · Runtime 1 · Project 0");

    await wrapper.find(".ek-workbench__locale-switcher select").setValue("zh-CN");
    await nextTick();
    expect(wrapper.get('[aria-label="编辑器状态"]').text()).toContain("问题 1");
    expect(wrapper.get('[aria-label="编辑器状态"]').text()).toContain("作者 0 · 运行时 1 · 项目 0");
    wrapper.unmount();
  });

  it("supports controlled locale, hidden switch, disabled switch, host translation override, and locale emits", async () => {
    const editor = markRaw(createEditor());
    const onLocaleChange = vi.fn();
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor,
        rendererFactory: fakeRenderer,
        locale: "en",
        showLocaleSwitcher: false,
        "onUpdate:locale": onLocaleChange,
        translate: (descriptor, locale) =>
          descriptor.key === "reactWorkbench.toolbar.project.open.label" && locale === "zh-CN"
            ? "Host open"
            : undefined
      }
    });

    expect(wrapper.find(".ek-workbench__locale-switcher").exists()).toBe(false);
    await wrapper.setProps({ locale: "zh-CN" });
    await nextTick();
    expect(wrapper.text()).toContain("Host open");

    await wrapper.setProps({ locale: "en", showLocaleSwitcher: true });
    await nextTick();
    let selector = wrapper.find(".ek-workbench__locale-switcher select");
    await selector.setValue("zh-CN");
    await nextTick();

    expect(onLocaleChange).toHaveBeenCalledWith("zh-CN");
    expect(wrapper.emitted("update:locale")?.[0]).toEqual(["zh-CN"]);
    expect(wrapper.text()).toContain("Open");
    expect(wrapper.text()).not.toContain("Host open");

    await wrapper.setProps({ locale: "zh-CN" });
    await nextTick();
    expect(wrapper.text()).toContain("Host open");

    onLocaleChange.mockClear();
    await wrapper.setProps({ localeSwitcherDisabled: true });
    selector = wrapper.find(".ek-workbench__locale-switcher select");
    expect((selector.element as HTMLSelectElement).disabled).toBe(true);
    await selector.trigger("change");
    expect(onLocaleChange).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("exposes i18n helpers through scoped slots and direct useWorkbench", async () => {
    const editor = markRaw(createEditor());
    const wrapper = mount(EditorWorkbench, {
      props: { editor, rendererFactory: fakeRenderer, locale: "zh-CN" },
      slots: {
        status: ({ i18n }) => h("span", `${i18n.locale}:${i18n.t("reactWorkbench.status.dirty")}`)
      }
    });

    expect(wrapper.text()).toContain("zh-CN:未保存");
    wrapper.unmount();

    let locale = "zh-CN" as const;
    let workbench!: ReturnType<typeof useWorkbench>;
    const Harness = defineComponent({
      setup() {
        workbench = useWorkbench({ editor, locale });
        return () => null;
      }
    });
    const direct = mount(Harness);

    expect(workbench.context.value.i18n.locale).toBe("zh-CN");
    expect(workbench.context.value.i18n.t("reactWorkbench.toolbar.project.open.label")).toBe("打开");
    direct.unmount();
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
    expect(transformSection?.find('[aria-label="Position X"]').exists()).toBe(true);
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
      props: { editor, rendererFactory: fakeRenderer, locale: "en" },
      slots: { toolbar: ({ editor: contextEditor, snapshot, dispatch }) => h("button", {
        "data-inspector-host": snapshot.selection.nodeId,
        onClick: () => dispatch({ type: "select-node", nodeId: "object-a" })
      }, String(contextEditor === editor)) }
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
    const runtime = editor.getRuntime();
    const snapshot = editor.getSnapshot();
    const history = editor.getHistoryState();
    await wrapper.get('.ek-workbench__locale-switcher select').setValue("zh-CN");
    expect(wrapper.emitted("update:locale")?.at(-1)).toEqual(["zh-CN"]);
    await wrapper.setProps({ locale: "zh-CN" });
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual(["属性", "环境", "场景"]);
    expect((wrapper.findAll(".ek-material-target-option").find((option) => option.text().includes("Screen"))!.get("input").element as HTMLInputElement).checked).toBe(true);
    expect(editor.getSnapshot()).toEqual(snapshot);
    expect(editor.getHistoryState()).toEqual(history);
    expect(editor.getRuntime()).toBe(runtime);
    expect(wrapper.get('[data-inspector-host]').attributes("data-inspector-host")).toBe("object-a");
    expect(wrapper.get('[data-inspector-host]').text()).toBe("true");
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "环境")!.trigger("click");
    expect(wrapper.get('[aria-label="灯光强度"]').exists()).toBe(true);
    await wrapper.findAll('[role="tab"]').find((tab) => tab.text() === "属性")!.trigger("click");
    await wrapper.setProps({ locale: "en" });
    editor.undo();
    await nextTick();
    expect(editor.getSnapshot().materials.assignments[`material-slot:object-a:${slotId}`]).toBeUndefined();
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
        sidePanel: () => h("span", "Legacy slot must yield to leftPanel"),
        rightPanel: ({ inspector }) => h("span", `Right ${inspector.selection.count}`)
      }
    });

    expect(wrapper.text()).toContain("Left 1:blocked:function");
    expect(wrapper.text()).not.toContain("Legacy slot must yield to leftPanel");
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

  it("renders descriptor-backed missing asset problems in zh-CN", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", label: "Missing box" } });
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor,
        resolver: new AssetResolverBridge(() => null),
        rendererFactory: fakeRenderer,
        locale: "zh-CN"
      }
    });

    await editor.getRuntime()?.project();
    await nextTick();
    await openPanelView(wrapper, "资源");

    const inspector = wrapper.find('[aria-label="场景检查器"]');
    expect(wrapper.find('[aria-label="缺失资源恢复"]').exists()).toBe(true);
    expect(inspector.text()).toContain("问题");
    expect(inspector.text()).toContain("无法解析资源");
    expect(inspector.text()).toContain("资源 asset-a 缺失或不可用。");
    expect(inspector.text().replace(/\s+/g, " ")).toContain("警告 · 资源解析器 · asset-a · 替换资源");
    expect(wrapper.text()).toContain("Missing box");
    expect(JSON.stringify(editor.serialize())).not.toContain("zh-CN");
    expect(JSON.stringify(editor.serialize())).not.toContain("无法解析资源");

    wrapper.unmount();
  });

  it("keeps locale interactions and replacement files out of serialized and exported state", async () => {
    const editor = markRaw(createEditor());
    seedI18nDurableEditor(editor);
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor,
        resolver: new AssetResolverBridge(() => null),
        rendererFactory: fakeRenderer,
        locale: "en",
        showLocaleSwitcher: false,
        translate: (descriptor, locale) =>
          descriptor.key === "reactWorkbench.toolbar.project.open.label" && locale === "zh-CN"
            ? "宿主打开"
            : undefined
      }
    });

    await wrapper.setProps({ locale: "zh-CN", localeSwitcherDisabled: true, showLocaleSwitcher: true });
    await nextTick();
    await wrapper.findAll(".ek-workbench__tree-row").find((button) => button.text().includes("Pump A"))!.trigger("click");
    const positionInput = wrapper.get('[aria-label="位置 X"]');
    expect(positionInput.exists()).toBe(true);
    await positionInput.setValue("2");
    await positionInput.trigger("blur");
    const replacementFile = new File([new Uint8Array([10, 11, 12, 13])], "motor-control-panel.glb", { type: "model/gltf-binary" });
    await editor.replaceAsset({
      assetId: "asset-a",
      source: replacementFile,
      label: replacementFile.name,
      mimeType: replacementFile.type
    });
    await nextTick();

    const exported = editor.exportProject({ partial: true });
    const serialized = editor.serialize();
    const packageBytes = await resolveProjectPackageBytes(exported.packageBytes);
    const packageText = decodeProjectPackageText(packageBytes);

    expect(packageBytes).toBeInstanceOf(Uint8Array);
    expect(serialized.objects["object-a"].transform.position[0]).toBe(2);
    expect(editor.getAssetWorkspacePayloads().find((payload) => payload.assetId === "asset-a")?.byteSize).toBe(4);
    expectAuthoredValuesPresent(serialized);
    expectAuthoredValuesPresent(packageText);
    expectNoI18nDurableLeakage(serialized);
    expectNoI18nDurableLeakage(packageText);
    expectNoRuntimeOnlyLeakage(serialized);
    expectNoRuntimeOnlyLeakage(packageText);
    expect(JSON.stringify(serialized)).not.toContain("宿主打开");
    expect(packageText).not.toContain("宿主打开");
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
    await openPanelView(wrapper, "Assets");

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
    expect(wrapper.find('[aria-label="Asset recovery status"]').text()).toContain("Replaced with recovered.glb");
    const nextProject = markRaw(createEditor());
    nextProject.dispatch({
      type: "import-glb",
      objectId: "next-object",
      name: "Next box",
      asset: { id: "next-asset", label: "next.glb", source: new Uint8Array([4, 5, 6]) }
    });
    editor.importProject(await resolveProjectPackageBytes(nextProject.exportProject().packageBytes));
    await nextTick();
    await waitForAssertion(() => {
      expect(wrapper.find('[aria-label="Asset recovery status"]').exists()).toBe(false);
      expect(wrapper.text()).toContain("Next box");
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

  it("keeps stale overlapping missing-asset replacements from overwriting newer success feedback", async () => {
    const editor = markRaw(createEditor());
    editor.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", label: "Missing box" } });
    const replaceAssetOriginal = editor.replaceAsset.bind(editor);
    const first = createDeferred<Awaited<ReturnType<typeof editor.replaceAsset>>>();
    const replaceAsset = vi.spyOn(editor, "replaceAsset").mockReturnValueOnce(first.promise);
    const wrapper = mount(EditorWorkbench, {
      props: {
        editor,
        resolver: new AssetResolverBridge(() => null),
        rendererFactory: fakeRenderer
      }
    });

    await editor.getRuntime()?.project();
    await nextTick();
    await openPanelView(wrapper, "Assets");
    const input = wrapper.find('[aria-label="Missing asset recovery"] input');
    const inputElement = input.element as HTMLInputElement;
    const firstFile = new File([new Uint8Array([1])], "first.glb", { type: "model/gltf-binary" });
    const secondFile = new File([new Uint8Array([2, 3])], "second.glb", { type: "model/gltf-binary" });
    Object.defineProperty(inputElement, "files", { configurable: true, value: [firstFile] });
    await input.trigger("change");
    Object.defineProperty(inputElement, "files", { configurable: true, value: [secondFile] });
    await input.trigger("change");

    expect(replaceAsset).toHaveBeenNthCalledWith(1, expect.objectContaining({ label: "first.glb" }));
    expect(replaceAsset).toHaveBeenCalledTimes(1);
    first.resolve(await replaceAssetOriginal({
      assetId: "asset-a",
      source: firstFile,
      label: "first.glb",
      mimeType: "model/gltf-binary"
    }));
    await waitForAssertion(() => {
      expect(wrapper.find('[aria-label="Asset recovery status"]').text()).toContain("Replaced with second.glb");
    });
    expect(replaceAsset).toHaveBeenNthCalledWith(2, expect.objectContaining({ label: "second.glb" }));
    expect(editor.getAssetWorkspacePayloads().find((item) => item.assetId === "asset-a")?.byteSize).toBe(2);
    expect(wrapper.text()).not.toContain("Replaced with first.glb");
    wrapper.unmount();
  });

  it("does not dispose a host-owned editor on unmount", () => {
    const editor = markRaw(createEditor());
    const wrapper = mount(EditorWorkbench, { props: { editor, rendererFactory: fakeRenderer } });

    wrapper.unmount();

    expect(editor.disposed).toBe(false);
    expect(editor.getSnapshot().version).toBe(8);
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

async function openPanelView(wrapper: ReturnType<typeof mount>, label: string): Promise<void> {
  const tab = wrapper.findAll(".ek-workbench__nav-button").find((button) => button.text().includes(label));
  expect(tab, `Expected panel tab ${label}`).toBeTruthy();
  await tab!.trigger("click");
  await nextTick();
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

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
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
