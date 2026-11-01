import type { Problem } from "../problems/types";
import type { AssetKind, JsonValue, SceneSnapshot } from "../snapshot/types";

export const PROJECT_PACKAGE_VERSION = 1;
export const PROJECT_MANIFEST_PATH = "project.json";
export const PROJECT_SCENE_PATH = "scene.json";
export const PROJECT_ASSET_DIR = "assets";

export type ProjectPackageVersion = typeof PROJECT_PACKAGE_VERSION;
export type ProjectCompleteness = "complete" | "partial";

export interface ProjectAssetManifestRecord {
  id: string;
  kind: AssetKind;
  label?: string;
  mimeType?: string;
  byteSize?: number;
  checksum?: string;
  payloadPath: string;
  metadata?: Record<string, JsonValue>;
}

export interface ProjectAssetPayloadSummary {
  assetId: string;
  kind: AssetKind;
  available: boolean;
  exportable: boolean;
  label?: string;
  mimeType?: string;
  byteSize?: number;
  checksum?: string;
  metadata?: Record<string, JsonValue>;
}

export interface ProjectPackageManifest {
  version: ProjectPackageVersion;
  scenePath: typeof PROJECT_SCENE_PATH;
  completeness: ProjectCompleteness;
  assets: Record<string, ProjectAssetManifestRecord>;
  metadata?: Record<string, JsonValue>;
}

export interface ProjectPackage {
  manifest: ProjectPackageManifest;
  scene: SceneSnapshot;
  payloads: Record<string, Uint8Array>;
  warnings: ProjectProblem[];
}

export interface ProjectProblem extends Problem {
  source: "validation";
}

/**
 * How a restore attempt stands once package parsing finishes. `package-error`
 * means the bytes or manifest are unusable; `config-error` means the scene
 * parsed but its durable data references cannot resolve and need editing.
 */
export type ProjectRestoreOutcome =
  | { kind: "package-error" }
  | { kind: "config-error"; problems: readonly Problem[] }
  | { kind: "reconnect"; missingCredentialCount: number }
  | { kind: "none"; missingCredentialCount: 0 };

export interface ProjectPackageLimits {
  maxArchiveBytes: number;
  maxEntries: number;
  maxEntryBytes: number;
}

export const DEFAULT_PROJECT_PACKAGE_LIMITS: ProjectPackageLimits = {
  maxArchiveBytes: 100 * 1024 * 1024,
  maxEntries: 1000,
  maxEntryBytes: 75 * 1024 * 1024
};

export interface ProjectImportOptions {
  limits?: Partial<ProjectPackageLimits>;
}

export interface ProjectImportResult {
  ok: boolean;
  snapshot: SceneSnapshot;
  manifest?: ProjectPackageManifest;
  problems: ProjectProblem[];
  outcome: ProjectRestoreOutcome;
}

export interface ProjectExportOptions {
  partial?: boolean;
  metadata?: Record<string, JsonValue>;
}

export interface ProjectExportResult {
  ok: boolean;
  packageBytes?: Uint8Array | Promise<Uint8Array>;
  manifest?: ProjectPackageManifest;
  problems: ProjectProblem[];
}

export interface ReplaceAssetInput {
  assetId: string;
  source: ProjectAssetSourceInput;
  kind?: AssetKind;
  label?: string;
  mimeType?: string;
  metadata?: Record<string, JsonValue>;
}

export interface ReplaceAssetResult {
  ok: boolean;
  problems: ProjectProblem[];
}

export type ProjectAssetSourceInput =
  | Uint8Array
  | ArrayBuffer
  | ArrayBufferView
  | Blob
  | {
      bytes?: Uint8Array | ArrayBuffer | ArrayBufferView;
      blob?: Blob;
      mimeType?: string;
      label?: string;
      metadata?: Record<string, JsonValue>;
    };
