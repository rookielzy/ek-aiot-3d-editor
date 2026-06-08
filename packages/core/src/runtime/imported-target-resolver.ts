import type { Camera, Object3D } from "three";
import type { GlbImportManifest } from "../assets/import-pipeline";
import type { ImportedGlbSourceDescriptor } from "../imported-targets/types";
import { cloneTransform } from "../snapshot/transforms";
import type { SceneImportedGlbNode, Transform } from "../snapshot/types";
import { readTransform } from "./transform";

export type ImportedTargetMatchStatus = "matched" | "aliased" | "missing" | "ambiguous";

export interface RuntimeImportedTargetMatch {
  node: SceneImportedGlbNode;
  ownerObjectId: string;
  importKey: string;
  source: ImportedGlbSourceDescriptor;
  status: ImportedTargetMatchStatus;
  object?: Object3D;
  baseTransform?: Transform;
  pickable: boolean;
  transformable: boolean;
  pickPriority: number;
  aliasNodeIds: string[];
  message?: string;
}

export interface ResolveImportedGlbTargetsInput {
  ownerObjectId: string;
  ownerRoot: Object3D;
  importedNodes: readonly SceneImportedGlbNode[];
  manifest?: GlbImportManifest | null;
}

interface RuntimeObjectIndexes {
  scene: Object3D;
  nodes: Object3D[];
  meshes: Object3D[];
  meshInstances: Map<number, RuntimeMeshInstance[]>;
  cameras: Object3D[];
  manifest: GlbImportManifest | null;
}

interface RuntimeMeshInstance {
  meshIndex: number;
  object: Object3D;
  primitives: Object3D[];
}

export function resolveImportedGlbTargets(input: ResolveImportedGlbTargetsInput): RuntimeImportedTargetMatch[] {
  const indexes = createRuntimeObjectIndexes(input.ownerRoot, input.manifest ?? null);
  const initialMatches = input.importedNodes.map((node) => resolveImportedNode(node, indexes));
  const byObject = new Map<Object3D, RuntimeImportedTargetMatch[]>();

  for (const match of initialMatches) {
    if (!match.object || match.status !== "matched") {
      continue;
    }
    byObject.set(match.object, [...(byObject.get(match.object) ?? []), match]);
  }

  return initialMatches.map((match) => {
    if (!match.object || match.status !== "matched") {
      return match;
    }

    const aliases = byObject.get(match.object) ?? [];
    const aliased = aliases.length > 1;
    const transformable = !aliased && match.transformable;
    return {
      ...match,
      status: aliased ? "aliased" : "matched",
      transformable,
      aliasNodeIds: aliases
        .map((alias) => alias.node.id)
        .filter((nodeId) => nodeId !== match.node.id)
        .sort()
    };
  });
}

function resolveImportedNode(node: SceneImportedGlbNode, indexes: RuntimeObjectIndexes): RuntimeImportedTargetMatch {
  const candidates = resolveCandidates(node.source, indexes);
  if (candidates.length === 0) {
    return {
      node,
      ownerObjectId: node.ownerObjectId,
      importKey: node.importKey,
      source: node.source,
      status: "missing",
      pickable: false,
      transformable: false,
      pickPriority: pickPriorityForSource(node.source),
      aliasNodeIds: [],
      message: `Imported target ${node.importKey} could not be matched in owner object ${node.ownerObjectId}.`
    };
  }

  if (candidates.length > 1) {
    return {
      node,
      ownerObjectId: node.ownerObjectId,
      importKey: node.importKey,
      source: node.source,
      status: "ambiguous",
      object: candidates[0],
      baseTransform: cloneTransform(readTransform(candidates[0])),
      pickable: true,
      transformable: false,
      pickPriority: pickPriorityForSource(node.source),
      aliasNodeIds: [],
      message: `Imported target ${node.importKey} matched ${candidates.length} runtime objects.`
    };
  }

  const object = candidates[0];
  return {
    node,
    ownerObjectId: node.ownerObjectId,
    importKey: node.importKey,
    source: node.source,
    status: "matched",
    object,
    baseTransform: cloneTransform(readTransform(object)),
    pickable: node.source.kind !== "material",
    transformable: node.source.kind !== "scene" && node.source.kind !== "primitive" && object !== indexes.scene,
    pickPriority: pickPriorityForSource(node.source),
    aliasNodeIds: []
  };
}

