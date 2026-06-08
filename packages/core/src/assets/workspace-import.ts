import type { EditorRuntimeOptions } from "../runtime/editor-runtime";
import type { AssetKind, JsonValue, SceneSnapshot } from "../snapshot/types";
import type { AssetInput } from "./types";
import type { GlbImportDiagnostic, GlbImportManifest } from "./import-pipeline";
import type { EditorWithGlbImport } from "../editor/editor-api";

export type WorkbenchImportStatus = "succeeded" | "failed";
export type WorkbenchRasterImportKind = "image" | "texture";

export interface WorkbenchAssetImportFile {
  source: AssetInput["source"];
  name?: string;
  kind?: AssetKind;
  mimeType?: string;
  id?: string;
  metadata?: Record<string, JsonValue>;
}

export interface WorkbenchAssetImportOptions {
  files: readonly WorkbenchAssetImportFile[];
  rasterKind?: WorkbenchRasterImportKind;
  loader?: EditorRuntimeOptions["loader"];
}

export interface WorkbenchAssetImportResult {
  label: string;
  kind?: AssetKind;
  status: WorkbenchImportStatus;
  assetId?: string;
  objectId?: string;
  committed: boolean;
  manifest?: GlbImportManifest;
  diagnostics: WorkbenchAssetImportDiagnostic[];
  snapshot: SceneSnapshot;
}

export interface WorkbenchAssetImportDiagnostic {
  id: string;
  severity: "info" | "warning" | "error";
  code: string;
  title: string;
  detail?: string;
  actionLabel?: string;
}

const GLB_EXTENSIONS = new Set(["glb"]);
const HDR_EXTENSIONS = new Set(["hdr"]);
const RASTER_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "tga", "webp"]);

export async function importWorkbenchAssets(
  editor: EditorWithGlbImport,
  options: WorkbenchAssetImportOptions
): Promise<WorkbenchAssetImportResult[]> {
  const results: WorkbenchAssetImportResult[] = [];

  for (const file of options.files) {
    results.push(await importWorkbenchAsset(editor, file, options));
  }

  return results;
}

export function classifyWorkbenchAssetImportFile(
  file: WorkbenchAssetImportFile,
  rasterKind?: WorkbenchRasterImportKind
): { kind: AssetKind; diagnostic?: WorkbenchAssetImportDiagnostic } {
  if (file.kind) {
    return { kind: file.kind };
  }

  const extension = getExtension(file.name);
  if (GLB_EXTENSIONS.has(extension)) {
    return { kind: "glb" };
  }
  if (HDR_EXTENSIONS.has(extension)) {
    return { kind: "hdr" };
  }
  if (RASTER_EXTENSIONS.has(extension)) {
    if (rasterKind) {
      return { kind: rasterKind };
    }
    return {
      kind: "image",
      diagnostic: createAmbiguousRasterDiagnostic(file.name)
    };
  }

  return {
    kind: "image",
    diagnostic: {
      id: "workbench-import-kind-unsupported",
      severity: "error",
      code: "workbench-import-kind-unsupported",
      title: "Unsupported asset type",
      detail: `${formatLabel(file.name)} cannot be imported as a local Workbench asset.`,
      actionLabel: "Choose GLB, HDR, or image"
    }
  };
}

async function importWorkbenchAsset(
  editor: EditorWithGlbImport,
  file: WorkbenchAssetImportFile,
  options: WorkbenchAssetImportOptions
): Promise<WorkbenchAssetImportResult> {
  const label = formatLabel(file.name);
  const classification = classifyWorkbenchAssetImportFile(file, options.rasterKind);
  if (classification.diagnostic) {
    return {
      label,
      kind: classification.kind,
      status: "failed",
      committed: false,
      diagnostics: [classification.diagnostic],
      snapshot: editor.getSnapshot()
    };
  }

  const kind = classification.kind;
  if (kind === "glb") {
    const result = await editor.importGlbAsset({
      asset: {
        id: file.id,
        kind,
        label,
        source: createProjectSource(file, label),
        metadata: file.metadata
      },
      name: stripExtension(label),
      loader: options.loader,
      commit: true
    });
    const assetId = result.commandResult?.ok
      ? findImportedAssetId(result.commandResult.snapshot, result.snapshot, label)
      : undefined;
    const objectId = result.commandResult?.ok
      ? findImportedObjectId(result.commandResult.snapshot, label)
      : undefined;
    return {
      label,
      kind,
      status: result.ok && result.committed ? "succeeded" : "failed",
      ...(assetId ? { assetId } : {}),
      ...(objectId ? { objectId } : {}),
      committed: result.committed,
      ...(result.manifest ? { manifest: result.manifest } : {}),
      diagnostics: result.diagnostics.map(toWorkbenchDiagnostic),
      snapshot: result.snapshot
    };
  }

  const commandResult = editor.dispatch({
    type: "register-asset",
    asset: {
      id: file.id,
      kind,
      label,
      source: createProjectSource(file, label),
      metadata: file.metadata
    }
  });
  const assetId = commandResult.ok ? findRegisteredAssetId(commandResult.snapshot, file.id, label, kind) : undefined;
  return {
    label,
    kind,
    status: commandResult.ok ? "succeeded" : "failed",
    ...(assetId ? { assetId } : {}),
    committed: commandResult.ok,
    diagnostics: commandResult.ok
      ? []
      : [{
          id: "workbench-import-register-failed",
          severity: "error",
          code: "workbench-import-register-failed",
          title: "Asset registration failed",
          ...(commandResult.error ? { detail: commandResult.error } : {}),
          actionLabel: "Choose another file"
        }],
    snapshot: commandResult.snapshot
  };
}

