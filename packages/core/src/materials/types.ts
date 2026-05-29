import type { AssetReference, JsonValue } from "../snapshot/types";

export type MaterialSide = "front" | "back" | "double";
export type TextureSlotName = "map" | "normalMap" | "roughnessMap" | "metalnessMap" | "emissiveMap" | "alphaMap";
export type TextureColorSpace = "srgb" | "linear" | "none";
export type TextureWrapMode = "clamp-to-edge" | "repeat" | "mirrored-repeat";
export type TextureFilterMode = "nearest" | "linear";

export interface TextureTransform {
  offset?: [number, number];
  repeat?: [number, number];
  rotation?: number;
  center?: [number, number];
}

export interface TextureSlot {
  assetId: AssetReference["id"];
  colorSpace?: TextureColorSpace;
  uvSet?: number;
  wrapS?: TextureWrapMode;
  wrapT?: TextureWrapMode;
  magFilter?: TextureFilterMode;
  minFilter?: TextureFilterMode;
  transform?: TextureTransform;
  metadata?: Record<string, JsonValue>;
}

export interface MeshStandardMaterialOverride {
  color?: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
  side?: MaterialSide;
  envMapIntensity?: number;
  textures?: Partial<Record<TextureSlotName, TextureSlot>>;
  metadata?: Record<string, JsonValue>;
}

export type MaterialTexturePatch = Partial<Record<TextureSlotName, TextureSlot | null>>;

export interface MaterialDefinition {
  id: string;
  name: string;
  kind: "mesh-standard";
  override: MeshStandardMaterialOverride;
  metadata?: Record<string, JsonValue>;
}

export type MaterialAssignmentTarget =
  | { kind: "object"; objectId: string }
  | { kind: "material-slot"; objectId: string; slotId: string };

export interface MaterialAssignment {
  id: string;
  materialId: string;
  target: MaterialAssignmentTarget;
  metadata?: Record<string, JsonValue>;
}

export interface MaterialState {
  definitions: Record<string, MaterialDefinition>;
  assignments: Record<string, MaterialAssignment>;
}

export type MaterialPatch = Omit<Partial<MeshStandardMaterialOverride>, "textures"> & {
  textures?: MaterialTexturePatch;
};
