import { encodeArchiveJson, type ArchiveAdapter } from "./archive-adapter";
import type { ProjectAssetStore } from "./asset-store";
import {
  PROJECT_ASSET_DIR,
  PROJECT_MANIFEST_PATH,
  PROJECT_PACKAGE_VERSION,
  PROJECT_SCENE_PATH,
  type ProjectExportOptions,
  type ProjectExportResult,
  type ProjectPackageManifest,
  type ProjectProblem
} from "./package-types";
import { collectSnapshotAssetReferences, createProjectProblem } from "./package-validation";
import type { SceneSnapshot } from "../snapshot/types";

export function exportProjectPackage(
  snapshot: SceneSnapshot,
  assets: ProjectAssetStore,
  archive: ArchiveAdapter,
  options: ProjectExportOptions = {}
): ProjectExportResult {
  const problems: ProjectProblem[] = [];
  const manifest: ProjectPackageManifest = {
    version: PROJECT_PACKAGE_VERSION,
    scenePath: PROJECT_SCENE_PATH,
    completeness: "complete",
    assets: {},
    ...(options.metadata ? { metadata: options.metadata } : {})
  };
  const entries: Array<{ path: string; bytes: Uint8Array }> = [
    { path: PROJECT_SCENE_PATH, bytes: encodeArchiveJson(snapshot) }
  ];
  const pendingEntries: Array<Promise<{ path: string; bytes: Uint8Array }>> = [];

  for (const assetId of collectSnapshotAssetReferences(snapshot)) {
    const asset = snapshot.assets[assetId];
    if (!asset) {
      problems.push(createProjectProblem("project-export-asset-missing", `Snapshot references missing asset ${assetId}.`, { assetId }));
      continue;
    }
    const payloadPath = createPayloadPath(asset.id, asset.kind);
    const exported = assets.exportRecord(asset, payloadPath);
    if (!exported) {
      problems.push(createProjectProblem("project-export-payload-missing", `Project export is missing payload for asset ${asset.id}.`, {
        assetId: asset.id
      }));
      continue;
    }
    manifest.assets[asset.id] = exported.record;
    if (exported.bytes instanceof Uint8Array) {
      entries.push({ path: payloadPath, bytes: exported.bytes });
    } else {
      pendingEntries.push(exported.bytes.then((bytes) => ({ path: payloadPath, bytes })));
    }
  }

  if (problems.length > 0 && !options.partial) {
    return {
      ok: false,
      manifest,
      problems
    };
  }

  if (problems.length > 0) {
    manifest.completeness = "partial";
  }

  const packageBytes = pendingEntries.length > 0
    ? Promise.all(pendingEntries).then((resolvedEntries) => archive.write([
      { path: PROJECT_MANIFEST_PATH, bytes: encodeArchiveJson(manifest) },
      ...entries,
      ...resolvedEntries
    ]))
    : archive.write(entriesWithManifest(manifest, entries));

  return {
    ok: problems.length === 0,
    packageBytes,
    manifest,
    problems
  };
}

function entriesWithManifest(
  manifest: ProjectPackageManifest,
  entries: Array<{ path: string; bytes: Uint8Array }>
): Array<{ path: string; bytes: Uint8Array }> {
  return [
    { path: PROJECT_MANIFEST_PATH, bytes: encodeArchiveJson(manifest) },
    ...entries
  ];
}

function createPayloadPath(assetId: string, kind: string): string {
  return `${PROJECT_ASSET_DIR}/${sanitizePathPart(assetId)}.${kind}`;
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_") || "asset";
}
