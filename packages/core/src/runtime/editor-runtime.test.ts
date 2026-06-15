import { AmbientLight, BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PointLight, Texture, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { attachGlbImportManifestMetadata, createGlbImportManifest } from "../assets/import-pipeline";
import { AssetResolverBridge } from "../assets/resolver";
import { AssetRegistry } from "../assets/registry";
import { createAuthoredCameraView } from "../cameras/defaults";
import { CommandDispatcher } from "../commands/dispatcher";
import { EditorMarqueeSelectionState } from "../editor/marquee-selection-state";
import { EditorSnapState } from "../editor/snap-state";
import { EditorViewportHelperState } from "../editor/viewport-helper-state";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { ThreeEditorRuntime, type RendererLike, type RuntimeProblemSnapshot } from "./editor-runtime";
import type { ViewportCameraControls } from "./viewport-controls";
import type { RuntimeTransformControls } from "./transform/transform-controls-adapter";
import { EditorTransformModeState } from "./transform/transform-mode";

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

  it("keeps existing render-on-projection and disposal behavior when interactions are disabled", async () => {
    const frames = createFrameScheduler();
    const renderer = createFakeRenderer(document.createElement("div"));
    const container = document.createElement("div");
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Group() },
      rendererFactory: () => renderer,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });

    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    await runtime.project();
    frames.flush();

    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.domElement.parentElement).toBe(container);

    runtime.dispose();

    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.domElement.parentElement).toBeNull();
  });

  it("renders once when camera controls invalidate the viewport without mutating snapshots", async () => {
    const frames = createFrameScheduler();
    const controls = createFakeControls();
    const renderer = createFakeRenderer(document.createElement("div"));
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      interactions: { camera: true },
      rendererFactory: () => renderer,
      cameraControlsFactory: () => controls,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });
    await runtime.project();
    frames.flush();
    const serialized = store.getSnapshot();

    controls.emit("change");
    controls.emit("change");
    frames.flush();

    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toBe(serialized);
    runtime.dispose();
  });

  it("observes container resize and invalidates exactly once per resize callback", () => {
    let resizeCallback: ResizeObserverCallback = () => {};
    const frames = createFrameScheduler();
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { configurable: true, value: 320 });
    Object.defineProperty(container, "clientHeight", { configurable: true, value: 160 });
    const renderer = createFakeRenderer(container);
    const runtime = new ThreeEditorRuntime({
      container,
      store: new EditorStore(),
      dispatcher: new CommandDispatcher(new EditorStore(), new CommandHistory(), new AssetRegistry()),
      interactions: { resize: true },
      rendererFactory: () => renderer,
      resizeObserverFactory: (callback) => {
        resizeCallback = callback;
        return {
          observe: vi.fn(),
          disconnect: vi.fn()
        };
      },
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });

    Object.defineProperty(container, "clientWidth", { configurable: true, value: 640 });
    Object.defineProperty(container, "clientHeight", { configurable: true, value: 320 });
    resizeCallback([], {} as ResizeObserver);
    frames.flush();

    expect(renderer.setSize).toHaveBeenLastCalledWith(640, 320);
    expect(runtime.camera.aspect).toBe(2);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it("frames selected/all objects and resets camera without serializing camera state", async () => {
    const frames = createFrameScheduler();
    const controls = createFakeControls();
    const renderer = createFakeRenderer(document.createElement("div"));
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      interactions: { camera: true },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer,
      cameraControlsFactory: () => controls,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, transform: { position: [4, 0, 0] } });
    dispatcher.dispatch({ type: "select-object", objectId: "object-a" });
    await runtime.project();
    frames.flush();
    const serialized = JSON.stringify(store.getSnapshot());

    expect(runtime.frameSelected()).toBe(true);
    frames.flush();
    expect(controls.target.x).toBeCloseTo(4);

    expect(runtime.frameAll()).toBe(true);
    frames.flush();
    runtime.resetCamera();
    frames.flush();

    expect(controls.target.toArray()).toEqual([0, 0, 0]);
    expect(JSON.stringify(store.getSnapshot())).toBe(serialized);
    runtime.dispose();
  });

  it("captures and applies authored camera views without mutating snapshots", async () => {
    const frames = createFrameScheduler();
    const controls = createFakeControls();
    const renderer = createFakeRenderer(document.createElement("div"));
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      interactions: { camera: true },
      rendererFactory: () => renderer,
      cameraControlsFactory: () => controls,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });
    await runtime.project();
    frames.flush();
    const serialized = JSON.stringify(store.getSnapshot());

    runtime.camera.position.set(7, 8, 9);
    runtime.camera.fov = 60;
    runtime.camera.near = 0.2;
    runtime.camera.far = 700;
    controls.target.set(1, 2, 3);
    const captured = runtime.captureCameraView({ id: "view-a", name: "Runtime" });

    expect(captured.ok).toBe(true);
    expect(captured.ok ? captured.view : null).toMatchObject({
      id: "view-a",
      name: "Runtime",
      projection: { kind: "perspective", fov: 60 },
      position: [7, 8, 9],
      target: [1, 2, 3],
      near: 0.2,
      far: 700
    });

    runtime.applyCameraView(createAuthoredCameraView({
      id: "view-a",
      projection: { kind: "perspective", fov: 35 },
      position: [3, 4, 5],
      target: [0, 1, 0],
      near: 0.5,
      far: 300
    }));
    frames.flush();

    expect(runtime.camera.position.toArray()).toEqual([3, 4, 5]);
    expect(runtime.camera.fov).toBe(35);
    expect(controls.target.toArray()).toEqual([0, 1, 0]);
    expect(renderer.render).toHaveBeenCalled();
    expect(JSON.stringify(store.getSnapshot())).toBe(serialized);
    runtime.dispose();
  });

  it("projects authored camera nodes as runtime targets distinct from the editor camera", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      rendererFactory: createFakeRenderer
    });
    dispatcher.dispatch({
      type: "create-camera-view",
      view: {
        id: "view-a",
        name: "Hero",
        projection: { kind: "perspective", fov: 35 },
        position: [1, 2, 3],
        target: [0, 1, 0],
        near: 0.5,
        far: 300
      }
    });

    await runtime.project();
    const target = runtime.getNodeTarget("view-a");

    expect(target).toBeInstanceOf(PerspectiveCamera);
    expect(target).not.toBe(runtime.camera);
    expect((target as PerspectiveCamera).fov).toBe(35);
    expect((target as PerspectiveCamera).near).toBe(0.5);
    expect((target as PerspectiveCamera).far).toBe(300);
    expect(target?.position.toArray()).toEqual([1, 2, 3]);

    dispatcher.dispatch({ type: "delete-camera-view", viewId: "view-a" });
    await runtime.project();

    expect(runtime.getNodeTarget("view-a")).toBeUndefined();
    runtime.dispose();
  });

  it("frames selected spatial light nodes through runtime node targets", async () => {
    const frames = createFrameScheduler();
    const controls = createFakeControls();
    const renderer = createFakeRenderer(document.createElement("div"));
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      interactions: { camera: true },
      rendererFactory: () => renderer,
      cameraControlsFactory: () => controls,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });
    dispatcher.dispatch({ type: "add-light", light: { id: "point-a", kind: "point", transform: { position: [4, 0, 0] } } });
    dispatcher.dispatch({ type: "select-node", nodeId: "point-a" });
    await runtime.project();
    frames.flush();
    const serialized = JSON.stringify(store.getSnapshot());

    expect(runtime.getNodeTarget("point-a")).toBeInstanceOf(PointLight);
    expect(runtime.frameSelected()).toBe(true);
    frames.flush();

    expect(controls.target.x).toBeCloseTo(4);
    expect(JSON.stringify(store.getSnapshot())).toBe(serialized);
    runtime.dispose();
  });

  it("does not frame non-spatial light selections", async () => {
    const frames = createFrameScheduler();
    const controls = createFakeControls();
    const renderer = createFakeRenderer(document.createElement("div"));
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      interactions: { camera: true },
      rendererFactory: () => renderer,
      cameraControlsFactory: () => controls,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });
    dispatcher.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });
    dispatcher.dispatch({ type: "select-node", nodeId: "ambient-a" });
    await runtime.project();
    frames.flush();

    expect(runtime.getNodeTarget("ambient-a")).toBeInstanceOf(AmbientLight);
    expect(runtime.frameSelected()).toBe(false);
    frames.flush();

    expect(controls.target.toArray()).toEqual([0, 0, 0]);
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

    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "select-node", nodeId: "object-a" });
    expect(store.getSnapshot().selection.objectId).toBe("object-a");
    runtime.dispose();
  });

  it("selects from pointer hits through command dispatch in replace mode", async () => {
    const container = document.createElement("div");
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
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: createFakeRenderer
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, transform: { position: [-2, 0, 0] } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, transform: { position: [0, 0, 0] } });
    await runtime.project();

    const result = runtime.selectFromPointer({ clientX: 100, clientY: 100 });

    expect(result.ok).toBe(true);
    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "select-node", nodeId: "object-b" });
    expect(store.getSnapshot().selection.objectId).toBe("object-b");
    runtime.dispose();
  });

  it("maps pointer modifiers to select-objects toggle commands without direct runtime mutation", async () => {
    const container = document.createElement("div");
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
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: createFakeRenderer
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "select-object", objectId: "object-a" });
    await runtime.project();

    const result = runtime.selectFromPointer({
      clientX: 100,
      clientY: 100,
      modifiers: { ctrlKey: true }
    });

    expect(result.ok).toBe(true);
    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "select-nodes", mode: "toggle", nodeId: "object-a" });
    expect(store.getSnapshot().selection.objectId).toBeNull();
    runtime.dispose();
  });

  it("routes enabled DOM pointer clicks through runtime picking with modifier selection", async () => {
    const container = document.createElement("div");
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
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    const renderer = createFakeRenderer(container);
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { pointerSelection: true },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    await runtime.project();

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 100, button: 0, ctrlKey: true }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointerup", { clientX: 100, clientY: 100, button: 0, ctrlKey: true }));

    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "select-nodes", mode: "toggle", nodeId: "object-a" });
    expect(store.getSnapshot().selection.objectId).toBe("object-a");
    runtime.dispose();
  });

  it("keeps small marquee-capable pointer movement on the click selection path", async () => {
    const container = createSizedContainer();
    const controls = createFakeControls();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    const renderer = createFakeRenderer(container);
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { camera: true, pointerSelection: true, marqueeSelection: true },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer,
      cameraControlsFactory: () => controls
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    await runtime.project();

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 100, clientY: 100, button: 0 }));
    expect(controls.enabled).toBe(false);
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 102, clientY: 102, button: 0, buttons: 1 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointerup", { clientX: 102, clientY: 102, button: 0 }));

    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "select-node", nodeId: "object-a" });
    expect(controls.enabled).toBe(true);
    expect(store.getSnapshot().selection.nodeIds).toEqual(["object-a"]);
    runtime.dispose();
  });

  it("dispatches ordered select-nodes from marquee drag completion", async () => {
    const container = createSizedContainer();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    const renderer = createFakeRenderer(container);
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { pointerSelection: true, marqueeSelection: true },
      resolver: new AssetResolverBridge((asset) => ({ uri: `/${asset.id}.glb` })),
      loader: { load: async () => new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial()) },
      rendererFactory: () => renderer
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, transform: { position: [1, -0.7, 0] } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, transform: { position: [-1, 0.7, 0] } });
    await runtime.project();

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 40, clientY: 35, button: 0 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 160, clientY: 165, button: 0, buttons: 1 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointerup", { clientX: 160, clientY: 165, button: 0 }));

    expect(dispatchSpy).toHaveBeenLastCalledWith({
      type: "select-nodes",
      mode: "replace",
      nodeIds: ["object-a", "object-b"],
      primaryNodeId: "object-a"
    });
    const selectionCommands = dispatchSpy.mock.calls
      .map(([command]) => command)
      .filter((command) => command.type === "select-node" || command.type === "select-nodes");
    renderer.domElement.dispatchEvent(new PointerEvent("pointerup", { clientX: 160, clientY: 165, button: 0 }));
    expect(dispatchSpy.mock.calls
      .map(([command]) => command)
      .filter((command) => command.type === "select-node" || command.type === "select-nodes")).toEqual(selectionCommands);
    expect(store.getSnapshot().selection.nodeIds).toEqual(["object-a", "object-b"]);
    runtime.dispose();
  });

  it.each([
    ["shift", { shiftKey: true }, "add", ["object-b", "object-a"], ["object-b", "object-a"]],
    ["ctrl", { ctrlKey: true }, "toggle", ["object-b"], ["object-b", "object-a"]],
    ["meta", { metaKey: true }, "toggle", ["object-b"], ["object-b", "object-a"]],
    ["alt", { altKey: true }, "remove", ["object-b"], ["object-b"]]
  ] as const)("maps %s marquee modifier to existing select-nodes %s mode", async (_label, modifiers, mode, initialSelection, expectedSelection) => {
    const container = createSizedContainer();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    const renderer = createFakeRenderer(container);
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { marqueeSelection: true },
      resolver: new AssetResolverBridge((asset) => ({ uri: `/${asset.id}.glb` })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, transform: { position: [3, 0, 0] } });
    dispatcher.dispatch({ type: "select-nodes", mode: "replace", nodeIds: [...initialSelection], primaryNodeId: initialSelection[0] ?? null });
    await runtime.project();

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 60, button: 0, ...modifiers }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, clientY: 140, button: 0, buttons: 1, ...modifiers }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointerup", { clientX: 140, clientY: 140, button: 0, ...modifiers }));

    expect(dispatchSpy).toHaveBeenLastCalledWith({
      type: "select-nodes",
      mode,
      nodeIds: ["object-a"],
      primaryNodeId: "object-a"
    });
    expect(store.getSnapshot().selection.nodeIds).toEqual(expectedSelection);
    runtime.dispose();
  });

  it("uses pointerup modifiers when completing marquee selection", async () => {
    const container = createSizedContainer();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    const renderer = createFakeRenderer(container);
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { marqueeSelection: true },
      resolver: new AssetResolverBridge((asset) => ({ uri: `/${asset.id}.glb` })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, transform: { position: [3, 0, 0] } });
    dispatcher.dispatch({ type: "select-node", nodeId: "object-b" });
    await runtime.project();

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 60, button: 0 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, clientY: 140, button: 0, buttons: 1 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointerup", { clientX: 140, clientY: 140, button: 0, shiftKey: true }));

    expect(dispatchSpy).toHaveBeenLastCalledWith({
      type: "select-nodes",
      mode: "add",
      nodeIds: ["object-a"],
      primaryNodeId: "object-a"
    });
    expect(store.getSnapshot().selection.nodeIds).toEqual(["object-b", "object-a"]);
    runtime.dispose();
  });

  it("does not start marquee while transform controls are dragging", async () => {
    const container = createSizedContainer();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    const renderer = createFakeRenderer(container);
    const transformControls = createFakeTransformControls();
    const marqueeState = new EditorMarqueeSelectionState();
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { transform: true, marqueeSelection: true },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer,
      transformControlsFactory: () => transformControls,
      marqueeSelection: marqueeState
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "select-object", objectId: "object-a" });
    await runtime.project();
    transformControls.emit("mouseDown");

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 60, button: 0 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, clientY: 140, button: 0, buttons: 1 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointerup", { clientX: 140, clientY: 140, button: 0 }));

    expect(marqueeState.get().status).toBe("idle");
    expect(dispatchSpy.mock.calls
      .map(([command]) => command)
      .filter((command) => command.type === "select-nodes")).toEqual([]);
    transformControls.emit("mouseUp");
    runtime.dispose();
  });

  it("clears selection through existing command semantics on empty replace marquee", async () => {
    const container = createSizedContainer();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    const renderer = createFakeRenderer(container);
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { marqueeSelection: true },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial()) },
      rendererFactory: () => renderer
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, transform: { position: [-2, 0, 0] } });
    dispatcher.dispatch({ type: "select-object", objectId: "object-a" });
    await runtime.project();

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 170, clientY: 170, button: 0 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 199, clientY: 199, button: 0, buttons: 1 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointerup", { clientX: 199, clientY: 199, button: 0 }));

    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "select-node", nodeId: null });
    expect(store.getSnapshot().selection.nodeIds).toEqual([]);
    runtime.dispose();
  });

  it("ignores drags that exceed threshold but stay below the minimum marquee size", async () => {
    const container = createSizedContainer();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    const renderer = createFakeRenderer(container);
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { marqueeSelection: { dragThreshold: 2, minSize: 12 } },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "select-object", objectId: "object-a" });
    await runtime.project();
    const selectionCommandsBeforeDrag = dispatchSpy.mock.calls
      .map(([command]) => command)
      .filter((command) => command.type === "select-node" || command.type === "select-nodes");

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 90, clientY: 90, button: 0 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 98, clientY: 98, button: 0, buttons: 1 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointerup", { clientX: 98, clientY: 98, button: 0 }));

    expect(dispatchSpy.mock.calls
      .map(([command]) => command)
      .filter((command) => command.type === "select-node" || command.type === "select-nodes")).toEqual(selectionCommandsBeforeDrag);
    expect(store.getSnapshot().selection.nodeIds).toEqual(["object-a"]);
    runtime.dispose();
  });

  it("does not compute preview candidates when preview is disabled", async () => {
    const container = createSizedContainer();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const renderer = createFakeRenderer(container);
    const marqueeState = new EditorMarqueeSelectionState();
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { marqueeSelection: { previewCandidates: false } },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer,
      marqueeSelection: marqueeState
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    await runtime.project();

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 60, button: 0 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, clientY: 140, button: 0, buttons: 1 }));

    expect(marqueeState.get().candidateNodeIds).toEqual([]);

    renderer.domElement.dispatchEvent(new PointerEvent("pointerup", { clientX: 140, clientY: 140, button: 0 }));
    expect(store.getSnapshot().selection.nodeIds).toEqual(["object-a"]);
    runtime.dispose();
  });

  it("clamps off-viewport marquee coordinates to the viewport bounds", async () => {
    const container = createSizedContainer();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const renderer = createFakeRenderer(container);
    const marqueeState = new EditorMarqueeSelectionState();
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { marqueeSelection: true },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer,
      marqueeSelection: marqueeState
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    await runtime.project();

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: -20, clientY: -15, button: 0 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 240, clientY: 230, button: 0, buttons: 1 }));

    expect(marqueeState.get().rect).toEqual({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200
    });

    renderer.domElement.dispatchEvent(new PointerEvent("pointerup", { clientX: 240, clientY: 230, button: 0 }));
    expect(store.getSnapshot().selection.nodeIds).toEqual(["object-a"]);
    runtime.dispose();
  });

  it("suppresses hover and camera controls while marquee is active", async () => {
    const container = createSizedContainer();
    const controls = createFakeControls();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const renderer = createFakeRenderer(container);
    const viewportHelpers = new EditorViewportHelperState();
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { camera: true, pointerSelection: true, marqueeSelection: true, viewportHelpers: { grid: false, axes: false, hover: true } },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer,
      cameraControlsFactory: () => controls,
      viewportHelpers
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    await runtime.project();
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 100, clientY: 100 }));
    expect(viewportHelpers.get().hoverNodeId).toBe("object-a");

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 60, button: 0, pointerId: 1 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, clientY: 140, button: 0, buttons: 1, pointerId: 1 }));

    expect(controls.enabled).toBe(false);
    expect(viewportHelpers.get().hoverNodeId).toBeNull();

    renderer.domElement.dispatchEvent(new PointerEvent("pointerup", { clientX: 140, clientY: 140, button: 0 }));

    expect(controls.enabled).toBe(true);
    runtime.dispose();
  });

  it("clears marquee session state on pointer cancel, Escape, project, and disposal", async () => {
    const container = createSizedContainer();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const renderer = createFakeRenderer(container);
    const releasePointerCapture = vi.fn();
    renderer.domElement.releasePointerCapture = releasePointerCapture;
    const marqueeState = new EditorMarqueeSelectionState();
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { marqueeSelection: true },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer,
      marqueeSelection: marqueeState
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    await runtime.project();

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 60, button: 0 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, clientY: 140, button: 0, buttons: 1 }));
    expect(marqueeState.get().status).toBe("dragging");

    renderer.domElement.dispatchEvent(new PointerEvent("pointercancel", { clientX: 140, clientY: 140, button: 0, pointerId: 1 }));
    expect(marqueeState.get().status).toBe("idle");
    expect(releasePointerCapture).toHaveBeenCalledTimes(1);

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 60, button: 0, pointerId: 2 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, clientY: 140, button: 0, buttons: 1, pointerId: 2 }));
    renderer.domElement.ownerDocument.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(marqueeState.get().status).toBe("idle");
    expect(releasePointerCapture).toHaveBeenCalledTimes(2);

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 60, button: 0, pointerId: 3 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, clientY: 140, button: 0, buttons: 1, pointerId: 3 }));
    await runtime.project();
    expect(marqueeState.get().status).toBe("idle");
    expect(releasePointerCapture).toHaveBeenCalledTimes(3);

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 60, button: 0, pointerId: 4 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, clientY: 140, button: 0, buttons: 1, pointerId: 4 }));
    runtime.dispose();
    expect(marqueeState.get().status).toBe("idle");
    expect(releasePointerCapture).toHaveBeenCalledTimes(4);
  });

  it("cancels active marquee synchronously when a new projection starts", async () => {
    const container = createSizedContainer();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    const renderer = createFakeRenderer(container);
    const marqueeState = new EditorMarqueeSelectionState();
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { marqueeSelection: true },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer,
      marqueeSelection: marqueeState
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    await runtime.project();

    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: 60, clientY: 60, button: 0, pointerId: 7 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, clientY: 140, button: 0, buttons: 1, pointerId: 7 }));
    expect(marqueeState.get().status).toBe("dragging");
    const projection = runtime.project();

    expect(marqueeState.get().status).toBe("idle");
    renderer.domElement.dispatchEvent(new PointerEvent("pointerup", { clientX: 140, clientY: 140, button: 0, pointerId: 7 }));
    await projection;

    expect(dispatchSpy.mock.calls
      .map(([command]) => command)
      .filter((command) => command.type === "select-node" || command.type === "select-nodes")).toEqual([]);
    expect(store.getSnapshot().selection.nodeIds).toEqual([]);
    runtime.dispose();
  });

  it("keeps selection helpers transient and out of serialized snapshots", async () => {
    const frames = createFrameScheduler();
    const renderer = createFakeRenderer(document.createElement("div"));
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      interactions: { selectionVisuals: true },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "select-object", objectId: "object-a" });
    await runtime.project();
    frames.flush();

    const helper = runtime.scene.children.find((object) => object.userData.selectionHelper);

    expect(helper?.userData).toMatchObject({
      runtimeOnly: true,
      selectionHelper: true,
      sceneObjectId: "object-a"
    });
    expect(JSON.stringify(store.getSnapshot())).not.toContain("selectionHelper");
    expect(runtime.getObject("object-a")?.userData.primarySelected).toBe(true);
    runtime.dispose();
  });

  it("keeps viewport helpers transient, runtime-only, and out of picking targets", async () => {
    const frames = createFrameScheduler();
    const renderer = createFakeRenderer(document.createElement("div"));
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const viewportHelpers = new EditorViewportHelperState();
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      interactions: { viewportHelpers: true },
      rendererFactory: () => renderer,
      viewportHelpers,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });

    await runtime.project();
    frames.flush();

    expect(runtime.scene.children.map((object) => object.userData.viewportHelper).sort()).toEqual(["axes", "grid"]);
    expect(runtime.scene.children.every((object) => object.userData.runtimeOnly)).toBe(true);
    expect([...runtime.projector.objects.targetEntries()]).toEqual([]);
    expect(JSON.stringify(store.getSnapshot())).not.toContain("viewportHelper");

    viewportHelpers.setVisibility({ grid: false, axes: false, floor: true });
    frames.flush();

    expect(runtime.scene.children.map((object) => object.userData.viewportHelper)).toEqual(["floor"]);
    runtime.dispose();
  });

  it("preserves session-owned helper visibility across runtime remounts", async () => {
    const frames = createFrameScheduler();
    const renderer = createFakeRenderer(document.createElement("div"));
    const container = document.createElement("div");
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const viewportHelpers = new EditorViewportHelperState();
    let runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { viewportHelpers: true },
      rendererFactory: () => renderer,
      viewportHelpers,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });

    await runtime.project();
    viewportHelpers.setVisibility({ grid: false, axes: false, floor: true });
    runtime.dispose();

    runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { viewportHelpers: true },
      rendererFactory: () => renderer,
      viewportHelpers,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });
    await runtime.project();

    expect(viewportHelpers.get().visibility).toMatchObject({
      grid: false,
      axes: false,
      floor: true
    });
    expect(runtime.scene.children.map((object) => object.userData.viewportHelper)).toEqual(["floor"]);
    runtime.dispose();
  });

  it("shows hover feedback from pointer movement without dispatching selection", async () => {
    const container = document.createElement("div");
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
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    const renderer = createFakeRenderer(container);
    const viewportHelpers = new EditorViewportHelperState();
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { pointerSelection: true, viewportHelpers: { grid: false, axes: false, hover: true } },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer,
      viewportHelpers
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    await runtime.project();

    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 100, clientY: 100 }));

    expect(viewportHelpers.get().hoverNodeId).toBe("object-a");
    expect(runtime.scene.children.find((object) => object.userData.hoverHelper)?.userData).toMatchObject({
      sceneNodeId: "object-a",
      sceneObjectId: "object-a"
    });
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: "select-node" }));
    expect(store.getSnapshot().selection.nodeId).toBeNull();
    runtime.dispose();
  });

  it("invalidates rendering when existing helper state updates without object churn", async () => {
    const container = document.createElement("div");
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
    const frames = createFrameScheduler();
    const renderer = createFakeRenderer(container);
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const viewportHelpers = new EditorViewportHelperState();
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { viewportHelpers: { grid: false, axes: false, hover: true } },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer,
      viewportHelpers,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" }, transform: { position: [-1, 0, 0] } });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" }, transform: { position: [0, 0, 0] } });
    await runtime.project();
    frames.flush();

    viewportHelpers.setHover("object-a");
    frames.flush();
    const renderCountAfterCreate = renderer.render.mock.calls.length;

    viewportHelpers.setHover("object-b");
    frames.flush();

    expect(renderer.render.mock.calls.length).toBe(renderCountAfterCreate + 1);
    expect(runtime.scene.children.find((object) => object.userData.hoverHelper)?.userData.sceneNodeId).toBe("object-b");
    runtime.dispose();
  });

  it("clears hover state when hover feedback is disabled", async () => {
    const state = new EditorViewportHelperState({ hover: true });
    state.setHover("object-a");

    state.setVisibility({ hover: false });

    expect(state.get().hoverNodeId).toBeNull();
  });

  it("clears hover feedback when the hovered runtime target is removed", async () => {
    const container = document.createElement("div");
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
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const renderer = createFakeRenderer(container);
    const viewportHelpers = new EditorViewportHelperState();
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { viewportHelpers: { grid: false, axes: false, hover: true } },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer,
      viewportHelpers
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    await runtime.project();

    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 100, clientY: 100 }));
    expect(viewportHelpers.get().hoverNodeId).toBe("object-a");

    dispatcher.dispatch({ type: "delete-objects", objectIds: ["object-a"] });
    await runtime.project();

    expect(viewportHelpers.get().hoverNodeId).toBeNull();
    expect(runtime.scene.children.find((object) => object.userData.hoverHelper)).toBeUndefined();
    runtime.dispose();
  });

  it("clears transient hover state on runtime disposal before remount", async () => {
    const container = document.createElement("div");
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
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const viewportHelpers = new EditorViewportHelperState();
    const renderer = createFakeRenderer(container);
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { viewportHelpers: { grid: false, axes: false, hover: true } },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer,
      viewportHelpers
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    await runtime.project();

    renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: 100, clientY: 100 }));
    expect(viewportHelpers.get().hoverNodeId).toBe("object-a");

    runtime.dispose();

    expect(viewportHelpers.get().hoverNodeId).toBeNull();

    const remounted = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { viewportHelpers: { grid: false, axes: false, hover: true } },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: createFakeRenderer,
      viewportHelpers
    });
    await remounted.project();

    expect(remounted.scene.children.find((object) => object.userData.hoverHelper)).toBeUndefined();
    remounted.dispose();
  });

  it("selects, frames, and transforms resolved imported GLB targets through runtime node targets", async () => {
    const container = document.createElement("div");
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
    const frames = createFrameScheduler();
    const controls = createFakeControls();
    const transformControls = createFakeTransformControls();
    const renderer = createFakeRenderer(container);
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    const loadedScene = new Group();
    const importedTarget = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    loadedScene.add(importedTarget);
    const runtime = new ThreeEditorRuntime({
      container,
      store,
      dispatcher,
      interactions: { camera: true, selectionVisuals: true, transform: true, pointerSelection: true },
      resolver: new AssetResolverBridge(() => ({ uri: "/machine.glb" })),
      loader: {
        analyze: async () => ({
          scene: loadedScene,
          manifest: createNodeOnlyManifest()
        }),
        load: async () => loadedScene
      },
      rendererFactory: () => renderer,
      cameraControlsFactory: () => controls,
      transformControlsFactory: () => transformControls,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });
    dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata: attachGlbImportManifestMetadata(undefined, createNodeOnlyManifest()) },
      expandImportedTargets: true
    });
    await runtime.project();
    const importedNodeId = findImportedNodeIdByKey(store.getSnapshot(), "glb:object-a/node:nodes/0")!;

    const picked = runtime.selectFromPointer({ clientX: 100, clientY: 100 });
    await runtime.project();
    frames.flush();

    expect(picked.ok).toBe(true);
    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "select-node", nodeId: importedNodeId });
    expect(store.getSnapshot().selection).toMatchObject({
      nodeId: importedNodeId,
      objectId: null
    });
    expect(runtime.getNodeTarget(importedNodeId)).toBe(importedTarget);
    expect(runtime.scene.children.find((object) => object.userData.selectionHelper)?.userData).toMatchObject({
      runtimeOnly: true,
      selectionHelper: true,
      sceneNodeId: importedNodeId
    });

    expect(runtime.frameSelected()).toBe(true);
    frames.flush();
    expect(controls.target.x).toBeCloseTo(0);
    expect(transformControls.attached).toBe(importedTarget);

    transformControls.emit("mouseDown");
    importedTarget.position.set(6, 0, 0);
    transformControls.emit("objectChange");
    transformControls.emit("mouseUp");

    expect(store.getSnapshot().nodes[importedNodeId].transform?.position).toEqual([6, 0, 0]);
    expect(store.getSnapshot().objects["object-a"].transform.position).toEqual([0, 0, 0]);
    expect(JSON.stringify(store.getSnapshot())).not.toContain("Object3D");
    runtime.dispose();
  });

  it("frames selected imported primitive targets even when they are not transformable", async () => {
    const frames = createFrameScheduler();
    const controls = createFakeControls();
    const transformControls = createFakeTransformControls();
    const renderer = createFakeRenderer(document.createElement("div"));
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const loadedScene = new Group();
    const importedTarget = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    importedTarget.position.set(4, 0, 0);
    loadedScene.add(importedTarget);
    const manifest = createNodeAndPrimitiveManifest();
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      interactions: { camera: true, transform: true },
      resolver: new AssetResolverBridge(() => ({ uri: "/machine.glb" })),
      loader: {
        analyze: async () => ({
          scene: loadedScene,
          manifest
        }),
        load: async () => loadedScene
      },
      rendererFactory: () => renderer,
      cameraControlsFactory: () => controls,
      transformControlsFactory: () => transformControls,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });
    dispatcher.dispatch({
      type: "import-glb",
      objectId: "object-a",
      asset: { id: "asset-a", metadata: attachGlbImportManifestMetadata(undefined, manifest) },
      expandImportedTargets: true
    });
    await runtime.project();
    const primitiveNodeId = findImportedNodeIdByKey(store.getSnapshot(), "glb:object-a/primitive:meshes/0/primitives/0")!;
    dispatcher.dispatch({ type: "select-node", nodeId: primitiveNodeId });
    await runtime.project();

    expect(runtime.getNodeTarget(primitiveNodeId)).toBe(importedTarget);
    expect(runtime.frameSelected()).toBe(true);
    frames.flush();
    expect(controls.target.x).toBeCloseTo(4);
    expect(transformControls.attached).toBeNull();
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

  it("passes environment loader and PMREM seams into core runtime projection", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const pmremTexture = new Texture();
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      resolver: new AssetResolverBridge((asset) => ({ uri: asset.id === "asset-a" ? "/box.glb" : "/studio.hdr" })),
      loader: { load: async () => new Group() },
      hdrLoader: { load: vi.fn(async () => new Texture()) },
      pmremFactory: () => ({
        fromEquirectangular: vi.fn(() => ({ texture: pmremTexture, dispose() {} })),
        dispose: vi.fn()
      }),
      rendererFactory: createFakeRenderer
    });

    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "register-asset", asset: { id: "hdr-a", kind: "hdr" } });
    dispatcher.dispatch({
      type: "set-environment",
      environment: {
        mode: "hdr",
        environment: { assetId: "hdr-a", intensity: 1.25, rotation: { x: 0, y: 0, z: 0 } }
      }
    });
    dispatcher.dispatch({ type: "add-light", light: { id: "light-a", kind: "ambient" } });
    await runtime.project();

    expect(runtime.scene.environment).toBe(pmremTexture);
    expect(runtime.scene.environmentIntensity).toBe(1.25);
    expect(runtime.projector.getLight("light-a")).toBeInstanceOf(AmbientLight);
    expect(runtime.getObject("object-a")).toBeInstanceOf(Group);
    runtime.dispose();
  });

  it("publishes versioned runtime problem snapshots after projection and stops on disposal", async () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      resolver: new AssetResolverBridge(() => null),
      rendererFactory: createFakeRenderer
    });
    const snapshots: RuntimeProblemSnapshot[] = [];
    const unsubscribe = runtime.subscribeProblems((snapshot) => {
      snapshots.push(snapshot);
    });

    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    await runtime.project();

    expect(snapshots.at(-1)?.version).toBeGreaterThan(0);
    expect(snapshots.at(-1)?.problems).toMatchObject([{ code: "asset-unresolved", assetId: "asset-a" }]);

    unsubscribe();
    runtime.dispose();
    expect(() => runtime.subscribeProblems(() => {})).toThrow("disposed");
  });

  it("does not render when disposed while projection is in flight", async () => {
    let resolveLoad: (object: Group) => void = () => {};
    const renderer = createFakeRenderer(document.createElement("div"));
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: {
        load: vi.fn(() => new Promise<Group>((resolve) => { resolveLoad = resolve; }))
      },
      rendererFactory: () => renderer
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const projection = runtime.project();
    await new Promise((resolve) => setTimeout(resolve, 0));

    runtime.dispose();
    resolveLoad(new Group());
    await projection;

    expect(renderer.render).not.toHaveBeenCalled();
  });

  it("does not render or mutate helpers after disposal with pending invalidation work", async () => {
    const frames = createFrameScheduler();
    const renderer = createFakeRenderer(document.createElement("div"));
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      interactions: { selectionVisuals: true },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()) },
      rendererFactory: () => renderer,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "select-object", objectId: "object-a" });
    await runtime.project();

    runtime.dispose();
    frames.flush();

    expect(renderer.render).not.toHaveBeenCalled();
    expect(runtime.scene.children.some((object) => object.userData.selectionHelper)).toBe(false);
  });

  it("mounts transform controls on the primary selected object and routes drags through one transaction", async () => {
    const frames = createFrameScheduler();
    const renderer = createFakeRenderer(document.createElement("div"));
    const transformControls = createFakeTransformControls();
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      interactions: { transform: true },
      resolver: new AssetResolverBridge(() => ({ uri: "/box.glb" })),
      loader: { load: async () => new Group() },
      rendererFactory: () => renderer,
      transformControlsFactory: () => transformControls,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "select-object", objectId: "object-a" });
    await runtime.project();
    const undoBefore = history.state.undoCount;

    expect(transformControls.attached).toBe(runtime.getObject("object-a"));
    expect(transformControls.helper.userData).toMatchObject({
      runtimeOnly: true,
      transformControlsHelper: true
    });

    transformControls.emit("mouseDown");
    runtime.getObject("object-a")?.position.set(1, 0, 0);
    transformControls.emit("objectChange");
    runtime.getObject("object-a")?.position.set(2, 0, 0);
    transformControls.emit("objectChange");
    transformControls.emit("mouseUp");

    expect(store.getSnapshot().objects["object-a"].transform.position).toEqual([2, 0, 0]);
    expect(history.state.undoCount).toBe(undoBefore + 1);
    expect(JSON.stringify(store.getSnapshot())).not.toContain("TransformControls");
    runtime.dispose();
  });

  it("mounts transform controls on spatial light nodes and skips ambient light nodes", async () => {
    const frames = createFrameScheduler();
    const renderer = createFakeRenderer(document.createElement("div"));
    const transformControls = createFakeTransformControls();
    const store = new EditorStore();
    const history = new CommandHistory();
    const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      interactions: { transform: true },
      rendererFactory: () => renderer,
      transformControlsFactory: () => transformControls,
      scheduleFrame: frames.schedule,
      cancelFrame: frames.cancel
    });
    dispatcher.dispatch({ type: "add-light", light: { id: "point-a", kind: "point" } });
    dispatcher.dispatch({ type: "select-node", nodeId: "point-a" });
    await runtime.project();
    const pointTarget = runtime.getNodeTarget("point-a");

    expect(transformControls.attached).toBe(pointTarget);

    transformControls.emit("mouseDown");
    pointTarget?.position.set(1, 2, 3);
    transformControls.emit("objectChange");
    transformControls.emit("mouseUp");

    expect(store.getSnapshot().nodes["point-a"].transform?.position).toEqual([1, 2, 3]);
    expect(store.getSnapshot().lights["point-a"].transform?.position).toEqual([1, 2, 3]);

    dispatcher.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });
    dispatcher.dispatch({ type: "select-node", nodeId: "ambient-a" });
    await runtime.project();

    expect(runtime.getNodeTarget("ambient-a")).toBeInstanceOf(AmbientLight);
    expect(transformControls.attached).toBeNull();
    runtime.dispose();
  });

  it("applies editor snap and transform mode session state to transform controls", async () => {
    const transformControls = createFakeTransformControls();
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const snap = new EditorSnapState();
    const transformMode = new EditorTransformModeState();
    const runtime = new ThreeEditorRuntime({
      container: document.createElement("div"),
      store,
      dispatcher,
      interactions: { transform: true },
      rendererFactory: createFakeRenderer,
      transformControlsFactory: () => transformControls,
      snap,
      transformMode
    });

    snap.set({ translate: 0.5, rotate: Math.PI / 4, scale: 0.1 });
    transformMode.set("rotate");

    expect(transformControls.translationSnap).toBe(0.5);
    expect(transformControls.rotationSnap).toBe(Math.PI / 4);
    expect(transformControls.scaleSnap).toBe(0.1);
    expect(transformControls.mode).toBe("rotate");
    runtime.dispose();
  });
});

