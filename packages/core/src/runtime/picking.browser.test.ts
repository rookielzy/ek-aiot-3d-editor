import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera } from "three";
import { describe, expect, it, vi } from "vitest";
import { AssetRegistry } from "../assets/registry";
import { CommandDispatcher } from "../commands/dispatcher";
import { EditorStore } from "../editor/store";
import { CommandHistory } from "../history/history";
import { ObjectPicker } from "./picking";
import { ThreeObjectMap } from "./three-object-map";

describe("object picking", () => {
  it("dispatches a selection command for a resolved object id", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const picker = new ObjectPicker(new PerspectiveCamera(), new ThreeObjectMap(), dispatcher);

    const result = picker.selectObject("object-a");

    expect(result.ok).toBe(true);
    expect(result.snapshot.selection.nodeId).toBe("object-a");
    expect(result.snapshot.selection.objectId).toBe("object-a");
  });

  it("dispatches node selection for non-object runtime targets", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    dispatcher.dispatch({ type: "add-light", light: { id: "point-a", kind: "point" } });
    const objects = new ThreeObjectMap();
    const lightProxy = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    objects.set("point-a", lightProxy, { kind: "light", lightId: "point-a", transformable: true });
    const picker = new ObjectPicker(new PerspectiveCamera(), objects, dispatcher);

    const result = picker.selectNode("point-a");

    expect(result.ok).toBe(true);
    expect(result.snapshot.selection.nodeId).toBe("point-a");
    expect(result.snapshot.selection.objectId).toBeNull();
  });

  it("raycasts from a client point and dispatches replace selection for the hit object", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    const objects = new ThreeObjectMap();
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    objects.set("object-a", mesh);
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
    const picker = new ObjectPicker(camera, objects, dispatcher);

    const result = picker.pickFromClientPoint(container, 100, 100, [mesh], "replace");

    expect(result.ok).toBe(true);
    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "select-node", nodeId: "object-a" });
    expect(store.getSnapshot().selection.objectId).toBe("object-a");
  });

  it("uses select-objects when pointer picking requests a modifier mode", () => {
    const store = new EditorStore();
    const dispatcher = new CommandDispatcher(store, new CommandHistory(), new AssetRegistry());
    const dispatchSpy = vi.spyOn(dispatcher, "dispatch");
    dispatcher.dispatch({ type: "import-glb", objectId: "object-a", asset: { id: "asset-a" } });
    dispatcher.dispatch({ type: "select-object", objectId: "object-a" });
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    const objects = new ThreeObjectMap();
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    objects.set("object-a", mesh);
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
    const picker = new ObjectPicker(camera, objects, dispatcher);

    const result = picker.pickFromClientPoint(container, 100, 100, [mesh], "toggle");

    expect(result.ok).toBe(true);
    expect(dispatchSpy).toHaveBeenLastCalledWith({ type: "select-nodes", mode: "toggle", nodeId: "object-a" });
    expect(store.getSnapshot().selection.objectId).toBeNull();
  });
});
