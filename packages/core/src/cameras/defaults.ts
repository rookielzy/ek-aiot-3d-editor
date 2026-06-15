import type { AuthoredCameraView, AuthoredCameraViewInput, ScenePresentationState } from "./types";

let nextCameraViewId = 0;

export function createEmptyPresentationState(): ScenePresentationState {
  return {
    cameraViews: {},
    defaultViewId: null
  };
}

export function createAuthoredCameraView(input: AuthoredCameraViewInput = {}): AuthoredCameraView {
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

export function createAuthoredCameraViewInput(
  existingViews: ScenePresentationState["cameraViews"],
  input: AuthoredCameraViewInput = {}
): AuthoredCameraViewInput {
  return {
    ...input,
    id: input.id ?? createCameraViewId(existingViews)
  };
}

export function hasAuthoredCameraView(
  cameraViews: ScenePresentationState["cameraViews"],
  viewId: string
): boolean {
  return Object.prototype.hasOwnProperty.call(cameraViews, viewId);
}

export function getAuthoredCameraView(
  cameraViews: ScenePresentationState["cameraViews"],
  viewId: string
): AuthoredCameraView | undefined {
  return hasAuthoredCameraView(cameraViews, viewId) ? cameraViews[viewId] : undefined;
}

export function copyCameraView(view: AuthoredCameraView): AuthoredCameraView {
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

function createCameraViewId(existingViews: ScenePresentationState["cameraViews"] = {}): string {
  let candidate: string;
  do {
    nextCameraViewId += 1;
    candidate = `camera-view-${nextCameraViewId.toString(36)}`;
  } while (hasAuthoredCameraView(existingViews, candidate));
  return candidate;
}

function copyVector(value: readonly [number, number, number]): [number, number, number] {
  return [value[0], value[1], value[2]];
}
