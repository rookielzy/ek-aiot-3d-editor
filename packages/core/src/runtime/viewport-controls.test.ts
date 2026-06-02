import { Object3D, PerspectiveCamera } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  frameCameraToObjects,
  normalizeRuntimeInteractionOptions,
  resetCameraView,
  resolvePointerSelectionMode,
  type ViewportCameraControls
} from "./viewport-controls";

describe("viewport controls", () => {
  it("keeps interactions disabled unless explicitly requested", () => {
    expect(normalizeRuntimeInteractionOptions(undefined)).toMatchObject({
      camera: false,
      pointerSelection: false,
      resize: false,
      selectionVisuals: false
    });

    expect(normalizeRuntimeInteractionOptions(true)).toMatchObject({
      camera: {},
      pointerSelection: { button: 0, clickTolerance: 4, defaultMode: "replace" },
      resize: true,
      selectionVisuals: { selectedColor: 0x4f8cff, primarySelectedColor: 0xffc247 }
    });

    expect(normalizeRuntimeInteractionOptions({ resize: true })).toMatchObject({
      camera: false,
      pointerSelection: false,
      resize: true,
      selectionVisuals: false
    });
  });

  it("maps pointer modifiers to additive selection modes", () => {
    expect(resolvePointerSelectionMode({ shiftKey: true })).toBe("add");
    expect(resolvePointerSelectionMode({ ctrlKey: true })).toBe("toggle");
    expect(resolvePointerSelectionMode({ metaKey: true })).toBe("toggle");
    expect(resolvePointerSelectionMode({ altKey: true })).toBe("remove");
    expect(resolvePointerSelectionMode({}, "toggle")).toBe("toggle");
  });

  it("resets camera and control target to the default runtime view", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(9, 9, 9);
    const controls = createFakeControls();
    controls.target.set(2, 2, 2);

    resetCameraView(camera, controls);

    expect(camera.position.toArray()).toEqual([0, 2, 5]);
    expect(controls.target.toArray()).toEqual([0, 0, 0]);
    expect(controls.update).toHaveBeenCalled();
    expect(controls.saveState).toHaveBeenCalled();
  });

  it("frames runtime objects without writing durable camera state", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 2, 5);
    const controls = createFakeControls();
    const object = new Object3D();
    object.position.set(10, 0, 0);

    const framed = frameCameraToObjects(camera, [object], controls);

    expect(framed).toBe(true);
    expect(controls.target.x).toBeCloseTo(10);
    expect(camera.position.x).not.toBe(0);
    expect(controls.update).toHaveBeenCalled();
  });

  it("reports that empty frame requests did not move the camera", () => {
    const camera = new PerspectiveCamera();

    expect(frameCameraToObjects(camera, [])).toBe(false);
  });
});

function createFakeControls(): ViewportCameraControls {
  return {
    enabled: true,
    target: new Object3D().position,
    addEventListener() {},
    removeEventListener() {},
    update: vi.fn(() => true),
    reset: vi.fn(),
    saveState: vi.fn(),
    dispose: vi.fn()
  };
}
