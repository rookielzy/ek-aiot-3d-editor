import { createEmptyCameraState, createEmptyPresentationState } from "../cameras/defaults";
import type { AuthoredCameraDefinition } from "../cameras/types";
import { createEmptyDataSources } from "../data-sources/defaults";
import { createDefaultEnvironment } from "../environment/defaults";
import type { LegacyLightDefinition, LightDefinition } from "../lights/types";
import { createEmptyMaterialState } from "../materials/defaults";
import { createEmptyAuthoredProblemState } from "../problems/defaults";
import { SNAPSHOT_VERSION, type SceneCameraNode, type SceneLightNode, type SceneObject, type SceneObjectNode, type SceneSnapshot, type Transform } from "./types";

let nextId = 0;

export function createId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId.toString(36)}`;
}

export function createTransform(partial: Partial<Transform> = {}): Transform {
  return {
    position: [...(partial.position ?? [0, 0, 0])] as [number, number, number],
    rotation: [...(partial.rotation ?? [0, 0, 0])] as [number, number, number],
    scale: [...(partial.scale ?? [1, 1, 1])] as [number, number, number]
  };
}

export function createEmptySnapshot(sceneId = createId("scene")): SceneSnapshot {
  const snapshot: SceneSnapshot = {
    version: SNAPSHOT_VERSION,
    scene: {
      id: sceneId,
      name: "Untitled scene"
    },
    nodes: {},
    rootNodeIds: [],
    objects: {},
    rootObjectIds: [],
    selection: {
      nodeId: null,
      nodeIds: [],
      objectId: null,
      objectIds: []
    },
    assets: {},
    materials: createEmptyMaterialState(),
    environment: createDefaultEnvironment(),
    lights: {},
    cameras: createEmptyCameraState(),
    presentation: createEmptyPresentationState(),
    problems: createEmptyAuthoredProblemState(),
    dataSources: createEmptyDataSources()
  };

  return Object.freeze(snapshot);
}

export function createObjectNode(object: SceneObject): SceneObjectNode {
  return {
    id: object.id,
    kind: "object",
    name: object.name,
    objectId: object.id,
    parentId: object.parentId,
    children: [...object.children],
    transform: createTransform(object.transform),
    ...(object.metadata ? { metadata: { ...object.metadata } } : {})
  };
}

export function createLightNode(light: LightDefinition | LegacyLightDefinition, id = light.id): SceneLightNode {
  const transform = getLightNodeTransform(light);
  return {
    id,
    kind: "light",
    name: light.name,
    lightId: light.id,
    parentId: null,
    children: [],
    ...(transform ? { transform: createTransform(transform) } : {}),
    ...(light.metadata ? { metadata: { ...light.metadata } } : {})
  };
}

export function createCameraNode(camera: AuthoredCameraDefinition, id = camera.id): SceneCameraNode {
  return {
    id,
    kind: "camera",
    name: camera.name,
    cameraId: camera.id,
    parentId: null,
    children: [],
    transform: createCameraTransform(camera),
    ...(camera.metadata ? { metadata: { ...camera.metadata } } : {})
  };
}

function createCameraTransform(camera: AuthoredCameraDefinition): Transform {
  return createTransform({
    position: camera.position
  });
}

function getLightNodeTransform(light: LightDefinition | LegacyLightDefinition): Transform | undefined {
  switch (light.kind) {
    case "directional":
    case "point":
    case "spot":
      return light.transform;
    case "ambient":
    case "hemisphere":
      return undefined;
    default:
      return assertNever(light as never);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported light: ${JSON.stringify(value)}`);
}
