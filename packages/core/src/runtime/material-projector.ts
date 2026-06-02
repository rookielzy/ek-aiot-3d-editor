import {
  BackSide,
  DoubleSide,
  FrontSide,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture
} from "three";
import type { AssetResolverBridge } from "../assets/resolver";
import type { MeshStandardMaterialOverride, TextureSlotName } from "../materials/types";
import type { Problem } from "../problems/types";
import type { SceneSnapshot } from "../snapshot/types";
import { MaterialResourceManager, type MaterialResourceManagerOptions } from "./material-resource-manager";
import type { RuntimeTextureLoaderAdapter } from "./texture-loader-adapter";

export interface MaterialProjectorOptions {
  resolver: AssetResolverBridge;
  textureLoader?: RuntimeTextureLoaderAdapter;
}

interface MeshProjectionRecord {
  objectId: string;
  originalMaterial: Material | Material[];
  ownedMaterials: Material[];
}

type TextureProjection = Partial<Record<TextureSlotName, Texture | null>>;

const TEXTURE_SLOTS: TextureSlotName[] = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "alphaMap"];

export class MaterialProjector {
  #resources: MaterialResourceManager;
  #records = new Map<Mesh, MeshProjectionRecord>();

  constructor(options: MaterialProjectorOptions) {
    const resourceOptions: MaterialResourceManagerOptions = {
      resolver: options.resolver,
      textureLoader: options.textureLoader
    };
    this.#resources = new MaterialResourceManager(resourceOptions);
  }

  async project(snapshot: SceneSnapshot, objects: Iterable<[string, Object3D]>): Promise<Problem[]> {
    const token = this.#resources.beginProjection();
    const problems: Problem[] = [];
    const objectMap = new Map(objects);
    const activeAssignedObjectIds = new Set<string>();

    for (const assignment of Object.values(snapshot.materials.assignments)) {
      if (assignment.target.kind !== "object") {
        continue;
      }
      const material = snapshot.materials.definitions[assignment.materialId];
      const object = objectMap.get(assignment.target.objectId);
      if (!material || material.kind !== "mesh-standard" || !object) {
        continue;
      }

      const textures = await this.#loadTextures(snapshot, assignment.target.objectId, material.id, material.override, token, problems);
      if (!this.#resources.isActive(token)) {
        return [];
      }

      this.#applyObjectOverride(assignment.target.objectId, object, material.override, textures);
      activeAssignedObjectIds.add(assignment.target.objectId);
    }

    if (!this.#resources.isActive(token)) {
      return [];
    }

    this.#releaseUnassignedObjects(activeAssignedObjectIds);
    this.#resources.releaseUnused(token);
    return problems;
  }

