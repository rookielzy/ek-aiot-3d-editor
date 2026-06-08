import type { Material, Object3D } from "three";
import type { Problem, ProblemRecoverability, ProblemSeverity } from "../problems/types";
import { isJsonCompatible, isPlainRecord } from "../snapshot/json";
import type { AssetReference, JsonValue } from "../snapshot/types";
import type { ResolvedAsset } from "./types";

export const GLB_IMPORT_MANIFEST_METADATA_KEY = "glbImportManifest";
export const GLB_IMPORT_MANIFEST_VERSION = 1;

export type GlbImportStatus = "not-applicable" | "not-analyzed" | "analyzed" | "has-diagnostics" | "failed";

export type GlbImportDiagnosticCode =
  | "glb-decoder-missing"
  | "glb-extension-required-unsupported"
  | "glb-extension-unknown"
  | "glb-source-invalid"
  | "glb-load-failed"
  | "glb-manifest-invalid";

export type GlbImportTarget =
  | { kind: "asset"; assetId?: string }
  | { kind: "scene"; sceneIndex?: number; path: string }
  | { kind: "node"; nodeIndex?: number; path: string }
  | { kind: "mesh"; meshIndex?: number; path: string }
  | { kind: "primitive"; meshIndex?: number; primitiveIndex?: number; path: string }
  | { kind: "material"; materialIndex?: number; path: string }
  | { kind: "texture"; textureIndex?: number; path: string }
  | { kind: "image"; imageIndex?: number; path: string }
  | { kind: "camera"; cameraIndex?: number; path: string }
  | { kind: "animation"; animationIndex?: number; path: string }
  | { kind: "extension"; extension: string };

export interface GlbImportDiagnostic {
  id: string;
  severity: ProblemSeverity;
  code: GlbImportDiagnosticCode;
  target: GlbImportTarget;
  message: string;
  recoverability: ProblemRecoverability;
  display: {
    title: string;
    detail?: string;
    actionLabel?: string;
  };
  metadata?: Record<string, JsonValue>;
}

export interface GlbImportDescriptor {
  id: string;
  index?: number;
  name?: string;
  path: string;
  extensions?: string[];
  extras?: JsonValue;
}

export interface GlbNodeDescriptor extends GlbImportDescriptor {
  meshIndex?: number;
  cameraIndex?: number;
  childNodeIndices: number[];
}

export interface GlbMeshPrimitiveDescriptor {
  id: string;
  meshIndex: number;
  primitiveIndex: number;
  path: string;
  materialIndex?: number;
  mode?: number;
  attributeNames: string[];
  extensions?: string[];
  extras?: JsonValue;
}

export interface GlbMeshDescriptor extends GlbImportDescriptor {
  primitiveCount: number;
  primitives: GlbMeshPrimitiveDescriptor[];
}

export interface GlbTextureDescriptor extends GlbImportDescriptor {
  sourceImageIndex?: number;
  samplerIndex?: number;
}

export interface GlbImageDescriptor extends GlbImportDescriptor {
  uri?: string;
  mimeType?: string;
  bufferViewIndex?: number;
}

export interface GlbAnimationDescriptor extends GlbImportDescriptor {
  channelCount: number;
  samplerCount: number;
}

export interface GlbImportManifest {
  version: typeof GLB_IMPORT_MANIFEST_VERSION;
  asset: {
    version?: string;
    minVersion?: string;
    generator?: string;
    copyright?: string;
    extras?: JsonValue;
  };
  source: {
    mimeType?: string;
    byteSize?: number;
    checksum?: string;
  };
  counts: {
    scenes: number;
    nodes: number;
    meshes: number;
    primitives: number;
    materials: number;
    textures: number;
    images: number;
    cameras: number;
    animations: number;
    skins: number;
  };
  extensions: {
    used: string[];
    required: string[];
    unsupportedRequired: string[];
  };
  scenes: GlbImportDescriptor[];
  nodes: GlbNodeDescriptor[];
  meshes: GlbMeshDescriptor[];
  materials: GlbImportDescriptor[];
  textures: GlbTextureDescriptor[];
  images: GlbImageDescriptor[];
  cameras: GlbImportDescriptor[];
  animations: GlbAnimationDescriptor[];
  diagnostics: GlbImportDiagnostic[];
}

