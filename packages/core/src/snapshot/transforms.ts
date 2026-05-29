import type { Transform } from "./types";

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
