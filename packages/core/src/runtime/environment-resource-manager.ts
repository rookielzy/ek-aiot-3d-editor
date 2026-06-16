import type { CubeTexture, Texture } from "three";
import type { AssetResolverBridge } from "../assets/resolver";
import type { AssetReference, ResolvedAsset } from "../assets/types";
import type { CubemapFaceReference } from "../environment/types";
import { CUBEMAP_FACE_ROLES } from "../environment/validation";
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
import {
  ThreeCubeTextureLoaderAdapter,
  ThreeHdrTextureLoaderAdapter,
  ThreeTextureLoaderAdapter,
  type RuntimeCubeTextureLoaderAdapter,
  type RuntimeTextureIntent,
  type RuntimeTextureLoaderAdapter
} from "./texture-loader-adapter";

export type EnvironmentAssetKind = "texture" | "hdr" | "cubemap";
export type EnvironmentPmremInput = "equirectangular" | "cubemap";

export interface EnvironmentResourceManagerOptions {
  resolver: AssetResolverBridge;
  textureLoader?: RuntimeTextureLoaderAdapter;
  hdrLoader?: RuntimeTextureLoaderAdapter;
  cubeTextureLoader?: RuntimeCubeTextureLoaderAdapter;
  pmrem?: RuntimePmremAdapter;
}

export type EnvironmentResourceResult =
  | {
      ok: true;
      texture: Texture | CubeTexture;
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
  kind: Exclude<EnvironmentAssetKind, "cubemap">;
  intent: RuntimeTextureIntent;
  role: EnvironmentProjectionRole;
  token: number;
  pmrem?: EnvironmentPmremInput;
}

interface LoadCubemapResourceOptions {
  snapshot: SceneSnapshot;
  faces: CubemapFaceReference[];
  role: EnvironmentProjectionRole;
  token: number;
  pmrem?: EnvironmentPmremInput;
}

interface EnvironmentResourceEntry {
  texture: Texture | CubeTexture;
  kind: EnvironmentAssetKind;
  assetId: string;
  usedToken: number;
  pmrem?: RuntimePmremResult;
  pmremUsedToken?: number;
}

interface ResolvedCubemapFace {
  face: CubemapFaceReference;
  asset: AssetReference;
  resolved: ResolvedAsset;
}

export class EnvironmentResourceManager {
  #resolver: AssetResolverBridge;
  #textureLoader: RuntimeTextureLoaderAdapter;
  #hdrLoader: RuntimeTextureLoaderAdapter;
  #cubeTextureLoader: RuntimeCubeTextureLoaderAdapter;
  #pmrem: RuntimePmremAdapter;
  #resources = new Map<string, EnvironmentResourceEntry>();
  #activeToken = 0;

  constructor(options: EnvironmentResourceManagerOptions) {
    this.#resolver = options.resolver;
    this.#textureLoader = options.textureLoader ?? new ThreeTextureLoaderAdapter();
    this.#hdrLoader = options.hdrLoader ?? new ThreeHdrTextureLoaderAdapter();
    this.#cubeTextureLoader = options.cubeTextureLoader ?? new ThreeCubeTextureLoaderAdapter();
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

    const resolved = await this.#resolveAsset(asset, options.role, options.token);
    if (!resolved.ok) {
      return resolved;
    }

    const key = createResourceKey(asset, resolved.asset, options.intent);
    const existing = this.#resources.get(key);
    if (existing) {
      existing.usedToken = options.token;
      return this.#withPmrem(existing, options);
    }

    let texture: Texture;
    try {
      texture = await this.#loaderFor(options.kind).load(resolved.asset, options.intent);
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
      kind: options.kind,
      assetId: asset.id,
      usedToken: options.token
    };
    this.#resources.set(key, entry);
    return this.#withPmrem(entry, options);
  }

