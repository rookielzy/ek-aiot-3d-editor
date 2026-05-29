import { EquirectangularReflectionMapping, SRGBColorSpace, Texture, TextureLoader } from "three";
import type { ResolvedAsset } from "../assets/types";

export interface RuntimeTextureLoaderAdapter {
  load(resolved: ResolvedAsset): Promise<Texture>;
}

export class ThreeTextureLoaderAdapter implements RuntimeTextureLoaderAdapter {
  async load(resolved: ResolvedAsset): Promise<Texture> {
    const texture = await new Promise<Texture>((resolve, reject) => {
      new TextureLoader().load(
        resolved.uri,
        (loaded) => resolve(loaded),
        undefined,
        (error) => reject(error)
      );
    });
    texture.colorSpace = SRGBColorSpace;
    texture.mapping = EquirectangularReflectionMapping;
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