export interface GlbImportPipelineResult {
  ok: boolean;
  manifest?: GlbImportManifest;
  diagnostics: GlbImportDiagnostic[];
}

export interface GltfLoaderResult {
  scene: Object3D;
  manifest?: GlbImportManifest;
  diagnostics?: GlbImportDiagnostic[];
}

export type GltfLoaderOutput = Object3D | GltfLoaderResult;

export interface GlbImportManifestInput {
  gltf?: unknown;
  scene?: Object3D;
  resolved?: ResolvedAsset;
  supportedExtensions?: readonly string[];
  diagnostics?: readonly GlbImportDiagnostic[];
}

const KNOWN_DECODER_EXTENSIONS = new Map<string, string>([
  ["KHR_draco_mesh_compression", "Draco"],
  ["KHR_texture_basisu", "KTX2"],
  ["KHR_meshopt_compression", "Meshopt"],
  ["EXT_meshopt_compression", "Meshopt"]
]);

const GLB_IMPORT_DIAGNOSTIC_CODES = new Set<string>([
  "glb-decoder-missing",
  "glb-extension-required-unsupported",
  "glb-extension-unknown",
  "glb-source-invalid",
  "glb-load-failed",
  "glb-manifest-invalid"
]);

const THREE_SUPPORTED_EXTENSIONS = new Set([
  "KHR_draco_mesh_compression",
  "KHR_lights_punctual",
  "KHR_materials_anisotropy",
  "KHR_materials_clearcoat",
  "KHR_materials_dispersion",
  "KHR_materials_emissive_strength",
  "KHR_materials_ior",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_iridescence",
  "KHR_materials_unlit",
  "KHR_materials_volume",
  "KHR_mesh_quantization",
  "KHR_meshopt_compression",
  "KHR_texture_basisu",
  "KHR_texture_transform",
  "EXT_materials_bump",
  "EXT_mesh_gpu_instancing",
  "EXT_meshopt_compression",
  "EXT_texture_avif",
  "EXT_texture_webp"
]);

export function normalizeGltfLoaderOutput(output: GltfLoaderOutput): GltfLoaderResult {
  if (isPlainRecord(output) && output.scene && isObject3D(output.scene)) {
    return {
      scene: output.scene,
      ...(isGlbImportManifest(output.manifest) ? { manifest: output.manifest } : {}),
      ...(Array.isArray(output.diagnostics) ? { diagnostics: output.diagnostics.filter(isGlbImportDiagnostic) } : {})
    };
  }

  return { scene: output as Object3D };
}

