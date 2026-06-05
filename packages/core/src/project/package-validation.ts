import { isSupportedAssetKind } from "../snapshot/primitives";
import type { AssetReference, SceneSnapshot } from "../snapshot/types";
import { isJsonCompatible, validateSceneSnapshot } from "../snapshot/validation";
import { migrateSerializedSnapshot } from "../snapshot/migrations";
import { decodeArchiveJson, type ArchiveAdapter, type ArchiveEntry } from "./archive-adapter";
import {
  DEFAULT_PROJECT_PACKAGE_LIMITS,
  PROJECT_ASSET_DIR,
  PROJECT_MANIFEST_PATH,
  PROJECT_PACKAGE_VERSION,
  PROJECT_SCENE_PATH,
  type ProjectAssetManifestRecord,
  type ProjectPackage,
  type ProjectPackageLimits,
  type ProjectPackageManifest,
  type ProjectProblem
} from "./package-types";

export interface ParseProjectPackageOptions {
  archive: ArchiveAdapter;
  limits?: Partial<ProjectPackageLimits>;
}

export function parseProjectPackage(bytes: Uint8Array, options: ParseProjectPackageOptions): ProjectPackage | { problems: ProjectProblem[] } {
  const limits = normalizeLimits(options.limits);
  const problems: ProjectProblem[] = [];

  if (bytes.byteLength > limits.maxArchiveBytes) {
    return {
      problems: [
        createProjectProblem("project-archive-too-large", "Project archive is too large.", {
          byteSize: bytes.byteLength,
          limit: limits.maxArchiveBytes
        })
      ]
    };
  }

  let entries: ArchiveEntry[];
  try {
    entries = options.archive.read(bytes);
  } catch (error) {
    return {
      problems: [createProjectProblem("project-archive-invalid", errorMessage(error))]
    };
  }

  const entryMap = normalizeEntries(entries, limits, problems);
  if (entryMap.size > limits.maxEntries) {
    problems.push(createProjectProblem("project-entry-limit-exceeded", "Project package has too many entries.", {
      entries: entryMap.size,
      limit: limits.maxEntries
    }));
  }

  const manifestValue = readJsonEntry(entryMap, PROJECT_MANIFEST_PATH, "project-manifest-invalid", problems);
  const sceneValue = readJsonEntry(entryMap, PROJECT_SCENE_PATH, "project-scene-invalid", problems);
  const manifest = validateProjectManifest(manifestValue, problems);
  const scene = validateProjectScene(sceneValue, problems);

  if (manifest && scene) {
    validateManifestAgainstScene(manifest, scene, entryMap, limits, problems);
  }

  if (problems.length > 0 || !manifest || !scene) {
    return { problems };
  }

  const payloads: Record<string, Uint8Array> = {};
  for (const [assetId, record] of Object.entries(manifest.assets)) {
    payloads[assetId] = new Uint8Array(entryMap.get(record.payloadPath)!);
  }

  return {
    manifest,
    scene,
    payloads
  };
}

export function validateProjectManifest(value: unknown, problems: ProjectProblem[]): ProjectPackageManifest | undefined {
  if (!isPlainRecord(value)) {
    problems.push(createProjectProblem("project-manifest-invalid", "Project manifest must be a plain object."));
    return undefined;
  }

  if (value.version !== PROJECT_PACKAGE_VERSION) {
    problems.push(createProjectProblem("project-version-unsupported", `Unsupported project package version: ${String(value.version)}.`));
  }
  if (value.scenePath !== PROJECT_SCENE_PATH) {
    problems.push(createProjectProblem("project-scene-path-invalid", `Project manifest scenePath must be ${PROJECT_SCENE_PATH}.`));
  }
  if (value.completeness !== "complete" && value.completeness !== "partial") {
    problems.push(createProjectProblem("project-completeness-invalid", "Project manifest completeness must be complete or partial."));
  }
  if (!isPlainRecord(value.assets)) {
    problems.push(createProjectProblem("project-assets-invalid", "Project manifest assets must be a plain object map."));
  } else {
    for (const [assetId, record] of Object.entries(value.assets)) {
      validateManifestRecord(assetId, record, problems);
    }
  }
  if ("metadata" in value && !isJsonCompatible(value.metadata)) {
    problems.push(createProjectProblem("project-metadata-invalid", "Project manifest metadata must be JSON-compatible."));
  }
  if (!isJsonCompatible(value)) {
    problems.push(createProjectProblem("project-manifest-runtime-value", "Project manifest must be JSON-compatible."));
  }

  return problems.length === 0 ? value as unknown as ProjectPackageManifest : undefined;
}