function createProjectSource(file: WorkbenchAssetImportFile, label: string): AssetInput["source"] {
  if (isSourceRecord(file.source)) {
    const metadata = mergeSourceMetadata(file.source.metadata, file.metadata);
    return {
      ...file.source,
      ...(file.mimeType ? { mimeType: file.mimeType } : {}),
      label,
      ...(metadata ? { metadata } : {})
    };
  }

  return {
    blob: isBlob(file.source) ? file.source : undefined,
    bytes: !isBlob(file.source) ? file.source : undefined,
    ...(file.mimeType ? { mimeType: file.mimeType } : {}),
    label,
    ...(file.metadata ? { metadata: file.metadata } : {})
  };
}

function mergeSourceMetadata(
  sourceMetadata: unknown,
  fileMetadata: Record<string, JsonValue> | undefined
): unknown {
  if (sourceMetadata === undefined) {
    return fileMetadata;
  }
  if (!fileMetadata) {
    return sourceMetadata;
  }
  if (!isRecordMetadata(sourceMetadata)) {
    return sourceMetadata;
  }
  return {
    ...sourceMetadata,
    ...fileMetadata
  };
}

function isRecordMetadata(value: unknown): value is Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function findImportedAssetId(snapshot: SceneSnapshot, resultSnapshot: SceneSnapshot, label: string): string | undefined {
  const objectId = findImportedObjectId(snapshot, label);
  return objectId ? snapshot.objects[objectId]?.asset.id : findRegisteredAssetId(resultSnapshot, undefined, label, "glb");
}

function findImportedObjectId(snapshot: SceneSnapshot, label: string): string | undefined {
  const object = Object.values(snapshot.objects)
    .filter((candidate) => candidate.asset.label === label || candidate.name === stripExtension(label))
    .sort((left, right) => left.id.localeCompare(right.id))
    .at(-1);
  return object?.id;
}

function findRegisteredAssetId(snapshot: SceneSnapshot, id: string | undefined, label: string, kind: AssetKind): string | undefined {
  if (id && snapshot.assets[id]) {
    return id;
  }
  return Object.values(snapshot.assets)
    .filter((asset) => asset.kind === kind && asset.label === label)
    .sort((left, right) => left.id.localeCompare(right.id))
    .at(-1)?.id;
}

function toWorkbenchDiagnostic(diagnostic: GlbImportDiagnostic): WorkbenchAssetImportDiagnostic {
  return {
    id: diagnostic.id,
    severity: diagnostic.severity,
    code: diagnostic.code,
    title: diagnostic.display.title,
    detail: diagnostic.display.detail ?? diagnostic.message,
    ...(diagnostic.display.actionLabel ? { actionLabel: diagnostic.display.actionLabel } : {})
  };
}

function createAmbiguousRasterDiagnostic(name: string | undefined): WorkbenchAssetImportDiagnostic {
  return {
    id: "workbench-import-raster-kind-required",
    severity: "error",
    code: "workbench-import-raster-kind-required",
    title: "Choose image or texture",
    detail: `${formatLabel(name)} is a raster file. Select whether it should be registered as an image or a texture.`,
    actionLabel: "Choose intent"
  };
}

function getExtension(name: string | undefined): string {
  const value = name?.trim().toLowerCase() ?? "";
  const index = value.lastIndexOf(".");
  return index >= 0 ? value.slice(index + 1) : "";
}

function formatLabel(name: string | undefined): string {
  return name?.trim() || "Untitled asset";
}

function stripExtension(label: string): string {
  return label.replace(/\.[^.]+$/, "") || label;
}

function isSourceRecord(source: unknown): source is Record<string, unknown> {
  return Boolean(source) && typeof source === "object" && !isBlob(source) && !(source instanceof Uint8Array) && !(source instanceof ArrayBuffer) && !ArrayBuffer.isView(source);
}

function isBlob(source: unknown): source is Blob {
  return typeof Blob !== "undefined" && source instanceof Blob;
}
