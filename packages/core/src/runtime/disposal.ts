import type { Material, Object3D, Texture } from "three";

interface Disposable {
  dispose?: () => void;
}

export function disposeObjectTree(object: Object3D): void {
  object.traverse((entry) => {
    const maybeGeometry = entry as Object3D & { geometry?: Disposable };
    maybeGeometry.geometry?.dispose?.();

    const maybeMaterial = entry as Object3D & { material?: Material | Material[] };
    const materials = Array.isArray(maybeMaterial.material) ? maybeMaterial.material : maybeMaterial.material ? [maybeMaterial.material] : [];
    for (const material of materials) {
      disposeMaterialTextures(material);
      material.dispose();
    }
  });

  object.removeFromParent();
}

export function disposeMaterialTextures(material: Material): void {
  for (const value of Object.values(material) as unknown[]) {
    if (isTexture(value)) {
      value.dispose();
    }
  }
}

function isTexture(value: unknown): value is Texture {
  return Boolean(value && typeof value === "object" && "isTexture" in value && (value as Texture).isTexture);
}