export function createGlbImportManifest(input: GlbImportManifestInput = {}): GlbImportManifest {
  const json = extractGltfJson(input.gltf);
  const scene = input.scene ?? extractGltfScene(input.gltf);
  const supportedExtensions = new Set([...(input.supportedExtensions ?? THREE_SUPPORTED_EXTENSIONS)]);
  const extensionsUsed = sortedStringArray(json?.extensionsUsed);
  const extensionsRequired = sortedStringArray(json?.extensionsRequired);
  const unsupportedRequired = extensionsRequired.filter((extension) => !supportedExtensions.has(extension)).sort(compareStrings);
  const unknownOptional = extensionsUsed
    .filter((extension) => !supportedExtensions.has(extension) && !extensionsRequired.includes(extension))
    .sort(compareStrings);
  const sceneDefs = toArray(json?.scenes);
  const nodeDefs = toArray(json?.nodes);
  const meshDefs = toArray(json?.meshes);
  const materialDefs = toArray(json?.materials);
  const textureDefs = toArray(json?.textures);
  const imageDefs = toArray(json?.images);
  const cameraDefs = toArray(json?.cameras);
  const animationDefs = toArray(json?.animations);
  const skinDefs = toArray(json?.skins);
  const fallbackNodes = json ? [] : collectFallbackNodes(scene);
  const fallbackResources = json ? createEmptyFallbackResources() : collectFallbackResources(scene);
  const meshes = meshDefs.length
    ? meshDefs.map((mesh, index) => createMeshDescriptor(mesh, index))
    : fallbackResources.meshes;
  const diagnostics = [
    ...unsupportedRequired.map(createUnsupportedRequiredExtensionDiagnostic),
    ...unknownOptional.map((extension) => createGlbUnknownExtensionDiagnostic(extension)),
    ...(input.diagnostics ?? [])
  ].filter(isGlbImportDiagnostic);

  const manifest: GlbImportManifest = {
    version: GLB_IMPORT_MANIFEST_VERSION,
    asset: createAssetSummary(json?.asset),
    source: createSourceSummary(input.resolved),
    counts: {
      scenes: sceneDefs.length || (scene ? 1 : 0),
      nodes: nodeDefs.length || fallbackNodes.length,
      meshes: meshDefs.length || fallbackResources.meshes.length,
      primitives: meshes.reduce((count, mesh) => count + mesh.primitiveCount, 0),
      materials: materialDefs.length || fallbackResources.materials.length,
      textures: textureDefs.length,
      images: imageDefs.length,
      cameras: cameraDefs.length || fallbackResources.cameras.length,
      animations: animationDefs.length,
      skins: skinDefs.length
    },
    extensions: {
      used: extensionsUsed,
      required: extensionsRequired,
      unsupportedRequired
    },
    scenes: sceneDefs.length
      ? sceneDefs.map((entry, index) => createDescriptor(entry, index, "scenes"))
      : scene
        ? [createRuntimeDescriptor(scene, 0, "scenes")]
        : [],
    nodes: nodeDefs.length
      ? nodeDefs.map((entry, index) => createNodeDescriptor(entry, index))
      : fallbackNodes,
    meshes,
    materials: materialDefs.length
      ? materialDefs.map((entry, index) => createDescriptor(entry, index, "materials"))
      : fallbackResources.materials,
    textures: textureDefs.map((entry, index) => createTextureDescriptor(entry, index)),
    images: imageDefs.map((entry, index) => createImageDescriptor(entry, index)),
    cameras: cameraDefs.length
      ? cameraDefs.map((entry, index) => createDescriptor(entry, index, "cameras"))
      : fallbackResources.cameras,
    animations: animationDefs.map((entry, index) => createAnimationDescriptor(entry, index)),
    diagnostics
  };

  return sortManifest(manifest);
}

export function attachGlbImportManifestMetadata(
  metadata: Record<string, JsonValue> | undefined,
  manifest: GlbImportManifest
): Record<string, JsonValue> {
  manifest = sanitizeGlbImportManifestForMetadata(manifest);
  assertValidGlbImportManifest(manifest);
  return {
    ...(metadata ?? {}),
    [GLB_IMPORT_MANIFEST_METADATA_KEY]: manifest as unknown as JsonValue
  };
}

export function sanitizeGlbImportManifestForMetadata(manifest: GlbImportManifest): GlbImportManifest {
  return {
    ...manifest,
    source: {
      ...(manifest.source.mimeType ? { mimeType: manifest.source.mimeType } : {}),
      ...(manifest.source.byteSize !== undefined ? { byteSize: manifest.source.byteSize } : {}),
      ...(manifest.source.checksum ? { checksum: manifest.source.checksum } : {})
    }
  };
}

export function getGlbImportManifestFromMetadata(metadata: Record<string, JsonValue> | undefined): GlbImportManifest | null {
  const candidate = metadata?.[GLB_IMPORT_MANIFEST_METADATA_KEY];
  return isGlbImportManifest(candidate) ? candidate : null;
}

export function resolveGlbImportStatus(kind: string, manifest: GlbImportManifest | null): GlbImportStatus {
  if (kind !== "glb") {
    return "not-applicable";
  }
  if (!manifest) {
    return "not-analyzed";
  }
  if (manifest.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "failed";
  }
  if (manifest.diagnostics.length > 0) {
    return "has-diagnostics";
  }
  return "analyzed";
}

