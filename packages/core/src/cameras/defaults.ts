import type { AuthoredCameraDefinition, AuthoredCameraInput, AuthoredCameraMap, AuthoredCameraView, AuthoredCameraViewInput, ScenePresentationState } from "./types";

let nextCameraViewId = 0;

export function createEmptyCameraState(): AuthoredCameraMap {
  return {};
}

export function createEmptyPresentationState(): ScenePresentationState {
  return {
    defaultCameraId: null
  };
}

export function createAuthoredCamera(input: AuthoredCameraInput = {}): AuthoredCameraDefinition {
  return {
    id: input.id ?? createCameraViewId(),
    name: input.name ?? "Camera view",
    projection: {
      kind: "perspective",
      fov: input.projection?.fov ?? 50
    },
    position: copyVector(input.position ?? [0, 2, 5]),
    target: copyVector(input.target ?? [0, 0, 0]),
    near: input.near ?? 0.1,
    far: input.far ?? 1000,
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
}

export function createAuthoredCameraView(input: AuthoredCameraViewInput = {}): AuthoredCameraView {
  return createAuthoredCamera(input);
}

export function createAuthoredCameraViewInput(
  existingViews: AuthoredCameraMap,
  input: AuthoredCameraViewInput = {}
): AuthoredCameraViewInput {
  return {
    ...input,
    id: input.id ?? createCameraViewId(existingViews)
  };
}

export function createAuthoredCameraInput(
  existingCameras: AuthoredCameraMap,
  input: AuthoredCameraInput = {}
): AuthoredCameraInput {
  return createAuthoredCameraViewInput(existingCameras, input);
}

export function hasAuthoredCamera(
  cameras: AuthoredCameraMap,
  cameraId: string
): boolean {
  return Object.prototype.hasOwnProperty.call(cameras, cameraId);
}

export function hasAuthoredCameraView(
  cameraViews: AuthoredCameraMap,
  viewId: string
): boolean {
  return hasAuthoredCamera(cameraViews, viewId);
}

export function getAuthoredCamera(
  cameras: AuthoredCameraMap,
  cameraId: string
): AuthoredCameraDefinition | undefined {
  return hasAuthoredCamera(cameras, cameraId) ? cameras[cameraId] : undefined;
}

export function getAuthoredCameraView(
  cameraViews: AuthoredCameraMap,
  viewId: string
): AuthoredCameraView | undefined {
  return getAuthoredCamera(cameraViews, viewId);
}

export function copyCamera(view: AuthoredCameraDefinition): AuthoredCameraDefinition {
  return {
    id: view.id,
    name: view.name,
    projection: { ...view.projection },
    position: copyVector(view.position),
    target: copyVector(view.target),
    near: view.near,
    far: view.far,
    ...(view.metadata ? { metadata: { ...view.metadata } } : {})
  };
}

export function copyCameraView(view: AuthoredCameraView): AuthoredCameraView {
  return copyCamera(view);
}

function createCameraViewId(existingViews: AuthoredCameraMap = {}): string {
  let candidate: string;
  do {
    nextCameraViewId += 1;
    candidate = `camera-view-${nextCameraViewId.toString(36)}`;
  } while (hasAuthoredCamera(existingViews, candidate));
  return candidate;
}

function copyVector(value: readonly [number, number, number]): [number, number, number] {
  return [value[0], value[1], value[2]];
}