export function createProjectProblem(code: string, message: string, metadata?: Record<string, unknown>): ProjectProblem {
  const assetId = typeof metadata?.assetId === "string" ? metadata.assetId : undefined;
  return {
    id: `project:${code}`,
    severity: "error",
    code,
    source: "validation",
    target: assetId ? { kind: "asset", assetId } : { kind: "scene", sceneId: "project" },
    ...(assetId ? { assetId } : {}),
    recoverability: "user-action",
    message,
    display: {
      title: formatProblemTitle(code),
      detail: message
    },
    ...(metadata && isJsonCompatible(metadata) ? { metadata } : {})
  };
}

export function normalizeProjectPath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) {
    return null;
  }
  const parts = normalized.split("/");
  const cleanParts: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      return null;
    }
    cleanParts.push(part);
  }
  if (cleanParts.length === 0 || path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path)) {
    return null;
  }
  return cleanParts.join("/");
}

export function collectSnapshotAssetReferences(snapshot: SceneSnapshot): Set<string> {
  const ids = new Set(Object.keys(snapshot.assets));

  for (const object of Object.values(snapshot.objects)) {
    ids.add(object.asset.id);
  }
  for (const material of Object.values(snapshot.materials.definitions)) {
    for (const slot of Object.values(material.override.textures ?? {})) {
      if (slot) {
        ids.add(slot.assetId);
      }
    }
  }
  if (snapshot.environment.background.mode === "texture" || snapshot.environment.background.mode === "hdr") {
    if (snapshot.environment.background.assetId) {
      ids.add(snapshot.environment.background.assetId);
    }
  }
  if ((snapshot.environment.mode === "texture" || snapshot.environment.mode === "hdr") && snapshot.environment.environment.assetId) {
    ids.add(snapshot.environment.environment.assetId);
  }

  return ids;
}

export function normalizeLimits(limits: Partial<ProjectPackageLimits> | undefined): ProjectPackageLimits {
  return {
    ...DEFAULT_PROJECT_PACKAGE_LIMITS,
    ...limits
  };
}

function normalizeEntries(entries: ArchiveEntry[], limits: ProjectPackageLimits, problems: ProjectProblem[]): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  for (const entry of entries) {
    const normalized = normalizeProjectPath(entry.path);
    if (!normalized) {
      problems.push(createProjectProblem("project-entry-path-invalid", `Project package entry path is unsafe: ${entry.path}.`));
      continue;
    }
    if (map.has(normalized)) {
      problems.push(createProjectProblem("project-entry-duplicate", `Project package contains duplicate entry: ${normalized}.`));
      continue;
    }
    if (entry.bytes.byteLength > limits.maxEntryBytes) {
      problems.push(createProjectProblem("project-entry-too-large", `Project package entry ${normalized} is too large.`, {
        byteSize: entry.bytes.byteLength,
        limit: limits.maxEntryBytes
      }));
      continue;
    }
    map.set(normalized, entry.bytes);
  }
  return map;
}

function readJsonEntry(
  entries: Map<string, Uint8Array>,
  path: string,
  code: string,
  problems: ProjectProblem[]
): unknown {
  const bytes = entries.get(path);
  if (!bytes) {
    problems.push(createProjectProblem(code, `Project package is missing ${path}.`));
    return undefined;
  }
  try {
    return decodeArchiveJson(bytes);
  } catch (error) {
    problems.push(createProjectProblem(code, `${path} is not valid JSON: ${errorMessage(error)}`));
    return undefined;
  }
}

function validateProjectScene(value: unknown, problems: ProjectProblem[]): SceneSnapshot | undefined {
  let scene: SceneSnapshot;
  try {
    scene = migrateSerializedSnapshot(value as never);
  } catch (error) {
    problems.push(createProjectProblem("project-scene-invalid", errorMessage(error)));
    return undefined;
  }

  const result = validateSceneSnapshot(scene);
  if (!result.ok) {
    for (const error of result.errors) {
      problems.push(createProjectProblem("project-scene-invalid", error));
    }
    return undefined;
  }
  return scene;
}

