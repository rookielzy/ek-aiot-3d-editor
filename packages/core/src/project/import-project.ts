import { defaultArchiveAdapter, type ArchiveAdapter } from "./archive-adapter";
import type { ProjectAssetStore, StoredProjectAsset } from "./asset-store";
import type { ProjectImportOptions, ProjectImportResult } from "./package-types";
import { parseProjectPackage } from "./package-validation";
import type { SceneSnapshot } from "../snapshot/types";

export function parseProjectPackageBytes(
  bytes: Uint8Array,
  options: ProjectImportOptions & { archive?: ArchiveAdapter } = {}
) {
  return parseProjectPackage(bytes, {
    archive: options.archive ?? defaultArchiveAdapter,
    limits: options.limits
  });
}

export function importProjectAssets(
  bytes: Uint8Array,
  projectAssets: ProjectAssetStore,
  options: ProjectImportOptions & { archive?: ArchiveAdapter } = {}
): ProjectImportResult {
  const parsed = parseProjectPackageBytes(bytes, options);
  if ("problems" in parsed) {
    return {
      ok: false,
      snapshot: undefined as unknown as SceneSnapshot,
      problems: parsed.problems,
      outcome: parsed.problems.some((problem) => problem.code === "project-data-config-invalid")
        ? { kind: "config-error", problems: parsed.problems }
        : { kind: "package-error" }
    };
  }

  const storedAssets: StoredProjectAsset[] = [];
  for (const [assetId, payload] of Object.entries(parsed.payloads)) {
    const record = parsed.manifest.assets[assetId];
    storedAssets.push({
      assetId,
      kind: record.kind,
      ...(record.label ? { label: record.label } : {}),
      ...(record.mimeType ? { mimeType: record.mimeType } : {}),
      ...(record.metadata ? { metadata: record.metadata } : {}),
      bytes: payload,
      byteSize: payload.byteLength,
      ...(record.checksum ? { checksum: record.checksum } : {})
    });
  }
  projectAssets.replaceAll(storedAssets);

  return {
    ok: true,
    snapshot: parsed.scene,
    manifest: parsed.manifest,
    problems: parsed.warnings,
    outcome: { kind: "none", missingCredentialCount: 0 }
  };
}
