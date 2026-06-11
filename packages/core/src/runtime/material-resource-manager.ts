import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearSRGBColorSpace,
  MirroredRepeatWrapping,
  NearestFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  UVMapping
} from "three";
import type { AssetResolverBridge } from "../assets/resolver";
import type { AssetReference, ResolvedAsset } from "../assets/types";
import type { TextureSlot, TextureSlotName } from "../materials/types";
import type { Problem } from "../problems/types";
import type { SceneSnapshot } from "../snapshot/types";
import {
  createMaterialTextureAssetLoadProblem,
  createMaterialTextureAssetResolveProblem,
  createMaterialTextureAssetUnresolvedProblem
} from "./problems";
import { ThreeTextureLoaderAdapter, type RuntimeTextureLoaderAdapter } from "./texture-loader-adapter";

export interface MaterialResourceManagerOptions {
  resolver: AssetResolverBridge;
  textureLoader?: RuntimeTextureLoaderAdapter;
}

export type MaterialResourceResult =
  | {
      ok: true;
      texture: Texture;
    }
  | {
      ok: false;
      stale?: boolean;
      problem?: Problem;
    };

export interface LoadMaterialTextureOptions {
  snapshot: SceneSnapshot;
  materialId: string;
  objectId: string;
  ownerKey?: string;
  slot: TextureSlotName;
  textureSlot: TextureSlot;
  token: number;
}

interface MaterialTextureResourceEntry {
  texture: Texture;
  usedToken: number;
  owners: Map<string, MaterialTextureResourceOwner>;
}

interface MaterialTextureResourceOwner {
  objectId: string;
  usedToken: number;
}

export class MaterialResourceManager {
  #resolver: AssetResolverBridge;
  #textureLoader: RuntimeTextureLoaderAdapter;
  #resources = new Map<string, MaterialTextureResourceEntry>();
  #activeToken = 0;

  constructor(options: MaterialResourceManagerOptions) {
    this.#resolver = options.resolver;
    this.#textureLoader = options.textureLoader ?? new ThreeTextureLoaderAdapter();
  }

  beginProjection(): number {
    this.#activeToken += 1;
    return this.#activeToken;
  }

  async load(options: LoadMaterialTextureOptions): Promise<MaterialResourceResult> {
    const asset = resolveAssetReference(options.snapshot, options.textureSlot.assetId);
    if (!asset) {
      return {
        ok: false,
        problem: createMaterialTextureAssetUnresolvedProblem(options)
      };
    }

    let resolved: ResolvedAsset | null;
    try {
      resolved = await this.#resolver.resolve(asset);
    } catch (error) {
      if (!this.#isActive(options.token)) {
        return { ok: false, stale: true };
      }
      return {
        ok: false,
        problem: createMaterialTextureAssetResolveProblem(options, error)
      };
    }
    if (!this.#isActive(options.token)) {
      return { ok: false, stale: true };
    }
    if (!resolved) {
      return {
        ok: false,
        problem: createMaterialTextureAssetUnresolvedProblem(options)
      };
    }

    const key = createResourceKey(asset, resolved, options.slot, options.textureSlot);
    const existing = this.#resources.get(key);
    if (existing) {
      markUsed(existing, options);
      return { ok: true, texture: existing.texture };
    }

    let texture: Texture;
    try {
      texture = await this.#textureLoader.load(resolved);
    } catch (error) {
      if (!this.#isActive(options.token)) {
        return { ok: false, stale: true };
      }
      return {
        ok: false,
        problem: createMaterialTextureAssetLoadProblem(options, error)
      };
    }

    if (!this.#isActive(options.token)) {
      texture.dispose();
      return { ok: false, stale: true };
    }

    configureTexture(texture, options.slot, options.textureSlot);
    const entry: MaterialTextureResourceEntry = {
      texture,
      usedToken: options.token,
      owners: new Map([[createOwnerKey(options), createResourceOwner(options)]])
    };
    this.#resources.set(key, entry);
    return { ok: true, texture };
  }

  releaseUnused(token: number): void {
    if (!this.#isActive(token)) {
      return;
    }

    for (const [key, resource] of this.#resources) {
      for (const [ownerKey, owner] of resource.owners) {
        if (owner.usedToken !== token) {
          resource.owners.delete(ownerKey);
        }
      }
      if (resource.usedToken !== token || resource.owners.size === 0) {
        resource.texture.dispose();
        this.#resources.delete(key);
      }
    }
  }