export function validateGlbImportManifest(value: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isPlainRecord(value)) {
    return { ok: false, errors: ["GLB import manifest must be a plain object."] };
  }
  if (value.version !== GLB_IMPORT_MANIFEST_VERSION) {
    errors.push("GLB import manifest version is unsupported.");
  }
  if (!isPlainRecord(value.asset)) {
    errors.push("GLB import manifest asset summary must be a plain object.");
  }
  if (!isPlainRecord(value.source)) {
    errors.push("GLB import manifest source summary must be a plain object.");
  }
  if (!isPlainRecord(value.counts)) {
    errors.push("GLB import manifest counts must be a plain object.");
  } else {
    for (const key of ["scenes", "nodes", "meshes", "primitives", "materials", "textures", "images", "cameras", "animations", "skins"]) {
      if (!isNonNegativeInteger(value.counts[key])) {
        errors.push(`GLB import manifest count ${key} must be a non-negative integer.`);
      }
    }
  }
  if (!isPlainRecord(value.extensions)) {
    errors.push("GLB import manifest extensions summary must be a plain object.");
  } else {
    for (const key of ["used", "required", "unsupportedRequired"]) {
      if (!Array.isArray(value.extensions[key]) || value.extensions[key].some((entry) => typeof entry !== "string")) {
        errors.push(`GLB import manifest extensions.${key} must be a string array.`);
      }
    }
  }
  for (const key of ["scenes", "nodes", "meshes", "materials", "textures", "images", "cameras", "animations", "diagnostics"]) {
    if (!Array.isArray(value[key])) {
      errors.push(`GLB import manifest ${key} must be an array.`);
    } else if (key !== "diagnostics") {
      value[key].forEach((descriptor, index) => {
        if (!isDescriptorLike(descriptor)) {
          errors.push(`GLB import manifest ${key} descriptor ${index} is invalid.`);
        }
      });
    }
  }
  if (Array.isArray(value.diagnostics)) {
    value.diagnostics.forEach((diagnostic, index) => {
      if (!isGlbImportDiagnostic(diagnostic)) {
        errors.push(`GLB import manifest diagnostic ${index} is invalid.`);
      }
    });
  }
  if (!isJsonCompatible(value)) {
    errors.push("GLB import manifest must be JSON-compatible.");
  }
  return { ok: errors.length === 0, errors };
}

export function assertValidGlbImportManifest(value: unknown): asserts value is GlbImportManifest {
  const result = validateGlbImportManifest(value);
  if (!result.ok) {
    throw new Error(result.errors.join("\n"));
  }
}

export function isGlbImportManifest(value: unknown): value is GlbImportManifest {
  return validateGlbImportManifest(value).ok;
}

export function isGlbImportDiagnostic(value: unknown): value is GlbImportDiagnostic {
  return isPlainRecord(value) &&
    typeof value.id === "string" &&
    isProblemSeverity(value.severity) &&
    typeof value.code === "string" &&
    GLB_IMPORT_DIAGNOSTIC_CODES.has(value.code) &&
    isGlbImportTarget(value.target) &&
    typeof value.message === "string" &&
    isProblemRecoverability(value.recoverability) &&
    isPlainRecord(value.display) &&
    typeof value.display.title === "string" &&
    (!("detail" in value.display) || value.display.detail === undefined || typeof value.display.detail === "string") &&
    (!("actionLabel" in value.display) || value.display.actionLabel === undefined || typeof value.display.actionLabel === "string") &&
    (!("metadata" in value) || value.metadata === undefined || isJsonCompatible(value.metadata));
}

