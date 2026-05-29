import { Group } from "three";
import { describe, expect, it, vi } from "vitest";
import { AssetResolverBridge } from "../assets/resolver";
import { AssetRegistry } from "../assets/registry";
import { CommandDispatcher } from "../commands/dispatcher";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { ThreeEditorRuntime, type RendererLike } from "./editor-runtime";

describe("editor runtime", () => {
  it("projects resolvable GLB objects and updates transform from snapshot changes", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Group() },
      rendererFactory: createFakeRenderer
    });

    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    await runtime.project();
    dispatcher.dispatch({ type: "set-transform", objectId: "object-a", transform: { position: [2, 3, 4] } });
    await runtime.project();

    expect(runtime.getObject("object-a")?.position.toArray()).toEqual([2, 3, 4]);
    runtime.dispose();
  });

  it("dispatches selection commands from picking instead of mutating snapshots directly", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Group() },
      rendererFactory: createFakeRenderer
    });

    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    await runtime.project();
    runtime.pickObject("object-a");

    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "select-object", objectId: "object-a" });
    expect(store.getSnapshot().selection.objectId).toBe("object-a");
    runtime.dispose();
  });

  it("is safe to dispose twice", () => {
    const renderer = createFakeRenderer(document.createElement("div"));
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store: new EditorStore(),
      dispatcher: new CommandDispatcher(new EditorStore(), new CommandHistory(), new AssetRegistry()),
      rendererFactory: () => renderer
    });

    runtime.dispose();
    runtime.dispose();

    expect(runtime.disposed).toBe(true);
  });
});

function createFakeRenderer(container: HTMLElement): RendererLike {
  const canvas = container.ownerDocument.createElement("canvas");
  return {
    domElement: canvas,
    setSize(width, height) {
      canvas.width = width;
      canvas.height = height;
    },
    render: vi.fn(),
    dispose: vi.fn()
  };
}
