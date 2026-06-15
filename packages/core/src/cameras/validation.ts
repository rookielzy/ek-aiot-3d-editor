import { isJsonCompatible, isPlainRecord } from "../snapshot/json";
import { isFiniteRange, isVector } from "../snapshot/primitives";
import { hasAuthoredCameraView } from "./defaults";
import type { AuthoredCameraMap, AuthoredCameraView, ScenePresentationState } from "./types";

export function validateCameras(value: unknown, errors: string[]): asserts value is AuthoredCameraMap {
  if (!isPlainRecord(value)) {
    errors.push("Snapshot cameras must be a plain object map.");
    return;
  }

  for (const [id, camera] of Object.entries(value)) {
    validateAuthoredCameraView(id, camera, errors);
  }
}

export function validatePresentationState(value: unknown, cameras: unknown, errors: string[]): asserts value is ScenePresentationState {
  if (!isPlainRecord(value)) {
    errors.push("Snapshot presentation must be a plain object.");
    return;
  }

  if (!(typeof value.defaultCameraId === "string" || value.defaultCameraId === null)) {
    errors.push("Snapshot presentation defaultCameraId must be a camera ID or null.");
  } else if (typeof value.defaultCameraId === "string" && value.defaultCameraId.trim().length === 0) {
    errors.push("Snapshot presentation defaultCameraId must be a non-empty camera ID or null.");
  } else if (typeof value.defaultCameraId === "string" && isPlainRecord(cameras) && !hasAuthoredCameraView(cameras as AuthoredCameraMap, value.defaultCameraId)) {
    errors.push(`Default camera ${value.defaultCameraId} must exist in cameras.`);
  }
}

export function validateAuthoredCameraView(id: string, value: unknown, errors: string[]): asserts value is AuthoredCameraView {
  if (!isPlainRecord(value)) {
    errors.push(`Camera view ${id} must be a plain object.`);
    return;
  }

  if (id.trim().length === 0) {
    errors.push("Camera view id must be a non-empty string.");
  }
  if (value.id !== id) {
    errors.push(`Camera view ${id} must use a matching id field.`);
  }
  if (typeof value.name !== "string") {
    errors.push(`Camera view ${id} must include a name.`);
  }
  validateProjection(value.projection, `Camera view ${id} projection`, errors);
  validateVector(value.position, `Camera view ${id} position`, errors);
  validateVector(value.target, `Camera view ${id} target`, errors);
  if (!isFiniteRange(value.near, 0, Number.POSITIVE_INFINITY) || value.near <= 0) {
    errors.push(`Camera view ${id} near must be a finite number greater than 0.`);
  }
  if (!isFiniteRange(value.far, 0, Number.POSITIVE_INFINITY) || value.far <= 0) {
    errors.push(`Camera view ${id} far must be a finite number greater than 0.`);
  }
  if (typeof value.near === "number" && typeof value.far === "number" && Number.isFinite(value.near) && Number.isFinite(value.far) && value.far <= value.near) {
    errors.push(`Camera view ${id} far must be greater than near.`);
  }
  if ("metadata" in value && !isJsonCompatible(value.metadata)) {
    errors.push(`Camera view ${id} metadata must be JSON-compatible.`);
  }
}

function validateProjection(value: unknown, label: string, errors: string[]): void {
  if (!isPlainRecord(value)) {
    errors.push(`${label} must be a plain object.`);
    return;
  }
  if (value.kind !== "perspective") {
    errors.push(`${label} kind is unsupported.`);
  }
  if (!isFiniteRange(value.fov, 0, 180) || value.fov <= 0 || value.fov >= 180) {
    errors.push(`${label} fov must be a finite number greater than 0 and less than 180.`);
  }
}

function validateVector(value: unknown, label: string, errors: string[]): void {
  if (!isVector(value, 3)) {
    errors.push(`${label} must contain three finite numbers.`);
  }
}
