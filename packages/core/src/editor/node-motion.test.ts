import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AssetResolverBridge, attachGlbImportManifestMetadata, createEditor, createGlbImportManifest, updateNodeMotionField, type Editor, type NodeMotion } from "../index";

describe("node motion authoring", () => {
  it("commits, validates, copies, removes, and restores motion through Editor", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "fan", asset: { id: "fan-asset" } });
    const legacy = createEditor({ snapshot: { ...editor.getSnapshot(), version: 9 } });
    expect(legacy.getSnapshot().version).toBe(10);
    expect(legacy.getSnapshot().nodes.fan).not.toHaveProperty("motion");

    const initial: NodeMotion = { kind: "continuous-spin", axis: "y", degreesPerSecond: 90 };
    const changed: NodeMotion = { kind: "continuous-spin", axis: "z", degreesPerSecond: -45 };
    expect(editor.dispatch({ type: "set-node-motion", nodeId: "fan", motion: initial }).ok).toBe(true);
    expect(createEditor({ snapshot: { ...editor.getSnapshot(), version: 9 } }).getSnapshot().nodes.fan).not.toHaveProperty("motion");
    expect(editor.dispatch({ type: "set-node-motion", nodeId: "fan", motion: changed }).ok).toBe(true);
    const committed = editor.getSnapshot();
    for (const degreesPerSecond of [0, NaN, Infinity]) {
      expect(editor.dispatch({
        type: "set-node-motion", nodeId: "fan", motion: { ...changed, degreesPerSecond }
      }).ok).toBe(false);
    }
    expect(editor.getSnapshot()).toBe(committed);
    expect(editor.undo().snapshot.nodes.fan).toHaveProperty("motion", initial);
    expect(editor.redo().snapshot.nodes.fan).toHaveProperty("motion", changed);

    const duplicated = editor.dispatch({ type: "duplicate-objects", objectIds: ["fan"], objectIdMap: { fan: "fan-copy" } });
    expect(duplicated.ok).toBe(true);
    expect(duplicated.snapshot.nodes["fan-copy"]).toHaveProperty("motion", changed);
    expect(editor.dispatch({ type: "set-node-motion", nodeId: "fan-copy", motion: null }).ok).toBe(true);
    expect(editor.getSnapshot().nodes.fan).toHaveProperty("motion", changed);
    expect(editor.getSnapshot().nodes["fan-copy"]).not.toHaveProperty("motion");
    expect(editor.undo().snapshot.nodes["fan-copy"]).toHaveProperty("motion", changed);
    expect(editor.redo().snapshot.nodes["fan-copy"]).not.toHaveProperty("motion");

    expect(createEditor({ snapshot: JSON.parse(JSON.stringify(editor.serialize())) }).getSnapshot().nodes.fan)
      .toHaveProperty("motion", changed);
    expect(editor.dispatch({ type: "delete-nodes", nodeIds: ["fan"] }).snapshot.nodes.fan).toBeUndefined();
    expect(editor.undo().snapshot.nodes.fan).toHaveProperty("motion", changed);
  });

  it("validates ping-pong translation, switches kinds with single undo, and restores through Editor", () => {
    const editor = createEditor();
    editor.dispatch({ type: "import-glb", objectId: "slider", asset: { id: "slider-asset" } });
    const spin: NodeMotion = { kind: "continuous-spin", axis: "z", degreesPerSecond: -45 };
    const pingPong: NodeMotion = { kind: "ping-pong-translation", axis: "x", distance: 1, durationSeconds: 2 };
    const reversed: NodeMotion = { kind: "ping-pong-translation", axis: "y", distance: -2.5, durationSeconds: 0.5 };

    expect(editor.dispatch({ type: "set-node-motion", nodeId: "slider", motion: spin }).ok).toBe(true);
    expect(editor.dispatch({ type: "set-node-motion", nodeId: "slider", motion: pingPong }).ok).toBe(true);
    expect(editor.getSnapshot().nodes.slider).toHaveProperty("motion", pingPong);
    expect(editor.undo().snapshot.nodes.slider).toHaveProperty("motion", spin);
    expect(editor.redo().snapshot.nodes.slider).toHaveProperty("motion", pingPong);

    expect(editor.dispatch({ type: "set-node-motion", nodeId: "slider", motion: reversed }).ok).toBe(true);
    expect(updateNodeMotionField(reversed, "motion.kind", "ping-pong-translation")).toBe(reversed);
    expect(updateNodeMotionField(reversed, "motion.kind", "continuous-spin")).toEqual({
      kind: "continuous-spin",
      axis: "y",
      degreesPerSecond: 90
    });
    const committed = editor.getSnapshot();
    for (const distance of [0, NaN, Infinity, -Infinity]) {
      expect(editor.dispatch({
        type: "set-node-motion", nodeId: "slider", motion: { ...reversed, distance }
      }).ok).toBe(false);
    }
    for (const durationSeconds of [0, -1, NaN, Infinity]) {
      expect(editor.dispatch({
        type: "set-node-motion", nodeId: "slider", motion: { ...reversed, durationSeconds }
      }).ok).toBe(false);
    }
    expect(editor.getSnapshot()).toBe(committed);

    const duplicated = editor.dispatch({ type: "duplicate-objects", objectIds: ["slider"], objectIdMap: { slider: "slider-copy" } });
    expect(duplicated.ok).toBe(true);
    expect(duplicated.snapshot.nodes["slider-copy"]).toHaveProperty("motion", reversed);
    expect(createEditor({ snapshot: JSON.parse(JSON.stringify(editor.serialize())) }).getSnapshot().nodes.slider)
      .toHaveProperty("motion", reversed);
  });

  it("spins a GLB blade around its local axis and restores the base pose on preview exit", async () => {
    const gltf = {
      asset: { version: "2.0" },
      scenes: [{ nodes: [0, 1] }],
      nodes: [
        { name: "Blade", rotation: [0.7071067811865475, 0, 0, 0.7071067811865476] },
        { name: "Housing", translation: [3, 0, 0] }
      ]
    };
    const glb = encodeGlb(gltf);
    const manifest = createGlbImportManifest({ gltf: { parser: { json: gltf } } });
    const editor = createEditor();
    const reopened = createEditor();
    const { frames, mount, frame } = createMotionRuntimeHarness(glb, "/fan.glb");
    try {
      editor.dispatch({
        type: "import-glb", objectId: "fan", expandImportedTargets: true,
        asset: { id: "fan-asset", source: glb, metadata: attachGlbImportManifestMetadata(undefined, manifest) }
      });
      const bladeId = Object.values(editor.getSnapshot().nodes).find((node) => node.name === "Blade")!.id;
      const housingId = Object.values(editor.getSnapshot().nodes).find((node) => node.name === "Housing")!.id;
      const motion: NodeMotion = { kind: "continuous-spin", axis: "y", degreesPerSecond: 90 };
      editor.dispatch({ type: "set-node-motion", nodeId: bladeId, motion });
      editor.dispatch({ type: "select-node", nodeId: "fan" });
      const duplicated = editor.operations.duplicate();
      expect(duplicated.ok).toBe(true);
      const copiedBlade = Object.values(duplicated.snapshot.nodes).find((node) => node.kind === "imported" &&
        node.name === "Blade" && node.ownerObjectId !== "fan");
      expect(copiedBlade).toHaveProperty("motion", motion);
      editor.undo();
      const runtime = mount(editor);
      runtime.pickNode(bladeId);
      await runtime.project();
      const blade = runtime.getNodeTarget(bladeId)!;
      const housing = runtime.getNodeTarget(housingId)!;
      expect(housing, JSON.stringify(runtime.getProblems())).toBeDefined();
      const base = blade.quaternion.clone();
      const housingPose = housing.matrix.clone();
      expect(new Vector3(0, 1, 0).applyQuaternion(base).z).toBeCloseTo(1);
      frame(100);
      expect(frames.size).toBe(0);

      const snapshot = editor.getSnapshot();
      const history = editor.getHistoryState();
      expect(runtime.startNodeMotionPreview?.(bladeId)).toBe(true);
      frame(1000);
      expect(blade.quaternion.equals(base)).toBe(true);
      frame(2000);
      expect(new Vector3(1, 0, 0).applyQuaternion(blade.quaternion).y).toBeCloseTo(1);
      expect(housing.matrix).toEqual(housingPose);
      expect(editor.dispatch({ type: "set-node-transform", nodeId: bladeId, transform: { position: [1, 0, 0] } }).ok).toBe(false);
      expect(editor.dispatch({ type: "reparent-node", nodeId: bladeId, parentId: "fan", preserveWorldTransform: true }).error).toMatch(/^motion-preview-locked:/);
      expect(editor.dispatch({ type: "set-node-motion", nodeId: bladeId, motion: null }).ok).toBe(false);

      const exported = editor.exportProject();
      expect(exported.ok).toBe(true);
      expect(reopened.importProject(exported.packageBytes!).ok).toBe(true);
      expect(reopened.getSnapshot().nodes[bladeId]).toMatchObject({ motion });
      expect(reopened.getSnapshot().nodes[bladeId]).not.toHaveProperty("transform");
      expect(editor.getSnapshot()).toBe(snapshot);
      expect(editor.getHistoryState()).toEqual(history);

      frame(5000);
      expect(blade.quaternion.equals(base)).toBe(true);
      frame(6000);
      runtime.stopNodeMotionPreview?.();
      expect(blade.quaternion.equals(base)).toBe(true);
      frame(6016);
      expect(frames.size).toBe(0);
      expect(editor.getSnapshot()).toBe(snapshot);
      expect(editor.getHistoryState()).toEqual(history);

      editor.dispatch({ type: "set-node-transform", nodeId: bladeId, transform: { rotation: [0, 0, 0] } });
      await runtime.project();
      expect(runtime.startNodeMotionPreview?.(bladeId)).toBe(true);
      frame(7000);
      expect(blade.quaternion.w).toBe(1);
      frame(8000);
      expect(new Vector3(1, 0, 0).applyQuaternion(blade.quaternion).z).toBeCloseTo(-1);
      runtime.pickNode(housingId);
      expect(blade.quaternion.w).toBe(1);
      await runtime.project();
      expect(runtime.getNodeMotionPreviewState?.(bladeId)).toBe("ready");
      editor.dispose();
      expect(frames.size).toBe(0);

      const fresh = mount(reopened);
      await fresh.project();
      expect(fresh.startNodeMotionPreview?.(bladeId)).toBe(true);
      frame(9000);
      frame(10000);
      expect(new Vector3(1, 0, 0).applyQuaternion(fresh.getNodeTarget(bladeId)!.quaternion).y).toBeCloseTo(1);
      const reprojection = fresh.project();
      expect(new Vector3(1, 0, 0).applyQuaternion(fresh.getNodeTarget(bladeId)!.quaternion).x).toBeCloseTo(1);
      await reprojection;
      expect(fresh.startNodeMotionPreview?.(bladeId)).toBe(true);
      reopened.dispose();
      expect(frames.size).toBe(0);
    } finally {
      editor.dispose();
      reopened.dispose();
    }
  });

  it("translates a slider along its rotated parent axis with ease-in-out ping-pong and restores on exit", async () => {
    const gltf = {
      asset: { version: "2.0" },
      scenes: [{ nodes: [0, 2] }],
      nodes: [
        { name: "Rail", rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], children: [1] },
        { name: "Carriage", translation: [1, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
        { name: "Frame", translation: [0, 0, 5] }
      ]
    };
    const glb = encodeGlb(gltf);
    const manifest = createGlbImportManifest({ gltf: { parser: { json: gltf } } });
    const editor = createEditor();
    const reopened = createEditor();
    const { frames, mount, frame } = createMotionRuntimeHarness(glb, "/slider.glb");
    try {
      editor.dispatch({
        type: "import-glb", objectId: "slider", expandImportedTargets: true,
        asset: { id: "slider-asset", source: glb, metadata: attachGlbImportManifestMetadata(undefined, manifest) }
      });
      const carriageId = Object.values(editor.getSnapshot().nodes).find((node) => node.name === "Carriage")!.id;
      const frameId = Object.values(editor.getSnapshot().nodes).find((node) => node.name === "Frame")!.id;
      const motion: NodeMotion = { kind: "ping-pong-translation", axis: "x", distance: 1, durationSeconds: 2 };
      editor.dispatch({ type: "set-node-motion", nodeId: carriageId, motion });
      const runtime = mount(editor);
      runtime.pickNode(carriageId);
      await runtime.project();
      const carriage = runtime.getNodeTarget(carriageId)!;
      const frameObj = runtime.getNodeTarget(frameId)!;
      const basePos = carriage.position.clone();
      const framePose = frameObj.matrix.clone();
      frame(100);
      expect(frames.size).toBe(0);

      const snapshot = editor.getSnapshot();
      const history = editor.getHistoryState();
      expect(runtime.startNodeMotionPreview?.(carriageId)).toBe(true);
      frame(1000);
      expect(carriage.position.equals(basePos)).toBe(true);
      expect(carriage.getWorldPosition(new Vector3()).z).toBeCloseTo(-1);

      frame(1500);
      const quarterOffset = carriage.position.x - basePos.x;
      expect(quarterOffset).toBeGreaterThan(0);
      expect(quarterOffset).toBeLessThan(0.25);

      frame(2000);
      expect(carriage.position.x).toBeCloseTo(1.5);

      frame(2500);
      const threeQuarterOffset = carriage.position.x - basePos.x;
      expect(threeQuarterOffset).toBeGreaterThan(0.75);
      expect(threeQuarterOffset).toBeLessThan(1);

      frame(3000);
      expect(carriage.position.x).toBeCloseTo(2);
      expect(carriage.position.y).toBeCloseTo(0);
      expect(carriage.position.z).toBeCloseTo(0);
      const endpointWorld = carriage.getWorldPosition(new Vector3());
      expect(endpointWorld.x).toBeCloseTo(0);
      expect(endpointWorld.y).toBeCloseTo(0);
      expect(endpointWorld.z).toBeCloseTo(-2);
      expect(frameObj.matrix).toEqual(framePose);

      // Camera navigation remains available while previewing, and edits stay locked.
      runtime.applyCameraView({
        id: "check",
        name: "Check",
        position: [4, 5, 6],
        target: [0, 0, 0],
        near: 0.1,
        far: 1000,
        projection: {
          kind: "perspective",
          fov: 50
        }
      });
      expect(runtime.captureCameraView().view.position).toEqual([4, 5, 6]);
      expect(runtime.getNodeMotionPreviewState?.(carriageId)).toBe("playing");
      expect(editor.dispatch({ type: "set-node-transform", nodeId: carriageId, transform: { position: [5, 0, 0] } }).ok).toBe(false);
      expect(editor.dispatch({ type: "set-node-motion", nodeId: carriageId, motion: null }).ok).toBe(false);

      const exported = editor.exportProject();
      expect(exported.ok).toBe(true);
      expect(reopened.importProject(exported.packageBytes!).ok).toBe(true);
      expect(reopened.getSnapshot().nodes[carriageId]).toMatchObject({ motion });
      expect(reopened.getSnapshot().nodes[carriageId]).not.toHaveProperty("transform");
      expect(editor.getSnapshot()).toBe(snapshot);
      expect(editor.getHistoryState()).toEqual(history);

      frame(5000);
      expect(carriage.position.x).toBeCloseTo(1);
      expect(carriage.getWorldPosition(new Vector3()).z).toBeCloseTo(-1);

      frame(7000);
      expect(carriage.position.x).toBeCloseTo(2);

      runtime.stopNodeMotionPreview?.();
      expect(carriage.position.equals(basePos)).toBe(true);
      expect(carriage.getWorldPosition(new Vector3()).z).toBeCloseTo(-1);
      frame(7016);
      expect(frames.size).toBe(0);

      // Re-preview starts from the base position again.
      expect(runtime.startNodeMotionPreview?.(carriageId)).toBe(true);
      frame(8000);
      expect(carriage.position.equals(basePos)).toBe(true);
      frame(9000);
      expect(carriage.position.x).toBeCloseTo(1.5);
      runtime.pickNode(frameId);
      expect(carriage.position.equals(basePos)).toBe(true);
      await runtime.project();
      expect(runtime.getNodeMotionPreviewState?.(carriageId)).toBe("ready");

      // Negative displacement moves in the opposite direction along the rotated parent axis.
      const railId = Object.values(editor.getSnapshot().nodes).find((node) => node.name === "Rail")!.id;
      expect(editor.dispatch({ type: "set-node-transform", nodeId: railId, transform: { rotation: [0, Math.PI, 0] } }).ok).toBe(true);
      runtime.pickNode(carriageId);
      await runtime.project();
      const reverseMotion: NodeMotion = { kind: "ping-pong-translation", axis: "x", distance: -1.5, durationSeconds: 2 };
      expect(editor.dispatch({ type: "set-node-motion", nodeId: carriageId, motion: reverseMotion }).ok).toBe(true);
      await runtime.project();
      expect(runtime.startNodeMotionPreview?.(carriageId)).toBe(true);
      frame(10000);
      expect(carriage.getWorldPosition(new Vector3()).x).toBeCloseTo(-1);
      frame(12000);
      expect(carriage.position.x).toBeCloseTo(-0.5);
      expect(carriage.getWorldPosition(new Vector3()).x).toBeCloseTo(0.5);
      expect(carriage.getWorldPosition(new Vector3()).z).toBeCloseTo(0);
      runtime.stopNodeMotionPreview?.();

      // GLB child with a transform override uses the overridden position as base pose.
      expect(editor.dispatch({ type: "set-node-transform", nodeId: carriageId, transform: { position: [3, 2, 0] } }).ok).toBe(true);
      await runtime.project();
      expect(runtime.startNodeMotionPreview?.(carriageId)).toBe(true);
      frame(12500);
      expect(carriage.position.toArray()).toEqual([3, 2, 0]);
      frame(14500);
      expect(carriage.position.x).toBeCloseTo(1.5);
      expect(carriage.position.y).toBeCloseTo(2);
      runtime.stopNodeMotionPreview?.();
      expect(carriage.position.toArray()).toEqual([3, 2, 0]);
      editor.dispose();
      expect(frames.size).toBe(0);

      const fresh = mount(reopened);
      await fresh.project();
      expect(fresh.startNodeMotionPreview?.(carriageId)).toBe(true);
      frame(13000);
      frame(15000);
      const freshCarriage = fresh.getNodeTarget(carriageId)!;
      expect(freshCarriage.position.x).toBeCloseTo(2);
      expect(freshCarriage.getWorldPosition(new Vector3()).z).toBeCloseTo(-2);
      reopened.dispose();
      expect(frames.size).toBe(0);
    } finally {
      editor.dispose();
      reopened.dispose();
    }
  });
});

