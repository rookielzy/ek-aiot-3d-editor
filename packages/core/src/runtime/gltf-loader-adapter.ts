import { Group, Object3D } from "three";
import type { ResolvedAsset } from "../assets/types";

export interface GltfLoaderAdapter {
  load(resolved: ResolvedAsset): Promise<Object3D>;
}

export class ThreeGltfLoaderAdapter implements GltfLoaderAdapter {
  async load(resolved: ResolvedAsset): Promise<Object3D> {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();

    return await new Promise<Object3D>((resolve, reject) => {
      loader.load(
        resolved.uri,
        (gltf) => resolve(gltf.scene),
        undefined,
        (error) => reject(error)
      );
    });
  }
}

export class PlaceholderGltfLoaderAdapter implements GltfLoaderAdapter {
  async load(): Promise<Object3D> {
    const group = new Group();
    group.name = "GLB placeholder";
    return group;
  }
}
