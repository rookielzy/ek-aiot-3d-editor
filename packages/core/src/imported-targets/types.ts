import type { GlbImportManifest, GlbImportTarget } from "../assets/import-pipeline";
import type { JsonValue, NodeId } from "../snapshot/types";

export type ImportedGlbSourceKind = "scene" | "node" | "mesh" | "primitive" | "material" | "camera";

export interface ImportedGlbSourceDescriptor {
  kind: ImportedGlbSourceKind;
  path: string;
  index?: number;
  meshIndex?: number;
  primitiveIndex?: number;
  materialIndex?: number;
  cameraIndex?: number;
  fingerprint?: string;
  metadata?: Record<string, JsonValue>;
}

export interface ImportedGlbMaterialSlotDescriptor {
  slotKey: string;
  label: string;
  source: {
    kind: "material-slot";
    path: string;
    meshIndex?: number;
    primitiveIndex?: number;
    materialIndex?: number;
  };
  materialImportKey?: string;
  metadata?: Record<string, JsonValue>;
}

export interface ImportedGlbRemapMetadata {
  status?: "resolved" | "unresolved" | "stale";
  previousImportKey?: string;
  candidateImportKeys?: string[];
  metadata?: Record<string, JsonValue>;
}

export interface ImportedGlbTargetDescriptor {
  id: NodeId;
  importKey: string;
  parentImportKey: string | null;
  displayName: string;
  source: ImportedGlbSourceDescriptor;
  materialSlots?: ImportedGlbMaterialSlotDescriptor[];
  metadata?: Record<string, JsonValue>;
}

export interface ImportedGlbTargetBuildOptions {
  ownerObjectId: string;
  manifest: GlbImportManifest;
  idPrefix?: string;
}

export interface ImportedGlbTargetBindingDescriptor {
  nodeId: NodeId;
  ownerObjectId: string;
  importKey: string;
  slotKey?: string;
}

export type ImportedGlbProblemTarget =
  | { kind: "imported-target"; objectId: string; nodeId: NodeId; importKey: string }
  | { kind: "imported-material-slot"; objectId: string; nodeId: NodeId; importKey: string; slotId: string };

export function glbImportTargetToImportedSource(target: GlbImportTarget): ImportedGlbSourceDescriptor | null {
  switch (target.kind) {
    case "scene":
      return {
        kind: "scene",
        path: target.path,
        ...(target.sceneIndex !== undefined ? { index: target.sceneIndex } : {})
      };
    case "node":
      return {
        kind: "node",
        path: target.path,
        ...(target.nodeIndex !== undefined ? { index: target.nodeIndex } : {})
      };
    case "mesh":
      return {
        kind: "mesh",
        path: target.path,
        ...(target.meshIndex !== undefined ? { index: target.meshIndex, meshIndex: target.meshIndex } : {})
      };
    case "primitive":
      return {
        kind: "primitive",
        path: target.path,
        ...(target.meshIndex !== undefined ? { meshIndex: target.meshIndex } : {}),
        ...(target.primitiveIndex !== undefined ? { primitiveIndex: target.primitiveIndex } : {})
      };
    case "material":
      return {
        kind: "material",
        path: target.path,
        ...(target.materialIndex !== undefined ? { index: target.materialIndex, materialIndex: target.materialIndex } : {})
      };
    case "camera":
      return {
        kind: "camera",
        path: target.path,
        ...(target.cameraIndex !== undefined ? { index: target.cameraIndex, cameraIndex: target.cameraIndex } : {})
      };
    default:
      return null;
  }
}
