import type { Transform } from "../../snapshot/types";

export interface SnapSettings {
  translate?: number | null;
  rotate?: number | null;
  scale?: number | null;
}

export function snapTransform(transform: Transform, settings: SnapSettings = {}): Transform {
  return {
    position: snapVector(transform.position, settings.translate),
    rotation: snapVector(transform.rotation, settings.rotate),
    scale: snapVector(transform.scale, settings.scale)
  };
}

export function snapVector<T extends [number, number, number]>(vector: T, increment?: number | null): T {
  if (!increment || !Number.isFinite(increment) || increment <= 0) {
    return [...vector] as T;
  }

  return vector.map((value) => snapNumber(value, increment)) as T;
}

export function snapNumber(value: number, increment: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Snap values must be finite numbers.");
  }
  if (!Number.isFinite(increment) || increment <= 0) {
    throw new Error("Snap increment must be a positive finite number.");
  }
  return normalizeZero(Math.round(value / increment) * increment);
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
