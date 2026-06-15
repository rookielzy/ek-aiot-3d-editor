import { createAuthoredCameraView, createAuthoredCameraViewInput, getAuthoredCameraView, hasAuthoredCameraView } from "../cameras/defaults";
import type { AuthoredCameraView, AuthoredCameraViewPatch } from "../cameras/types";
import type { SceneSnapshot } from "../snapshot/types";
import type { CreateCameraViewCommand, DeleteCameraViewCommand, SetDefaultCameraViewCommand, UpdateCameraViewCommand } from "./types";

export function applyCreateCameraView(snapshot: SceneSnapshot, command: CreateCameraViewCommand): SceneSnapshot {
  const cameraView = createAuthoredCameraView(createAuthoredCameraViewInput(snapshot.presentation.cameraViews, command.view));
  if (hasAuthoredCameraView(snapshot.presentation.cameraViews, cameraView.id)) {
    throw new Error(`Camera view ${cameraView.id} already exists.`);
  }

  return {
    ...snapshot,
    presentation: {
      ...snapshot.presentation,
      cameraViews: {
        ...snapshot.presentation.cameraViews,
        [cameraView.id]: cameraView
      }
    }
  };
}

export function applyUpdateCameraView(snapshot: SceneSnapshot, command: UpdateCameraViewCommand): SceneSnapshot {
  const cameraView = getAuthoredCameraView(snapshot.presentation.cameraViews, command.viewId);
  if (!cameraView) {
    throw new Error(`Camera view ${command.viewId} does not exist.`);
  }

  const next = updateCameraView(cameraView, command.patch);
  return {
    ...snapshot,
    presentation: {
      ...snapshot.presentation,
      cameraViews: {
        ...snapshot.presentation.cameraViews,
        [command.viewId]: next
      }
    }
  };
}

export function applyDeleteCameraView(snapshot: SceneSnapshot, command: DeleteCameraViewCommand): SceneSnapshot {
  if (!hasAuthoredCameraView(snapshot.presentation.cameraViews, command.viewId)) {
    throw new Error(`Camera view ${command.viewId} does not exist.`);
  }

  const { [command.viewId]: _removed, ...cameraViews } = snapshot.presentation.cameraViews;
  return {
    ...snapshot,
    presentation: {
      cameraViews,
      defaultViewId: snapshot.presentation.defaultViewId === command.viewId
        ? null
        : snapshot.presentation.defaultViewId
    }
  };
}

export function applySetDefaultCameraView(snapshot: SceneSnapshot, command: SetDefaultCameraViewCommand): SceneSnapshot {
  if (command.viewId !== null && !hasAuthoredCameraView(snapshot.presentation.cameraViews, command.viewId)) {
    throw new Error(`Camera view ${command.viewId} does not exist.`);
  }

  if (snapshot.presentation.defaultViewId === command.viewId) {
    return snapshot;
  }

  return {
    ...snapshot,
    presentation: {
      ...snapshot.presentation,
      defaultViewId: command.viewId
    }
  };
}

function updateCameraView(cameraView: AuthoredCameraView, patch: AuthoredCameraViewPatch): AuthoredCameraView {
  return {
    ...cameraView,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.projection !== undefined ? { projection: { ...cameraView.projection, ...patch.projection, kind: "perspective" as const } } : {}),
    ...(patch.position !== undefined ? { position: copyVector(patch.position) } : {}),
    ...(patch.target !== undefined ? { target: copyVector(patch.target) } : {}),
    ...(patch.near !== undefined ? { near: patch.near } : {}),
    ...(patch.far !== undefined ? { far: patch.far } : {}),
    ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {})
  };
}

function copyVector(value: readonly [number, number, number]): [number, number, number] {
  return [value[0], value[1], value[2]];
}
