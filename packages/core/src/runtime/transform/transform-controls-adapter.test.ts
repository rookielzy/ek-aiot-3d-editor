import { Object3D, Scene, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { attachGlbImportManifestMetadata, createGlbImportManifest } from "../../assets/import-pipeline";
import { AssetRegistry } from "../../assets/registry";
import { CommandDispatcher } from "../../commands/dispatcher";
import { EditorStore } from "../../editor/store";
import { CommandHistory } from "../../history/history";
import { ThreeObjectMap } from "../three-object-map";
import type { ViewportCameraControls } from "../viewport-controls";
import { TransformController } from "./transform-controller";
import { TransformControlsAdapter, type RuntimeTransformControls } from "./transform-controls-adapter";
import type { TransformMode } from "./transform-mode";

describe("transform controls adapter", () => {
  it("commits one history entry after several translate previews and supports undo/redo", () => {
    const setup = createAdapterHarness();
    const undoBefore = setup.history.state.undoCount;

    setup.controls.emit("mouseDown");
    setup.object.position.set(1.2, 0, 0);
    setup.controls.emit("objectChange");
    setup.object.position.set(2.4, 0, 0);
    setup.controls.emit("objectChange");
    setup.controls.emit("mouseUp");

    expect(setup.store.getSnapshot().objects["object-a"].transform.position).toEqual([2.4, 0, 0]);
    expect(setup.history.state.undoCount).toBe(undoBefore + 1);

    setup.dispatcher.undo();
    expect(setup.store.getSnapshot().objects["object-a"].transform.position).toEqual([0, 0, 0]);
    setup.dispatcher.redo();
    expect(setup.store.getSnapshot().objects["object-a"].transform.position).toEqual([2.4, 0, 0]);
  });

  it.each([
    ["rotate", "rotation", [0.25, 0, 0]],
    ["scale", "scale", [2, 2, 2]]
  ] as const)("commits only the %s channel", (mode, channel, value) => {
    const setup = createAdapterHarness({ mode });
    const snapshotBefore = setup.store.getSnapshot().objects["object-a"].transform;

    setup.controls.emit("mouseDown");
    if (channel === "rotation") {
      setup.object.rotation.set(...value);
    } else {
      setup.object.scale.set(...value);
    }
    setup.controls.emit("objectChange");
    setup.controls.emit("mouseUp");

    const transform = setup.store.getSnapshot().objects["object-a"].transform;
    expect(transform[channel]).toEqual(value);
    expect(transform.position).toEqual(snapshotBefore.position);
    expect(mode === "rotate" ? transform.scale : transform.rotation).toEqual(mode === "rotate" ? snapshotBefore.scale : snapshotBefore.rotation);
  });

  it("maps snap settings into controls and commits snapped finite transform values", () => {
    const setup = createAdapterHarness({ snap: { translate: 0.5, rotate: 0.25, scale: 0.1 } });

    expect(setup.controls.translationSnap).toBe(0.5);
    expect(setup.controls.rotationSnap).toBe(0.25);
    expect(setup.controls.scaleSnap).toBe(0.1);

    setup.controls.emit("mouseDown");
    setup.object.position.set(1.24, -0.26, 0);
    setup.controls.emit("objectChange");
    setup.controls.emit("mouseUp");

    expect(setup.store.getSnapshot().objects["object-a"].transform.position).toEqual([1, -0.5, 0]);
    expect(JSON.stringify(setup.store.getSnapshot())).not.toContain("NaN");

    setup.adapter.setSnap({ translate: null, rotate: Number.NaN, scale: -1 });
    expect(setup.controls.translationSnap).toBeNull();
    expect(setup.controls.rotationSnap).toBeNull();
    expect(setup.controls.scaleSnap).toBeNull();
  });

  it("publishes session-only snap feedback from the drag lifecycle", () => {
    const feedback: unknown[] = [];
    const setup = createAdapterHarness({
      snap: { translate: 0.5 },
      onSnapFeedback: (next) => feedback.push(next)
    });

    setup.controls.emit("mouseDown");
    setup.object.position.set(1.24, -0.26, 0);
    setup.controls.emit("objectChange");
    setup.controls.emit("mouseUp");

    expect(feedback).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: "dragging-snapped",
        nodeId: "object-a",
        mode: "translate",
        increment: 0.5,
        before: [0, 0, 0],
        preview: [0, 0, 0],
        snapped: [0, 0, 0]
      }),
      expect.objectContaining({
        status: "dragging-snapped",
        nodeId: "object-a",
        mode: "translate",
        increment: 0.5,
        before: [0, 0, 0],
        preview: [1.24, -0.26, 0],
        snapped: [1, -0.5, 0]
      }),
      expect.objectContaining({
        status: "idle",
        nodeId: null
      })
    ]));
    expect(setup.store.getSnapshot().objects["object-a"].transform.position).toEqual([1, -0.5, 0]);
  });

  it.each([
    [{}, "dragging-unsnapped", null, [1.24, -0.26, 0], [1.24, -0.26, 0]],
    [{ translate: Number.NaN }, "invalid", null, [1.24, -0.26, 0], [1.24, -0.26, 0]],
    [{ translate: -1 }, "invalid", null, [1.24, -0.26, 0], [1.24, -0.26, 0]]
  ] as const)("publishes %s translate snap feedback", (snap, status, increment, preview, snapped) => {
    const feedback: unknown[] = [];
    const setup = createAdapterHarness({
      snap,
      onSnapFeedback: (next) => feedback.push(next)
    });

    setup.controls.emit("mouseDown");
    setup.object.position.set(...preview);
    setup.controls.emit("objectChange");

    expect(feedback).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status,
        nodeId: "object-a",
        mode: "translate",
        increment,
        before: [0, 0, 0],
        preview,
        snapped
      })
    ]));
  });

  it.each([
    ["rotate", "rotation", { rotate: 0.25 }, [0.31, 0, 0], [0.25, 0, 0]],
    ["scale", "scale", { scale: 0.5 }, [1.24, 1.76, 2.1], [1, 2, 2]]
  ] as const)("publishes snapped %s feedback for the active channel", (mode, channel, snap, preview, snapped) => {
    const feedback: unknown[] = [];
    const setup = createAdapterHarness({
      mode,
      snap,
      onSnapFeedback: (next) => feedback.push(next)
    });

    setup.controls.emit("mouseDown");
    if (channel === "rotation") {
      setup.object.rotation.set(...preview);
    } else {
      setup.object.scale.set(...preview);
    }
    setup.controls.emit("objectChange");

    expect(feedback).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: "dragging-snapped",
        nodeId: "object-a",
        mode,
        increment: channel === "rotation" ? 0.25 : 0.5,
        before: channel === "rotation" ? [0, 0, 0] : [1, 1, 1],
        preview,
        snapped
      })
    ]));
  });

  it("cancels the active drag when snap settings change mid-drag", () => {
    const feedback: unknown[] = [];
    const setup = createAdapterHarness({
      snap: { translate: 0.5 },
      onSnapFeedback: (next) => feedback.push(next)
    });
    const undoBefore = setup.history.state.undoCount;

    setup.controls.emit("mouseDown");
    setup.object.position.set(1.24, 0, 0);
    setup.controls.emit("objectChange");
    setup.adapter.setSnap({ translate: 0.25 });
    setup.controls.emit("mouseUp");

    expect(setup.adapter.dragging).toBe(false);
    expect(setup.object.position.toArray()).toEqual([0, 0, 0]);
    expect(setup.store.getSnapshot().objects["object-a"].transform.position).toEqual([0, 0, 0]);
    expect(setup.history.state.undoCount).toBe(undoBefore);
    expect(feedback).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "idle", nodeId: null })
    ]));
  });

  it("cancels preview state without committing when selection changes during drag", () => {
    const setup = createAdapterHarness();
    const undoBefore = setup.history.state.undoCount;

    setup.controls.emit("mouseDown");
    setup.object.position.set(3, 0, 0);
    setup.controls.emit("objectChange");
    setup.dispatcher.dispatch({ type: "select-object", objectId: "object-b" });
    setup.adapter.sync(setup.store.getSnapshot());
    setup.controls.emit("mouseUp");

    expect(setup.object.position.toArray()).toEqual([0, 0, 0]);
    expect(setup.store.getSnapshot().objects["object-a"].transform.position).toEqual([0, 0, 0]);
    expect(setup.history.state.undoCount).toBe(undoBefore + 1);
    expect(setup.adapter.dragging).toBe(false);
  });

  it("detaches without dispatching a stale transform when the selected object is deleted", () => {
    const setup = createAdapterHarness();
    const dispatchSpy = vi.spyOn(setup.dispatcher, "dispatch");

    setup.controls.emit("mouseDown");
    setup.object.position.set(3, 0, 0);
    setup.controls.emit("objectChange");
    setup.objects.delete("object-a");
    setup.dispatcher.dispatch({ type: "delete-objects", objectIds: ["object-a"] });
    setup.adapter.sync(setup.store.getSnapshot());
    setup.controls.emit("mouseUp");

    expect(setup.controls.attached).toBeNull();
    expect(setup.adapter.attachedObjectId).toBeNull();
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: "set-transform", objectId: "object-a" }));
  });

  it("commits spatial light node transforms through node commands", () => {
    const setup = createAdapterHarness();
    const dispatchSpy = vi.spyOn(setup.dispatcher, "dispatch");
    const light = new Object3D();
    setup.dispatcher.dispatch({ type: "add-light", light: { id: "point-a", kind: "point" } });
    setup.dispatcher.dispatch({ type: "select-node", nodeId: "point-a" });
    setup.objects.set("point-a", light, { kind: "light", lightId: "point-a", transformable: true });
    setup.adapter.sync(setup.store.getSnapshot());

    expect(setup.controls.attached).toBe(light);

    setup.controls.emit("mouseDown");
    light.position.set(5, 6, 7);
    setup.controls.emit("objectChange");
    setup.controls.emit("mouseUp");

    expect(dispatchSpy).toHaveBeenLastCalledWith({
      type: "batch",
      label: "Transform node",
      commands: [{ type: "set-node-transform", nodeId: "point-a", transform: { position: [5, 6, 7] } }]
    });
    expect(setup.store.getSnapshot().nodes["point-a"].transform?.position).toEqual([5, 6, 7]);
    expect(setup.store.getSnapshot().lights["point-a"].transform?.position).toEqual([5, 6, 7]);
  });

  it("does not attach transform controls to non-spatial light nodes", () => {
    const setup = createAdapterHarness();
    const dispatchSpy = vi.spyOn(setup.dispatcher, "dispatch");
    const ambient = new Object3D();
    setup.dispatcher.dispatch({ type: "add-light", light: { id: "ambient-a", kind: "ambient" } });
    setup.dispatcher.dispatch({ type: "select-node", nodeId: "ambient-a" });
    setup.objects.set("ambient-a", ambient, { kind: "light", lightId: "ambient-a", transformable: false });

    setup.adapter.sync(setup.store.getSnapshot());
    setup.controls.emit("mouseDown");
    ambient.position.set(1, 2, 3);
    setup.controls.emit("objectChange");
    setup.controls.emit("mouseUp");

    expect(setup.controls.attached).toBeNull();
    expect(setup.adapter.attachedNodeId).toBeNull();
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: "set-node-transform", nodeId: "ambient-a" }));
    expect(setup.store.getSnapshot().nodes["ambient-a"].transform).toBeUndefined();
  });

  it("commits imported target transforms through set-node-transform without changing the owner object", () => {
    const setup = createAdapterHarness();
    const dispatchSpy = vi.spyOn(setup.dispatcher, "dispatch");
    const imported = new Object3D();
    setup.dispatcher.dispatch({
      type: "batch",
      commands: [{
        type: "create-imported-glb-targets",
        ownerObjectId: "object-a"
      }]
    });
    const snapshot = setup.store.getSnapshot();
    const importedNodeId = Object.values(snapshot.nodes)
      .find((node) => node.kind === "imported" && node.source.kind === "node")?.id;
    expect(importedNodeId).toBeTruthy();
    setup.dispatcher.dispatch({ type: "select-node", nodeId: importedNodeId! });
    setup.objects.set(importedNodeId!, imported, {
      kind: "imported",
      ownerObjectId: "object-a",
      importKey: "glb:object-a/node:nodes/0",
      source: { kind: "node", path: "nodes/0", index: 0 },
      transformable: true,
      pickable: true
    });
    setup.adapter.sync(setup.store.getSnapshot());

    setup.controls.emit("mouseDown");
    imported.position.set(8, 9, 10);
    setup.controls.emit("objectChange");
    setup.controls.emit("mouseUp");

    expect(dispatchSpy).toHaveBeenLastCalledWith({
      type: "batch",
      label: "Transform node",
      commands: [{ type: "set-node-transform", nodeId: importedNodeId, transform: { position: [8, 9, 10] } }]
    });
    expect(setup.store.getSnapshot().nodes[importedNodeId!]).toMatchObject({
      transform: { position: [8, 9, 10], rotation: [0, 0, 0], scale: [1, 1, 1] }
    });
    expect(setup.store.getSnapshot().objects["object-a"].transform.position).toEqual([0, 0, 0]);
  });

  it("does not attach transform controls to non-transformable imported aliases", () => {
    const setup = createAdapterHarness();
    const imported = new Object3D();
    setup.dispatcher.dispatch({
      type: "batch",
      commands: [{ type: "create-imported-glb-targets", ownerObjectId: "object-a" }]
    });
    const importedNodeId = Object.values(setup.store.getSnapshot().nodes)
      .find((node) => node.kind === "imported" && node.source.kind === "primitive")?.id;
    expect(importedNodeId).toBeTruthy();
    setup.dispatcher.dispatch({ type: "select-node", nodeId: importedNodeId! });
    setup.objects.set(importedNodeId!, imported, {
      kind: "imported",
      ownerObjectId: "object-a",
      importKey: "glb:object-a/primitive:meshes/0/primitives/0",
      source: { kind: "primitive", path: "meshes/0/primitives/0", meshIndex: 0, primitiveIndex: 0 },
      transformable: false,
      pickable: true
    });

    setup.adapter.sync(setup.store.getSnapshot());
    setup.controls.emit("mouseDown");
    imported.position.set(1, 2, 3);
    setup.controls.emit("objectChange");
    setup.controls.emit("mouseUp");

    expect(setup.controls.attached).toBeNull();
    expect(setup.adapter.attachedNodeId).toBeNull();
    expect(setup.store.getSnapshot().nodes[importedNodeId!].transform).toBeUndefined();
  });

  it("disables camera controls while dragging and restores them after commit or cancellation", () => {
    const cameraControls = createFakeCameraControls();
    const setup = createAdapterHarness({ cameraControls });

    setup.controls.emit("mouseDown");
    expect(cameraControls.enabled).toBe(false);
    setup.object.position.set(1, 0, 0);
    setup.controls.emit("objectChange");
    setup.controls.emit("mouseUp");
    expect(cameraControls.enabled).toBe(true);

    setup.controls.emit("mouseDown");
    setup.object.position.set(2, 0, 0);
    setup.controls.emit("objectChange");
    setup.adapter.cancel();
    expect(cameraControls.enabled).toBe(true);
    expect(setup.object.position.toArray()).toEqual([1, 0, 0]);
  });

  it("removes listeners and cancels the active transaction when disposed", () => {
    const setup = createAdapterHarness();
    const undoBefore = setup.history.state.undoCount;

    setup.controls.emit("mouseDown");
    setup.object.position.set(4, 0, 0);
    setup.controls.emit("objectChange");
    setup.adapter.dispose();
    setup.controls.emit("mouseUp");

    expect(setup.object.position.toArray()).toEqual([0, 0, 0]);
    expect(setup.controls.dispose).toHaveBeenCalledTimes(1);
    expect(setup.scene.children).not.toContain(setup.controls.helper);
    expect(setup.history.state.undoCount).toBe(undoBefore);
  });
});

