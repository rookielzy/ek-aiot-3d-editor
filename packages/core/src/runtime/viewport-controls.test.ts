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
      marqueeSelection: false,
      resize: false,
      selectionVisuals: false,
      transform: false,
      viewportHelpers: false
    });

    expect(normalizeRuntimeInteractionOptions(true)).toMatchObject({
      camera: {},
      pointerSelection: { button: 0, clickTolerance: 4, defaultMode: "replace" },
      marqueeSelection: { button: 0, dragThreshold: 4, minSize: 4, defaultMode: "replace", previewCandidates: false },
      resize: true,
      selectionVisuals: { selectedColor: 0x4f8cff, primarySelectedColor: 0xffc247, hoverColor: 0x7dd3fc },
      transform: {},
      viewportHelpers: {
        visibility: {
          grid: true,
          floor: false,
          axes: true,
          selectionBounds: true,
          hover: true,
          snapFeedback: true
        }
      }
    });

    expect(normalizeRuntimeInteractionOptions({ resize: true })).toMatchObject({
      camera: false,
      pointerSelection: false,
      marqueeSelection: false,
      resize: true,
      selectionVisuals: false,
      transform: false,
      viewportHelpers: false
    });
  });

  it("normalizes transform controls without leaking disabled options", () => {
    expect(normalizeRuntimeInteractionOptions({ transform: true }).transform).toEqual({});
    expect(normalizeRuntimeInteractionOptions({ transform: { size: 0.8, space: "local" } }).transform).toEqual({ size: 0.8, space: "local" });
    expect(normalizeRuntimeInteractionOptions({ transform: { enabled: false } }).transform).toBe(false);
  });

  it("normalizes marquee selection options without leaking disabled payloads", () => {
    expect(normalizeRuntimeInteractionOptions({ marqueeSelection: true }).marqueeSelection).toEqual({
      enabled: true,
      button: 0,
      dragThreshold: 4,
      minSize: 4,
      defaultMode: "replace",
      previewCandidates: false
    });
    expect(normalizeRuntimeInteractionOptions({
      marqueeSelection: {
        button: 1,
        dragThreshold: 9,
        minSize: 6,
        defaultMode: "toggle",
        previewCandidates: false
      }
    }).marqueeSelection).toEqual({
      enabled: true,
      button: 1,
      dragThreshold: 9,
      minSize: 6,
      defaultMode: "toggle",
      previewCandidates: false
    });
    expect(normalizeRuntimeInteractionOptions({ marqueeSelection: { enabled: false, dragThreshold: 20 } }).marqueeSelection).toBe(false);
  });

  it("normalizes viewport helpers without leaking disabled option payloads", () => {
    expect(normalizeRuntimeInteractionOptions({ viewportHelpers: true }).viewportHelpers).toMatchObject({
      visibility: {
        grid: true,
        floor: false,
        axes: true,
        selectionBounds: true,
        hover: true,
        snapFeedback: true
      },
      gridSize: 20,
      axesSize: 2
    });
    expect(normalizeRuntimeInteractionOptions({
      viewportHelpers: {
        grid: false,
        floor: true,
        axesSize: 3
      }
    }).viewportHelpers).toMatchObject({
      visibility: {
        grid: false,
        floor: true,
        axes: true
      },
      axesSize: 3
    });
    expect(normalizeRuntimeInteractionOptions({ viewportHelpers: { enabled: false, grid: true } }).viewportHelpers).toBe(false);
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