  async loadCubemap(options: LoadCubemapResourceOptions): Promise<EnvironmentResourceResult> {
    const assetFaces: ResolvedCubemapFace[] = [];

    for (const face of options.faces) {
      const asset = resolveAssetReference(options.snapshot, face.assetId);
      if (!asset) {
        return {
          ok: false,
          problem: createEnvironmentAssetUnresolvedProblem(face.assetId, options.role)
        };
      }
      const resolved = await this.#resolveAsset(asset, options.role, options.token);
      if (!resolved.ok) {
        return resolved;
      }
      assetFaces.push({ face, asset, resolved: resolved.asset });
    }

    const orderedAssetFaces = orderCubemapFaces(assetFaces);
    if (!orderedAssetFaces) {
      return {
        ok: false,
        problem: createEnvironmentAssetUnresolvedProblem("missing", options.role)
      };
    }

    const resolvedFaces = orderedAssetFaces.map(({ resolved }) => resolved);
    const key = createCubemapResourceKey(orderedAssetFaces);
    const existing = this.#resources.get(key);
    if (existing) {
      existing.usedToken = options.token;
      return this.#withPmrem(existing, options);
    }

    let texture: CubeTexture;
    try {
      texture = await this.#cubeTextureLoader.load(resolvedFaces);
    } catch (error) {
      if (!this.#isActive(options.token)) {
        return { ok: false, stale: true };
      }
      const assetId = orderedAssetFaces.find((entry) => entry.asset.id)?.asset.id ?? "missing";
      return {
        ok: false,
        problem: createEnvironmentAssetLoadProblem(assetId, options.role, error)
      };
    }

    if (!this.#isActive(options.token)) {
      texture.dispose();
      return { ok: false, stale: true };
    }

    const entry: EnvironmentResourceEntry = {
      texture,
      kind: "cubemap",
      assetId: orderedAssetFaces[0]?.asset.id ?? "missing",
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
    options: { token: number; pmrem?: EnvironmentPmremInput; assetId?: string; role: EnvironmentProjectionRole }
  ): Promise<EnvironmentResourceResult> {
    if (!options.pmrem) {
      return { ok: true, texture: entry.texture };
    }

    if (entry.pmrem) {
      entry.pmremUsedToken = options.token;
      return { ok: true, texture: entry.texture, pmremTexture: entry.pmrem.texture };
    }

    try {
      const pmrem = options.pmrem === "cubemap"
        ? this.#pmrem.fromCubemap(entry.texture as CubeTexture)
        : this.#pmrem.fromEquirectangular(entry.texture as Texture);
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
        problem: createEnvironmentPmremProblem(options.assetId ?? entry.assetId, options.role, error)
      };
    }
  }

  async #resolveAsset(
    asset: AssetReference,
    role: EnvironmentProjectionRole,
    token: number
  ): Promise<{ ok: true; asset: ResolvedAsset } | { ok: false; stale?: boolean; problem?: Problem }> {
    let resolved;
    try {
      resolved = await this.#resolver.resolve(asset);
    } catch (error) {
      if (!this.#isActive(token)) {
        return { ok: false, stale: true };
      }
      return {
        ok: false,
        problem: createEnvironmentAssetResolveProblem(asset.id, role, error)
      };
    }
    if (!this.#isActive(token)) {
      return { ok: false, stale: true };
    }
    if (!resolved) {
      return {
        ok: false,
        problem: createEnvironmentAssetUnresolvedProblem(asset.id, role)
      };
    }
    return { ok: true, asset: resolved };
  }

  #loaderFor(kind: Exclude<EnvironmentAssetKind, "cubemap">): RuntimeTextureLoaderAdapter {
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

function createResourceKey(asset: AssetReference, resolved: ResolvedAsset, intent: RuntimeTextureIntent): string {
  return `${asset.id}:${asset.kind}:${intent}:${resolved.uri}`;
}

function orderCubemapFaces(faces: ResolvedCubemapFace[]): ResolvedCubemapFace[] | undefined {
  const byRole = new Map(faces.map((face) => [face.face.role, face]));
  const ordered = CUBEMAP_FACE_ROLES.map((role) => byRole.get(role));
  return ordered.every((face) => face !== undefined) ? ordered as ResolvedCubemapFace[] : undefined;
}

function createCubemapResourceKey(faces: ResolvedCubemapFace[]): string {
  return faces.map(({ face, asset, resolved }) => `${face.role}:${asset.id}:${asset.kind}:${resolved.uri}`).join("|");
}

function disposeEnvironmentResource(resource: EnvironmentResourceEntry): void {
  resource.pmrem?.dispose();
  resource.texture.dispose();
}