  releaseObjects(activeObjectIds: Set<string>): void {
    this.#activeToken += 1;
    for (const [key, resource] of this.#resources) {
      for (const [ownerKey, owner] of resource.owners) {
        if (!activeObjectIds.has(owner.objectId)) {
          resource.owners.delete(ownerKey);
        }
      }
      if (resource.owners.size === 0) {
        resource.texture.dispose();
        this.#resources.delete(key);
      }
    }
  }

  dispose(): void {
    this.#activeToken += 1;
    for (const resource of this.#resources.values()) {
      resource.texture.dispose();
    }
    this.#resources.clear();
  }

  get size(): number {
    return this.#resources.size;
  }

  isActive(token: number): boolean {
    return this.#isActive(token);
  }

  #isActive(token: number): boolean {
    return token === this.#activeToken;
  }
}

function markUsed(entry: MaterialTextureResourceEntry, options: LoadMaterialTextureOptions): void {
  entry.usedToken = options.token;
  entry.owners.set(createOwnerKey(options), createResourceOwner(options));
}

function createOwnerKey(options: Pick<LoadMaterialTextureOptions, "objectId" | "ownerKey">): string {
  return options.ownerKey ?? `object:${options.objectId}`;
}

function createResourceOwner(options: Pick<LoadMaterialTextureOptions, "objectId" | "token">): MaterialTextureResourceOwner {
  return {
    objectId: options.objectId,
    usedToken: options.token
  };
}

function resolveAssetReference(snapshot: SceneSnapshot, assetId: string): AssetReference | undefined {
  return snapshot.assets[assetId];
}

function createResourceKey(
  asset: AssetReference,
  resolved: ResolvedAsset,
  slot: TextureSlotName,
  textureSlot: TextureSlot
): string {
  return JSON.stringify({
    assetId: asset.id,
    kind: asset.kind,
    uri: resolved.uri,
    slot,
    colorSpace: textureSlot.colorSpace,
    uvSet: textureSlot.uvSet,
    wrapS: textureSlot.wrapS,
    wrapT: textureSlot.wrapT,
    magFilter: textureSlot.magFilter,
    minFilter: textureSlot.minFilter,
    transform: textureSlot.transform
  });
}

function configureTexture(texture: Texture, slot: TextureSlotName, textureSlot: TextureSlot): void {
  texture.mapping = UVMapping;
  texture.colorSpace = resolveColorSpace(slot, textureSlot.colorSpace);
  if (textureSlot.uvSet !== undefined) {
    texture.channel = textureSlot.uvSet;
  }
  if (textureSlot.wrapS) {
    texture.wrapS = textureSlot.wrapS === "repeat"
      ? RepeatWrapping
      : textureSlot.wrapS === "mirrored-repeat" ? MirroredRepeatWrapping : ClampToEdgeWrapping;
  }
  if (textureSlot.wrapT) {
    texture.wrapT = textureSlot.wrapT === "repeat"
      ? RepeatWrapping
      : textureSlot.wrapT === "mirrored-repeat" ? MirroredRepeatWrapping : ClampToEdgeWrapping;
  }
  if (textureSlot.magFilter) {
    texture.magFilter = textureSlot.magFilter === "nearest" ? NearestFilter : LinearFilter;
  }
  if (textureSlot.minFilter) {
    texture.minFilter = textureSlot.minFilter === "nearest" ? NearestFilter : LinearFilter;
  }
  if (textureSlot.transform?.offset) {
    texture.offset.fromArray(textureSlot.transform.offset);
  }
  if (textureSlot.transform?.repeat) {
    texture.repeat.fromArray(textureSlot.transform.repeat);
  }
  if (textureSlot.transform?.rotation !== undefined) {
    texture.rotation = textureSlot.transform.rotation;
  }
  if (textureSlot.transform?.center) {
    texture.center.fromArray(textureSlot.transform.center);
  }
  texture.needsUpdate = true;
}

function resolveColorSpace(slot: TextureSlotName, colorSpace: TextureSlot["colorSpace"]): Texture["colorSpace"] {
  if (colorSpace === "srgb") {
    return SRGBColorSpace;
  }
  if (colorSpace === "linear") {
    return LinearSRGBColorSpace;
  }
  if (colorSpace === "none") {
    return NoColorSpace;
  }
  return slot === "map" || slot === "emissiveMap" ? SRGBColorSpace : NoColorSpace;
}
