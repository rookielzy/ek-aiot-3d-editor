import type { PerspectiveCamera } from "three";
import { Vector3 } from "three";
import type { AuthoredCameraView, AuthoredCameraViewInput } from "../cameras/types";
import type { ViewportCameraControls } from "./viewport-controls";

export type RuntimeCameraViewCaptureResult =
  | { ok: true; view: AuthoredCameraViewInput }
  | { ok: false; error: string };

export function captureAuthoredCameraView(
  camera: PerspectiveCamera,
  controls?: ViewportCameraControls | null,
  input: Pick<AuthoredCameraViewInput, "id" | "name" | "metadata"> = {}
): RuntimeCameraViewCaptureResult {
  const position = toFiniteVector(camera.position);
  if (!position) {
    return { ok: false, error: "Camera position must contain finite numbers." };
  }

  const target = controls ? toFiniteVector(controls.target) : getCameraLookTarget(camera);
  if (!target) {
    return { ok: false, error: "Camera target must contain finite numbers." };
  }

  if (!Number.isFinite(camera.fov) || camera.fov <= 0 || camera.fov >= 180) {
    return { ok: false, error: "Camera FOV must be greater than 0 and less than 180." };
  }
  if (!Number.isFinite(camera.near) || camera.near <= 0) {
    return { ok: false, error: "Camera near plane must be greater than 0." };
  }
  if (!Number.isFinite(camera.far) || camera.far <= camera.near) {
    return { ok: false, error: "Camera far plane must be greater than near." };
  }

  return {
    ok: true,
    view: {
      ...input,
      projection: { kind: "perspective", fov: camera.fov },
      position,
      target,
      near: camera.near,
      far: camera.far
    }
  };
}

export function applyAuthoredCameraViewToRuntime(
  camera: PerspectiveCamera,
  view: AuthoredCameraView,
  controls?: ViewportCameraControls | null
): void {
  camera.position.set(view.position[0], view.position[1], view.position[2]);
  camera.fov = view.projection.fov;
  camera.near = view.near;
  camera.far = view.far;
  camera.lookAt(view.target[0], view.target[1], view.target[2]);
  camera.updateProjectionMatrix();
  if (controls) {
    controls.target.set(view.target[0], view.target[1], view.target[2]);
    controls.update();
    controls.saveState();
  }
}

function toFiniteVector(value: Vector3): [number, number, number] | null {
  const vector: [number, number, number] = [value.x, value.y, value.z];
  return vector.every(Number.isFinite) ? vector : null;
}

function getCameraLookTarget(camera: PerspectiveCamera): [number, number, number] | null {
  const direction = new Vector3();
  camera.getWorldDirection(direction);
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y) || !Number.isFinite(direction.z) || direction.lengthSq() === 0) {
    return null;
  }
  return toFiniteVector(camera.position.clone().add(direction));
}