function resolveCandidates(source: ImportedGlbSourceDescriptor, indexes: RuntimeObjectIndexes): Object3D[] {
  switch (source.kind) {
    case "scene":
      if (indexes.manifest && indexedSourceOutOfRange(indexFromPath(source.path) ?? source.index, indexes.manifest.scenes.length)) {
        return [];
      }
      return [indexes.scene];
    case "node":
      return optionalIndex(indexes.nodes, checkedIndex(indexes.manifest?.nodes.length, source.index ?? indexFromPath(source.path)));
    case "mesh": {
      const meshIndex = checkedIndex(indexes.manifest?.meshes.length, source.meshIndex ?? source.index ?? indexFromPath(source.path));
      return resolveMeshCandidates(meshIndex, indexes);
    }
    case "primitive": {
      const meshIndex = source.meshIndex ?? meshIndexFromPrimitivePath(source.path);
      if (indexes.manifest && !manifestHasPrimitive(indexes.manifest, meshIndex, source.primitiveIndex)) {
        return [];
      }
      return resolvePrimitiveCandidates(
        checkedIndex(indexes.manifest?.meshes.length, meshIndex),
        source.primitiveIndex,
        indexes
      );
    }
    case "camera":
      return optionalIndex(indexes.cameras, checkedIndex(indexes.manifest?.cameras.length, source.cameraIndex ?? source.index ?? indexFromPath(source.path)));
    case "material":
      return [];
  }
}

function createRuntimeObjectIndexes(ownerRoot: Object3D, manifest: GlbImportManifest | null): RuntimeObjectIndexes {
  const withRoot = collectTraversal(ownerRoot, true);
  const withoutRoot = collectTraversal(ownerRoot, false);
  const nodes = selectNodeTraversal(withRoot, withoutRoot, manifest);
  const meshes = withRoot.filter(isMeshLike);
  return {
    scene: ownerRoot,
    nodes,
    meshes,
    meshInstances: createRuntimeMeshInstances(nodes, meshes, manifest),
    cameras: withRoot.filter(isCameraLike),
    manifest
  };
}

function resolveMeshCandidates(meshIndex: number | undefined, indexes: RuntimeObjectIndexes): Object3D[] {
  if (meshIndex === undefined) {
    return [];
  }

  const instances = indexes.meshInstances.get(meshIndex);
  if (instances?.length) {
    return uniqueObjects(instances.map((instance) => instance.object));
  }
  if (indexes.manifest) {
    return [];
  }
  return optionalIndex(indexes.meshes, meshIndex);
}

function resolvePrimitiveCandidates(
  meshIndex: number | undefined,
  primitiveIndex: number | undefined,
  indexes: RuntimeObjectIndexes
): Object3D[] {
  if (meshIndex === undefined) {
    return [];
  }

  const instances = indexes.meshInstances.get(meshIndex);
  if (instances?.length) {
    return uniqueObjects(instances
      .map((instance) => {
        if (primitiveIndex === undefined) {
          return instance.primitives[0];
        }
        return instance.primitives[primitiveIndex];
      })
      .filter((object): object is Object3D => Boolean(object)));
  }
  if (indexes.manifest) {
    return [];
  }
  return optionalIndex(indexes.meshes, meshIndex);
}

function createRuntimeMeshInstances(
  nodes: readonly Object3D[],
  meshes: readonly Object3D[],
  manifest: GlbImportManifest | null
): Map<number, RuntimeMeshInstance[]> {
  const instances = new Map<number, RuntimeMeshInstance[]>();
  if (!manifest || !manifest.nodes.some((node) => node.meshIndex !== undefined)) {
    meshes.forEach((object, meshIndex) => {
      addMeshInstance(instances, {
        meshIndex,
        object,
        primitives: [object]
      });
    });
    return instances;
  }

  for (const node of manifest.nodes) {
    if (node.index === undefined || node.meshIndex === undefined) {
      continue;
    }
    const object = nodes[node.index];
    if (!object) {
      continue;
    }
    const mesh = manifest.meshes.find((candidate) => candidate.index === node.meshIndex);
    addMeshInstance(instances, {
      meshIndex: node.meshIndex,
      object,
      primitives: resolveRuntimePrimitiveObjects(object, mesh?.primitiveCount ?? 1)
    });
  }
  return instances;
}

