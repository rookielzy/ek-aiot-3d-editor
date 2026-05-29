import type { AssetKind, AssetReference, JsonValue } from "../snapshot/types";

export type { AssetReference };

export interface RegisteredAsset {
  reference: AssetReference;
  source?: unknown;
}

export interface ResolvedAsset {
  uri: string;
  mimeType?: string;
  metadata?: Record<string, JsonValue>;
}

export type AssetResolver = (asset: AssetReference) => Promise<ResolvedAsset | null> | ResolvedAsset | null;

export interface AssetInput {
  id?: string;
  kind?: AssetKind;
  label?: string;
  source?: unknown;
  metadata?: Record<string, JsonValue>;
}