function createFakeRenderer(container: HTMLElement): RendererLike {
  const canvas = container.ownerDocument.createElement("canvas");
  return {
    domElement: canvas,
    setSize: vi.fn((width, height) => {
      canvas.width = width;
      canvas.height = height;
    }),
    render: vi.fn(),
    dispose: vi.fn()
  };
}

function createSizedContainer(width = 200, height = 200): HTMLElement {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(container, "clientHeight", { configurable: true, value: height });
  container.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON() {}
  });
  return container;
}

function createFrameScheduler() {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    schedule: vi.fn((callback: FrameRequestCallback) => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    }),
    cancel: vi.fn((handle: number) => {
      callbacks.delete(handle);
    }),
    flush() {
      const pending = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of pending) {
        callback(0);
      }
    }
  };
}

function createFakeControls(): ViewportCameraControls & { emit(type: "change"): void } {
  const listeners = new Set<() => void>();
  return {
    enabled: true,
    target: new Vector3(),
    addEventListener: vi.fn((type: "change", listener: () => void) => {
      if (type === "change") {
        listeners.add(listener);
      }
    }),
    removeEventListener: vi.fn((type: "change", listener: () => void) => {
      if (type === "change") {
        listeners.delete(listener);
      }
    }),
    update: vi.fn(() => true),
    reset: vi.fn(),
    saveState: vi.fn(),
    dispose: vi.fn(),
    emit() {
      for (const listener of [...listeners]) {
        listener();
      }
    }
  };
}