function addMeshInstance(instances: Map<number, RuntimeMeshInstance[]>, instance: RuntimeMeshInstance): void {
  instances.set(instance.meshIndex, [...(instances.get(instance.meshIndex) ?? []), instance]);
}

function resolveRuntimePrimitiveObjects(object: Object3D, primitiveCount: number): Object3D[] {
  const meshDescendants = collectTraversal(object, true).filter(isMeshLike);
  if (meshDescendants.length === 0) {
    return [];
  }
  if (primitiveCount <= 1) {
    return [meshDescendants[0]];
  }
  return meshDescendants;
}

function uniqueObjects(objects: readonly Object3D[]): Object3D[] {
  return [...new Set(objects)];
}

function checkedIndex(manifestCount: number | undefined, index: number | undefined): number | undefined {
  if (index === undefined) {
    return undefined;
  }
  if (manifestCount !== undefined && indexedSourceOutOfRange(index, manifestCount)) {
    return undefined;
  }
  return index;
}

function indexedSourceOutOfRange(index: number | undefined, count: number): boolean {
  return index !== undefined && (index < 0 || index >= count);
}

function manifestHasPrimitive(
  manifest: GlbImportManifest,
  meshIndex: number | undefined,
  primitiveIndex: number | undefined
): boolean {
  if (meshIndex === undefined || primitiveIndex === undefined) {
    return false;
  }
  const mesh = manifest.meshes.find((candidate) => candidate.index === meshIndex);
  return Boolean(mesh?.primitives.some((primitive) => primitive.primitiveIndex === primitiveIndex));
}

function collectTraversal(ownerRoot: Object3D, includeRoot: boolean): Object3D[] {
  const objects: Object3D[] = [];
  ownerRoot.traverse((object) => {
    if (!includeRoot && object === ownerRoot) {
      return;
    }
    objects.push(object);
  });
  return objects;
}

function selectNodeTraversal(
  withRoot: readonly Object3D[],
  withoutRoot: readonly Object3D[],
  manifest: GlbImportManifest | null
): Object3D[] {
  if (!manifest || manifest.nodes.length === 0) {
    return [...withRoot];
  }

  const withRootScore = scoreTraversal(withRoot, manifest);
  const withoutRootScore = scoreTraversal(withoutRoot, manifest);
  return withoutRootScore > withRootScore ? [...withoutRoot] : [...withRoot];
}

function scoreTraversal(objects: readonly Object3D[], manifest: GlbImportManifest): number {
  let score = objects.length === manifest.nodes.length ? 1000 : 0;
  const comparableCount = Math.min(objects.length, manifest.nodes.length);
  for (let index = 0; index < comparableCount; index += 1) {
    const descriptor = manifest.nodes[index];
    if (!descriptor) {
      continue;
    }
    if (descriptor.name && objects[index]?.name === descriptor.name) {
      score += 10;
    }
    if (descriptor.meshIndex !== undefined && isMeshLike(objects[index])) {
      score += 5;
    }
    if (descriptor.cameraIndex !== undefined && isCameraLike(objects[index])) {
      score += 5;
    }
  }
  return score;
}

function optionalIndex(objects: readonly Object3D[], index: number | undefined): Object3D[] {
  if (index === undefined) {
    return [];
  }
  const object = objects[index];
  return object ? [object] : [];
}

function indexFromPath(path: string): number | undefined {
  const match = path.match(/\/(\d+)$/);
  if (!match) {
    return undefined;
  }
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

function meshIndexFromPrimitivePath(path: string): number | undefined {
  const match = path.match(/^meshes\/(\d+)\/primitives\/\d+$/);
  if (!match) {
    return undefined;
  }
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

function pickPriorityForSource(source: ImportedGlbSourceDescriptor): number {
  switch (source.kind) {
    case "primitive":
      return 60;
    case "mesh":
      return 50;
    case "camera":
      return 45;
    case "node":
      return 30;
    case "scene":
      return 10;
    case "material":
      return 0;
  }
}

function isMeshLike(object: Object3D): boolean {
  return Boolean((object as Object3D & { isMesh?: boolean }).isMesh);
}

function isCameraLike(object: Object3D): object is Camera {
  return Boolean((object as Object3D & { isCamera?: boolean }).isCamera);
}
