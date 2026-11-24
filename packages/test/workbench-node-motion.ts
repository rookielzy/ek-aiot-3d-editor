import { fireEvent, waitFor, within } from "@testing-library/react";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { expect } from "vitest";
import {
  AssetResolverBridge, attachGlbImportManifestMetadata, createEditor, createGlbImportManifest,
  type Editor, type GltfLoaderAdapter, type RendererLike, type SupportedLocale
} from "@ek-aiot/3d-editor-core";

export async function verifyWorkbenchNodeMotion(
  locale: SupportedLocale,
  mountWorkbench: (props: {
    editor: Editor;
    resolver: AssetResolverBridge;
    loader: GltfLoaderAdapter;
    rendererFactory(container: HTMLElement): RendererLike;
    defaultLocale: SupportedLocale;
  }, host: HTMLElement) => { unmount(): void }
) {
  window.localStorage.removeItem("ek-aiot.workbench.locale");
  const editor = createEditor();
  editor.dispatch({
    type: "import-glb", objectId: "fan", name: "Fan", expandImportedTargets: true,
    asset: { id: "fan-asset", metadata: glbMetadata(["Blade"]) }
  });
  editor.dispatch({
    type: "import-glb", objectId: "incomplete", name: "Incomplete model", expandImportedTargets: true,
    asset: { id: "incomplete-asset", metadata: glbMetadata(["Holder", "Missing blade"]) }
  });
  const bladeId = Object.values(editor.getSnapshot().nodes).find((node) => node.name === "Blade")!.id;
  const missingId = Object.values(editor.getSnapshot().nodes).find((node) => node.name === "Missing blade")!.id;
  editor.dispatch({ type: "set-node-motion", nodeId: missingId, motion: { kind: "continuous-spin", axis: "x", degreesPerSecond: 30 } });
  const host = document.createElement("div");
  document.body.append(host);
  const view = mountWorkbench({
    editor,
    resolver: new AssetResolverBridge((asset) => ({ uri: `/${asset.id}.glb` })),
    loader: { load: async (asset) => {
      const model = new Group();
      if (asset.uri === "/fan-asset.glb") {
        const blade = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
        blade.name = "Blade";
        model.add(blade);
      }
      return model;
    } },
    rendererFactory: (container) => {
      container.getBoundingClientRect = () => new DOMRect(0, 0, 240, 240);
      const canvas = container.ownerDocument.createElement("canvas");
      canvas.setPointerCapture = () => {};
      canvas.releasePointerCapture = () => {};
      return {
        domElement: canvas,
        setSize() {}, render() {}, dispose() {}
      };
    },
    defaultLocale: locale
  }, host);
  const labels = locale === "en"
    ? { inspector: "Scene inspector", tab: "Motion", add: "Add continuous spin", speed: "Speed (°/s)", preview: "Preview", stop: "Stop", transform: "Transform", remove: "Remove", missing: "The GLB target could not be resolved for preview." }
    : { inspector: "场景检查器", tab: "动效", add: "添加持续自转", speed: "转速 (°/秒)", preview: "预览", stop: "停止", transform: "变换", remove: "移除", missing: "无法解析 GLB 子节点，暂时无法预览。" };
  try {
    const ui = within(host);
    const inspector = within(ui.getByRole("complementary", { name: labels.inspector, exact: true }));
    const tree = within(ui.getByRole("tree"));
    await waitFor(() => expect(editor.getRuntime()?.getNodeMotionPreviewState?.(bladeId)).toBe("ready"));
    const canvas = host.querySelector("canvas")!;
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 120, button: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 120, button: 0, pointerId: 1 });
    expect(editor.getSnapshot().selection.nodeId).toBe(bladeId);
    const motionTab = await inspector.findByRole("tab", { name: labels.tab, exact: true });
    fireEvent.click(motionTab);
    const motion = within(await inspector.findByRole("tabpanel", { name: labels.tab, exact: true }));
    const button = (name: string) => motion.getByRole<HTMLButtonElement>("button", { name, exact: true });
    const speed = () => motion.getByRole<HTMLInputElement>("spinbutton", { name: labels.speed, exact: true });
    fireEvent.click(button(labels.add));
    await waitFor(() => expect(speed().value).toBe("90"));

    fireEvent.input(speed(), { target: { value: "0" } });
    fireEvent.keyDown(speed(), { key: "Enter" });
    expect(editor.getSnapshot().nodes[bladeId]).toHaveProperty("motion.degreesPerSecond", 90);
    await motion.findByRole("alert");
    fireEvent.input(speed(), { target: { value: "-45" } });
    fireEvent.keyDown(speed(), { key: "Enter" });
    await waitFor(() => expect(editor.getSnapshot().nodes[bladeId]).toHaveProperty("motion.degreesPerSecond", -45));

    await waitFor(() => expect(button(labels.preview).disabled).toBe(false));
    fireEvent.click(button(labels.preview));
    await waitFor(() => expect(button(labels.stop).disabled).toBe(false));
    expect(speed().disabled).toBe(true);
    fireEvent.click(button(labels.stop));
    await waitFor(() => expect(speed().disabled).toBe(false));
    fireEvent.click(button(labels.preview));
    await motion.findByRole("button", { name: labels.stop, exact: true });
    fireEvent.click(inspector.getByRole("tab", { name: labels.transform, exact: true }));
    await waitFor(() => expect(editor.getRuntime()?.getNodeMotionPreviewState?.(bladeId)).toBe("ready"));
    fireEvent.click(motionTab);
    await waitFor(() => expect(speed().disabled).toBe(false));

    fireEvent.click(tree.getByRole("treeitem", { name: "Missing blade" }));
    await waitFor(() => expect(speed().value).toBe("30"));
    await motion.findByText(labels.missing);
    expect(button(labels.preview).disabled).toBe(true);
    fireEvent.click(button(labels.remove));
    await waitFor(() => expect(editor.getSnapshot().nodes[missingId]).not.toHaveProperty("motion"));
    expect(editor.getSnapshot().nodes[bladeId]).toHaveProperty("motion.degreesPerSecond", -45);
  } finally {
    view.unmount();
    editor.dispose();
    host.remove();
  }
}

function glbMetadata(names: string[]) {
  return attachGlbImportManifestMetadata(undefined, createGlbImportManifest({
    gltf: { parser: { json: { scenes: [{ nodes: names.map((_, index) => index) }], nodes: names.map((name) => ({ name })) } } }
  }));
}
