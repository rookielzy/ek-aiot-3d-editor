import type { ResolvedAsset } from "../assets/types";
import type { AssetWorkspacePayloadSummary } from "../assets/workspace";
import { isJsonCompatible } from "../snapshot/validation";
import type { AssetKind, AssetReference, JsonValue } from "../snapshot/types";
import { copyBytes } from "./archive-adapter";
import type { ProjectAssetManifestRecord, ProjectAssetSourceInput } from "./package-types";

export interface StoredProjectAsset {
  assetId: string;
  kind: AssetKind;
  label?: string;
  mimeType?: string;
  metadata?: Record<string, JsonValue>;
  bytes?: Uint8Array;
  blob?: Blob;
  uri?: string;
  byteSize?: number;
  checksum?: string;
}

export interface RegisterProjectAssetInput {
  asset: AssetReference;
  source: ProjectAssetSourceInput;
  mimeType?: string;
  label?: string;
  metadata?: Record<string, JsonValue>;
}

export type ObjectUrlFactory = (source: Blob) => string | undefined;
export type ObjectUrlRevoker = (uri: string) => void;

export class ProjectAssetStore {
  #assets = new Map<string, StoredProjectAsset>();
  #objectUrls = new Map<string, string>();
  #createObjectUrl?: ObjectUrlFactory;
  #revokeObjectUrl?: ObjectUrlRevoker;

  constructor(options: { createObjectUrl?: ObjectUrlFactory; revokeObjectUrl?: ObjectUrlRevoker } = {}) {
    this.#createObjectUrl = options.createObjectUrl ?? defaultCreateObjectUrl;
    this.#revokeObjectUrl = options.revokeObjectUrl ?? defaultRevokeObjectUrl;
  }

  register(input: RegisterProjectAssetInput): StoredProjectAsset {
    const source = normalizeProjectAssetSource(input.source);
    const metadata = {
      ...(input.asset.metadata ?? {}),
      ...(source.metadata ?? {}),
      ...(input.metadata ?? {})
    };
    if (!isJsonCompatible(metadata)) {
      throw new Error("Project asset metadata must be JSON-compatible.");
    }

    const stored: StoredProjectAsset = {
      assetId: input.asset.id,
      kind: input.asset.kind,
      ...(input.label ?? source.label ?? input.asset.label ? { label: input.label ?? source.label ?? input.asset.label } : {}),
      ...(input.mimeType ?? source.mimeType ? { mimeType: input.mimeType ?? source.mimeType } : {}),
      ...(Object.keys(metadata).length ? { metadata } : {}),
      ...(source.bytes ? { bytes: copyBytes(source.bytes), byteSize: source.bytes.byteLength, checksum: checksumBytes(source.bytes) } : {}),
      ...(source.blob ? { blob: source.blob, byteSize: source.blob.size } : {})
    };

    this.set(stored);
    return this.get(input.asset.id)!;
  }

  set(asset: StoredProjectAsset): void {
    this.#revoke(asset.assetId);
    this.#assets.set(asset.assetId, {
      ...asset,
      ...(asset.bytes ? { bytes: copyBytes(asset.bytes), byteSize: asset.byteSize ?? asset.bytes.byteLength } : {})
    });
  }

  get(assetId: string): StoredProjectAsset | undefined {
    const stored = this.#assets.get(assetId);
    return stored
      ? {
          ...stored,
          ...(stored.bytes ? { bytes: copyBytes(stored.bytes) } : {})
        }
      : undefined;
  }

  resolve(asset: AssetReference): ResolvedAsset | null {
    const stored = this.#assets.get(asset.id);
    if (!stored || stored.kind !== asset.kind) {
      return null;
    }
    if (stored.uri) {
      return toResolvedAsset(stored, stored.uri);
    }
    const existingUri = this.#objectUrls.get(asset.id);
    if (existingUri) {
      return toResolvedAsset(stored, existingUri);
    }
    const blobSource = stored.blob ?? (stored.bytes ? new Blob([toBlobArrayBuffer(stored.bytes)], stored.mimeType ? { type: stored.mimeType } : undefined) : undefined);
    if (!blobSource) {
      return null;
    }

    const uri = this.#createObjectUrl?.(blobSource);
    if (!uri) {
      return null;
    }
    this.#objectUrls.set(asset.id, uri);
    return toResolvedAsset(stored, uri);
  }

  exportRecord(asset: AssetReference, payloadPath: string): { record: ProjectAssetManifestRecord; bytes: Uint8Array | Promise<Uint8Array> } | null {
    const stored = this.#assets.get(asset.id);
    if (!stored || stored.kind !== asset.kind || (!stored.bytes && !stored.blob)) {
      return null;
    }
    return {
      record: {
        id: asset.id,
        kind: asset.kind,
        ...(stored.label ?? asset.label ? { label: stored.label ?? asset.label } : {}),
        ...(stored.mimeType ? { mimeType: stored.mimeType } : {}),
        ...createOptionalByteSize(stored),
        ...(stored.checksum ?? stored.bytes ? { checksum: stored.checksum ?? checksumBytes(stored.bytes!) } : {}),
        payloadPath,
        ...(stored.metadata ?? asset.metadata ? { metadata: { ...(asset.metadata ?? {}), ...(stored.metadata ?? {}) } } : {})
      },
      bytes: stored.bytes ? copyBytes(stored.bytes) : blobToBytes(stored.blob!)
    };
  }

  summaries(): AssetWorkspacePayloadSummary[] {
    return [...this.#assets.values()]
      .map((asset) => toPayloadSummary(asset))
      .sort((left, right) => left.assetId.localeCompare(right.assetId));
  }

  entries(): IterableIterator<[string, StoredProjectAsset]> {
    return this.#assets.entries();
  }

  replaceAll(assets: Iterable<StoredProjectAsset>): void {
    this.clear();
    for (const asset of assets) {
      this.set(asset);
    }
  }

  remove(assetId: string): void {
    this.#revoke(assetId);
    this.#assets.delete(assetId);
  }

  clear(): void {
    for (const assetId of this.#assets.keys()) {
      this.#revoke(assetId);
    }
    this.#assets.clear();
  }

  get size(): number {
    return this.#assets.size;
  }

  #revoke(assetId: string): void {
    const uri = this.#objectUrls.get(assetId);
    if (!uri) {
      return;
    }
    this.#objectUrls.delete(assetId);
    this.#revokeObjectUrl?.(uri);
  }
}

