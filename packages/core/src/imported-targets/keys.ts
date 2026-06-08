import type { GlbImportDescriptor, GlbImportManifest, GlbMeshDescriptor, GlbMeshPrimitiveDescriptor, GlbNodeDescriptor } from "../assets/import-pipeline";
import type { JsonValue } from "../snapshot/types";
import type { ImportedGlbMaterialSlotDescriptor, ImportedGlbSourceDescriptor, ImportedGlbTargetBuildOptions, ImportedGlbTargetDescriptor } from "./types";

export function createImportedGlbTargetDescriptors(options: ImportedGlbTargetBuildOptions): ImportedGlbTargetDescriptor[] {
  const keyContext = createImportedGlbKeyContext(options.ownerObjectId);
  const nodeTargets = createNodeTargets(options.manifest, keyContext);
  const sceneTargets = createSceneTargets(options.manifest, keyContext, nodeTargets);
  const materialImportKeyByIndex = createMaterialImportKeyByIndex(options.manifest, keyContext);
  const meshTargets = createMeshTargets(options.manifest, keyContext, nodeTargets, materialImportKeyByIndex);
  const cameraTargets = createCameraTargets(options.manifest, keyContext, nodeTargets);
  const descriptors = [...sceneTargets, ...nodeTargets, ...meshTargets, ...cameraTargets];
  return ensureUniqueDescriptorIds(descriptors, options.idPrefix ?? `${options.ownerObjectId}:imported`);
}

export function createImportedGlbImportKey(ownerObjectId: string, source: ImportedGlbSourceDescriptor): string {
  return formatImportedGlbImportKey(createImportedGlbOwnerKeyPrefix(ownerObjectId), source.kind, source.path);
}

export function createImportedGlbMaterialSlotKey(ownerObjectId: string, primitive: GlbMeshPrimitiveDescriptor): string {
  return formatImportedGlbMaterialSlotKey(createImportedGlbOwnerKeyPrefix(ownerObjectId), primitive.path, primitive.materialIndex);
}

export function remapImportedGlbOwnerKey(value: string, sourceOwnerObjectId: string, targetOwnerObjectId: string): string {
  const sourcePrefix = createImportedGlbOwnerKeyPrefix(sourceOwnerObjectId);
  const targetPrefix = createImportedGlbOwnerKeyPrefix(targetOwnerObjectId);
  return value === sourcePrefix || value.startsWith(`${sourcePrefix}/`)
    ? `${targetPrefix}${value.slice(sourcePrefix.length)}`
    : value;
}

export function createImportedGlbOwnerKeyPrefix(ownerObjectId: string): string {
  return `glb:${sanitizeKeyPart(ownerObjectId)}`;
}

interface ImportedGlbKeyContext {
  ownerKeyPrefix: string;
  targetKeys: Set<string>;
  materialSlotKeys: Set<string>;
  materialImportKeys: Set<string>;
}

function createImportedGlbKeyContext(ownerObjectId: string): ImportedGlbKeyContext {
  return {
    ownerKeyPrefix: createImportedGlbOwnerKeyPrefix(ownerObjectId),
    targetKeys: new Set<string>(),
    materialSlotKeys: new Set<string>(),
    materialImportKeys: new Set<string>()
  };
}

function createTargetImportKey(
  context: ImportedGlbKeyContext,
  kind: ImportedGlbSourceDescriptor["kind"],
  path: string
): string {
  return allocateCollisionSafeValue(formatImportedGlbImportKey(context.ownerKeyPrefix, kind, path), context.targetKeys);
}

function createMaterialImportKey(context: ImportedGlbKeyContext, path: string): string {
  return allocateCollisionSafeValue(formatImportedGlbImportKey(context.ownerKeyPrefix, "material", path), context.materialImportKeys);
}

function createMaterialSlotKey(context: ImportedGlbKeyContext, primitive: GlbMeshPrimitiveDescriptor): string {
  return allocateCollisionSafeValue(
    formatImportedGlbMaterialSlotKey(context.ownerKeyPrefix, primitive.path, primitive.materialIndex),
    context.materialSlotKeys
  );
}

function formatImportedGlbImportKey(
  ownerKeyPrefix: string,
  kind: ImportedGlbSourceDescriptor["kind"],
  path: string
): string {
  return `${ownerKeyPrefix}/${kind}:${sanitizeKeyPart(path)}`;
}

function formatImportedGlbMaterialSlotKey(
  ownerKeyPrefix: string,
  path: string,
  materialIndex: number | undefined
): string {
  return `${ownerKeyPrefix}/slot:${sanitizeKeyPart(path)}:material-${materialIndex ?? "none"}`;
}

