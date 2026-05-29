export const ASSET_KINDS = ["glb", "texture", "hdr", "image"] as const;

const COLOR_PATTERN = /^(#[0-9a-fA-F]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/;

export function isSupportedAssetKind(kind: unknown): kind is (typeof ASSET_KINDS)[number] {
  return typeof kind === "string" && (ASSET_KINDS as readonly string[]).includes(kind);
}

export function isColorString(value: unknown): value is string {
  return typeof value === "string" && COLOR_PATTERN.test(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isFiniteRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

export function isVector(value: unknown, size: number): value is number[] {
  return Array.isArray(value) && value.length === size && value.every(isFiniteNumber);
}