function createOptionalByteSize(stored: StoredProjectAsset): { byteSize?: number } {
  const byteSize = stored.byteSize ?? stored.bytes?.byteLength ?? stored.blob?.size;
  return byteSize === undefined ? {} : { byteSize };
}

function toBlobArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function normalizeProjectAssetSource(input: ProjectAssetSourceInput): {
  bytes?: Uint8Array;
  blob?: Blob;
  mimeType?: string;
  label?: string;
  metadata?: Record<string, JsonValue>;
} {
  if (input instanceof Uint8Array) {
    return { bytes: copyBytes(input) };
  }
  if (input instanceof ArrayBuffer) {
    return { bytes: new Uint8Array(input.slice(0)) };
  }
  if (ArrayBuffer.isView(input)) {
    return { bytes: copyBytes(new Uint8Array(input.buffer, input.byteOffset, input.byteLength)) };
  }
  if (isBlob(input)) {
    return {
      blob: input,
      ...(input.type ? { mimeType: input.type } : {})
    };
  }

  const source = input as {
    bytes?: Uint8Array | ArrayBuffer | ArrayBufferView;
    blob?: Blob;
    mimeType?: string;
    label?: string;
    metadata?: Record<string, JsonValue>;
  };
  const bytesSource = source.bytes ?? source.blob;
  if (!bytesSource) {
    throw new Error("Project asset source must include bytes or a Blob.");
  }
  const normalized = normalizeProjectAssetSource(bytesSource);
  return {
    ...normalized,
    ...(source.mimeType ? { mimeType: source.mimeType } : {}),
    ...(source.label ? { label: source.label } : {}),
    ...(source.metadata ? { metadata: source.metadata } : {})
  };
}

export function checksumBytes(bytes: Uint8Array): string {
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function toResolvedAsset(stored: StoredProjectAsset, uri: string): ResolvedAsset {
  return {
    uri,
    ...(stored.mimeType ? { mimeType: stored.mimeType } : {}),
    metadata: {
      ...(stored.metadata ?? {}),
      packageAsset: true,
      byteSize: stored.byteSize ?? stored.bytes?.byteLength ?? 0,
      checksum: stored.checksum ?? (stored.bytes ? checksumBytes(stored.bytes) : "")
    }
  };
}

function toPayloadSummary(stored: StoredProjectAsset): AssetWorkspacePayloadSummary {
  const exportable = Boolean(stored.bytes || stored.blob);
  const byteSize = stored.byteSize ?? stored.bytes?.byteLength ?? stored.blob?.size;
  return {
    assetId: stored.assetId,
    kind: stored.kind,
    available: exportable,
    exportable,
    ...(stored.label ? { label: stored.label } : {}),
    ...(stored.mimeType ? { mimeType: stored.mimeType } : {}),
    ...(byteSize !== undefined ? { byteSize } : {}),
    ...(stored.checksum ?? stored.bytes ? { checksum: stored.checksum ?? checksumBytes(stored.bytes!) } : {}),
    ...(stored.metadata ? { metadata: { ...stored.metadata } } : {})
  };
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function defaultCreateObjectUrl(source: Blob): string | undefined {
  return typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(source)
    : undefined;
}

function defaultRevokeObjectUrl(uri: string): void {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(uri);
  }
}
