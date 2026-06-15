import { createAuthoredCameraView, createAuthoredCameraViewInput, getAuthoredCameraView, hasAuthoredCameraView } from "../cameras/defaults";
import type { AuthoredCameraView, AuthoredCameraViewPatch } from "../cameras/types";
import { createCameraNode } from "../snapshot/defaults";
import { createCameraNodeId, findCameraNodeId } from "../snapshot/nodes";
import type { SceneSnapshot } from "../snapshot/types";
import { applyDeleteNodes } from "./delete-nodes";
import type { CreateCameraViewCommand, DeleteCameraViewCommand, SetDefaultCameraViewCommand, UpdateCameraViewCommand } from "./types";

export function applyCreateCameraView(snapshot: SceneSnapshot, command: CreateCameraViewCommand): SceneSnapshot {
  assertSupportedCameraProjection(command.view?.projection);
  const cameraView = createAuthoredCameraView(createAuthoredCameraViewInput(snapshot.cameras, command.view));
  if (hasAuthoredCameraView(snapshot.cameras, cameraView.id)) {
    throw new Error(`Camera view ${cameraView.id} already exists.`);
  }

  const nodeId = createCameraNodeId(cameraView.id, snapshot.nodes);
  const cameraNode = createCameraNode(cameraView, nodeId);
  return {
    ...snapshot,
    cameras: {
      ...snapshot.cameras,
      [cameraView.id]: cameraView
    },
    nodes: {
      ...snapshot.nodes,
      [cameraNode.id]: cameraNode
    },
    rootNodeIds: [...snapshot.rootNodeIds, cameraNode.id]
  };
}

export function applyUpdateCameraView(snapshot: SceneSnapshot, command: UpdateCameraViewCommand): SceneSnapshot {
  const cameraView = getAuthoredCameraView(snapshot.cameras, command.viewId);
  if (!cameraView) {
    throw new Error(`Camera view ${command.viewId} does not exist.`);
  }
  assertSupportedCameraProjection(command.patch.projection);

  const next = updateCameraView(cameraView, command.patch);
  const cameraNodeId = findCameraNodeId(snapshot, command.viewId);
  const cameraNode = cameraNodeId ? snapshot.nodes[cameraNodeId] : undefined;
  return {
    ...snapshot,
    cameras: {
      ...snapshot.cameras,
      [command.viewId]: next
    },
    nodes: cameraNode?.kind === "camera"
      ? {
          ...snapshot.nodes,
          [cameraNode.id]: {
            ...cameraNode,
            name: next.name,
            transform: {
              ...cameraNode.transform,
              position: [...next.position]
            },
            ...(next.metadata ? { metadata: { ...next.metadata } } : {})
          }
        }
      : snapshot.nodes
  };
}

export function applyDeleteCameraView(snapshot: SceneSnapshot, command: DeleteCameraViewCommand): SceneSnapshot {
  if (!hasAuthoredCameraView(snapshot.cameras, command.viewId)) {
    throw new Error(`Camera view ${command.viewId} does not exist.`);
  }

  const nodeId = findCameraNodeId(snapshot, command.viewId);
  if (!nodeId) {
    throw new Error(`Camera view ${command.viewId} does not have a scene node.`);
  }

  return applyDeleteNodes(snapshot, { type: "delete-nodes", nodeIds: [nodeId] });
}

export function applySetDefaultCameraView(snapshot: SceneSnapshot, command: SetDefaultCameraViewCommand): SceneSnapshot {
  if (command.viewId !== null && !hasAuthoredCameraView(snapshot.cameras, command.viewId)) {
    throw new Error(`Camera view ${command.viewId} does not exist.`);
  }

  if (snapshot.presentation.defaultCameraId === command.viewId) {
    return snapshot;
  }

  return {
    ...snapshot,
    presentation: {
      ...snapshot.presentation,
      defaultCameraId: command.viewId
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

function assertSupportedCameraProjection(projection: AuthoredCameraViewPatch["projection"] | undefined): void {
  const kind = (projection as { kind?: unknown } | undefined)?.kind;
  if (kind !== undefined && kind !== "perspective") {
    throw new Error("Camera view projection kind must be perspective.");
  }
}

function copyVector(value: readonly [number, number, number]): [number, number, number] {
  return [value[0], value[1], value[2]];
}
