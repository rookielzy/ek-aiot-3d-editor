import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { Transform } from "./types";
import type { SceneSnapshot } from "./types";

export function normalizeTransform(transform: Partial<Transform> = {}): Transform {
  return {
    position: normalizeVector(transform.position, [0, 0, 0]),
    rotation: normalizeVector(transform.rotation, [0, 0, 0]),
    scale: normalizeVector(transform.scale, [1, 1, 1])
  };
}

export function cloneTransform(transform: Transform): Transform {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
    scale: [...transform.scale]
  };
}

export function transformEquals(left: Transform, right: Transform): boolean {
  return (
    vectorEquals(left.position, right.position) &&
    vectorEquals(left.rotation, right.rotation) &&
    vectorEquals(left.scale, right.scale)
  );
}

export function getWorldTransform(snapshot: SceneSnapshot, objectId: string): Transform {
  const matrix = getWorldMatrix(snapshot, objectId);
  return matrixToTransform(matrix);
}

export function getLocalTransformForParent(snapshot: SceneSnapshot, objectId: string, parentId: string | null): Transform {
  const worldMatrix = getWorldMatrix(snapshot, objectId);
  if (!parentId) {
    return matrixToTransform(worldMatrix);
  }

  const parentWorldMatrix = getWorldMatrix(snapshot, parentId);
  return matrixToTransform(parentWorldMatrix.invert().multiply(worldMatrix));
}

function getWorldMatrix(snapshot: SceneSnapshot, objectId: string): Matrix4 {
  const object = snapshot.objects[objectId];
  if (!object) {
    throw new Error(`Object ${objectId} does not exist.`);
  }

  const localMatrix = transformToMatrix(object.transform);
  if (!object.parentId) {
    return localMatrix;
  }

  return getWorldMatrix(snapshot, object.parentId).multiply(localMatrix);
}

function transformToMatrix(transform: Transform): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...transform.position),
    new Quaternion().setFromEuler(new Euler(...transform.rotation, "XYZ")),
    new Vector3(...transform.scale)
  );
}

function matrixToTransform(matrix: Matrix4): Transform {
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, rotation, scale);
  const euler = new Euler().setFromQuaternion(rotation, "XYZ");

  return {
    position: [position.x, position.y, position.z],
    rotation: [euler.x, euler.y, euler.z],
    scale: [scale.x, scale.y, scale.z]
  };
}

function normalizeVector(value: readonly number[] | undefined, fallback: [number, number, number]): [number, number, number] {
  const source = value ?? fallback;
  if (source.length !== 3 || source.some((entry) => !Number.isFinite(entry))) {
    throw new Error("Transform vectors must contain three finite numbers.");
  }

  return [source[0], source[1], source[2]];
}

function vectorEquals(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}
