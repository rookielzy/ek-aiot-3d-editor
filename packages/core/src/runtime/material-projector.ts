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
import { createMaterialAssignmentId } from "../materials/defaults";
import type { AssetResolverBridge } from "../assets/resolver";
import type { MaterialAssignment, MeshStandardMaterialOverride, TextureSlotName } from "../materials/types";
import type { Problem } from "../problems/types";
import type { SceneSnapshot } from "../snapshot/types";
import { MaterialResourceManager, type MaterialResourceManagerOptions } from "./material-resource-manager";
import { resolveMaterialSlotTarget, type MaterialSlotResolution } from "./material-slot-resolver";
import {
  createImportedMaterialSlotAssignmentUnresolvedProblem,
  createImportedMaterialSlotProjectionProblem,
  createImportedMaterialSlotUnresolvedProblem
} from "./problems";
import type { RuntimeNodeTarget } from "./three-object-map";
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

interface MaterialProjectionInput {
  snapshot: SceneSnapshot;
  objectMap: ReadonlyMap<string, Object3D>;
  runtimeTargets: readonly RuntimeNodeTarget[];
  token: number;
  problems: Problem[];
}

interface PendingMeshProjection {
  objectId: string;
  mesh: Mesh;
  slotOverrides: Map<number | "single", MaterialOverrideProjection>;
  objectOverride?: MaterialOverrideProjection;
}