function isGlbImportTarget(value: unknown): value is GlbImportTarget {
  if (!isPlainRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  switch (value.kind) {
    case "asset":
      return !("assetId" in value) || value.assetId === undefined || typeof value.assetId === "string";
    case "scene":
      return typeof value.path === "string" && (!("sceneIndex" in value) || value.sceneIndex === undefined || isNonNegativeInteger(value.sceneIndex));
    case "node":
      return typeof value.path === "string" && (!("nodeIndex" in value) || value.nodeIndex === undefined || isNonNegativeInteger(value.nodeIndex));
    case "mesh":
      return typeof value.path === "string" && (!("meshIndex" in value) || value.meshIndex === undefined || isNonNegativeInteger(value.meshIndex));
    case "primitive":
      return typeof value.path === "string" &&
        (!("meshIndex" in value) || value.meshIndex === undefined || isNonNegativeInteger(value.meshIndex)) &&
        (!("primitiveIndex" in value) || value.primitiveIndex === undefined || isNonNegativeInteger(value.primitiveIndex));
    case "material":
      return typeof value.path === "string" && (!("materialIndex" in value) || value.materialIndex === undefined || isNonNegativeInteger(value.materialIndex));
    case "texture":
      return typeof value.path === "string" && (!("textureIndex" in value) || value.textureIndex === undefined || isNonNegativeInteger(value.textureIndex));
    case "image":
      return typeof value.path === "string" && (!("imageIndex" in value) || value.imageIndex === undefined || isNonNegativeInteger(value.imageIndex));
    case "camera":
      return typeof value.path === "string" && (!("cameraIndex" in value) || value.cameraIndex === undefined || isNonNegativeInteger(value.cameraIndex));
    case "animation":
      return typeof value.path === "string" && (!("animationIndex" in value) || value.animationIndex === undefined || isNonNegativeInteger(value.animationIndex));
    case "extension":
      return typeof value.extension === "string";
    default:
      return false;
  }
}

function isDescriptorLike(value: unknown): boolean {
  return isPlainRecord(value) &&
    typeof value.id === "string" &&
    typeof value.path === "string" &&
    (!("index" in value) || value.index === undefined || isNonNegativeInteger(value.index)) &&
    (!("name" in value) || value.name === undefined || typeof value.name === "string") &&
    (!("extensions" in value) || value.extensions === undefined || (Array.isArray(value.extensions) && value.extensions.every((entry) => typeof entry === "string"))) &&
    (!("extras" in value) || value.extras === undefined || isJsonCompatible(value.extras));
}

export function createGlbImportDiagnosticsFromError(error: unknown): GlbImportDiagnostic[] {
  const message = error instanceof Error ? error.message : String(error);
  const decoderExtension = detectDecoderExtension(message);
  if (decoderExtension) {
    const decoder = KNOWN_DECODER_EXTENSIONS.get(decoderExtension) ?? decoderExtension;
    return [{
      id: `glb-decoder-missing:${decoderExtension}`,
      severity: "error",
      code: "glb-decoder-missing",
      target: { kind: "extension", extension: decoderExtension },
      message,
      recoverability: "user-action",
      display: {
        title: `${decoder} decoder is not configured`,
        detail: message,
        actionLabel: "Configure decoder"
      },
      metadata: {
        extension: decoderExtension,
        decoder
      }
    }];
  }

  return [{
    id: "glb-load-failed",
    severity: "error",
    code: "glb-load-failed",
    target: { kind: "asset" },
    message,
    recoverability: "user-action",
    display: {
      title: "GLB failed to load",
      detail: message,
      actionLabel: "Replace asset"
    }
  }];
}

export function createGlbUnknownExtensionDiagnostic(extension: string, message?: string): GlbImportDiagnostic {
  return {
    id: `glb-extension-unknown:${extension}`,
    severity: "warning",
    code: "glb-extension-unknown",
    target: { kind: "extension", extension },
    message: message ?? `Unknown glTF extension ${extension}.`,
    recoverability: "user-action",
    display: {
      title: "Unknown GLB extension",
      detail: message ?? `The GLB declares ${extension}, which may need host support.`
    },
    metadata: { extension }
  };
}

export function glbImportDiagnosticToProblem(
  diagnostic: GlbImportDiagnostic,
  asset: AssetReference,
  objectId?: string
): Problem {
  const problemTarget = objectId ? { kind: "object" as const, objectId } : { kind: "asset" as const, assetId: asset.id };
  return {
    id: `glb-import:${asset.id}:${objectId ?? "asset"}:${diagnostic.id}`,
    severity: diagnostic.severity,
    code: diagnostic.code,
    source: "runtime",
    target: problemTarget,
    assetId: asset.id,
    ...(objectId ? { objectId } : {}),
    message: diagnostic.message,
    recoverability: diagnostic.recoverability,
    display: { ...diagnostic.display },
    metadata: {
      ...(diagnostic.metadata ?? {}),
      glbImportDiagnosticId: diagnostic.id,
      glbImportTarget: diagnostic.target as unknown as JsonValue
    }
  };
}

function createUnsupportedRequiredExtensionDiagnostic(extension: string): GlbImportDiagnostic {
  return {
    id: `glb-extension-required-unsupported:${extension}`,
    severity: "error",
    code: "glb-extension-required-unsupported",
    target: { kind: "extension", extension },
    message: `Required glTF extension ${extension} is not supported by the configured loader.`,
    recoverability: "user-action",
    display: {
      title: "Required GLB extension is unsupported",
      detail: `${extension} is required by the GLB and needs a host loader plugin or decoder.`,
      actionLabel: "Configure loader"
    },
    metadata: { extension }
  };
}

function createAssetSummary(asset: unknown): GlbImportManifest["asset"] {
  if (!isPlainRecord(asset)) {
    return {};
  }
  return {
    ...(typeof asset.version === "string" ? { version: asset.version } : {}),
    ...(typeof asset.minVersion === "string" ? { minVersion: asset.minVersion } : {}),
    ...(typeof asset.generator === "string" ? { generator: asset.generator } : {}),
    ...(typeof asset.copyright === "string" ? { copyright: asset.copyright } : {}),
    ...(isJsonCompatible(asset.extras) ? { extras: asset.extras } : {})
  };
}

function createSourceSummary(resolved: ResolvedAsset | undefined): GlbImportManifest["source"] {
  const metadata = resolved?.metadata ?? {};
  return {
    ...(resolved?.mimeType ? { mimeType: resolved.mimeType } : {}),
    ...(typeof metadata.byteSize === "number" ? { byteSize: metadata.byteSize } : {}),
    ...(typeof metadata.checksum === "string" ? { checksum: metadata.checksum } : {})
  };
}

function createDescriptor(value: unknown, index: number, collection: string): GlbImportDescriptor {
  const record = isPlainRecord(value) ? value : {};
  return compactDescriptor({
    id: `${collection}/${index}`,
    index,
    ...(typeof record.name === "string" ? { name: record.name } : {}),
    path: `${collection}/${index}`,
    extensions: extractExtensionNames(record.extensions),
    ...(isJsonCompatible(record.extras) ? { extras: record.extras } : {})
  });
}

function createRuntimeDescriptor(object: Object3D, index: number, collection: string): GlbImportDescriptor {
  return {
    id: `${collection}/${index}`,
    index,
    ...(object.name ? { name: object.name } : {}),
    path: `${collection}/${index}`
  };
}

function createNodeDescriptor(value: unknown, index: number): GlbNodeDescriptor {
  const record = isPlainRecord(value) ? value : {};
  return {
    ...createDescriptor(record, index, "nodes"),
    childNodeIndices: Array.isArray(record.children) ? record.children.filter(isNumber) : [],
    ...(typeof record.mesh === "number" ? { meshIndex: record.mesh } : {}),
    ...(typeof record.camera === "number" ? { cameraIndex: record.camera } : {})
  };
}

function createMeshDescriptor(value: unknown, index: number): GlbMeshDescriptor {
  const record = isPlainRecord(value) ? value : {};
  const primitives = toArray(record.primitives).map((primitive, primitiveIndex) => createPrimitiveDescriptor(primitive, index, primitiveIndex));
  return {
    ...createDescriptor(record, index, "meshes"),
    primitiveCount: primitives.length,
    primitives
  };
}

function createPrimitiveDescriptor(value: unknown, meshIndex: number, primitiveIndex: number): GlbMeshPrimitiveDescriptor {
  const record = isPlainRecord(value) ? value : {};
  return compactDescriptor({
    id: `meshes/${meshIndex}/primitives/${primitiveIndex}`,
    meshIndex,
    primitiveIndex,
    path: `meshes/${meshIndex}/primitives/${primitiveIndex}`,
    ...(typeof record.material === "number" ? { materialIndex: record.material } : {}),
    ...(typeof record.mode === "number" ? { mode: record.mode } : {}),
    attributeNames: isPlainRecord(record.attributes) ? Object.keys(record.attributes).sort(compareStrings) : [],
    extensions: extractExtensionNames(record.extensions),
    ...(isJsonCompatible(record.extras) ? { extras: record.extras } : {})
  });
}

function createTextureDescriptor(value: unknown, index: number): GlbTextureDescriptor {
  const record = isPlainRecord(value) ? value : {};
  return compactDescriptor({
    ...createDescriptor(record, index, "textures"),
    ...(typeof record.source === "number" ? { sourceImageIndex: record.source } : {}),
    ...(typeof record.sampler === "number" ? { samplerIndex: record.sampler } : {})
  });
}

function createImageDescriptor(value: unknown, index: number): GlbImageDescriptor {
  const record = isPlainRecord(value) ? value : {};
  return compactDescriptor({
    ...createDescriptor(record, index, "images"),
    ...(typeof record.uri === "string" ? { uri: record.uri } : {}),
    ...(typeof record.mimeType === "string" ? { mimeType: record.mimeType } : {}),
    ...(typeof record.bufferView === "number" ? { bufferViewIndex: record.bufferView } : {})
  });
}

function createAnimationDescriptor(value: unknown, index: number): GlbAnimationDescriptor {
  const record = isPlainRecord(value) ? value : {};
  return {
    ...createDescriptor(record, index, "animations"),
    channelCount: Array.isArray(record.channels) ? record.channels.length : 0,
    samplerCount: Array.isArray(record.samplers) ? record.samplers.length : 0
  };
}

function collectFallbackNodes(scene: Object3D | undefined): GlbNodeDescriptor[] {
  if (!scene) {
    return [];
  }
  const nodes: GlbNodeDescriptor[] = [];
  const indices = new Map<Object3D, number>();
  scene.traverse((object) => {
    const index = nodes.length;
    indices.set(object, index);
    nodes.push({
      id: `nodes/${index}`,
      index,
      ...(object.name ? { name: object.name } : {}),
      path: `nodes/${index}`,
      childNodeIndices: []
    });
  });
  scene.traverse((object) => {
    const index = indices.get(object);
    if (index === undefined) {
      return;
    }
    nodes[index] = {
      ...nodes[index],
      childNodeIndices: object.children
        .map((child) => indices.get(child))
        .filter((childIndex): childIndex is number => typeof childIndex === "number")
    };
  });
  return nodes;
}

function createEmptyFallbackResources(): {
  meshes: GlbMeshDescriptor[];
  materials: GlbImportDescriptor[];
  cameras: GlbImportDescriptor[];
} {
  return { meshes: [], materials: [], cameras: [] };
}

function collectFallbackResources(scene: Object3D | undefined): {
  meshes: GlbMeshDescriptor[];
  materials: GlbImportDescriptor[];
  cameras: GlbImportDescriptor[];
} {
  if (!scene) {
    return createEmptyFallbackResources();
  }
  const meshes: GlbMeshDescriptor[] = [];
  const materials: GlbImportDescriptor[] = [];
  const materialIndices = new Map<Material, number>();
  const cameras: GlbImportDescriptor[] = [];

  scene.traverse((object) => {
    if (isCameraLike(object)) {
      const index = cameras.length;
      cameras.push({
        id: `cameras/${index}`,
        index,
        ...(object.name ? { name: object.name } : {}),
        path: `cameras/${index}`
      });
    }

    if (!isMeshLike(object)) {
      return;
    }
    const meshIndex = meshes.length;
    const meshMaterials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    const primitives = (meshMaterials.length ? meshMaterials : [undefined]).map((material, primitiveIndex): GlbMeshPrimitiveDescriptor => {
      let materialIndex: number | undefined;
      if (material) {
        materialIndex = materialIndices.get(material);
        if (materialIndex === undefined) {
          materialIndex = materials.length;
          materialIndices.set(material, materialIndex);
          materials.push({
            id: `materials/${materialIndex}`,
            index: materialIndex,
            ...(material.name ? { name: material.name } : {}),
            path: `materials/${materialIndex}`
          });
        }
      }
      return compactDescriptor({
        id: `meshes/${meshIndex}/primitives/${primitiveIndex}`,
        meshIndex,
        primitiveIndex,
        path: `meshes/${meshIndex}/primitives/${primitiveIndex}`,
        materialIndex,
        attributeNames: collectRuntimeAttributeNames(object)
      });
    });
    meshes.push({
      id: `meshes/${meshIndex}`,
      index: meshIndex,
      ...(object.name ? { name: object.name } : {}),
      path: `meshes/${meshIndex}`,
      primitiveCount: primitives.length,
      primitives
    });
  });

  return { meshes, materials, cameras };
}

function collectRuntimeAttributeNames(object: MeshLikeObject): string[] {
  const attributes = object.geometry?.attributes;
  return isPlainRecord(attributes) ? Object.keys(attributes).sort(compareStrings) : [];
}

type MeshLikeObject = Object3D & {
  isMesh?: boolean;
  material?: Material | Material[];
  geometry?: {
    attributes?: unknown;
  };
};

function isMeshLike(object: Object3D): object is MeshLikeObject {
  return Boolean((object as MeshLikeObject).isMesh);
}

function isCameraLike(object: Object3D): boolean {
  return Boolean((object as Object3D & { isCamera?: boolean }).isCamera);
}

function sortManifest(manifest: GlbImportManifest): GlbImportManifest {
  return {
    ...manifest,
    scenes: sortByPath(manifest.scenes),
    nodes: sortByPath(manifest.nodes),
    meshes: sortByPath(manifest.meshes).map((mesh) => ({
      ...mesh,
      primitives: sortByPath(mesh.primitives)
    })),
    materials: sortByPath(manifest.materials),
    textures: sortByPath(manifest.textures),
    images: sortByPath(manifest.images),
    cameras: sortByPath(manifest.cameras),
    animations: sortByPath(manifest.animations),
    diagnostics: [...manifest.diagnostics].sort((left, right) => compareStrings(left.id, right.id))
  };
}

function extractGltfJson(gltf: unknown): Record<string, unknown> | null {
  if (!isPlainRecord(gltf)) {
    return null;
  }
  const parser = gltf.parser;
  if (isPlainRecord(parser) && isPlainRecord(parser.json)) {
    return parser.json;
  }
  if (isPlainRecord(gltf.json)) {
    return gltf.json;
  }
  return null;
}

function extractGltfScene(gltf: unknown): Object3D | undefined {
  if (isPlainRecord(gltf) && isObject3D(gltf.scene)) {
    return gltf.scene;
  }
  return undefined;
}

function detectDecoderExtension(message: string): string | null {
  if (message.includes("No DRACOLoader") || message.includes("DRACOLoader")) {
    return "KHR_draco_mesh_compression";
  }
  if (message.includes("setKTX2Loader") || message.includes("KTX2")) {
    return "KHR_texture_basisu";
  }
  if (message.includes("setMeshoptDecoder") || message.includes("Meshopt")) {
    return "KHR_meshopt_compression";
  }
  return null;
}

function extractExtensionNames(value: unknown): string[] | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const names = Object.keys(value).sort(compareStrings);
  return names.length ? names : undefined;
}

function compactDescriptor<T extends Record<string, unknown>>(descriptor: T): T {
  const compacted = { ...descriptor };
  for (const key of Object.keys(compacted)) {
    const value = compacted[key];
    if (value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete compacted[key];
    }
  }
  return compacted;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sortedStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").sort(compareStrings) : [];
}

function sortByPath<T extends { path: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => compareStrings(left.path, right.path));
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isObject3D(value: unknown): value is Object3D {
  return Boolean(value && typeof value === "object" && "isObject3D" in value && (value as Object3D).isObject3D);
}

function isProblemSeverity(value: unknown): value is ProblemSeverity {
  return value === "info" || value === "warning" || value === "error";
}

function isProblemRecoverability(value: unknown): value is ProblemRecoverability {
  return value === "automatic" || value === "user-action" || value === "not-recoverable";
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}