function createMotionRuntimeHarness(glb: Uint8Array<ArrayBuffer>, uri: string) {
  const frames = new Map<number, FrameRequestCallback>();
  let handle = 0;
  return {
    frames,
    mount: (host: Editor) => host.mountRuntime({
      container: document.createElement("div"),
      resolver: new AssetResolverBridge(() => ({ uri })),
      loader: { load: async () => (await new GLTFLoader().parseAsync(glb.buffer, "")).scene },
      rendererFactory: (container) => ({
        domElement: container.ownerDocument.createElement("canvas"),
        setSize() {}, render() {}, dispose() {}
      }),
      scheduleFrame: (callback) => {
        frames.set(++handle, callback);
        return handle;
      },
      cancelFrame: (id) => { frames.delete(id); }
    }),
    frame: (time: number) => {
      expect(frames.size).toBe(1);
      const pending = [...frames.values()][0];
      frames.clear();
      pending(time);
    }
  };
}

function encodeGlb(gltf: object): Uint8Array<ArrayBuffer> {
  const json = JSON.stringify(gltf);
  const chunk = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4));
  const bytes = new Uint8Array(20 + chunk.length);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, bytes.length, true);
  header.setUint32(12, chunk.length, true);
  header.setUint32(16, 0x4e4f534a, true);
  bytes.set(chunk, 20);
  return bytes;
}
