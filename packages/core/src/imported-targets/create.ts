import { getGlbImportManifestFromMetadata } from "../assets/import-pipeline";
import { cloneTransform } from "../snapshot/transforms";
import type { SceneImportedGlbNode, SceneObjectNode, SceneSnapshot } from "../snapshot/types";
import { createImportedGlbTargetDescriptors } from "./keys";
import type { ImportedGlbTargetDescriptor } from "./types";

export function createImportedGlbNodesFromDescriptors(
  ownerObjectId: string,
  ownerNodeId: string,
  descriptors: readonly ImportedGlbTargetDescriptor[]
): Record<string, SceneImportedGlbNode> {
  const idByImportKey = new Map(descriptors.map((descriptor) => [descriptor.importKey, descriptor.id]));
  const childrenByParentId = new Map<string, string[]>();

  for (const descriptor of descriptors) {
    const parentId = descriptor.parentImportKey ? idByImportKey.get(descriptor.parentImportKey) : ownerNodeId;
    if (!parentId) {
      throw new Error(`Imported target ${descriptor.importKey} references missing parent ${descriptor.parentImportKey}.`);
    }
    childrenByParentId.set(parentId, [...(childrenByParentId.get(parentId) ?? []), descriptor.id]);
  }

  const nodes: Record<string, SceneImportedGlbNode> = {};
  for (const descriptor of descriptors) {
    const parentId = descriptor.parentImportKey ? idByImportKey.get(descriptor.parentImportKey)! : ownerNodeId;
    nodes[descriptor.id] = {
      id: descriptor.id,
      kind: "imported",
      name: descriptor.displayName,
      ownerObjectId,
      importKey: descriptor.importKey,
      source: { ...descriptor.source },
      parentId,
      children: childrenByParentId.get(descriptor.id) ?? [],
      ...(descriptor.materialSlots ? { materialSlots: descriptor.materialSlots.map((slot) => ({ ...slot, source: { ...slot.source } })) } : {}),
      ...(descriptor.metadata ? { metadata: { ...descriptor.metadata } } : {})
    };
  }

  return nodes;
}

export function createImportedGlbNodesFromManifest(snapshot: SceneSnapshot, ownerObjectId: string): {
  ownerNode: SceneObjectNode;
  nodes: Record<string, SceneImportedGlbNode>;
} {
  const ownerNode = findOwnerObjectNode(snapshot, ownerObjectId);
  const object = snapshot.objects[ownerObjectId];
  if (!object) {
    throw new Error(`Owner object ${ownerObjectId} does not exist.`);
  }
  const manifest = getGlbImportManifestFromMetadata(object.asset.metadata);
  if (!manifest) {
    throw new Error(`Owner object ${ownerObjectId} does not have GLB import manifest metadata.`);
  }
  const descriptors = createImportedGlbTargetDescriptors({ ownerObjectId, manifest });
  return {
    ownerNode,
    nodes: createImportedGlbNodesFromDescriptors(ownerObjectId, ownerNode.id, descriptors)
  };
}

export function cloneImportedGlbNode(node: SceneImportedGlbNode): SceneImportedGlbNode {
  return {
    ...node,
    source: {
      ...node.source,
      ...(node.source.metadata ? { metadata: { ...node.source.metadata } } : {})
    },
    children: [...node.children],
    ...(node.transform ? { transform: cloneTransform(node.transform) } : {}),
    ...(node.motion ? { motion: { ...node.motion } } : {}),
    ...(node.materialSlots ? {
      materialSlots: node.materialSlots.map((slot) => ({
        ...slot,
        source: { ...slot.source },
        ...(slot.metadata ? { metadata: { ...slot.metadata } } : {})
      }))
    } : {}),
    ...(node.remap ? {
      remap: {
        ...node.remap,
        ...(node.remap.candidateImportKeys ? { candidateImportKeys: [...node.remap.candidateImportKeys] } : {}),
        ...(node.remap.metadata ? { metadata: { ...node.remap.metadata } } : {})
      }
    } : {}),
    ...(node.metadata ? { metadata: { ...node.metadata } } : {})
  };
}

function findOwnerObjectNode(snapshot: SceneSnapshot, ownerObjectId: string): SceneObjectNode {
  for (const node of Object.values(snapshot.nodes)) {
    if (node.kind === "object" && node.objectId === ownerObjectId) {
      return node;
    }
  }
  throw new Error(`Owner object ${ownerObjectId} does not have an object node.`);
}
