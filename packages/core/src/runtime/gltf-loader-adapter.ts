import { Group, Object3D } from "three";
import {
  createGlbImportDiagnosticsFromError,
  createGlbImportManifest,
  type GlbImportDiagnostic,
  type GlbImportManifest,
  type GltfLoaderResult
} from "../assets/import-pipeline";
import type { ResolvedAsset } from "../assets/types";

import type { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import type { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export interface GltfLoaderAdapter {
  load(resolved: ResolvedAsset): Promise<Object3D>;
  analyze?(resolved: ResolvedAsset): Promise<GltfLoaderResult>;
}

export type GltfDecoderProvider<T> = T | (() => T | Promise<T>);
export type GltfLoaderFactory = () => GLTFLoader | Promise<GLTFLoader>;

export interface GltfDecoderConfiguration {
  draco?: GltfDecoderProvider<DRACOLoader>;
  ktx2?: GltfDecoderProvider<KTX2Loader>;
  meshopt?: GltfDecoderProvider<typeof MeshoptDecoder>;
}

export interface ThreeGltfLoaderAdapterOptions {
  decoders?: GltfDecoderConfiguration;
  loaderFactory?: GltfLoaderFactory;
  supportedExtensions?: readonly string[];
}

export class GlbImportError extends Error {
  readonly diagnostics: GlbImportDiagnostic[];
  readonly manifest?: GlbImportManifest;

  constructor(message: string, diagnostics: readonly GlbImportDiagnostic[], manifest?: GlbImportManifest) {
    super(message);
    this.name = "GlbImportError";
    this.diagnostics = [...diagnostics];
    this.manifest = manifest;
  }
}

export class ThreeGltfLoaderAdapter implements GltfLoaderAdapter {
  #options: ThreeGltfLoaderAdapterOptions;

  constructor(options: ThreeGltfLoaderAdapterOptions = {}) {
    this.#options = options;
  }

  async load(resolved: ResolvedAsset): Promise<Object3D> {
    return (await this.analyze(resolved)).scene;
  }

  async analyze(resolved: ResolvedAsset): Promise<GltfLoaderResult> {
    try {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const loader = this.#options.loaderFactory ? await this.#options.loaderFactory() : new GLTFLoader();
      await configureGltfLoader(loader, this.#options.decoders);

      const gltf = await loadGltfWithLoader(loader, resolved);
      const manifest = createGlbImportManifest({
        gltf,
        scene: gltf.scene,
        resolved,
        supportedExtensions: this.#options.supportedExtensions
      });
      return {
        scene: gltf.scene,
        manifest,
        diagnostics: manifest.diagnostics
      };
    } catch (error) {
      const diagnostics = createGlbImportDiagnosticsFromError(error);
      throw new GlbImportError(error instanceof Error ? error.message : String(error), diagnostics);
    }
  }
}

export async function configureGltfLoader(loader: GLTFLoader, decoders: GltfDecoderConfiguration | undefined): Promise<GLTFLoader> {
  if (!decoders) {
    return loader;
  }
  if (decoders.draco) {
    loader.setDRACOLoader(await resolveProvider(decoders.draco));
  }
  if (decoders.ktx2) {
    loader.setKTX2Loader(await resolveProvider(decoders.ktx2));
  }
  if (decoders.meshopt) {
    loader.setMeshoptDecoder(await resolveProvider(decoders.meshopt));
  }
  return loader;
}

export async function loadGltfWithLoader(loader: GLTFLoader, resolved: ResolvedAsset): Promise<GLTF> {
  return await new Promise<GLTF>((resolve, reject) => {
    loader.load(
      resolved.uri,
      (gltf) => resolve(gltf),
      undefined,
      (error) => reject(error)
    );
  });
}

async function resolveProvider<T>(provider: GltfDecoderProvider<T>): Promise<T> {
  return typeof provider === "function" ? await (provider as () => T | Promise<T>)() : provider;
}

export class PlaceholderGltfLoaderAdapter implements GltfLoaderAdapter {
  async load(): Promise<Object3D> {
    const group = new Group();
    group.name = "GLB placeholder";
    group.userData.runtimePlaceholder = true;
    return group;
  }
}
