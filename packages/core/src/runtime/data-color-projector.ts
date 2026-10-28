import { Material, Mesh, MeshStandardMaterial, Object3D } from "three";
import {
  emptyDataColorCapability,
  type DataColorAssignment,
  type DataColorCapabilityProblem,
  type DataColorObjectCapability
} from "../data-sources/color-preview";
import type { ThreeObjectMap } from "./three-object-map";

export type {
  DataColorAssignment,
  DataColorCapabilityProblem,
  DataColorObjectCapability
} from "../data-sources/color-preview";

export interface DataColorProjectorOptions {
  objects: ThreeObjectMap;
}

interface MeshColorRecord {
  objectNodeId: string;
  authoredMaterial: Material | Material[];
  ownedMaterials: MeshStandardMaterial[];
}

/**
 * Applies runtime-only status colors on top of authored material projection.
 * Colors always live on projection-owned material clones so shared GLB
 * materials, textures and material-slot authoring stay untouched.
 */
export class DataColorProjector {
  readonly #objects: ThreeObjectMap;
  readonly #records = new Map<Mesh, MeshColorRecord>();
  #assignments = new Map<string, string | null>();
  #capabilities = new Map<string, DataColorObjectCapability>();
  #disposed = false;

  constructor(options: DataColorProjectorOptions) {
    this.#objects = options.objects;
  }

  set(assignments: readonly DataColorAssignment[]): DataColorObjectCapability[] {
    if (this.#disposed) {
      return [];
    }
    const next = new Map<string, string | null>();
    for (const assignment of assignments) {
      next.set(assignment.objectNodeId, assignment.color);
    }

    for (const objectNodeId of [...this.#assignedObjectIds()]) {
      if (!next.has(objectNodeId)) {
        this.#restoreObject(objectNodeId);
      }
    }

    const capabilities: DataColorObjectCapability[] = [];
    for (const [objectNodeId, color] of next) {
      const previousColor = this.#assignments.get(objectNodeId);
      const previousCapability = this.#capabilities.get(objectNodeId);
      if (previousCapability && previousColor === color) {
        capabilities.push(previousCapability);
        continue;
      }
      this.#restoreObject(objectNodeId);
      capabilities.push(this.#applyObject(objectNodeId, color));
    }
    this.#assignments = next;
    this.#capabilities = new Map(capabilities.map((capability) => [capability.objectNodeId, capability]));
    return capabilities;
  }

  /**
   * Restores authored materials before a scene projection replaces them.
   * Assignments stay configured so `reapply()` can re-evaluate after loading.
   */
  restoreAll(): void {
    for (const objectNodeId of [...this.#assignedObjectIds()]) {
      this.#restoreObject(objectNodeId);
    }
    this.#capabilities = new Map();
  }

  reapply(): DataColorObjectCapability[] {
    if (this.#disposed) {
      return [];
    }
    const capabilities: DataColorObjectCapability[] = [];
    for (const [objectNodeId, color] of this.#assignments) {
      this.#restoreObject(objectNodeId);
      capabilities.push(this.#applyObject(objectNodeId, color));
    }
    this.#capabilities = new Map(capabilities.map((capability) => [capability.objectNodeId, capability]));
    return capabilities;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const objectNodeId of [...this.#assignedObjectIds()]) {
      this.#restoreObject(objectNodeId);
    }
    this.#assignments.clear();
    this.#capabilities.clear();
  }

  #assignedObjectIds(): Set<string> {
    const objectIds = new Set(this.#assignments.keys());
    for (const record of this.#records.values()) {
      objectIds.add(record.objectNodeId);
    }
    return objectIds;
  }

  #applyObject(objectNodeId: string, color: string | null): DataColorObjectCapability {
    const root = this.#objects.get(objectNodeId);
    if (!root) {
      return emptyDataColorCapability(objectNodeId);
    }

    const meshes: Mesh[] = [];
    root.traverse((object) => {
      if (isMeshWithMaterial(object)) {
        meshes.push(object);
      }
    });

    let slotCount = 0;
    let supportedSlotCount = 0;
    const problems: DataColorCapabilityProblem[] = [];
    for (const mesh of meshes) {
      const authoredMaterial = mesh.material;
      const sourceMaterials = Array.isArray(authoredMaterial) ? authoredMaterial : [authoredMaterial];
      const nextMaterials: Material[] = [];
      const ownedMaterials: MeshStandardMaterial[] = [];
      for (const [slotIndex, source] of sourceMaterials.entries()) {
        slotCount += 1;
        if (!isMeshStandardMaterial(source)) {
          nextMaterials.push(source);
          problems.push({
            code: "color-material-unsupported",
            meshName: mesh.name || "(unnamed mesh)",
            slotIndex: Array.isArray(authoredMaterial) ? slotIndex : null,
            materialType: source.type || "Material",
            message: `Material ${source.type || "unknown"} on ${mesh.name || "mesh"} does not support data color.`
          });
          continue;
        }
        supportedSlotCount += 1;
        if (color === null) {
          nextMaterials.push(source);
          continue;
        }
        const clone = source.clone();
        clone.color.set(color);
        clone.needsUpdate = true;
        nextMaterials.push(clone);
        ownedMaterials.push(clone);
      }
      if (ownedMaterials.length === 0) {
        continue;
      }
      mesh.material = Array.isArray(authoredMaterial) ? nextMaterials : nextMaterials[0]!;
      this.#records.set(mesh, {
        objectNodeId,
        authoredMaterial,
        ownedMaterials
      });
    }

    return {
      objectNodeId,
      status: supportedSlotCount === 0
        ? "unsupported"
        : supportedSlotCount < slotCount ? "partial" : color === null ? "supported" : "applied",
      meshCount: meshes.length,
      slotCount,
      supportedSlotCount,
      problems
    };
  }

  #restoreObject(objectNodeId: string): void {
    for (const [mesh, record] of [...this.#records]) {
      if (record.objectNodeId !== objectNodeId) {
        continue;
      }
      mesh.material = record.authoredMaterial;
      for (const material of record.ownedMaterials) {
        material.dispose();
      }
      this.#records.delete(mesh);
    }
  }
}

function isMeshWithMaterial(object: Object3D): object is Mesh {
  return Boolean((object as Mesh).isMesh && "material" in object);
}

function isMeshStandardMaterial(material: Material): material is MeshStandardMaterial {
  return Boolean((material as MeshStandardMaterial).isMeshStandardMaterial);
}
