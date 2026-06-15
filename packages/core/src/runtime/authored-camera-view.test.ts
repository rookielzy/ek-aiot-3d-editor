import { PerspectiveCamera } from "three";
import { describe, expect, it, vi } from "vitest";
import { createAuthoredCameraView } from "../cameras/defaults";
import { applyAuthoredCameraViewToRuntime, captureAuthoredCameraView } from "./authored-camera-view";
import type { ViewportCameraControls } from "./viewport-controls";

describe("runtime authored camera view helpers", () => {
  it("captures a JSON-compatible authored camera view patch from camera and controls", () => {
    const camera = new PerspectiveCamera(70, 1, 0.2, 900);
    camera.position.set(1, 2, 3);
    const controls = createFakeControls();
    controls.target.set(4, 5, 6);

    const result = captureAuthoredCameraView(camera, controls, { id: "view-a", name: "Hero" });

    expect(result).toEqual({
      ok: true,
      view: {
        id: "view-a",
        name: "Hero",
        projection: { kind: "perspective", fov: 70 },
        position: [1, 2, 3],
        target: [4, 5, 6],
        near: 0.2,
        far: 900
      }
    });
    expect(JSON.parse(JSON.stringify(result.ok ? result.view : null))).toEqual(result.ok ? result.view : null);
  });

  it("captures a deterministic look target when controls are unavailable", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const result = captureAuthoredCameraView(camera);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.view.position : null).toEqual([0, 0, 10]);
    expect(result.ok ? result.view.target?.[2] : null).toBeCloseTo(9);
  });

  it("returns typed failures for invalid runtime camera data", () => {
    const camera = new PerspectiveCamera(Number.NaN, 1, 0.1, 1000);

    const result = captureAuthoredCameraView(camera);

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("FOV");
  });

  it("applies authored camera views to transient runtime camera and controls", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    const controls = createFakeControls();
    const view = createAuthoredCameraView({
      projection: { kind: "perspective", fov: 35 },
      position: [3, 4, 5],
      target: [1, 1, 1],
      near: 0.5,
      far: 250
    });
    const updateProjectionMatrix = vi.spyOn(camera, "updateProjectionMatrix");

    applyAuthoredCameraViewToRuntime(camera, view, controls);

    expect(camera.position.toArray()).toEqual([3, 4, 5]);
    expect(camera.fov).toBe(35);
    expect(camera.near).toBe(0.5);
    expect(camera.far).toBe(250);
    expect(controls.target.toArray()).toEqual([1, 1, 1]);
    expect(updateProjectionMatrix).toHaveBeenCalled();
    expect(controls.update).toHaveBeenCalled();
    expect(controls.saveState).toHaveBeenCalled();
  });
});

function createFakeControls(): ViewportCameraControls {
  return {
    enabled: true,
    target: new PerspectiveCamera().position,
    addEventListener() {},
    removeEventListener() {},
    update: vi.fn(() => true),
    reset: vi.fn(),
    saveState: vi.fn(),
    dispose: vi.fn()
  };
}