function createAdapterHarness(options: {
  mode?: TransformMode;
  snap?: Parameters<TransformControlsAdapter["setSnap"]>[0];
  cameraControls?: ViewportCameraControls;
  onSnapFeedback?: ConstructorParameters<typeof TransformControlsAdapter>[0]["onSnapFeedback"];
} = {}) {
  const store = new EditorStore();
  const history = new CommandHistory();
  const dispatcher = new CommandDispatcher(store, history, new AssetRegistry());
  dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a", metadata: createRuntimeImportManifestMetadata() } });
  dispatcher.dispatch({ type: "import-glb", objectId: "object-b", asset: { id: "asset-b" } });
  dispatcher.dispatch({ type: "select-object", objectId: "object-a" });
  const scene = new Scene();
  const objects = new ThreeObjectMap();
  const object = new Object3D();
  objects.set("object-a", object);
  objects.set("object-b", new Object3D());
  const controls = createFakeTransformControls();
  const adapter = new TransformControlsAdapter({
    scene,
    controls,
    objects,
    controller: new TransformController(objects, dispatcher),
    cameraControls: options.cameraControls,
    mode: options.mode,
    snap: options.snap,
    onChange: vi.fn(),
    onSnapFeedback: options.onSnapFeedback
  });
  adapter.sync(store.getSnapshot());

  return {
    store,
    history,
    dispatcher,
    scene,
    objects,
    object,
    controls,
    adapter
  };
}

function createRuntimeImportManifestMetadata() {
  return attachGlbImportManifestMetadata(undefined, createGlbImportManifest({
    gltf: {
      parser: {
        json: {
          nodes: [{ name: "Panel", mesh: 0 }],
          meshes: [{ name: "Panel", primitives: [{ attributes: { POSITION: 0 } }] }]
        }
      }
    }
  }));
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
    mode: TransformMode;
    emit(type: "change" | "mouseDown" | "mouseUp" | "objectChange"): void;
  } = {
    attached: null,
    helper: new Object3D(),
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
    setMode: vi.fn((mode: TransformMode) => {
      controls.mode = mode;
    }),
    setTranslationSnap: vi.fn((value: number | null) => {
      controls.translationSnap = value;
    }),
    setRotationSnap: vi.fn((value: number | null) => {
      controls.rotationSnap = value;
    }),
    setScaleSnap: vi.fn((value: number | null) => {
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

function createFakeCameraControls(): ViewportCameraControls {
  return {
    enabled: true,
    target: new Vector3(),
    addEventListener() {},
    removeEventListener() {},
    update: vi.fn(() => true),
    reset: vi.fn(),
    saveState: vi.fn(),
    dispose: vi.fn()
  };
}