interface MaterialOverrideProjection {
  assignment: MaterialAssignment;
  override: MeshStandardMaterialOverride;
  textures: TextureProjection;
  ownerKey: string;
}

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

  async project(
    snapshot: SceneSnapshot,
    objectsOrTargets: Iterable<[string, Object3D]> | Iterable<[string, RuntimeNodeTarget]>
  ): Promise<Problem[]> {
    const token = this.#resources.beginProjection();
    const problems: Problem[] = [];
    const entries = [...objectsOrTargets];
    const runtimeTargets = toRuntimeTargets(entries);
    const objectMap = runtimeTargets
      ? createObjectMapFromTargets(runtimeTargets)
      : new Map(entries as [string, Object3D][]);
    const input: MaterialProjectionInput = {
      snapshot,
      objectMap,
      runtimeTargets: runtimeTargets ?? [],
      token,
      problems
    };
    const pending = new Map<Mesh, PendingMeshProjection>();

    for (const assignment of sortedAssignments(snapshot)) {
      if (assignment.target.kind !== "object") {
        continue;
      }
      await this.#queueObjectAssignment(input, pending, assignment);
      if (!this.#resources.isActive(token)) {
        return [];
      }
    }

    for (const assignment of sortedAssignments(snapshot)) {
      if (assignment.target.kind !== "material-slot") {
        continue;
      }
      await this.#queueSlotAssignment(input, pending, assignment);
      if (!this.#resources.isActive(token)) {
        return [];
      }
    }

    if (!this.#resources.isActive(token)) {
      return [];
    }

    this.#applyPendingProjections(pending);
    this.#releaseUnprojectedMeshes(new Set(pending.keys()));
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

  async #queueObjectAssignment(
    input: MaterialProjectionInput,
    pending: Map<Mesh, PendingMeshProjection>,
    assignment: MaterialAssignment
  ): Promise<void> {
    const material = input.snapshot.materials.definitions[assignment.materialId];
    const object = input.objectMap.get(assignment.target.objectId);
    if (!material || material.kind !== "mesh-standard" || !object) {
      return;
    }

    const textures = await this.#loadTextures(
      input.snapshot,
      assignment.target.objectId,
      createMaterialAssignmentId(assignment.target),
      material.id,
      material.override,
      input.token,
      input.problems
    );
    if (!this.#resources.isActive(input.token)) {
      return;
    }

    object.traverse((entry) => {
      if (!isMeshWithMaterial(entry)) {
        return;
      }
      this.#pendingForMesh(pending, assignment.target.objectId, entry).objectOverride = {
        assignment,
        override: material.override,
        textures,
        ownerKey: createMaterialAssignmentId(assignment.target)
      };
    });
  }

  async #queueSlotAssignment(
    input: MaterialProjectionInput,
    pending: Map<Mesh, PendingMeshProjection>,
    assignment: MaterialAssignment
  ): Promise<void> {
    const material = input.snapshot.materials.definitions[assignment.materialId];
    if (!material || material.kind !== "mesh-standard" || assignment.target.kind !== "material-slot") {
      return;
    }

    const resolution = resolveMaterialSlotTarget(input.snapshot, assignment.target, input.runtimeTargets);
    if (!this.#handleSlotResolutionProblem(input, assignment, resolution)) {
      return;
    }
    if (!this.#slotResolutionHasMeshStandardSource(resolution)) {
      const assetId = input.snapshot.objects[assignment.target.objectId]?.asset.id;
      input.problems.push(createImportedMaterialSlotProjectionProblem(
        resolution.node,
        assignment.target.slotId,
        `Imported material slot ${assignment.target.slotId} does not resolve to a MeshStandardMaterial.`,
        assetId
      ));
      return;
    }

    const textures = await this.#loadTextures(
      input.snapshot,
      assignment.target.objectId,
      createMaterialAssignmentId(assignment.target),
      material.id,
      material.override,
      input.token,
      input.problems
    );
    if (!this.#resources.isActive(input.token)) {
      return;
    }

    const key = resolution.materialIndex ?? "single";
    this.#pendingForMesh(pending, assignment.target.objectId, resolution.mesh).slotOverrides.set(key, {
      assignment,
      override: material.override,
      textures,
      ownerKey: createMaterialAssignmentId(assignment.target)
    });
  }

  #handleSlotResolutionProblem(
    input: MaterialProjectionInput,
    assignment: MaterialAssignment,
    resolution: MaterialSlotResolution
  ): resolution is MaterialSlotResolution & { status: "resolved" } {
    if (assignment.target.kind !== "material-slot") {
      return false;
    }
    const assetId = input.snapshot.objects[assignment.target.objectId]?.asset.id;
    if (resolution.status === "resolved") {
      return true;
    }
    if (resolution.status === "unresolved") {
      input.problems.push(resolution.node
        ? createImportedMaterialSlotUnresolvedProblem(resolution.node, assignment.target.slotId, assetId, resolution.reason)
        : createImportedMaterialSlotAssignmentUnresolvedProblem(assignment.target.objectId, assignment.target.slotId, assetId));
      return false;
    }

    const reason = formatSlotProjectionFailure(assignment.target.slotId, resolution.reason);
    input.problems.push(createImportedMaterialSlotProjectionProblem(
      resolution.node,
      assignment.target.slotId,
      reason,
      assetId
    ));
    return false;
  }

  #slotResolutionHasMeshStandardSource(resolution: MaterialSlotResolution & { status: "resolved" }): boolean {
    const originalMaterial = this.#records.get(resolution.mesh)?.originalMaterial ?? resolution.mesh.material;
    if (resolution.materialIndex !== undefined) {
      return Array.isArray(originalMaterial) && isMeshStandardMaterial(originalMaterial[resolution.materialIndex]);
    }
    if (Array.isArray(originalMaterial)) {
      return originalMaterial.some(isMeshStandardMaterial);
    }
    return isMeshStandardMaterial(originalMaterial);
  }

  async #loadTextures(
    snapshot: SceneSnapshot,
    objectId: string,
    ownerKey: string,
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
        ownerKey,
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

  #pendingForMesh(
    pending: Map<Mesh, PendingMeshProjection>,
    objectId: string,
    mesh: Mesh
  ): PendingMeshProjection {
    const existing = pending.get(mesh);
    if (existing) {
      return existing;
    }
    const next = {
      objectId,
      mesh,
      slotOverrides: new Map<number | "single", MaterialOverrideProjection>()
    };
    pending.set(mesh, next);
    return next;
  }

  #applyPendingProjections(pending: ReadonlyMap<Mesh, PendingMeshProjection>): void {
    for (const projection of pending.values()) {
      this.#applyMeshProjection(projection);
    }
  }

  #applyMeshProjection(projection: PendingMeshProjection): void {
    const previous = this.#records.get(projection.mesh);
    const originalMaterial = previous?.originalMaterial ?? projection.mesh.material;
    const sourceMaterials = toMaterialArray(originalMaterial);
    const nextMaterials: Material[] = [];
    const ownedMaterials: Material[] = [];
    let projected = false;

    for (const [index, source] of sourceMaterials.entries()) {
      const objectOverride = projection.objectOverride;
      const slotOverride = projection.slotOverrides.get(index) ?? projection.slotOverrides.get("single");
      if (!objectOverride && !slotOverride) {
        nextMaterials.push(source);
        continue;
      }
      if (!isMeshStandardMaterial(source)) {
        nextMaterials.push(source);
        continue;
      }

      const material = source.clone();
      if (objectOverride) {
        applyMeshStandardOverride(material, objectOverride.override, objectOverride.textures);
      }
      if (slotOverride) {
        applyMeshStandardOverride(material, slotOverride.override, slotOverride.textures);
      }
      nextMaterials.push(material);
      ownedMaterials.push(material);
      projected = true;
    }

    if (!projected) {
      if (previous) {
        this.#restoreRecord(projection.mesh, previous);
      }
      return;
    }

    if (previous) {
      disposeProjectionMaterials(previous.ownedMaterials);
    }

    projection.mesh.material = Array.isArray(originalMaterial) ? nextMaterials : nextMaterials[0];
    this.#records.set(projection.mesh, {
      objectId: projection.objectId,
      originalMaterial,
      ownedMaterials
    });
  }

  #releaseUnprojectedMeshes(activeMeshes: ReadonlySet<Mesh>): void {
    for (const [mesh, record] of [...this.#records]) {
      if (!activeMeshes.has(mesh)) {
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

function sortedAssignments(snapshot: SceneSnapshot): MaterialAssignment[] {
  return Object.values(snapshot.materials.assignments)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function toRuntimeTargets(
  entries: readonly ([string, Object3D] | [string, RuntimeNodeTarget])[]
): RuntimeNodeTarget[] | null {
  const targets = entries
    .map(([, value]) => value)
    .filter(isRuntimeNodeTarget);
  return targets.length === entries.length ? targets : null;
}

function createObjectMapFromTargets(targets: readonly RuntimeNodeTarget[]): Map<string, Object3D> {
  const objects = new Map<string, Object3D>();
  for (const target of targets) {
    if (target.kind === "object" && target.objectId) {
      objects.set(target.objectId, target.object);
    }
  }
  return objects;
}

function isRuntimeNodeTarget(value: Object3D | RuntimeNodeTarget): value is RuntimeNodeTarget {
  return "nodeId" in value && "kind" in value && "object" in value && "transformable" in value && "pickable" in value;
}

function formatSlotProjectionFailure(slotId: string, reason: string): string {
  switch (reason) {
    case "target-missing":
      return `Imported material slot ${slotId} has no matched runtime target.`;
    case "target-ambiguous":
      return `Imported material slot ${slotId} matched an ambiguous runtime target.`;
    case "target-not-mesh":
      return `Imported material slot ${slotId} does not resolve to a mesh material.`;
    case "material-index-missing":
      return `Imported material slot ${slotId} does not resolve to a material array index.`;
    default:
      return `Imported material slot ${slotId} could not be projected.`;
  }
}