function createSceneTargets(
  manifest: GlbImportManifest,
  keyContext: ImportedGlbKeyContext,
  nodeTargets: readonly ImportedGlbTargetDescriptor[]
): ImportedGlbTargetDescriptor[] {
  const firstRootNode = nodeTargets.find((target) => target.parentImportKey === null);
  return manifest.scenes.map((scene) => {
    const source = createSourceDescriptor("scene", scene);
    const importKey = createTargetImportKey(keyContext, "scene", scene.path);
    return {
      id: importKey,
      importKey,
      parentImportKey: null,
      displayName: scene.name ?? `Scene ${scene.index ?? scene.path}`,
      source,
      metadata: {
        ...(firstRootNode ? { primaryRootImportKey: firstRootNode.importKey } : {})
      }
    };
  });
}

function createNodeTargets(manifest: GlbImportManifest, keyContext: ImportedGlbKeyContext): ImportedGlbTargetDescriptor[] {
  const parentByNodeIndex = new Map<number, number>();
  for (const node of manifest.nodes) {
    if (node.index === undefined) {
      continue;
    }
    for (const childNodeIndex of node.childNodeIndices) {
      if (!parentByNodeIndex.has(childNodeIndex)) {
        parentByNodeIndex.set(childNodeIndex, node.index);
      }
    }
  }

  const importKeyByNodeIndex = new Map<number, string>();
  const importKeys = manifest.nodes.map((node) => createTargetImportKey(keyContext, "node", node.path));
  manifest.nodes.forEach((node, descriptorIndex) => {
    if (node.index !== undefined) {
      importKeyByNodeIndex.set(node.index, importKeys[descriptorIndex]);
    }
  });

  return manifest.nodes.map((node, descriptorIndex) => {
    const source = createNodeSourceDescriptor(node);
    const importKey = importKeys[descriptorIndex];
    const parentNodeIndex = node.index === undefined ? undefined : parentByNodeIndex.get(node.index);
    return {
      id: importKey,
      importKey,
      parentImportKey: parentNodeIndex === undefined ? null : importKeyByNodeIndex.get(parentNodeIndex) ?? null,
      displayName: node.name ?? `Node ${node.index ?? node.path}`,
      source,
      ...(createNodeMetadata(node))
    };
  });
}

function createMeshTargets(
  manifest: GlbImportManifest,
  keyContext: ImportedGlbKeyContext,
  nodeTargets: readonly ImportedGlbTargetDescriptor[],
  materialImportKeyByIndex: ReadonlyMap<number, string>
): ImportedGlbTargetDescriptor[] {
  const nodeImportKeyByMeshIndex = new Map<number, string>();
  for (const node of manifest.nodes) {
    if (node.meshIndex === undefined) {
      continue;
    }
    const nodeTarget = nodeTargets.find((target) => target.source.kind === "node" && target.source.index === node.index);
    if (nodeTarget) {
      nodeImportKeyByMeshIndex.set(node.meshIndex, nodeTarget.importKey);
    }
  }

  return manifest.meshes.flatMap((mesh) => {
    const meshSource = createMeshSourceDescriptor(mesh);
    const meshImportKey = createTargetImportKey(keyContext, "mesh", mesh.path);
    const meshTarget: ImportedGlbTargetDescriptor = {
      id: meshImportKey,
      importKey: meshImportKey,
      parentImportKey: mesh.index === undefined ? null : nodeImportKeyByMeshIndex.get(mesh.index) ?? null,
      displayName: mesh.name ?? `Mesh ${mesh.index ?? mesh.path}`,
      source: meshSource
    };

    const primitiveTargets = mesh.primitives.map((primitive) => {
      const primitiveImportKey = createTargetImportKey(keyContext, "primitive", primitive.path);
      return {
        id: primitiveImportKey,
        importKey: primitiveImportKey,
        parentImportKey: meshImportKey,
        displayName: `Primitive ${primitive.primitiveIndex}`,
        source: createPrimitiveSourceDescriptor(primitive),
        materialSlots: [createPrimitiveMaterialSlot(keyContext, primitive, manifest, materialImportKeyByIndex)]
      } satisfies ImportedGlbTargetDescriptor;
    });

    return [meshTarget, ...primitiveTargets];
  });
}

function createCameraTargets(
  manifest: GlbImportManifest,
  keyContext: ImportedGlbKeyContext,
  nodeTargets: readonly ImportedGlbTargetDescriptor[]
): ImportedGlbTargetDescriptor[] {
  const nodeImportKeyByCameraIndex = new Map<number, string>();
  for (const node of manifest.nodes) {
    if (node.cameraIndex === undefined) {
      continue;
    }
    const nodeTarget = nodeTargets.find((target) => target.source.kind === "node" && target.source.index === node.index);
    if (nodeTarget) {
      nodeImportKeyByCameraIndex.set(node.cameraIndex, nodeTarget.importKey);
    }
  }

  return manifest.cameras.map((camera) => {
    const source = createSourceDescriptor("camera", camera);
    const importKey = createTargetImportKey(keyContext, "camera", camera.path);
    return {
      id: importKey,
      importKey,
      parentImportKey: camera.index === undefined ? null : nodeImportKeyByCameraIndex.get(camera.index) ?? null,
      displayName: camera.name ?? `Camera ${camera.index ?? camera.path}`,
      source
    };
  });
}

