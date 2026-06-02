import { Object3D, PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { AssetRegistry } from "../../assets/registry";
import { CommandDispatcher } from "../../commands/dispatcher";
import { EditorStore } from "../../editor/store";
import { CommandHistory } from "../../history/history";
import { ThreeObjectMap } from "../three-object-map";
import { TransformController } from "./transform-controller";
import { createThreeTransformControls } from "./transform-controls-adapter";

describe("transform controller", () => {
  it("cancels an active transaction when a new target starts", () => {
    const dispatcher = new CommandDispatcher(new EditorStore(), new CommandHistory(), new AssetRegistry());
    const objects = new ThreeObjectMap();
    const objectA = new Object3D();
    const objectB = new Object3D();
    objectA.position.set(1, 0, 0);
    objects.set("object-a", objectA);
    objects.set("object-b", objectB);
    const controller = new TransformController(objects, dispatcher);

    controller.start("object-a");
    controller.preview({ position: [5, 0, 0] });
    controller.start("object-b");

    expect(objectA.position.toArray()).toEqual([1, 0, 0]);
    expect(controller.activeTransaction?.objectId).toBe("object-b");
  });

  it("creates a Three.js TransformControls helper that can attach, detach, and dispose", () => {
    const object = new Object3D();
    const controls = createThreeTransformControls({
      camera: new PerspectiveCamera(),
      domElement: document.createElement("canvas"),
      options: { size: 0.75, space: "local" }
    });

    expect(controls.getHelper().userData).toEqual({});
    controls.setMode("scale");
    controls.setTranslationSnap(0.5);
    controls.setRotationSnap(0.25);
    controls.setScaleSnap(0.1);
    controls.attach(object);
    controls.detach();
    controls.dispose();

    expect(controls.getHelper()).toBeInstanceOf(Object3D);
  });
});
