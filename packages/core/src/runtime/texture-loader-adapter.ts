import { CubeTexture, CubeTextureLoader, EquirectangularReflectionMapping, SRGBColorSpace, Texture, TextureLoader, UVMapping } from "three";
import type { ResolvedAsset } from "../assets/types";

export type RuntimeTextureIntent = "flat" | "equirectangular";

export interface RuntimeTextureLoaderAdapter {
  load(resolved: ResolvedAsset, intent?: RuntimeTextureIntent): Promise<Texture>;
}

export interface RuntimeCubeTextureLoaderAdapter {
  load(resolvedFaces: ResolvedAsset[]): Promise<CubeTexture>;
}

export class ThreeTextureLoaderAdapter implements RuntimeTextureLoaderAdapter {
  async load(resolved: ResolvedAsset, intent: RuntimeTextureIntent = "flat"): Promise<Texture> {
    const texture = await new Promise<Texture>((resolve, reject) => {
      new TextureLoader().load(
        resolved.uri,
        (loaded) => resolve(loaded),
        undefined,
        (error) => reject(error)
      );
    });
    texture.colorSpace = SRGBColorSpace;
    texture.mapping = intent === "equirectangular" ? EquirectangularReflectionMapping : UVMapping;
    return texture;
  }
}

export class ThreeHdrTextureLoaderAdapter implements RuntimeTextureLoaderAdapter {
  async load(resolved: ResolvedAsset): Promise<Texture> {
    const { HDRLoader } = await import("three/examples/jsm/loaders/HDRLoader.js");
    const texture = await new Promise<Texture>((resolve, reject) => {
      new HDRLoader().load(
        resolved.uri,
        (loaded) => resolve(loaded),
        undefined,
        (error) => reject(error)
      );
    });
    texture.mapping = EquirectangularReflectionMapping;
    return texture;
  }
}

export class ThreeCubeTextureLoaderAdapter implements RuntimeCubeTextureLoaderAdapter {
  async load(resolvedFaces: ResolvedAsset[]): Promise<CubeTexture> {
    return await new Promise<CubeTexture>((resolve, reject) => {
      new CubeTextureLoader().load(
        resolvedFaces.map((face) => face.uri),
        (loaded) => resolve(loaded),
        undefined,
        (error) => reject(error)
      );
    });
  }
}