  releaseObjects(activeObjectIds: Set<string>): void {
    for (const [mesh, record] of [...this.#records]) {
      if (!activeObjectIds.has(record.objectId)) {
        this.#restoreRecord(mesh, record);
      }
    }
    this.#resources.releaseObjects(activeObjectIds);
  }

  dispose(): void {
    for (const [mesh, record] of [...this.#records]) {
      this.#restoreRecord(mesh, record);
    }
    this.#resources.dispose();
  }

  get resourceCount(): number {
    return this.#resources.size;
  }

  async #loadTextures(
    snapshot: SceneSnapshot,
    objectId: string,
    materialId: string,
    override: MeshStandardMaterialOverride,
    token: number,
    problems: Problem[]
  ): Promise<TextureProjection> {
    const textures: TextureProjection = {};
    for (const [slot, textureSlot] of Object.entries(override.textures ?? {}) as [TextureSlotName, NonNullable<MeshStandardMaterialOverride["textures"]>[TextureSlotName]][]) {
      if (!textureSlot) {
        textures[slot] = null;
        continue;
      }

      const result = await this.#resources.load({
        snapshot,
        materialId,
        objectId,
        slot,
        textureSlot,
        token
      });
      if (!this.#resources.isActive(token)) {
        return {};
      }
      if (result.ok) {
        textures[slot] = result.texture;
      } else {
        textures[slot] = null;
        if (result.problem) {
          problems.push(result.problem);
        }
      }
    }
    return textures;
  }

  #applyObjectOverride(
    objectId: string,
    object: Object3D,
    override: MeshStandardMaterialOverride,
    textures: TextureProjection
  ): void {
    object.traverse((entry) => {
      if (!isMeshWithMaterial(entry)) {
        return;
      }

      this.#applyMeshOverride(objectId, entry, override, textures);
    });
  }

  #applyMeshOverride(
    objectId: string,
    mesh: Mesh,
    override: MeshStandardMaterialOverride,
    textures: TextureProjection
  ): void {
    const previous = this.#records.get(mesh);
    const originalMaterial = previous?.originalMaterial ?? mesh.material;
    const sourceMaterials = toMaterialArray(originalMaterial);
    const nextMaterials: Material[] = [];
    const ownedMaterials: Material[] = [];
    let projected = false;

    for (const source of sourceMaterials) {
      if (!isMeshStandardMaterial(source)) {
        nextMaterials.push(source);
        continue;
      }

      const material = source.clone();
      applyMeshStandardOverride(material, override, textures);
      nextMaterials.push(material);
      ownedMaterials.push(material);
      projected = true;
    }

    if (!projected) {
      if (previous) {
        this.#restoreRecord(mesh, previous);
      }
      return;
    }

    if (previous) {
      disposeProjectionMaterials(previous.ownedMaterials);
    }

    mesh.material = Array.isArray(originalMaterial) ? nextMaterials : nextMaterials[0];
    this.#records.set(mesh, {
      objectId,
      originalMaterial,
      ownedMaterials
    });
  }

  #releaseUnassignedObjects(activeAssignedObjectIds: Set<string>): void {
    for (const [mesh, record] of [...this.#records]) {
      if (!activeAssignedObjectIds.has(record.objectId)) {
        this.#restoreRecord(mesh, record);
      }
    }
  }

  #restoreRecord(mesh: Mesh, record: MeshProjectionRecord): void {
    mesh.material = record.originalMaterial;
    disposeProjectionMaterials(record.ownedMaterials);
    this.#records.delete(mesh);
  }
}

function applyMeshStandardOverride(
  material: MeshStandardMaterial,
  override: MeshStandardMaterialOverride,
  textures: TextureProjection
): void {
  if (override.color !== undefined) {
    material.color.set(override.color);
  }
  if (override.metalness !== undefined) {
    material.metalness = override.metalness;
  }
  if (override.roughness !== undefined) {
    material.roughness = override.roughness;
  }
  if (override.emissive !== undefined) {
    material.emissive.set(override.emissive);
  }
  if (override.emissiveIntensity !== undefined) {
    material.emissiveIntensity = override.emissiveIntensity;
  }
  if (override.opacity !== undefined) {
    material.opacity = override.opacity;
  }
  if (override.transparent !== undefined) {
    material.transparent = override.transparent;
  }
  if (override.side !== undefined) {
    material.side = override.side === "double" ? DoubleSide : override.side === "back" ? BackSide : FrontSide;
  }
  if (override.envMapIntensity !== undefined) {
    material.envMapIntensity = override.envMapIntensity;
  }
  for (const slot of TEXTURE_SLOTS) {
    if (slot in textures) {
      setTextureSlot(material, slot, textures[slot] ?? null);
    }
  }
  material.needsUpdate = true;
}

function setTextureSlot(material: MeshStandardMaterial, slot: TextureSlotName, texture: Texture | null): void {
  (material as unknown as Record<TextureSlotName, Texture | null>)[slot] = texture;
}

function isMeshWithMaterial(object: Object3D): object is Mesh {
  return Boolean((object as Mesh).isMesh && "material" in object);
}

function isMeshStandardMaterial(material: Material): material is MeshStandardMaterial {
  return Boolean((material as MeshStandardMaterial).isMeshStandardMaterial);
}

function toMaterialArray(material: Material | Material[]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function disposeProjectionMaterials(materials: Material[]): void {
  for (const material of materials) {
    material.dispose();
  }
}