function validateManifestRecord(assetId: string, value: unknown, problems: ProjectProblem[]): void {
  if (!isPlainRecord(value)) {
    problems.push(createProjectProblem("project-asset-record-invalid", `Project asset ${assetId} manifest record must be a plain object.`));
    return;
  }

  if (value.id !== assetId) {
    problems.push(createProjectProblem("project-asset-id-mismatch", `Project asset ${assetId} must use a matching id field.`));
  }
  if (!isSupportedAssetKind(value.kind)) {
    problems.push(createProjectProblem("project-asset-kind-invalid", `Project asset ${assetId} kind is unsupported.`));
  }
  if ("label" in value && value.label !== undefined && typeof value.label !== "string") {
    problems.push(createProjectProblem("project-asset-label-invalid", `Project asset ${assetId} label must be a string.`));
  }
  if ("mimeType" in value && value.mimeType !== undefined && typeof value.mimeType !== "string") {
    problems.push(createProjectProblem("project-asset-mime-invalid", `Project asset ${assetId} MIME type must be a string.`));
  }
  if ("byteSize" in value && value.byteSize !== undefined && (!isNonNegativeInteger(value.byteSize))) {
    problems.push(createProjectProblem("project-asset-size-invalid", `Project asset ${assetId} byte size must be a non-negative integer.`));
  }
  if ("checksum" in value && value.checksum !== undefined && typeof value.checksum !== "string") {
    problems.push(createProjectProblem("project-asset-checksum-invalid", `Project asset ${assetId} checksum must be a string.`));
  }
  if (typeof value.payloadPath !== "string") {
    problems.push(createProjectProblem("project-asset-payload-invalid", `Project asset ${assetId} payloadPath must be a string.`));
  } else if (!normalizeProjectPath(value.payloadPath)?.startsWith(`${PROJECT_ASSET_DIR}/`)) {
    problems.push(createProjectProblem("project-asset-payload-path-invalid", `Project asset ${assetId} payloadPath must stay under ${PROJECT_ASSET_DIR}/.`));
  }
  if ("metadata" in value && !isJsonCompatible(value.metadata)) {
    problems.push(createProjectProblem("project-asset-metadata-invalid", `Project asset ${assetId} metadata must be JSON-compatible.`));
  }
}

function validateManifestAgainstScene(
  manifest: ProjectPackageManifest,
  scene: SceneSnapshot,
  entries: Map<string, Uint8Array>,
  limits: ProjectPackageLimits,
  problems: ProjectProblem[]
): void {
  const referencedAssetIds = collectSnapshotAssetReferences(scene);
  const payloadPaths = new Set<string>();

  for (const assetId of referencedAssetIds) {
    if (!manifest.assets[assetId]) {
      if (manifest.completeness === "complete") {
        problems.push(createProjectProblem("project-asset-manifest-missing", `Project manifest is missing referenced asset ${assetId}.`));
      }
    }
  }

  for (const [assetId, record] of Object.entries(manifest.assets)) {
    const sceneAsset = scene.assets[assetId];
    if (!sceneAsset) {
      problems.push(createProjectProblem("project-asset-not-in-scene", `Project asset ${assetId} is not present in the scene snapshot.`));
      continue;
    }
    validateRecordMatchesAsset(record, sceneAsset, problems);
    const payloadPath = normalizeProjectPath(record.payloadPath);
    if (!payloadPath) {
      continue;
    }
    if (payloadPaths.has(payloadPath)) {
      problems.push(createProjectProblem("project-payload-duplicate", `Project payload path ${payloadPath} is referenced by multiple assets.`));
    }
    payloadPaths.add(payloadPath);
    const payload = entries.get(payloadPath);
    if (!payload) {
      problems.push(createProjectProblem("project-payload-missing", `Project payload ${payloadPath} is missing for asset ${assetId}.`));
      continue;
    }
    if (payload.byteLength > limits.maxEntryBytes) {
      problems.push(createProjectProblem("project-payload-too-large", `Project payload ${payloadPath} exceeds the entry size limit.`));
    }
    if (record.byteSize !== undefined && payload.byteLength !== record.byteSize) {
      problems.push(createProjectProblem("project-payload-size-mismatch", `Project payload ${payloadPath} byte size does not match the manifest.`));
    }
  }
}

function validateRecordMatchesAsset(record: ProjectAssetManifestRecord, asset: AssetReference, problems: ProjectProblem[]): void {
  if (record.kind !== asset.kind) {
    problems.push(createProjectProblem("project-asset-kind-mismatch", `Project asset ${record.id} kind does not match the scene asset.`));
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatProblemTitle(code: string): string {
  return code
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