function createFakeTransformControls() {
  const listeners: Record<string, Set<() => void>> = {
    change: new Set(),
    mouseDown: new Set(),
    mouseUp: new Set(),
    objectChange: new Set()
  };
  const controls: RuntimeTransformControls & {
    attached: Object3D | null;
    helper: Object3D;
    translationSnap: number | null;
    rotationSnap: number | null;
    scaleSnap: number | null;
    mode: "translate" | "rotate" | "scale";
    emit(type: "change" | "mouseDown" | "mouseUp" | "objectChange"): void;
  } = {
    attached: null,
    helper: new Group(),
    translationSnap: null,
    rotationSnap: null,
    scaleSnap: null,
    mode: "translate",
    attach: vi.fn((object: Object3D) => {
      controls.attached = object;
    }),
    detach: vi.fn(() => {
      controls.attached = null;
    }),
    dispose: vi.fn(),
    getHelper: vi.fn(() => controls.helper),
    setMode: vi.fn((mode) => {
      controls.mode = mode;
    }),
    setTranslationSnap: vi.fn((value) => {
      controls.translationSnap = value;
    }),
    setRotationSnap: vi.fn((value) => {
      controls.rotationSnap = value;
    }),
    setScaleSnap: vi.fn((value) => {
      controls.scaleSnap = value;
    }),
    addEventListener: vi.fn((type, listener) => {
      listeners[type].add(listener);
    }),
    removeEventListener: vi.fn((type, listener) => {
      listeners[type].delete(listener);
    }),
    emit(type) {
      for (const listener of [...listeners[type]]) {
        listener();
      }
    }
  };
  return controls;
}

function createNodeOnlyManifest() {
  return createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name: "Panel" }],
          meshes: []
        }
      }
    }
  });
}

function createNodeAndPrimitiveManifest() {
  return createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name: "Panel", mesh: 0 }],
          meshes: [{ name: "Panel", primitives: [{ attributes: { POSITION: 0 } }] }]
        }
      }
    }
  });
}

function findImportedNodeIdByKey(snapshot: ReturnType<EditorStore["getSnapshot"]>, importKey: string): string | null {
  return Object.values(snapshot.nodes).find((node) => node.kind === "imported" && node.importKey === importKey)?.id ?? null;
}