function createMaterialImportKeyByIndex(
  manifest: GlbImportManifest,
  keyContext: ImportedGlbKeyContext
): Map<number, string> {
  const importKeyByIndex = new Map<number, string>();
  for (const material of manifest.materials) {
    const importKey = createMaterialImportKey(keyContext, material.path);
    if (material.index !== undefined) {
      importKeyByIndex.set(material.index, importKey);
    }
  }
  return importKeyByIndex;
}

function createPrimitiveMaterialSlot(
  keyContext: ImportedGlbKeyContext,
  primitive: GlbMeshPrimitiveDescriptor,
  manifest: GlbImportManifest,
  materialImportKeyByIndex: ReadonlyMap<number, string>
): ImportedGlbMaterialSlotDescriptor {
  const material = primitive.materialIndex === undefined
    ? undefined
    : manifest.materials.find((candidate) => candidate.index === primitive.materialIndex);
  const slotKey = createMaterialSlotKey(keyContext, primitive);
  return {
    slotKey,
    label: material?.name ?? `Primitive ${primitive.primitiveIndex} material`,
    source: {
      kind: "material-slot",
      path: primitive.path,
      meshIndex: primitive.meshIndex,
      primitiveIndex: primitive.primitiveIndex,
      ...(primitive.materialIndex !== undefined ? { materialIndex: primitive.materialIndex } : {})
    },
    ...(primitive.materialIndex !== undefined && materialImportKeyByIndex.has(primitive.materialIndex)
      ? { materialImportKey: materialImportKeyByIndex.get(primitive.materialIndex)! }
      : {})
  };
}

function createSourceDescriptor(kind: ImportedGlbSourceDescriptor["kind"], descriptor: GlbImportDescriptor): ImportedGlbSourceDescriptor {
  return {
    kind,
    path: descriptor.path,
    ...(descriptor.index !== undefined ? { index: descriptor.index } : {}),
    ...(descriptor.extensions || descriptor.extras ? { metadata: compactMetadata({ extensions: descriptor.extensions, extras: descriptor.extras }) } : {})
  };
}

function createNodeSourceDescriptor(node: GlbNodeDescriptor): ImportedGlbSourceDescriptor {
  return {
    ...createSourceDescriptor("node", node),
    ...(node.meshIndex !== undefined ? { meshIndex: node.meshIndex } : {}),
    ...(node.cameraIndex !== undefined ? { cameraIndex: node.cameraIndex } : {})
  };
}

function createMeshSourceDescriptor(mesh: GlbMeshDescriptor): ImportedGlbSourceDescriptor {
  return {
    ...createSourceDescriptor("mesh", mesh),
    ...(mesh.index !== undefined ? { meshIndex: mesh.index } : {})
  };
}

function createPrimitiveSourceDescriptor(primitive: GlbMeshPrimitiveDescriptor): ImportedGlbSourceDescriptor {
  return {
    kind: "primitive",
    path: primitive.path,
    meshIndex: primitive.meshIndex,
    primitiveIndex: primitive.primitiveIndex,
    ...(primitive.materialIndex !== undefined ? { materialIndex: primitive.materialIndex } : {}),
    metadata: compactMetadata({
      attributeNames: primitive.attributeNames,
      mode: primitive.mode,
      extensions: primitive.extensions,
      extras: primitive.extras
    })
  };
}

function createNodeMetadata(node: GlbNodeDescriptor): Pick<ImportedGlbTargetDescriptor, "metadata"> {
  const metadata = compactMetadata({
    childNodeIndices: node.childNodeIndices,
    meshIndex: node.meshIndex,
    cameraIndex: node.cameraIndex
  });
  return Object.keys(metadata).length ? { metadata } : {};
}

function ensureUniqueDescriptorIds(
  descriptors: readonly ImportedGlbTargetDescriptor[],
  idPrefix: string
): ImportedGlbTargetDescriptor[] {
  const usedIds = new Set<string>();
  return descriptors.map((descriptor) => {
    const preferredId = `${idPrefix}:${sanitizeKeyPart(descriptor.importKey)}`;
    const id = createCollisionSafeId(preferredId, usedIds);
    usedIds.add(id);
    return {
      ...descriptor,
      id
    };
  });
}

function createCollisionSafeId(preferredId: string, usedIds: Set<string>): string {
  if (!usedIds.has(preferredId)) {
    return preferredId;
  }

  let index = 2;
  let candidate = `${preferredId}-${index}`;
  while (usedIds.has(candidate)) {
    index += 1;
    candidate = `${preferredId}-${index}`;
  }
  return candidate;
}

function allocateCollisionSafeValue(preferredValue: string, usedValues: Set<string>): string {
  const value = createCollisionSafeId(preferredValue, usedValues);
  usedValues.add(value);
  return value;
}

function compactMetadata(metadata: Record<string, JsonValue | undefined>): Record<string, JsonValue> {
  const compacted: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) {
      continue;
    }
    compacted[key] = value;
  }
  return compacted;
}

function sanitizeKeyPart(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
  return sanitized || "target";
}
