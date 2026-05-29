import type { Texture } from "three";
import type { AssetResolverBridge } from "../assets/resolver";
import type { AssetReference, ResolvedAsset } from "../assets/types";
import type { Problem } from "../problems/types";
import type { SceneSnapshot } from "../snapshot/types";
import {
  createEnvironmentAssetLoadProblem,
  createEnvironmentAssetResolveProblem,
  createEnvironmentAssetUnresolvedProblem,
  createEnvironmentPmremProblem,
  type EnvironmentProjectionRole
} from "./problems";
import { NoopPmremAdapter, type RuntimePmremAdapter, type RuntimePmremResult } from "./pmrem-adapter";
import { ThreeHdrTextureLoaderAdapter, ThreeTextureLoaderAdapter, type RuntimeTextureLoaderAdapter } from "./texture-loader-adapter";

export type EnvironmentAssetKind = "texture" | "hdr";

export interface EnvironmentResourceManagerOptions {
  resolver: AssetResolverBridge;
  textureLoader?: RuntimeTextureLoaderAdapter;
  hdrLoader?: RuntimeTextureLoaderAdapter;
  pmrem?: RuntimePmremAdapter;
}

export type EnvironmentResourceResult =
  | {
      ok: true;
      texture: Texture;
      pmremTexture?: Texture;
    }
  | {
      ok: false;
      stale?: boolean;
      problem?: Problem;
    };

interface LoadEnvironmentResourceOptions {
  snapshot: SceneSnapshot;
  assetId: string | undefined;
  kind: EnvironmentAssetKind;
  role: EnvironmentProjectionRole;
  token: number;
  pmrem?: boolean;
}

interface EnvironmentResourceEntry {
  texture: Texture;
  pmrem?: RuntimePmremResult;
  usedToken: number;
  pmremUsedToken?: number;
}

export class EnvironmentResourceManager {
  #resolver: AssetResolverBridge;
  #textureLoader: RuntimeTextureLoaderAdapter;
  #hdrLoader: RuntimeTextureLoaderAdapter;
  #pmrem: RuntimePmremAdapter;
  #resources = new Map<string, EnvironmentResourceEntry>();
  #activeToken = 0;

  constructor(options: EnvironmentResourceManagerOptions) {
    this.#resolver = options.resolver;
    this.#textureLoader = options.textureLoader ?? new ThreeTextureLoaderAdapter();
    this.#hdrLoader = options.hdrLoader ?? new ThreeHdrTextureLoaderAdapter();
    this.#pmrem = options.pmrem ?? new NoopPmremAdapter();
  }

  beginProjection(): number {
    this.#activeToken += 1;
    return this.#activeToken;
  }

  async load(options: LoadEnvironmentResourceOptions): Promise<EnvironmentResourceResult> {
    const asset = resolveAssetReference(options.snapshot, options.assetId);
    if (!asset) {
      return {
        ok: false,
        problem: createEnvironmentAssetUnresolvedProblem(options.assetId ?? "missing", options.role)
      };
    }

    let resolved;
    try {
      resolved = await this.#resolver.resolve(asset);
    } catch (error) {
      if (!this.#isActive(options.token)) {
        return { ok: false, stale: true };
      }
      return {
        ok: false,
        problem: createEnvironmentAssetResolveProblem(asset.id, options.role, error)
      };
    }
    if (!this.#isActive(options.token)) {
      return { ok: false, stale: true };
    }
    if (!resolved) {
      return {
        ok: false,
        problem: createEnvironmentAssetUnresolvedProblem(asset.id, options.role)
      };
    }

    const key = createResourceKey(asset, resolved);
    const existing = this.#resources.get(key);
    if (existing) {
      existing.usedToken = options.token;
      return this.#withPmrem(existing, options);
    }

    let texture: Texture;
    try {
      texture = await this.#loaderFor(options.kind).load(resolved);
    } catch (error) {
      if (!this.#isActive(options.token)) {
        return { ok: false, stale: true };
      }
      return {
        ok: false,
        problem: createEnvironmentAssetLoadProblem(asset.id, options.role, error)
      };
    }

    if (!this.#isActive(options.token)) {
      texture.dispose();
      return { ok: false, stale: true };
    }

    const entry: EnvironmentResourceEntry = {
      texture,
      usedToken: options.token
    };
    this.#resources.set(key, entry);
    return this.#withPmrem(entry, options);
  }

  releaseUnused(token: number): void {
    if (!this.#isActive(token)) {
      return;
    }

    for (const [key, resource] of this.#resources) {
      if (resource.pmrem && resource.pmremUsedToken !== token) {
        resource.pmrem.dispose();
        delete resource.pmrem;
        delete resource.pmremUsedToken;
      }
      if (resource.usedToken !== token) {
        disposeEnvironmentResource(resource);
        this.#resources.delete(key);
      }
    }
  }

  dispose(): void {
    this.#activeToken += 1;
    for (const resource of this.#resources.values()) {
      disposeEnvironmentResource(resource);
    }
    this.#resources.clear();
    this.#pmrem.dispose();
  }

  get size(): number {
    return this.#resources.size;
  }

  isActive(token: number): boolean {
    return this.#isActive(token);
  }

  async #withPmrem(
    entry: EnvironmentResourceEntry,
    options: LoadEnvironmentResourceOptions
  ): Promise<EnvironmentResourceResult> {
    if (!options.pmrem) {
      return { ok: true, texture: entry.texture };
    }

    if (entry.pmrem) {
      entry.pmremUsedToken = options.token;
      return { ok: true, texture: entry.texture, pmremTexture: entry.pmrem.texture };
    }

    try {
      const pmrem = this.#pmrem.fromEquirectangular(entry.texture);
      if (!this.#isActive(options.token)) {
        pmrem.dispose();
        return { ok: false, stale: true };
      }
      entry.pmrem = pmrem;
      entry.pmremUsedToken = options.token;
      return { ok: true, texture: entry.texture, pmremTexture: pmrem.texture };
    } catch (error) {
      return {
        ok: false,
        problem: createEnvironmentPmremProblem(options.assetId ?? "missing", options.role, error)
      };
    }
  }

  #loaderFor(kind: EnvironmentAssetKind): RuntimeTextureLoaderAdapter {
    return kind === "hdr" ? this.#hdrLoader : this.#textureLoader;
  }

  #isActive(token: number): boolean {
    return token === this.#activeToken;
  }
}

function resolveAssetReference(snapshot: SceneSnapshot, assetId: string | undefined): AssetReference | undefined {
  if (!assetId) {
    return undefined;
  }
  return snapshot.assets[assetId];
}

function createResourceKey(asset: AssetReference, resolved: ResolvedAsset): string {
  return `${asset.id}:${asset.kind}:${resolved.uri}`;
}

function disposeEnvironmentResource(resource: EnvironmentResourceEntry): void {
  resource.pmrem?.dispose();
  resource.texture.dispose();
}
